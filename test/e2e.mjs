// End-to-end test of PointToShip on one machine: a mock tracker (GitHub,
// GitLab or Gitea/Forgejo, from PROVIDER), the real
// small function (Node adapter), the real loader and overlay in Chromium, the
// real runner on a throwaway git repository with a stand-in agent.
//   cd test && npm install && npm test
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mockTracker } from "./mock-trackers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(here, "../skills/pointtoship/assets");
const work = mkdtempSync(join(tmpdir(), "pts-e2e-"));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  ${detail}`}`); };
const sh = (cmd, args, cwd, env) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: env ?? process.env });
  if (r.status !== 0 && !env) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr}`);
  return r;
};
const listen = (server) => new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${server.address().port}`)));

// ---------------------------------------------------------------- the repo

const origin = join(work, "origin.git");
const clone = join(work, "runner");
sh("git", ["init", "--quiet", "--bare", "-b", "main", origin], work);
sh("git", ["clone", "--quiet", origin, clone], work);
cpSync(join(here, "site/index.html"), join(clone, "index.html"));
mkdirSync(join(clone, ".pointtoship/lib"), { recursive: true });
for (const f of ["pointtoship-core.mjs", "pointtoship-runner.mjs"]) cpSync(join(ASSETS, "lib", f), join(clone, ".pointtoship/lib", f));
cpSync(join(ASSETS, "skills/pointtoship-method"), join(clone, ".pointtoship/skills/pointtoship-method"), { recursive: true });

// ------------------------------------------------------------ the services

const PROVIDER = process.env.PROVIDER ?? "github";
console.log(`\n${PROVIDER}`);
const gh = mockTracker({ kind: PROVIDER, users: { "fn-token": "shop-bot", "runner-token": "runner-bot" } });
const ghUrl = await listen(gh);

