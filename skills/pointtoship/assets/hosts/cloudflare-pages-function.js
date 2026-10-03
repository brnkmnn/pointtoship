// Cloudflare Pages: functions/api/pointtoship.js
import { handle } from "../../.pointtoship/lib/pointtoship-core.mjs";

export const onRequest = ({ request, env }) => handle(request, env);
