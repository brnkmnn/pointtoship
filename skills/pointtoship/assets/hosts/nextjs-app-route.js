// Next.js (App Router): app/api/pointtoship/route.js (or src/app/...).
import { handle } from "../../../.pointtoship/lib/pointtoship-core.mjs";

export const dynamic = "force-dynamic";
export const POST = (request) => handle(request, process.env);
export const OPTIONS = POST;
