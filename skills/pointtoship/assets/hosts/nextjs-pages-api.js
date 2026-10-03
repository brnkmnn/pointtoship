// Next.js (Pages Router): pages/api/pointtoship.js (or src/pages/...).
// The edge runtime hands over a standard Request.
import { handle } from "../../.pointtoship/lib/pointtoship-core.mjs";

export const config = { runtime: "edge" };
export default (request) => handle(request, process.env);
