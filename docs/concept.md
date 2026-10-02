# PointToShip in detail

- [Pointing](#pointing)
- [Runners](#runners)
- [Previews](#previews)
- [Safety](#safety)
- [The installer](#the-installer)
- [What exists already](#what-exists-already)

## Pointing

A pointer describes the same spot several independent ways, so that when one
fails (the text was edited, the layout moved) the others still find it. The
[W3C Web Annotation model](https://www.w3.org/TR/annotation-model/#selectors)
describes exactly this with layered selectors.

### What a pointer carries, strongest first

1. **Where it is in the code.** Frameworks can stamp each element with the
   source file and line at build time. On a public site that becomes a short
   code (`data-ps="a3f9"`), and only the runner holds the table from code to
   file. Optional, and the best signal when present.
2. **What it says or shows.** The text with a little before and after, how it
   broke into lines on that screen, an image or video by file and alt text, a
   link by target, a button by label, the nearest heading above it.
3. **Where it sits.** A robust CSS path and the section around it, for things
   without text.
4. **How it looks.** Position, size and computed style. "Too big" and "does
   not line up" become measurable.
5. **The state of the page.** Address, open overlays, screen size, device,
   scroll position, theme. Enough for the runner to rebuild the view and take
   the screenshot itself.

### Ways to point

- One element, then **Wider** to its parent and its section.
- A few words selected inside a paragraph.
- A frame drawn round an area.
- Several things at once, for "swap these" or "make these the same size".
- The whole page.

### A pointer, as the runner receives it

```json
{
  "comment": "These two belong to the bridge chapter",
  "pointer": {
    "kind": "row",
    "source": ["a3f9", "a3fa"],
    "media": ["istanbul/Meeting-07L.jpg", "istanbul/Meeting-08L.jpg"],
    "heading": "Meetings",
    "selector": "main section:nth-of-type(14) [data-row]",
    "box": { "x": 0, "y": 257, "w": 1440, "h": 417 }
  },
  "view": { "path": "/projects/istanbul", "width": 1512, "height": 857,
            "dpr": 2, "device": "Mac Chrome", "scroll": 17878, "theme": "light" }
}
```

### From pointer to code

1. A source code is there: open that file at that line.
2. Otherwise search the repository for the text and the file names.
3. Not in the repository: the content comes from a CMS or a data source, so
   look there.
4. Otherwise use the selector and the screenshot, and find it by looking.

A site may also label its own meaningful ids (`data-ps-id="photo:Work-03S"`).
Without such labels it still works, one level more generic.

## Runners

Easy, robust and reliable wins. The installer recommends one and explains the
others.

| Runner | Good | Watch out |
| --- | --- | --- |
| **The tracker's CI** (default) | No machine of your own. Every run in a fresh, isolated container. Starts on a new issue, no polling. Ready integrations exist for Claude, Codex and others. | CI minutes beyond the free allowance (GitLab Free: 400 minutes a month, roughly 50 to 80 comments). An agent key stored in CI. |
| **Hosted agent service** | Almost no setup (for example GitHub Copilot's cloud agent). | Bound to that service, and usually ends in a pull request rather than a deploy. |
| **Your own computer** | Free, full control, real fonts and screenshots. Sandboxed, for example with macOS sandbox-exec. | Only while the machine is on and its login is valid. Use a long-lived token and a standalone agent install, not the copy inside a desktop app, which can move when the app updates. |
| **A small server** | Always on, any agent. | The most upkeep: updates, logs, restarts. |

### Before every comment

Whichever runner you choose, it owns its agent: a standalone install of the
agent's command-line tool, or the one in the CI image. Where it has to look
for an agent, it takes the newest one it finds, and a configured path wins
over the search.

Before it takes a comment, the runner checks itself: the agent starts, its
login or token is valid, the tracker answers, and the deploy credentials are
there.

| Where it fails | For example | What happens |
| --- | --- | --- |
| The runner | The agent is missing or moved, the login expired, the tracker is down. | The comment stays in the queue. You hear about it once, with what broke and what fixes it. The runner pauses, checks again, and goes on by itself. You are never asked for more detail. |
| The comment | Unclear, impossible, or the change has a real downside. | The agent asks you on the page, and your answer goes into the same issue. |

## Previews

Where the host builds a preview for every branch (Vercel, Netlify, Cloudflare
Pages, Render), previews cost nothing: the run works on its own branch, the
host builds a preview, and **Ship it** merges. Elsewhere previews are real
work, so the installer only offers them where they are cheap.

| Mode | What happens |
| --- | --- |
| Straight to live | Every change ships when it is done. Git is the undo. |
| **Preview when risky** (default where previews are free) | Changes that remove something, touch other pages or rewrite words you did not supply wait as *Ready to look*. Everything else ships. |
| Always preview | Nothing goes live without your OK. |
| Collected | Several finished comments on one preview, shipped together. |

- **Show** opens the preview at the very element, as it does on the live site.
- A thin bar on the preview: *Preview of #11 · Ship it · Not like this*. The
  last opens the comment box on that issue, and the run reworks the same
  preview.
- Before and after screenshots, at the commenter's screen size, sit beside
  each item in Issues.
- Previews nobody touches close after a few days. They are never indexed and
  never counted in analytics.

## Safety

1. **Only the owner can send.** A secret link once per browser. Each new
   browser opens its own issue, mentions the owner, and can be revoked there.
2. **Only accepted authors count.** The runner reads issues written by the
   site's own account and notes from the owner. A stranger's comment never
   reaches the agent as an instruction.
3. **Words are data.** The comment is the only instruction; everything
   captured from the page arrives labelled as page content.
4. **The run is fenced.** It may change content, components, styles, records
   and docs, and nothing that runs later outside it. No keys, no network
   tools, no pushing, no deploying.
5. **Checked before shipping.** Every file the run's commits touched is
   checked; anything outside the allowed paths, and nothing ships.
6. **Everything is in git.** Any single change can be reverted.

## The installer

One skill you run once, in whatever agent you already use. It starts from
what is already there, decides what is clear, and asks only where the choice
is really yours.

| It looks at | And decides |
| --- | --- |
| The git remote | Where the code lives and where comments go. Linear or Jira only if the project already uses them. |
| Host and CI files | How a push deploys, where the small function that talks to the tracker goes, whether previews come for free. |
| The framework | Where the script tag goes, and whether source codes can be stamped at build time. |
| Signed-in tools | Which agent and runner are already in reach. |
| Your agent's notes | What it already knows about you and the project (CLAUDE.md, AGENTS.md, memory). |

It asks only when there are several good answers that cost different things
(CI minutes or your own computer), or when it needs something only you can do
(a token, a secret in CI). One question at a time, recommendation first.

It ends with a test comment through the whole loop and a summary like this:

> **PointToShip is set up for shop.example.com**
> - Comments become issues in GitLab, project `acme/shop`.
> - GitLab CI works them with Claude Code. About 60 comments a month fit the free minutes.
> - Changes go live when Vercel deploys `main`. Risky ones wait as a preview first.
> - The test comment went through and shipped in 2 minutes 40 seconds.
>
> Open your site once in each browser with this link, and the dot appears:
> `shop.example.com/?pointtoship=k7f2-9qa1`

It also writes two skills into your repository: the **method** (how a comment
is worked) and the **doctor** (what to do when something hangs). The doctor
checks first whether the agent has moved or been updated, then whether its
login has expired, and only then looks at a stuck queue or a failed deploy.

## What exists already

Visual feedback tools turn a click on a live site into a ticket for a human
(BugHerd, Marker.io). Agent pointing tools hand a selected element to a coding
agent on a local dev server (stagewise, Agentation, Vibe Annotations,
Frontman). Issue agents turn an issue into a pull request (Claude Code for
GitHub Actions and GitLab CI, GitHub Copilot's cloud agent). PointToShip joins
the three: it starts on the live site, ends deployed, and reports back where
it started.
