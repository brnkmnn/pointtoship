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
  "after": { "selector": "#features > div:nth-of-type(1) > section:nth-of-type(3) > svg", "path": "/" }
}
```

| Field | Values |
| --- | --- |
| `status` | `done` (committed), `needs-you` (a question, nothing committed), `blocked` (your environment failed, nothing committed) |
| `ship` | With `done`: `live` (ship it now) or `preview` (risky, the owner looks first). Leave out otherwise. |
| `message` | For the owner: two or three sentences, or the question with lettered options. For `blocked`: one sentence for the runner about what broke. |
| `after` | With `done`: where the changed element is on the new page (`selector`, and `path` if it moved to another page). Show uses it. |

## .pointtoship/config.json (installer to everyone)

```json
{
  "site": "https://shop.example.com",
  "tracker": { "kind": "gitlab", "project": "acme/shop" },
  "allowed": ["src/", "content/", "public/images/"],
  "checks": ["npm run lint", "npx tsc --noEmit"],
  "start": { "command": "npm run dev -- --port 4310", "url": "http://127.0.0.1:4310" },
  "previews": true,
  "mode": "preview-when-risky"
}
```

- `allowed`: path prefixes the agent may change. The runner refuses commits
  touching anything else.
- `checks`: commands that must pass before a commit.
- `start`: how to run the site locally for screenshots. Leave out if the
  site cannot run in the runner.
- `previews`: whether the host builds a preview per branch.
- `mode`: `straight-to-live`, `preview-when-risky` or `always-preview`. The
  runner applies it; the agent only marks risky changes with `"ship":
  "preview"`.
