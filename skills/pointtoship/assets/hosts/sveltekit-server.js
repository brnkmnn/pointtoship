// SvelteKit: src/routes/api/pointtoship/+server.js
import { env } from "$env/dynamic/private";
import { handle } from "../../../../.pointtoship/lib/pointtoship-core.mjs";

export const POST = ({ request }) => handle(request, env);
export const OPTIONS = POST;
