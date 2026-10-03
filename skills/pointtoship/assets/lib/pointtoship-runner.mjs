#!/usr/bin/env node
// PointToShip runner: takes queued comments from the tracker, has a coding
// agent work each one, checks what it changed, commits, ships, and reports
// back on the issue. The same script runs in any CI (GitHub, GitLab, Gitea
// and Forgejo Actions, Bitbucket, Woodpecker...), on a computer or on a
// server, with any agent that has a headless mode.
//
//   node .pointtoship/lib/pointtoship-runner.mjs              work everything queued, then stop
//   node .pointtoship/lib/pointtoship-runner.mjs --issue 12   work one issue
//   node .pointtoship/lib/pointtoship-runner.mjs --watch 60   keep going, checking every 60 s
//   node .pointtoship/lib/pointtoship-runner.mjs --check      only the health check
//   node .pointtoship/lib/pointtoship-runner.mjs --setup      create the tracker labels, then the health check
//
// Settings come from .pointtoship/config.json; secrets from the environment:
//   PTS_TRACKER_TOKEN  reads and writes issues (required)
//   PTS_GIT_TOKEN      pushes over https (optional; without it git uses its own credentials)
//   plus the agent's own key (ANTHROPIC_API_KEY, OPENAI_API_KEY, ...)
//
// Needs Node 18 or newer and git. No dependencies.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import {
  tracker, readPayload, readState, writeState, statusLabel, LABEL_ALL, LABEL_DEVICE, ALL_LABELS,
  RESULT_MARK, ANSWER_MARK, PAUSED_MARK,
} from "./pointtoship-core.mjs";

// --------------------------------------------------------------- settings

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

const git = (...a) => {
  const r = spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${a.filter((x) => !x.includes("@")).join(" ")}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
};

const ROOT = (() => {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) { console.error("Run the PointToShip runner inside the site's git repository."); process.exit(2); }
  return r.stdout.trim();
})();

const CONFIG = (() => {
  const file = join(ROOT, ".pointtoship/config.json");
  if (!existsSync(file)) { console.error("No .pointtoship/config.json. Run the PointToShip installer first."); process.exit(2); }
  return JSON.parse(readFileSync(file, "utf8"));
})();

const BRANCH = CONFIG.branch ?? "main";
const MODE = CONFIG.mode ?? "preview-when-risky";
const PREVIEWS = CONFIG.previews?.url ? CONFIG.previews : null;
const AUTHORS = CONFIG.tracker.authors ?? [];
const OWNER = CONFIG.tracker.owner ?? "";
const MENTION = OWNER ? `@${OWNER}` : "";
const METHOD = CONFIG.method ?? ".pointtoship/skills/pointtoship-method/SKILL.md";
const TIMEOUT_MIN = CONFIG.agent?.timeout ?? 20;
const MAX_ATTEMPTS = 2;

if (!process.env.PTS_TRACKER_TOKEN) { console.error("PTS_TRACKER_TOKEN is not set."); process.exit(2); }
const T = tracker({ ...CONFIG.tracker, token: process.env.PTS_TRACKER_TOKEN });

// Never changed by a run, whatever `allowed` says: the loop's own files, CI,
// secrets and git itself.
const FORBIDDEN = [
  /^\.pointtoship\//, /^\.git\//, /^\.github\//, /^\.gitlab-ci\.yml$/, /^\.gitlab\//, /^\.forgejo\//, /^\.gitea\//,
  /^\.woodpecker/, /^bitbucket-pipelines\.yml$/, /(^|\/)\.env($|\.)/, /\.(pem|key|p12)$/, /(^|\/)\.npmrc$/,
];
const allowed = (path) => (CONFIG.allowed ?? []).some((p) => path.startsWith(p)) && !FORBIDDEN.some((re) => re.test(path));

// ------------------------------------------------------------------ agents

