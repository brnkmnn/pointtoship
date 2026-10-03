// Cloudflare Worker, deployed on its own: for static sites and for sites on
// any other stack. Deploy with `npx wrangler deploy`, set the variables with
// `npx wrangler secret put PTS_TRACKER_TOKEN` (and the others), and set
// PTS_ORIGINS to the site's origin. The loader's ENDPOINT is then the
// worker's URL.
import { handle } from "../lib/pointtoship-core.mjs";

export default { fetch: (request, env) => handle(request, env) };
