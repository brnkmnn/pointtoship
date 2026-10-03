// Remix and React Router 7 (framework mode): app/routes/api.pointtoship.js
import { handle } from "../../.pointtoship/lib/pointtoship-core.mjs";

export const action = ({ request }) => handle(request, process.env);
