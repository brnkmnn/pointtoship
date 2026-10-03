// In-memory stand-ins for the GitHub, GitLab and Gitea/Forgejo REST APIs:
// the endpoints PointToShip uses, nothing more, over one shared store. The
// store keeps issues in one plain shape so the test can check them the same
// way for every tracker.
import { createServer } from "node:http";

export const mockTracker = ({ kind, users }) => {
  const issues = new Map();
  const labels = new Map(); // name -> id
  let next = 1;
  let clock = Date.now();
  const now = () => new Date((clock += 1000)).toISOString();
  const label = (name) => { if (!labels.has(name)) labels.set(name, labels.size + 1); return name; };
  const nameOf = (id) => [...labels].find(([, i]) => i === id)?.[0] ?? id;
  const dispatches = [];

  const shape = {
    github: (i) => ({ number: i.id, title: i.title, body: i.body, user: { login: i.author }, labels: i.labels.map((name) => ({ name })), state: i.state, html_url: `https://tracker.example/${i.id}`, updated_at: i.updated }),
    gitlab: (i) => ({ iid: i.id, title: i.title, description: i.body, author: { username: i.author }, labels: [...i.labels], state: i.state === "open" ? "opened" : "closed", web_url: `https://tracker.example/${i.id}`, updated_at: i.updated }),
    gitea: (i) => ({ number: i.id, title: i.title, body: i.body, user: { login: i.author }, labels: i.labels.map((name) => ({ id: labels.get(name), name })), state: i.state, html_url: `https://tracker.example/${i.id}`, updated_at: i.updated }),
  }[kind];
  const note = {
    github: (c) => ({ user: { login: c.author }, body: c.body, created_at: c.at }),
    gitlab: (c) => ({ author: { username: c.author }, body: c.body, created_at: c.at, system: false }),
    gitea: (c) => ({ user: { login: c.author }, body: c.body, created_at: c.at }),
  }[kind];

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const body = !raw ? {} : (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(data === undefined ? "" : JSON.stringify(data)); };
    const url = new URL(req.url, "http://x");

    const token = kind === "github" ? (req.headers.authorization ?? "").replace("Bearer ", "")
      : kind === "gitlab" ? req.headers["private-token"] : (req.headers.authorization ?? "").replace("token ", "");
    const prefix = { github: /^\/repos\/[^/]+\/[^/]+(\/.*)?$/, gitlab: /^\/api\/v4\/projects\/[^/]+(\/.*)?$/, gitea: /^\/api\/v1\/repos\/[^/]+\/[^/]+(\/.*)?$/ }[kind];
    const m = url.pathname.match(prefix);
    if (!m) return send(404, { message: "Not Found" });
    const path = m[1] ?? "";

    // GitLab's pipeline trigger authenticates with the trigger token in the form.
    if (kind === "gitlab" && path === "/trigger/pipeline") { dispatches.push({ issue: body["variables[PTS_ISSUE]"], token: body.token, ref: body.ref }); return send(201, {}); }
    const user = users[token];
    if (!user) return send(401, { message: "401 Unauthorized" });

    let r;
    if (path === "" && req.method === "GET") return send(200, { name: "shop" });
    if (path.startsWith("/labels")) {
      if (req.method === "GET") return send(200, [...labels].map(([name, id]) => ({ id, name })));
      label(body.name);
      return send(201, { id: labels.get(body.name), name: body.name });
    }
    if (kind === "github" && path === "/dispatches") { dispatches.push({ issue: body.client_payload?.issue }); return send(204); }
    if (kind === "gitea" && (r = path.match(/^\/actions\/workflows\/([^/]+)\/dispatches$/))) { dispatches.push({ issue: body.inputs?.issue, workflow: r[1] }); return send(204); }

    if (path === "/issues" && req.method === "POST") {
      const given = kind === "gitlab" ? (body.labels ? body.labels.split(",") : []) : kind === "github" ? (body.labels ?? []) : [];
      const i = { id: next++, title: body.title, body: kind === "gitlab" ? body.description : body.body, author: user, labels: given.map(label), state: "open", updated: now(), comments: [] };
      issues.set(i.id, i);
      return send(201, shape(i));
    }
    if (path === "/issues" && req.method === "GET") {
      const want = url.searchParams.get("labels");
      return send(200, [...issues.values()].filter((i) => !want || i.labels.includes(want)).sort((a, b) => b.updated.localeCompare(a.updated)).map(shape));
    }
    if ((r = path.match(/^\/issues\/(\d+)$/))) {
      const i = issues.get(Number(r[1]));
      if (!i) return send(404, { message: "Not Found" });
      if (req.method !== "GET") {
        if (kind === "gitlab") {
          if (body.description !== undefined) i.body = body.description;
          if (body.state_event) i.state = body.state_event === "close" ? "closed" : "open";
          if (body.labels !== undefined) i.labels = body.labels.split(",").filter(Boolean).map(label);
        } else {
          if (body.body !== undefined) i.body = body.body;
          if (body.state) i.state = body.state;
        }
        i.updated = now();
      }
      return send(200, shape(i));
    }
    if ((r = path.match(/^\/issues\/(\d+)\/labels$/)) && req.method === "PUT") {
      const i = issues.get(Number(r[1]));
      i.labels = body.labels.map((l) => (kind === "gitea" ? nameOf(l) : label(l)));
      i.updated = now();
      return send(200, i.labels.map((name) => ({ name })));
    }
    if ((r = path.match(/^\/issues\/(\d+)\/(comments|notes)$/))) {
      const i = issues.get(Number(r[1]));
      if (req.method === "POST") { i.comments.push({ author: user, body: body.body, at: now() }); i.updated = now(); return send(201, {}); }
      return send(200, i.comments.map(note));
    }
    send(404, { message: `No mock for ${req.method} ${path}` });
  });
  server.issues = issues;
  server.dispatches = dispatches;
  return server;
};