writeFileSync(join(clone, ".pointtoship/config.json"), JSON.stringify({
  site: "http://127.0.0.1", branch: "main",
  tracker: { kind: PROVIDER, repo: "acme/shop", url: ghUrl, authors: ["shop-bot"], owner: "anna" },
  // Started by name, like the real presets, so a PATH without it means "agent missing".
  agent: { command: ["node", join(here, "fake-agent.mjs"), "{prompt}"], env: ["FAKE_MODE", "FAKE_LOG"], timeout: 2 },
  allowed: ["index.html"], mode: "straight-to-live", author: "PointToShip <pts@example.com>",
}, null, 2));
sh("git", ["add", "-A"], clone);
sh("git", ["-c", "user.name=Test", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", "Site"], clone);
sh("git", ["push", "--quiet", "origin", "main"], clone);

Object.assign(process.env, {
  PTS_SECRET: "s3cret-link", PTS_TRACKER: PROVIDER, PTS_REPO: "acme/shop", PTS_TRACKER_URL: ghUrl,
  PTS_TRACKER_TOKEN: "fn-token", PTS_OWNER: "anna", PTS_TRIGGER: PROVIDER, PTS_TRIGGER_TOKEN: PROVIDER === "gitlab" ? "trigger-token" : "",
});
const { nodeHandler } = await import(join(ASSETS, "lib/pointtoship-node.mjs"));

// The site: whatever is on origin/main ("deployed on push"), with the loader.
const loader = readFileSync(join(ASSETS, "overlay/loader.html"), "utf8")
  .replace(/var SCRIPT = "[^"]*";/, 'var SCRIPT = "/pointtoship.js";');
const site = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/api/pointtoship") return nodeHandler(req, res);
  if (path === "/pointtoship.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(readFileSync(join(ASSETS, "overlay/pointtoship.js"))); }
  if (path !== "/") { res.writeHead(404); return res.end(); }
  const html = sh("git", ["--git-dir", origin, "show", "main:index.html"], work).stdout.replace("<!--POINTTOSHIP-->", loader);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});
const siteUrl = await listen(site);

// Async: the mock tracker lives in this process and must keep answering.
const runner = (mode, extraEnv = {}) => new Promise((done) => {
  const child = spawn(process.execPath, [join(clone, ".pointtoship/lib/pointtoship-runner.mjs")], {
    cwd: clone,
    env: { PATH: process.env.PATH, HOME: work, PTS_TRACKER_TOKEN: "runner-token", FAKE_MODE: mode, FAKE_LOG: join(work, "agent.log"), ...extraEnv },
  });
  let out = "";
  child.stdout.on("data", (b) => { out += b; });
  child.stderr.on("data", (b) => { out += b; });
  child.on("close", (status) => done({ status, stdout: out, stderr: "" }));
});
const issue = (n) => gh.issues.get(n);
const labels = (n) => issue(n).labels.join(",");

// --------------------------------------------------------------- the test

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    addEventListener("pagereveal", (e) => { window.__revealTransition = Boolean(e.viewTransition); });
  });

  // Register this browser with the secret link.
  await page.goto(`${siteUrl}/?pointtoship=s3cret-link`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pointtoship") ?? "null")?.token);
  check("secret link registers the browser", true);
  check("secret leaves the address bar", !page.url().includes("s3cret"), page.url());
  const device = [...gh.issues.values()].find((i) => i.labels.includes("pts-device"));
  check("new browser opens a device issue mentioning the owner", Boolean(device?.body.includes("@anna")), device?.body);

  // A visitor without the key gets nothing.
  const visitor = await browser.newPage();
  await visitor.goto(siteUrl);
  await visitor.waitForTimeout(400);
  check("visitors do not load the overlay", (await visitor.evaluate(() => Boolean(document.querySelector("[data-pointtoship]")))) === false);
  await visitor.close();

  // Point and send.
  const send = async (comment) => {
    await page.keyboard.press("Escape");
    await page.locator('[data-act="dot"]').click();
    await page.locator('[data-act="select"]').click();
    const box = await page.locator(".card:nth-child(3) .icon").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator("#text").fill(comment);
    await page.locator('[data-act="send"]').click();
    await page.locator(".note").filter({ hasText: "Sent as" }).waitFor();
    return Math.max(...gh.issues.keys());
  };

  const first = await send("bigger");
  const payload = JSON.parse(/```json pointtoship\n([\s\S]*?)\n```/.exec(issue(first).body)[1]);
  check("comment becomes an issue in the queue", labels(first) === "pts,pts-queued", labels(first));
  check("pointer names the icon", payload.pointer.label.startsWith("Icon") && payload.pointer.tag === "svg", payload.pointer.label);
  check("pointer carries a selector that finds it", payload.pointer.selector.includes("svg"), payload.pointer.selector);
  check("pointer carries size and view", payload.pointer.box.w === 40 && payload.view.width === 1200, JSON.stringify(payload.pointer.box));
  check("the function wakes the runner", gh.dispatches.some((d) => d.issue === String(first)), JSON.stringify(gh.dispatches));

  // The runner works it.
  const run1 = await runner("done", { PTS_ISSUE: String(first) });
  check("runner finishes", run1.status === 0, run1.stdout + run1.stderr);
  const log = sh("git", ["--git-dir", origin, "log", "--format=%s|%an", "-1", "main"], work).stdout.trim();
  check("change is committed and pushed by the runner", log === "Feature icons: same size|PointToShip", log);
  check("issue is done and closed", labels(first) === "pts,pts-done" && issue(first).state === "closed", labels(first));
  check("result note is on the issue", Boolean(issue(first).comments.at(-1)?.body.startsWith("Made the icon the same size")));

  // Back on the page: Done, then Show.
  await page.locator('[data-act="dot"]').click();
  await page.locator('[data-act="issues"]').click();
  const line = page.locator(`[data-act="open"][data-id="${first}"]`);
  const done = await line.filter({ hasText: "Done" }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  check("Issues shows Done", done);
  await line.click();
  await page.locator(`[data-act="show"][data-id="${first}"]`).click();
  await page.waitForURL(/pts=/);
  await page.waitForFunction(() => window.__pointtoshipShown instanceof Element, null, { timeout: 5000 });
  check("Show animates with a view transition", await page.evaluate(() => window.__revealTransition === true));
  check("the new page has the change", await page.evaluate(() => !document.querySelector(".card:nth-child(3) .icon").classList.contains("small")));
  await page.waitForTimeout(300);
  check("the address is clean again", !page.url().includes("pts="), page.url());
  await page.screenshot({ path: join(here, "e2e-show.png") });

  // A run that touches a file it may not change ships nothing.
  const second = await send("change the settings");
  const before = sh("git", ["--git-dir", origin, "rev-parse", "main"], work).stdout.trim();
  await runner("forbidden", { PTS_ISSUE: String(second) });
  check("forbidden file: nothing ships", sh("git", ["--git-dir", origin, "rev-parse", "main"], work).stdout.trim() === before);
  check("forbidden file: the owner is told", labels(second) === "pts,pts-needs-you" && issue(second).comments.at(-1).body.includes(".pointtoship/config.json"), issue(second).comments.at(-1)?.body);

  // A question, answered on the page, goes back to the queue with the answer.
  const third = await send("make it pop");
  await runner("question", { PTS_ISSUE: String(third) });
  check("question: needs you, with a mention", labels(third) === "pts,pts-needs-you" && issue(third).comments.at(-1).body.includes("@anna"));
  await page.locator('[data-act="dot"]').click();
  await page.locator('[data-act="issues"]').click();
  await page.locator(`[data-act="open"][data-id="${third}"]`).click();
  await page.locator("#answer").fill("a");
  await page.locator(`[data-act="answer"][data-id="${third}"]`).click();
  await page.locator(".note").filter({ hasText: "back in the queue" }).waitFor();
  check("answer requeues the issue", labels(third) === "pts,pts-queued");
  writeFileSync(join(work, "agent.log"), "");
  await runner("done", { PTS_ISSUE: String(third) });
  const thread = JSON.parse(readFileSync(join(work, "agent.log"), "utf8").trim().split("\n").at(-1));
  check("the answer reaches the agent as the owner's words", thread.some((t) => t.from === "owner" && t.text === "a") && thread.some((t) => t.from === "agent"), JSON.stringify(thread));
  check("answered issue gets done", issue(third).labels.includes("pts-done"));

  // No agent: the comment stays queued and the owner hears it once.
  const fourth = await send("one more");
  const noAgent = { PATH: "/usr/bin:/bin" };
  const r1 = await runner("done", { ...noAgent, PTS_ISSUE: String(fourth) });
  await runner("done", { ...noAgent, PTS_ISSUE: String(fourth) });
  const paused = issue(fourth).comments.filter((c) => c.body.includes("pointtoship-paused"));
  check("missing agent: exit code says try later", r1.status === 75, String(r1.status));
  check("missing agent: stays queued", labels(fourth) === "pts,pts-queued", labels(fourth));
  check("missing agent: one note, not one per run", paused.length === 1 && paused[0].body.includes("did not start"), paused.map((c) => c.body).join(" | "));

  check("no page errors", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  site.close();
  gh.close();
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
