// Any Node server. Two ways in:
//
// 1. Express, Fastify (with its express adapter), Koa, or plain http:
//      import { nodeHandler } from "./.pointtoship/lib/pointtoship-node.mjs";
//      app.post("/api/pointtoship", nodeHandler);   // before any body parser
//      app.options("/api/pointtoship", nodeHandler);
//
// 2. On its own, for a site on another stack:
//      PORT=8787 node .pointtoship/lib/pointtoship-node.mjs
//    and proxy /api/pointtoship to it, or set PTS_ORIGINS and call it directly.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { handle } from "./pointtoship-core.mjs";

const toRequest = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  return new Request(new URL(req.url, `${proto}://${req.headers.host}`), {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
};

export const nodeHandler = async (req, res) => {
  const response = await handle(await toRequest(req), process.env);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.PORT ?? 8787);
  createServer(nodeHandler).listen(port, () => console.log(`PointToShip function on http://localhost:${port}`));
}
