// Vercel, for any framework or a static site: api/pointtoship.js
import { handle } from "../.pointtoship/lib/pointtoship-core.mjs";

export const POST = (request) => handle(request, process.env);
export const OPTIONS = POST;