// Headless commands of the common agents. {prompt} is replaced. A site can
// set agent.command (and agent.check, agent.keys) for any other agent.
const PRESETS = {
  claude: { command: ["claude", "-p", "{prompt}", "--permission-mode", "acceptEdits", "--allowedTools", "Bash,Read,Edit,Write,Glob,Grep"], keys: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] },
  codex: { command: ["codex", "exec", "--sandbox", "workspace-write", "{prompt}"], keys: ["OPENAI_API_KEY", "CODEX_API_KEY"] },
  gemini: { command: ["gemini", "-p", "{prompt}", "--yolo"], keys: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT"] },
  copilot: { command: ["copilot", "-p", "{prompt}", "--allow-all-tools"], keys: ["COPILOT_GITHUB_TOKEN"] },
  cursor: { command: ["cursor-agent", "-p", "{prompt}", "--force"], keys: ["CURSOR_API_KEY"] },
  opencode: { command: ["opencode", "run", "{prompt}"], keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY"] },
};

const AGENT = (() => {
  const a = CONFIG.agent ?? {};
  const preset = PRESETS[a.preset ?? "claude"];
  if (!a.command && !preset) { console.error(`Unknown agent preset "${a.preset}". Known: ${Object.keys(PRESETS).join(", ")}.`); process.exit(2); }
  const command = a.command ?? preset.command;
  return { command, check: a.check ?? [command[0], "--version"], keys: [...(preset?.keys ?? []), ...(a.keys ?? [])] };
})();

// The agent gets a clean environment: its own key and the basics, never the
// tracker token, the push token or anything else the runner holds.
const agentEnv = (extra = {}) => {
  const keep = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM", "TMPDIR", "CI", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", ...AGENT.keys, ...(CONFIG.agent?.env ?? [])];
  const env = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  return { ...env, ...extra };
};

// Signs of a refused login or key in the agent's output.
const AUTH_RE = /\b401\b|unauthori[sz]ed|invalid api key|invalid x-api-key|authentication[_ ]failed|not logged in|please (run )?\/?login|token (has )?expired|credit balance is too low/i;

// --------------------------------------------------------------- git, push

const pushUrl = () => {
  const origin = git("remote", "get-url", "origin");
  const token = process.env.PTS_GIT_TOKEN;
  if (!token || !origin.startsWith("https://")) return origin;
  const user = { github: "x-access-token", gitlab: "oauth2" }[T.kind] ?? "pointtoship";
  return origin.replace(/^https:\/\/([^@/]*@)?/, `https://${user}:${encodeURIComponent(token)}@`);
};

