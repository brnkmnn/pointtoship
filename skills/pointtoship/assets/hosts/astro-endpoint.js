// Astro (server or hybrid output): src/pages/api/pointtoship.js
import { handle } from "../../../.pointtoship/lib/pointtoship-core.mjs";

export const prerender = false;
const env = () => (typeof process !== "undefined" ? process.env : import.meta.env);
export const POST = ({ request }) => handle(request, env());
export const OPTIONS = POST;
