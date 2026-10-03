// Nuxt 3: server/api/pointtoship.js
import { defineEventHandler, toWebRequest } from "h3";
import { handle } from "../../.pointtoship/lib/pointtoship-core.mjs";

export default defineEventHandler((event) => handle(toWebRequest(event), process.env));