const changedFiles = () => {
  const out = spawnSync("git", ["status", "--porcelain", "-z", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" }).stdout;
  const parts = out.split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    files.push(parts[i].slice(3));
    if (code[0] === "R" || code[0] === "C") files.push(parts[++i]); // the old path of a rename
  }
  return [...new Set(files)];
};

const restore = (start) => {
  git("reset", "--hard", start);
  git("clean", "-fd");
};

// Fetches with the push credentials too, so private repositories work in
// CI checkouts that keep no credentials of their own.
const fetchRef = (ref) => git("fetch", "--quiet", pushUrl(), `+refs/heads/${ref}:refs/remotes/origin/${ref}`);

const syncBranch = () => {
  fetchRef(BRANCH);
  git("checkout", "--quiet", "-B", BRANCH, `origin/${BRANCH}`);
};

// ------------------------------------------------------------------ health

const health = async () => {
  const problems = [];
  const v = spawnSync(AGENT.check[0], AGENT.check.slice(1), { cwd: ROOT, encoding: "utf8", timeout: 60_000, env: agentEnv() });
  if (v.error || v.status !== 0) {
    problems.push(`the agent command "${AGENT.check[0]}" did not start${v.error ? ` (${v.error.code})` : ""}; it may have moved or not be installed`);
  }
  try { await T.check(); } catch (err) {
    problems.push(err.status === 401 || err.status === 403 ? "the tracker refused the runner's token; it may have expired" : `the tracker did not answer (${err.message.slice(0, 80)})`);
  }
  if (changedFiles().length) problems.push("the runner's checkout has uncommitted changes; it needs a clean clone of its own");
  const remote = spawnSync("git", ["ls-remote", "--heads", pushUrl(), BRANCH], { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
  if (remote.status !== 0) problems.push("git could not reach the repository with the push credentials");
  for (const k of CONFIG.deploy?.env ?? []) if (!process.env[k]) problems.push(`the deploy needs ${k}, which is not set`);
  return problems;
};

// One pause note per problem, not one per comment and not one per minute.
const pause = async (issue, problems) => {
  const text = `PointToShip is paused: ${problems.join("; ")}. This comment stays in the queue and runs once that is fixed. ${MENTION}`.trim();
  log("paused:", problems.join("; "));
  if (!issue) return;
  const last = (await T.comments(issue.id)).filter((c) => c.body.includes(PAUSED_MARK)).at(-1);
  if (last?.body.startsWith(text)) return;
  await T.comment(issue.id, `${text}\n\n${PAUSED_MARK}`);
};

// ------------------------------------------------------------------- locks

// One run per checkout, across processes; the lock lives in .git so it is
// never committed.
const LOCK = join(ROOT, ".git", "pointtoship.lock");
const lock = () => {
  if (existsSync(LOCK)) {
    const held = JSON.parse(readFileSync(LOCK, "utf8"));
    let alive = held.host === hostname();
    if (alive) try { process.kill(held.pid, 0); } catch { alive = false; }
    if (alive) return false;
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString() }));
  return true;
};
const unlock = () => rmSync(LOCK, { force: true });

// ------------------------------------------------------------------ issues

const statusOf = (issue) => ["queued", "working", "needs-you", "ready", "ship", "done"].find((s) => issue.labels.includes(statusLabel(s))) ?? "queued";

const accepted = (issue) => AUTHORS.includes(issue.author) && issue.labels.includes(LABEL_ALL) && !issue.labels.includes(LABEL_DEVICE);

const plain = (body) => body.replace(/<!-- pointtoship[\s\S]*?-->/g, "").trim();

// Only the owner's words count as instructions; everything else is dropped
// or marked as the agent's own earlier message.
const threadOf = async (issue) => (await T.comments(issue.id)).flatMap((c) => {
  if (c.body.includes(PAUSED_MARK)) return [];
  if (c.body.includes(RESULT_MARK)) return [{ from: "agent", at: c.at, text: plain(c.body) }];
  if ((c.body.includes(ANSWER_MARK) && AUTHORS.includes(c.author)) || (OWNER && c.author === OWNER)) return [{ from: "owner", at: c.at, text: plain(c.body) }];
  return [];
});

const report = async (issue, status, state, note) => {
  await T.comment(issue.id, `${note}\n\n${RESULT_MARK}`);
  const fresh = await T.get(issue.id);
  await T.update(issue.id, { body: writeState(fresh.body, { ...readState(fresh.body), ...state, status, updated: new Date().toISOString() }) });
  await T.setStatus(issue.id, status, fresh.labels);
  if (status === "done") await T.update(issue.id, { open: false });
};

const deploy = () => {
  if (!CONFIG.deploy?.command) return null;
  const r = spawnSync(CONFIG.deploy.command, { cwd: ROOT, shell: true, encoding: "utf8", timeout: 20 * 60_000 });
  return r.status === 0 ? null : (r.stderr || r.stdout || "").trim().split("\n").at(-1);
};

const pushLive = () => {
  try { git("push", "--quiet", pushUrl(), `HEAD:refs/heads/${BRANCH}`); }
  catch {
    // Someone pushed meanwhile: replay the one commit on top and try once more.
    git("pull", "--quiet", "--rebase", pushUrl(), BRANCH);
    git("push", "--quiet", pushUrl(), `HEAD:refs/heads/${BRANCH}`);
  }
};

const previewUrl = (branch) => PREVIEWS.url.replaceAll("{branch}", branch.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase());

const runAgent = (dir, issue) => new Promise((done) => {
  const prompt = `Work PointToShip comment #${issue.id}. Read ${METHOD} and follow it exactly. The run directory is ${dir} (also in PTS_RUN_DIR). Do not commit or push: write result.json there and stop.`;
  const [cmd, ...rest] = AGENT.command.map((part) => part.replaceAll("{prompt}", prompt));
  const child = spawn(cmd, rest, { cwd: ROOT, env: agentEnv({ PTS_RUN_DIR: dir }), stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const take = (b) => { output = (output + b).slice(-200_000); };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 10_000); }, TIMEOUT_MIN * 60_000);
  child.on("error", (err) => { clearTimeout(timer); done({ code: -1, output: String(err), timedOut }); });
  child.on("close", (code) => { clearTimeout(timer); writeFileSync(join(dir, "agent.log"), output); done({ code, output, timedOut }); });
});

