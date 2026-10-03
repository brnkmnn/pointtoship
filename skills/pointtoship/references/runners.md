# Runners and agents

The runner is one script, `.pointtoship/lib/pointtoship-runner.mjs` (Node 18+
and git, no dependencies). Where it runs decides only how it starts.

| Runner | Start it with | Good for |
| --- | --- | --- |
| GitHub Actions | `assets/ci/github-actions.yml` | code on GitHub (default) |
| GitLab CI | `assets/ci/gitlab-ci.yml` plus a pipeline trigger token | code on GitLab (default) |
| Forgejo or Gitea Actions | `assets/ci/forgejo-actions.yml` | Codeberg, Forgejo, Gitea |
| Any other CI (Woodpecker, Bitbucket Pipelines, Jenkins, Buildkite) | a job that runs `node .pointtoship/lib/pointtoship-runner.mjs` with the variables, started by `PTS_TRIGGER=webhook` or a schedule | what the team already has |
| A Mac | `assets/ci/launchd.plist` with `--watch 60` | free, no CI minutes, real browsers for screenshots |
| A Linux server or computer | `assets/ci/systemd.service` with `--watch 60` | always on |
| Windows | Task Scheduler running `node ... --watch 60` at logon | |

On a computer or server, give the runner **its own clone** of the site: it
resets its checkout to the deploy branch before each comment. Keep the
secrets in an env file outside the clone.

## Agents

| Preset | Install | Key | Notes |
| --- | --- | --- | --- |
| `claude` | `npm i -g @anthropic-ai/claude-code` | `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` for a subscription | On a computer, use the token rather than a login, which expires. |
| `codex` | `npm i -g @openai/codex` | `OPENAI_API_KEY` | Runs in its workspace-write sandbox. |
| `gemini` | `npm i -g @google/gemini-cli` | `GEMINI_API_KEY` | |
| `copilot` | `npm i -g @github/copilot` | `COPILOT_GITHUB_TOKEN` | Needs a Copilot plan. |
| `cursor` | Cursor's CLI installer | `CURSOR_API_KEY` | |
| `opencode` | `npm i -g opencode-ai` | the model provider's key | |
| any other | its installer | set `agent.keys` | set `agent.command` with `{prompt}`, and `agent.check` |

Always install the agent as a standalone command, never point the runner at a
copy bundled inside a desktop app: app updates move it.

The agent gets a clean environment: its own key, `PATH`, `HOME` and the
basics. The tracker token and the push token stay with the runner.

## Details per CI

- **GitHub:** pushes made with `github.token` do not start other workflows.
  If the site deploys through a GitHub Actions workflow on push, give
  `PTS_GIT_TOKEN` a fine-grained token with **Contents: read and write**
  instead. Hosts that deploy through their own GitHub app (Vercel, Netlify,
  Cloudflare) are not affected. Protected branches must allow the runner's
  account to push, or use previews only.
- **GitLab:** the free tier includes 400 CI minutes a month; one comment
  usually takes three to eight. Keep the job on `node:22` or an image with the
  site's toolchain.
- **Forgejo, Gitea:** `runs-on` must match a label of the instance's runner.
- **All:** install the site's dependencies before the runner (`npm ci`,
  `pnpm install --frozen-lockfile`, `yarn install --immutable`, `bun install`)
  so the agent can run the checks.

## Health

`--check` reports what is missing: the agent does not start, the tracker
refuses the token, the checkout is dirty, git cannot push, a deploy variable
is missing. A failure on the runner's side keeps the comment queued, tells
the owner once, and retries; after two failed tries on the same comment it
asks the owner instead of looping.
