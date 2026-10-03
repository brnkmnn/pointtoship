// PointToShip core: the small server function the overlay talks to, and the
// tracker client the runner shares. Plain JavaScript on web standards
// (fetch, Request, Response, crypto.subtle), no dependencies, so it runs
// unchanged on Node 18+, Deno, Bun, Cloudflare Workers, Vercel, Netlify and
// any framework that hands over a Request.

export const VERSION = "0.1.0";

/** The life of a comment, as tracker labels `pts-<status>`. */
export const STATUSES = ["queued", "working", "needs-you", "ready", "ship", "done"];
export const LABEL_ALL = "pts";
export const LABEL_DEVICE = "pts-device";
export const statusLabel = (status) => `pts-${status}`;

const PAYLOAD_RE = /```json pointtoship\n([\s\S]*?)\n```/;
const STATE_RE = /<!-- pointtoship-state (\{[\s\S]*?\}) -->/;
const DEVICE_RE = /<!-- pointtoship-device ([a-z0-9-]+) -->/;
export const RESULT_MARK = "<!-- pointtoship-result -->";
export const ANSWER_MARK = "<!-- pointtoship-answer -->";
export const PAUSED_MARK = "<!-- pointtoship-paused -->";

/** An error whose message is safe to show the owner. */
export class Fail extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------ issue bodies

/** The fenced block the overlay's payload travels in. */
export const payloadBlock = (payload) => "```json pointtoship\n" + JSON.stringify(payload, null, 2) + "\n```";

export const readPayload = (body = "") => {
  const m = PAYLOAD_RE.exec(body);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};

/** The latest outcome, kept in the issue body so one list call shows it. */
export const readState = (body = "") => {
  const m = STATE_RE.exec(body);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};

export const writeState = (body = "", state) => {
  // "-->" cannot appear inside an HTML comment; escape it in the JSON.
  const block = `<!-- pointtoship-state ${JSON.stringify(state).replaceAll("-->", "--\\u003e")} -->`;
  return STATE_RE.test(body) ? body.replace(STATE_RE, block) : `${body}\n\n${block}`;
};

const statusOf = (labels) => STATUSES.find((s) => labels.includes(statusLabel(s))) ?? "queued";

// ----------------------------------------------------------------- trackers

const request = async (url, { method = "GET", headers = {}, body, form } = {}) => {
  const init = { method, headers: { "User-Agent": `pointtoship/${VERSION}`, ...headers } };
  if (form) init.body = new URLSearchParams(form);
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${new URL(url).pathname} answered ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
};

const github = ({ repo, url, token }) => {
  const api = (url ?? "https://api.github.com").replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const call = (path, opts = {}) => request(`${api}/repos/${repo}${path}`, { ...opts, headers });
  const issue = (i) => ({
    id: String(i.number), title: i.title, body: i.body ?? "", author: i.user?.login ?? "",
    labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)), open: i.state === "open",
    url: i.html_url, updated: i.updated_at,
  });
  return {
    kind: "github",
    check: () => call(""),
    ensureLabels: async (names) => {
      const have = new Set((await call("/labels?per_page=100")).map((l) => l.name));
      for (const name of names.filter((n) => !have.has(n))) await call("/labels", { method: "POST", body: { name, color: "2f5bff" } });
    },
    create: async ({ title, body, labels }) => issue(await call("/issues", { method: "POST", body: { title, body, labels } })),
    get: async (id) => issue(await call(`/issues/${id}`)),
    update: async (id, { body, open }) => {
      const patch = {};
      if (body !== undefined) patch.body = body;
      if (open !== undefined) patch.state = open ? "open" : "closed";
      return issue(await call(`/issues/${id}`, { method: "PATCH", body: patch }));
    },
    setLabels: (id, labels) => call(`/issues/${id}/labels`, { method: "PUT", body: { labels } }),
    comment: (id, body) => call(`/issues/${id}/comments`, { method: "POST", body: { body } }),
    comments: async (id) => (await call(`/issues/${id}/comments?per_page=100`)).map((c) => ({ author: c.user?.login ?? "", body: c.body ?? "", at: c.created_at })),
    list: async (label, limit = 30) => (await call(`/issues?labels=${encodeURIComponent(label)}&state=all&sort=updated&per_page=${limit}`))
      .filter((i) => !i.pull_request).map(issue),
    // repository_dispatch: a workflow with `on: repository_dispatch` picks it up.
    dispatch: (issueId, { token: t } = {}) => request(`${api}/repos/${repo}/dispatches`, {
      method: "POST", headers: { ...headers, Authorization: `Bearer ${t ?? token}` },
      body: { event_type: "pointtoship", client_payload: { issue: issueId } },
    }),
  };
};