const readResult = (dir) => {
  const file = join(dir, "result.json");
  if (!existsSync(file)) return null;
  try {
    const r = JSON.parse(readFileSync(file, "utf8"));
    return ["done", "needs-you", "blocked"].includes(r.status) && typeof r.message === "string" ? r : null;
  } catch { return null; }
};

/** A failure on our side: requeue, tell the owner once, give up after a few tries. */
const ourSide = async (issue, reason) => {
  const state = readState((await T.get(issue.id)).body) ?? {};
  const attempts = (state.attempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await report(issue, "needs-you", { attempts, message: `PointToShip could not work this comment: ${reason}. Nothing changed. Run the doctor, or answer "try again".` },
      `PointToShip could not work this comment: ${reason}. Nothing changed. Run the doctor, or answer "try again". ${MENTION}`);
    return;
  }
  const fresh = await T.get(issue.id);
  await T.update(issue.id, { body: writeState(fresh.body, { ...state, attempts }) });
  await T.setStatus(issue.id, "queued", fresh.labels);
  await pause(issue, [reason]);
};

const work = async (issue) => {
  const payload = readPayload(issue.body);
  if (!payload) { log(`#${issue.id}: no PointToShip data, skipped`); return; }
  log(`#${issue.id}: working "${issue.title}"`);
  await T.setStatus(issue.id, "working", issue.labels);
  syncBranch();
  const start = git("rev-parse", "HEAD");
  const dir = mkdtempSync(join(tmpdir(), `pts-${issue.id}-`));
  try {
    writeFileSync(join(dir, "request.json"), JSON.stringify({
      issue: { id: issue.id, url: issue.url },
      comment: payload.comment,
      thread: await threadOf(issue),
      pointer: payload.pointer ?? { kind: "page" },
      view: payload.view ?? {},
    }, null, 2));

    const run = await runAgent(dir, issue);
    const result = readResult(dir);

    if (!result) {
      restore(start);
      if (run.timedOut) {
        await report(issue, "needs-you", { message: `This took longer than ${TIMEOUT_MIN} minutes and was stopped. Nothing changed.` },
          `This took longer than ${TIMEOUT_MIN} minutes and was stopped. Nothing changed. A smaller step may work, or answer "try again". ${MENTION}`);
      } else {
        await ourSide(issue, AUTH_RE.test(run.output) ? "the agent's login or key was refused; it may have expired" : `the agent stopped without a result (exit ${run.code})`);
      }
      return;
    }
    if (result.status === "blocked") { restore(start); await ourSide(issue, result.message.replace(/\.$/, "")); return; }
    if (result.status === "needs-you") {
      restore(start);
      await report(issue, "needs-you", { message: result.message, attempts: 0 }, `${result.message} ${MENTION}`.trim());
      return;
    }

    // Done: fold any commits the agent made anyway into one, then check
    // every file before anything leaves this machine.
    if (git("rev-parse", "HEAD") !== start) git("reset", "--soft", start);
    const files = changedFiles();
    const outside = files.filter((f) => !allowed(f));
    if (outside.length) {
      restore(start);
      const message = `The change also touched files it may not change (${outside.slice(0, 5).join(", ")}), so nothing shipped.`;
      await report(issue, "needs-you", { message }, `${message} ${MENTION}`.trim());
      return;
    }
    if (!files.length) {
      await report(issue, "done", { message: result.message, after: result.after ?? null, attempts: 0 }, result.message);
      return;
    }

    git("add", "-A", "--", ...files);
    const subject = (result.commit || result.message.split(/(?<=\.)\s/)[0]).slice(0, 100);
    // A fresh CI checkout has no git identity; fall back to the config's.
    const who = spawnSync("git", ["config", "user.email"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() ? [] : (() => {
      const [, name = "PointToShip", email = "pointtoship@users.noreply.github.com"] = /^(.*?)\s*<(.+)>$/.exec(CONFIG.author ?? "") ?? [];
      return ["-c", `user.name=${name}`, "-c", `user.email=${email}`];
    })();
    git(...who, "commit", "--quiet", "-m", `${subject}\n\nPointToShip #${issue.id}`);
    const sha = git("rev-parse", "--short", "HEAD");

    const preview = PREVIEWS && (MODE === "always-preview" || (MODE === "preview-when-risky" && result.ship === "preview"));
    if (preview) {
      const branch = `pts/${issue.id}`;
      git("push", "--quiet", "--force", pushUrl(), `HEAD:refs/heads/${branch}`);
      restore(start);
      const url = previewUrl(branch);
      await report(issue, "ready", { message: result.message, after: result.after ?? null, preview: url, commit: sha, attempts: 0 },
        `${result.message}\n\nReady to look: ${url} ${MENTION}`.trim());
      log(`#${issue.id}: ready as a preview, ${url}`);
      return;
    }

    pushLive();
    const failed = deploy();
    const note = failed ? `${result.message}\n\nCommitted and pushed, but the deploy failed: ${failed} ${MENTION}` : result.message;
    await report(issue, "done", { message: result.message, after: result.after ?? null, commit: sha, attempts: 0 }, note.trim());
    log(`#${issue.id}: done, ${sha}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// "Ship it" on a preview: merge the issue's branch and push.
const ship = async (issue) => {
  const branch = `pts/${issue.id}`;
  log(`#${issue.id}: shipping ${branch}`);
  syncBranch();
  const start = git("rev-parse", "HEAD");
  try {
    fetchRef(branch);
    try { git("merge", "--quiet", "--ff-only", `origin/${branch}`); }
    catch { git("merge", "--quiet", "--no-edit", `origin/${branch}`); }
  } catch {
    spawnSync("git", ["merge", "--abort"], { cwd: ROOT });
    restore(start);
    const message = "The preview no longer fits the live site, so it did not ship. Send the comment again.";
    await report(issue, "needs-you", { message }, `${message} ${MENTION}`.trim());
    return;
  }
  pushLive();
  spawnSync("git", ["push", "--quiet", pushUrl(), `:refs/heads/${branch}`], { cwd: ROOT });
  const failed = deploy();
  const state = readState(issue.body) ?? {};
  const message = failed ? `Shipped, but the deploy failed: ${failed}` : "Shipped.";
  await report(issue, "done", { ...state, message: state.message ?? message, preview: null }, failed ? `${message} ${MENTION}` : message);
};

const queue = async () => {
  const one = value("--issue") ?? process.env.PTS_ISSUE;
  const issues = one ? [await T.get(one)] : (await T.list(LABEL_ALL, 50)).filter((i) => i.open).sort((a, b) => a.updated.localeCompare(b.updated));
  return issues.filter((i) => {
    if (!accepted(i)) { if (one) log(`#${i.id}: not written by the site's account, skipped`); return false; }
    return ["queued", "ship"].includes(statusOf(i));
  });
};

const once = async () => {
  const todo = await queue();
  if (!todo.length) { log("nothing queued"); return true; }
  const problems = await health();
  if (problems.length) { await pause(todo[0], problems); return false; }
  for (const issue of todo) {
    if (statusOf(issue) === "ship") await ship(issue);
    else await work(issue);
  }
  return true;
};

// -------------------------------------------------------------------- main

const main = async () => {
  if (flag("--setup")) {
    await T.ensureLabels(ALL_LABELS);
    log(`labels ready: ${ALL_LABELS.join(", ")}`);
  }
  if (flag("--check") || flag("--setup")) {
    const problems = await health();
    console.log(problems.length ? `Not ready: ${problems.join("; ")}.` : "Ready.");
    process.exit(problems.length ? 1 : 0);
  }
  if (!lock()) { log("another run holds the lock; stopping"); return; }
  const stop = () => { unlock(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    if (!flag("--watch")) {
      process.exitCode = (await once()) ? 0 : 75;
      return;
    }
    const every = Number(value("--watch")) || 60;
    for (;;) {
      let ok = false;
      try { ok = await once(); } catch (err) { log("error:", err.message); }
      // After a problem on our side, look again in five minutes, not every minute.
      await new Promise((r) => setTimeout(r, (ok ? every : Math.max(every, 300)) * 1000));
    }
  } finally {
    unlock();
  }
};

main().catch((err) => { log("error:", err.message); unlock(); process.exit(1); });
