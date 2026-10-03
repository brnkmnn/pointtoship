# Where the small function goes

Every file here is a few lines around `handle(request, env)` from
`.pointtoship/lib/pointtoship-core.mjs`. Pick the one for the site's
framework or host, copy it to the path in its first comment, and fix the
relative import if the folder depth differs.

The function needs these environment variables on the host (never in the
repository):

| Variable | What |
| --- | --- |
| `PTS_SECRET` | The secret in the owner's link. Long and random. Changing it blocks every browser. |
| `PTS_TRACKER` | `github`, `gitlab`, `gitea`, `forgejo` or `codeberg` |
| `PTS_REPO` | `owner/repo`, or the GitLab project path `group/project` |
| `PTS_TRACKER_URL` | Only for self-hosted GitLab, Gitea or Forgejo, e.g. `https://git.example.com` |
| `PTS_TRACKER_TOKEN` | Writes issues and comments. Its account is the one the runner trusts. |
| `PTS_OWNER` | The owner's username, mentioned on questions and new browsers |
| `PTS_ORIGINS` | Only when the function runs on another origin than the site: the site's origin(s), comma separated |
| `PTS_TRIGGER` | `none` (default), `github`, `gitlab`, `gitea`, `forgejo` or `webhook`: how the function wakes the runner |
| `PTS_TRIGGER_TOKEN` | For `gitlab`: a pipeline trigger token. For the others: a token allowed to start workflows, if the tracker token is not. For `webhook`: a shared secret. |
| `PTS_TRIGGER_REF` | Branch the triggered pipeline runs on, default `main` |
| `PTS_TRIGGER_WORKFLOW` | For `gitea`/`forgejo`: the workflow file name, default `pointtoship.yml` |
| `PTS_TRIGGER_URL` | For `webhook`: where to POST `{ "issue": "12" }` |

Any Node server (Express, Fastify, Koa, plain http) uses
`.pointtoship/lib/pointtoship-node.mjs`; see the comment at its top. Deno
and Bun: `deno-bun.md`.

A site with no server of its own (a static site, or one on PHP, Python, Ruby
or anything else) uses `cloudflare-worker.js` or `netlify-function.mjs` as a
separate small deployment, and sets `PTS_ORIGINS` to the site's origin.