const gitlab = ({ repo, url, token }) => {
  const api = `${(url ?? "https://gitlab.com").replace(/\/$/, "")}/api/v4/projects/${encodeURIComponent(repo)}`;
  const headers = { "PRIVATE-TOKEN": token };
  const call = (path, opts = {}) => request(`${api}${path}`, { ...opts, headers });
  const issue = (i) => ({
    id: String(i.iid), title: i.title, body: i.description ?? "", author: i.author?.username ?? "",
    labels: i.labels, open: i.state === "opened", url: i.web_url, updated: i.updated_at,
  });
  return {
    kind: "gitlab",
    check: () => call(""),
    // GitLab creates a missing label the first time it is used.
    ensureLabels: async () => {},
    create: async ({ title, body, labels }) => issue(await call("/issues", { method: "POST", body: { title, description: body, labels: labels.join(",") } })),
    get: async (id) => issue(await call(`/issues/${id}`)),
    update: async (id, { body, open }) => {
      const patch = {};
      if (body !== undefined) patch.description = body;
      if (open !== undefined) patch.state_event = open ? "reopen" : "close";
      return issue(await call(`/issues/${id}`, { method: "PUT", body: patch }));
    },
    setLabels: (id, labels) => call(`/issues/${id}`, { method: "PUT", body: { labels: labels.join(",") } }),
    comment: (id, body) => call(`/issues/${id}/notes`, { method: "POST", body: { body } }),
    comments: async (id) => (await call(`/issues/${id}/notes?sort=asc&per_page=100`))
      .filter((n) => !n.system).map((n) => ({ author: n.author?.username ?? "", body: n.body ?? "", at: n.created_at })),
    list: async (label, limit = 30) => (await call(`/issues?labels=${encodeURIComponent(label)}&order_by=updated_at&per_page=${limit}`)).map(issue),
    // A pipeline trigger token (free on every GitLab plan) starts the CI job.
    dispatch: (issueId, { token: t, ref = "main" } = {}) => request(`${api}/trigger/pipeline`, {
      method: "POST", form: { token: t, ref, "variables[PTS_ISSUE]": issueId },
    }),
  };
};

// Gitea, Forgejo and Codeberg share one API.
const gitea = ({ repo, url, token }) => {
  if (!url) throw new Fail(500, "PointToShip is not configured: a Gitea or Forgejo tracker needs its address (PTS_TRACKER_URL).");
  const api = `${url.replace(/\/$/, "")}/api/v1/repos/${repo}`;
  const headers = { Authorization: `token ${token}` };
  const call = (path, opts = {}) => request(`${api}${path}`, { ...opts, headers });
  const issue = (i) => ({
    id: String(i.number), title: i.title, body: i.body ?? "", author: i.user?.login ?? "",
    labels: (i.labels ?? []).map((l) => l.name), open: i.state === "open", url: i.html_url, updated: i.updated_at,
  });
  // Older versions take label ids only, so names are resolved, and created
  // when missing.
  const labelIds = async (names) => {
    const existing = await call("/labels?limit=100");
    const ids = [];
    for (const name of names) {
      const found = existing.find((l) => l.name === name);
      ids.push(found ? found.id : (await call("/labels", { method: "POST", body: { name, color: "#2f5bff" } })).id);
    }
    return ids;
  };
  return {
    kind: "gitea",
    check: () => call(""),
    ensureLabels: async (names) => { await labelIds(names); },
    create: async ({ title, body, labels }) => {
      const created = await call("/issues", { method: "POST", body: { title, body } });
      await call(`/issues/${created.number}/labels`, { method: "PUT", body: { labels: await labelIds(labels) } });
      return issue(await call(`/issues/${created.number}`));
    },
    get: async (id) => issue(await call(`/issues/${id}`)),
    update: async (id, { body, open }) => {
      const patch = {};
      if (body !== undefined) patch.body = body;
      if (open !== undefined) patch.state = open ? "open" : "closed";
      return issue(await call(`/issues/${id}`, { method: "PATCH", body: patch }));
    },
    setLabels: async (id, labels) => call(`/issues/${id}/labels`, { method: "PUT", body: { labels: await labelIds(labels) } }),
    comment: (id, body) => call(`/issues/${id}/comments`, { method: "POST", body: { body } }),
    comments: async (id) => (await call(`/issues/${id}/comments`)).map((c) => ({ author: c.user?.login ?? "", body: c.body ?? "", at: c.created_at })),
    list: async (label, limit = 30) => (await call(`/issues?labels=${encodeURIComponent(label)}&state=all&type=issues&limit=${limit}`)).map(issue),
    // workflow_dispatch (Gitea 1.23+, Forgejo 8+).
    dispatch: (issueId, { token: t, ref = "main", workflow = "pointtoship.yml" } = {}) => request(`${api}/actions/workflows/${workflow}/dispatches`, {
      method: "POST", headers: { Authorization: `token ${t ?? token}` }, body: { ref, inputs: { issue: issueId } },
    }),
  };
};

