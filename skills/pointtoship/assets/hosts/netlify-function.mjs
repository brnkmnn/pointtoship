// Netlify, for any framework or a static site: netlify/functions/pointtoship.mjs
import { handle } from "../../.pointtoship/lib/pointtoship-core.mjs";

export default (request) => handle(request, process.env);
export const config = { path: "/api/pointtoship" };
