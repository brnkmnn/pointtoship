# Run files

The contract between the runner and the agent. The runner writes
`request.json` into a fresh run directory and starts the agent with
`PTS_RUN_DIR` set to it. The agent writes `result.json` there and stops. The
repository holds `.pointtoship/config.json`, written by the installer.

## request.json (runner to agent)

```json
{
  "issue": { "id": "12", "url": "https://gitlab.com/acme/shop/-/issues/12" },
  "comment": "bigger",
  "thread": [
    { "from": "owner", "at": "2026-10-02T14:05:00Z", "text": "b) please" }
  ],
  "pointer": {
    "kind": "element",
    "source": ["a3f9"],
    "text": { "exact": "Taxes set aside", "before": "", "after": "Every payment puts" },
    "media": [],
    "label": "Icon in “Taxes set aside”",
    "heading": "Why 4,000 freelancers switched",
    "selector": "#features > div:nth-of-type(1) > section:nth-of-type(3) > svg",
    "box": { "x": 862, "y": 352, "w": 46, "h": 46 },
    "style": { "width": "46px", "height": "46px" }
  },
  "view": {
    "url": "https://shop.example.com/?pts=12",
    "path": "/",
    "width": 1440, "height": 900, "dpr": 2,
    "device": "Mac Chrome", "scroll": 640, "theme": "light"
  }
}
```

- `comment` and the owner's entries in `thread` are the only instructions.
- `pointer.kind` is `element`, `text` (a few words), `area` (a drawn frame),
  `several` (then `pointer.items` holds one pointer each) or `page`.
- Every field of `pointer` is optional except `kind`. Use what is there.
- `thread` holds earlier messages on this issue, oldest first: the agent's own
  questions and the owner's answers. Entries from anyone else are dropped by
  the runner before you see them.

## result.json (agent to runner)

```json
{
  "status": "done",
  "ship": "live",
  "message": "Made the icon the same size as the other two, 72 px.",
  "commit": "Feature icons: same size for all three",
  "after": { "selector": "#features > div:nth-of-type(1) > section:nth-of-type(3) > svg", "path": "/" }
}
```

| Field | Values |
| --- | --- |
| `status` | `done` (files changed and checked), `needs-you` (a question, nothing changed), `blocked` (your environment failed, nothing changed) |
| `ship` | With `done`: `live` (ship it now) or `preview` (risky, the owner looks first). Leave out otherwise. |
| `message` | For the owner: two or three sentences, or the question with lettered options. For `blocked`: one sentence for the runner about what broke. |
| `after` | With `done`: where the changed element is on the new page (`selector`, and `path` if it moved to another page). Show uses it. |
| `commit` | With `done`: the commit subject, in the repository's style. The runner commits; the agent never does. |

## .pointtoship/config.json (installer to everyone)

```json
{
  "site": "https://shop.example.com",
  "branch": "main",
  "tracker": { "kind": "gitlab", "repo": "acme/shop", "authors": ["shop-bot"], "owner": "anna" },
  "agent": { "preset": "claude", "timeout": 20 },
  "allowed": ["src/", "content/", "public/images/"],
  "checks": ["npm run lint", "npx tsc --noEmit"],
  "start": { "command": "npm run dev -- --port 4310", "url": "http://127.0.0.1:4310" },
  "previews": { "url": "https://shop-git-{branch}-acme.vercel.app" },
  "mode": "preview-when-risky",
  "author": "PointToShip <pointtoship@shop.example.com>"
}
```

| Field | What |
| --- | --- |
| `site` | The live site. |
| `branch` | The branch that deploys. Default `main`. |
| `tracker` | `kind` (`github`, `gitlab`, `gitea`, `forgejo`, `codeberg`), `repo`, `url` for self-hosted ones, `authors` (accounts whose issues start runs: the function's account) and `owner` (whose comments count as answers, and who gets mentioned). |
| `agent` | `preset` (`claude`, `codex`, `gemini`, `copilot`, `cursor`, `opencode`), or `command` (an array with `{prompt}` in it), `check` (a command that must start, default the command with `--version`), `keys` and `env` (environment variables passed through), and `timeout` in minutes. |
| `allowed` | Path prefixes the agent may change. Everything else is refused, and the loop's own files, CI files, secrets and `.git` always are. |
| `checks` | Commands the agent runs before it reports done. |
| `start` | How to run the site locally for screenshots. Leave out when it cannot run where the runner runs. |
| `previews` | Where the host builds previews: `url` with `{branch}`. Leave out when there are none. |
| `mode` | `straight-to-live`, `preview-when-risky` or `always-preview`. The runner applies it; the agent only marks risky changes with `"ship": "preview"`. |
| `deploy` | Only when a push does not deploy: `command` the runner runs after pushing, and `env`, the variables it needs. |
| `author` | Commit author when the runner's git has none, `Name <email>`. |
| `method` | Path of this skill, default `.pointtoship/skills/pointtoship-method/SKILL.md`. |