const TRACKERS = { github, gitlab, gitea, forgejo: gitea, codeberg: (o) => gitea({ url: "https://codeberg.org", ...o }) };

/** Every label PointToShip uses, for the installer to create up front. */
export const ALL_LABELS = [LABEL_ALL, LABEL_DEVICE, ...STATUSES.map(statusLabel)];

/** A tracker client: { kind, repo, url, token }. */
export const tracker = (cfg) => {
  const make = TRACKERS[cfg.kind];
  if (!make) throw new Fail(500, `PointToShip does not know the tracker "${cfg.kind}". Known: ${Object.keys(TRACKERS).join(", ")}.`);
  const t = make(cfg);
  /** Moves an issue to one status, keeping every label that is not ours. */
  t.setStatus = async (id, status, current) => {
    const labels = current ?? (await t.get(id)).labels;
    const ours = new Set([LABEL_ALL, ...STATUSES.map(statusLabel)]);
    return t.setLabels(id, [...labels.filter((l) => !ours.has(l)), LABEL_ALL, statusLabel(status)]);
  };
  return t;
};

// ------------------------------------------------------------ device keys

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A browser's key: an HMAC of its id under the site secret. */
export const sign = async (secret, deviceId) => {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(`pointtoship-device:${deviceId}`)));
};

const same = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// ------------------------------------------------------------- the handler

const settings = (env) => {
  const need = (name) => {
    const v = env[name];
    if (!v) throw new Fail(500, `PointToShip is not configured: ${name} is missing on the server.`);
    return v;
  };
  return {
    secret: need("PTS_SECRET"),
    tracker: { kind: need("PTS_TRACKER"), repo: need("PTS_REPO"), url: env.PTS_TRACKER_URL || undefined, token: need("PTS_TRACKER_TOKEN") },
    owner: env.PTS_OWNER ?? "",
    origins: (env.PTS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    trigger: { kind: env.PTS_TRIGGER || "none", token: env.PTS_TRIGGER_TOKEN || undefined, ref: env.PTS_TRIGGER_REF || undefined, workflow: env.PTS_TRIGGER_WORKFLOW || undefined, url: env.PTS_TRIGGER_URL || undefined },
  };
};

const allowedOrigin = (request, origins) => {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  if (origin === new URL(request.url).origin || origins.includes(origin)) return origin;
  return false;
};

const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });

// Revocation is looked up on the tracker; a minute of memory spares the
// rate limit while the overlay polls.
const deviceCache = new Map();

const findDevice = async (t, id) => {
  const issues = await t.list(LABEL_DEVICE, 100);
  return issues.find((i) => DEVICE_RE.exec(i.body)?.[1] === id) ?? null;
};

const authorise = async (cfg, t, device) => {
  if (!device?.id || !device?.token || !same(device.token, await sign(cfg.secret, device.id))) {
    throw new Fail(401, "This browser has no valid key. Open the site once with your secret link.");
  }
  const hit = deviceCache.get(device.id);
  if (hit && Date.now() - hit.at < 60_000) {
    if (!hit.ok) throw new Fail(403, "This browser was blocked. Reopen its issue and open the secret link again to allow it.");
    return;
  }
  const issue = await findDevice(t, device.id);
  const ok = Boolean(issue?.open);
  deviceCache.set(device.id, { ok, at: Date.now() });
  if (!ok) throw new Fail(403, "This browser was blocked. Reopen its issue and open the secret link again to allow it.");
};

const kick = async (cfg, t, issueId) => {
  const { kind, token, ref, workflow, url } = cfg.trigger;
  if (kind === "none") return;
  try {
    if (kind === "webhook") {
      await request(url, { method: "POST", headers: { "X-PointToShip-Secret": token ?? "" }, body: { issue: issueId } });
    } else {
      await t.dispatch(issueId, { token, ref, workflow });
    }
  } catch (err) {
    // The issue is safe in the queue; a missed kick only delays it.
    console.error("PointToShip could not start the runner:", err.message);
  }
};

const text = (v, max, name) => {
  if (typeof v !== "string" || !v.trim()) throw new Fail(400, `${name} is empty.`);
  if (v.length > max) throw new Fail(400, `${name} is longer than ${max} characters.`);
  return v.trim();
};

