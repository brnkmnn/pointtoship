# Trackers

PointToShip keeps every comment as an issue where the code lives. Two
accounts touch the issues:

- **The site's account** writes issues for the small function. Its token is
  `PTS_TRACKER_TOKEN` on the host. The runner only works issues this account
  wrote (`tracker.authors` in the config), so a stranger's issue never
  reaches the agent.
- **The runner's account** reads issues, comments, labels and pushes. In CI
  it is usually the job's own token.

The owner's username goes in `PTS_OWNER` and `tracker.owner`: they get
mentioned on questions and new browsers, and their comments count as answers.

Create the labels once: `node .pointtoship/lib/pointtoship-runner.mjs --setup`
(with `PTS_TRACKER_TOKEN` set).

## GitHub

- Site account: the owner's account or a bot account. A **fine-grained
  personal access token** for this one repository, permission **Issues: read
  and write**. A bot account is cleaner (issues show who wrote them); the
  owner's own token works too.
- Runner in GitHub Actions: `github.token` with `issues: write` and
  `contents: write` (set in the workflow). Nothing to create.
- Wake-up: none needed. Issues opened and labels added with the site's token
  start the workflow (`on: issues`). `PTS_TRIGGER=github` adds a
  `repository_dispatch` as well, which needs a token with **Contents: read and
  write**.
- `tracker.authors`: the site account's login. GitHub Enterprise:
  `PTS_TRACKER_URL=https://HOST/api/v3`.

## GitLab

- Site account: a separate user with the **Reporter** role on the project and
  a **personal access token** with the `api` scope. (Project access tokens
  work too, on plans that have them.)
- Runner in GitLab CI: `PTS_TRACKER_TOKEN` is a token of an account with
  **Developer** role (to comment and label); `PTS_GIT_TOKEN` a token with
  `write_repository`, or leave it out when the project allows the CI job
  token to push.
- Wake-up: GitLab starts no pipeline when an issue opens. Create a
  **pipeline trigger token** (Settings, CI/CD, Pipeline trigger tokens; free
  on every plan) and set `PTS_TRIGGER=gitlab`, `PTS_TRIGGER_TOKEN` and
  `PTS_TRIGGER_REF` on the function's host. A scheduled pipeline with
  `PTS_SCHEDULE=1` every hour or so catches a missed trigger.
- Self-hosted: `PTS_TRACKER_URL=https://gitlab.example.com`.

## Gitea, Forgejo, Codeberg

- Site account: a separate user with write access to issues, and an access
  token with `write:issue` (and `read:repository`).
- `PTS_TRACKER=codeberg` needs no URL; `gitea` and `forgejo` need
  `PTS_TRACKER_URL=https://git.example.com`.
- Runner in Forgejo or Gitea Actions: secrets `PTS_TRACKER_TOKEN` and
  `PTS_GIT_TOKEN` (an account with issue and repository write).
- Wake-up: issue events start the workflow. `PTS_TRIGGER=forgejo` (or
  `gitea`) adds a `workflow_dispatch` call (Forgejo 8+, Gitea 1.23+).
- Labels: older versions take label ids only; PointToShip resolves names and
  creates missing labels by itself.

## Not yet

Bitbucket, Azure DevOps, Linear and Jira need an adapter in
`pointtoship-core.mjs` (`create`, `get`, `update`, `setLabels`, `comment`,
`comments`, `list`, `check`, `ensureLabels`, `dispatch`). Until then, such a
project can still use PointToShip with its code mirrored to one of the
trackers above.