const item = (i) => {
  const state = readState(i.body) ?? {};
  const payload = readPayload(i.body);
  return {
    id: i.id, title: i.title, url: i.url, updated: i.updated, status: statusOf(i.labels),
    said: state.message ?? "", after: state.after ?? null, preview: state.preview ?? null,
    path: payload?.view?.path ?? "/",
    selector: payload?.pointer?.selector ?? null,
  };
};

const actions = {
  async register(cfg, t, body) {
    if (!same(String(body.secret ?? ""), cfg.secret)) throw new Fail(401, "The secret link is not right.");
    const id = String(body.device?.id ?? "");
    if (!/^[a-z0-9-]{8,64}$/.test(id)) throw new Fail(400, "The browser id is not valid.");
    const name = String(body.device?.name ?? "A browser").slice(0, 80);
    if (!(await findDevice(t, id))) {
      const mention = cfg.owner ? `@${cfg.owner} ` : "";
      await t.create({
        title: `New browser for PointToShip: ${name}`,
        body: `${mention}A new browser can now send comments to this site: ${name}.\n\nIf that was not you, close this issue and the browser is blocked.\n\n<!-- pointtoship-device ${id} -->`,
        labels: [LABEL_DEVICE],
      });
    }
    deviceCache.delete(id);
    return { token: await sign(cfg.secret, id) };
  },

  async send(cfg, t, body) {
    await authorise(cfg, t, body.device);
    const comment = text(body.comment, 4000, "The comment");
    const payload = { version: VERSION, comment, pointer: body.pointer ?? { kind: "page" }, view: body.view ?? {}, device: String(body.device?.name ?? "") };
    if (JSON.stringify(payload).length > 60_000) throw new Fail(413, "The pointer is too large.");
    const first = comment.split("\n")[0];
    const title = first.length > 80 ? `${first.slice(0, 77)}...` : first;
    const where = payload.pointer.label ? `On: ${payload.pointer.label}${payload.view.path ? ` (${payload.view.path})` : ""}\n\n` : "";
    const issue = await t.create({
      title,
      body: `${comment}\n\n${where}${payloadBlock(payload)}`,
      labels: [LABEL_ALL, statusLabel("queued")],
    });
    await kick(cfg, t, issue.id);
    return { item: item(issue) };
  },

  async list(cfg, t, body) {
    await authorise(cfg, t, body.device);
    return { items: (await t.list(LABEL_ALL, 30)).filter((i) => !i.labels.includes(LABEL_DEVICE)).map(item) };
  },

  async answer(cfg, t, body) {
    await authorise(cfg, t, body.device);
    const id = String(body.id ?? "");
    const answer = text(body.text, 4000, "The answer");
    const issue = await t.get(id);
    if (!issue.labels.includes(LABEL_ALL)) throw new Fail(404, "That is not a PointToShip issue.");
    await t.comment(id, `${answer}\n\n${ANSWER_MARK}`);
    if (!issue.open) await t.update(id, { open: true });
    await t.setStatus(id, "queued", issue.labels);
    await kick(cfg, t, id);
    return { ok: true };
  },

  async ship(cfg, t, body) {
    await authorise(cfg, t, body.device);
    const id = String(body.id ?? "");
    const issue = await t.get(id);
    if (statusOf(issue.labels) !== "ready") throw new Fail(409, "That change is not waiting as a preview.");
    await t.setStatus(id, "ship", issue.labels);
    await kick(cfg, t, id);
    return { ok: true };
  },
};

/**
 * The server function: hand it the Request and the environment, get a
 * Response. Every host template is a few lines around this.
 */
export async function handle(request, env = {}) {
  let headers = {};
  try {
    const cfg = settings(env);
    const origin = allowedOrigin(request, cfg.origins);
    if (origin === false) return json({ error: "This site may not use this PointToShip endpoint." }, 403, headers);
    if (origin) headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return json({ error: "PointToShip takes POST requests." }, 405, headers);

    let body;
    try { body = await request.json(); } catch { throw new Fail(400, "The request is not JSON."); }
    const run = actions[body?.action];
    if (!run) throw new Fail(400, "Unknown action.");
    return json(await run(cfg, tracker(cfg.tracker), body), 200, headers);
  } catch (err) {
    if (err instanceof Fail) return json({ error: err.message }, err.status, headers);
    console.error("PointToShip:", err);
    const auth = err.status === 401 || err.status === 403;
    return json({ error: auth ? "The tracker refused the server's token. It may have expired." : "The tracker did not answer. Try again in a minute." }, 502, headers);
  }
}
