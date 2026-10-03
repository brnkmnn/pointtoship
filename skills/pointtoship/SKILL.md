---
name: pointtoship
description: Sets up PointToShip on a website project, so the owner can point at something on the live site, say what should change, and have a coding agent work it, ship it and report back on the page. Use when the user asks to set up, install, configure, repair or remove PointToShip, or wants point-and-comment feedback on their site handled by an agent.
license: MIT
metadata:
  version: "0.0.1"
  status: draft
---

<!-- Draft. The method and doctor skills exist; the overlay, function and runner templates and the references/ files are not written yet. -->

# Set up PointToShip

You are installing PointToShip into the user's website project. Make it feel
effortless: work out everything you can on your own, decide what is clear,
and ask only where the choice is really theirs. The user should spend a few
minutes and almost no thought.

## 1. Read first

Before you say anything beyond a one-line "Looking at your project", gather:

- **Your own knowledge of the user and project.** Instruction files
  (CLAUDE.md, AGENTS.md, GEMINI.md, .github/copilot-instructions.md), your
  memory, earlier conversation. Branch and push rules, who to mention, words
  or files that must not change.
- **The git remote.** GitHub, GitLab or other. This sets the default tracker
  and the CI on offer.
- **Host and CI files.** `vercel.json`, `netlify.toml`, `wrangler.toml`,
  `render.yaml`, `.github/workflows/`, `.gitlab-ci.yml`, deploy scripts.
  Does a push to the main branch deploy? Does the host build a preview per
  branch?
- **The framework.** `package.json` and friends. Where a script tag goes,
  where a small server function can live, whether source codes can be
  stamped at build time.
- **Signed-in tools.** `gh`, `glab`, the agent CLIs on the machine, CI
  variables you can see. Prefer what is already there over installing
  something new.
- **An existing PointToShip setup.** If one exists, this is a repair or an
  update: read [the doctor](assets/skills/pointtoship-doctor/SKILL.md) and
  follow it instead.

## 2. Decide what is clear

Decide without asking whenever the project gives one sensible answer:

| Choice | Default |
| --- | --- |
| Tracker | Issues where the code lives. Linear or Jira only if the project already uses them. |
| Small function to the tracker | On the site's own host: a Next.js route, a Cloudflare Worker, a Netlify Function. Never a hosted relay. |
| Agent | The one you are running in, if it can run headless. |
| Runner | The tracker's CI, unless the project clearly runs elsewhere. |
| How much ships alone | *Preview when risky* where the host builds previews for free, otherwise *straight to live*. |
| Source codes | Stamp them when the framework supports it cheaply. |

Write each decision down for the summary. Do not explain it now.

## 3. Ask only what is theirs

Ask only when:

- **Several good answers cost different things.** For example CI minutes
  against a computer that must stay on.
- **Something only they can do.** Creating a token, storing a secret,
  approving access. Say exactly where to click, then wait.

One question at a time. Recommendation first, as `a)` with "(recommended)",
then the alternatives, each in one plain line. Never ask what you could have
read.

## 4. Install

For each part, use the matching file in `references/` and the templates in
`assets/`:

1. **The script tag** (`assets/overlay/`). Load it only for the owner, never
   for visitors.
2. **The small function** (`assets/functions/<host>`). It writes issues as
   the site's own account and holds the tracker token.
3. **The runner** (`assets/runners/<runner>`). It owns its agent: a
   standalone CLI install or the CI image's copy, never a desktop app's
   bundled one. It checks its health before every comment.
4. **The method and the doctor** (`assets/skills/pointtoship-method`,
   `assets/skills/pointtoship-doctor`). Copy both into the repository's
   skills folder (`.agents/skills/`, or the folder the chosen agent reads)
   so whichever agent the runner starts finds them.
5. **The config.** Write `.pointtoship/config.json` with what you decided:
   the allowed paths, the checks, how to start the site, previews and the
   mode. The format is in
   [run-files.md](assets/skills/pointtoship-method/references/run-files.md).
   Add `.pointtoship/notes.md` with anything the agent needs to know that the
   code does not say, such as where content comes from.
6. **The secret link.** Generate it and keep it out of the repository.

Follow the project's own rules from step 1 for branches, commits and
reviews.

## 5. Prove it

Send one test comment through the whole loop: from the page, to an issue,
through the runner and the agent, to a deploy, and back to the page as
Done with a working Show link. If any step fails, fix it or tell the user
exactly what is missing. Never report success without this run.

## 6. Report in a few lines

Plain words, no file paths, no plans. Use this shape:

> **PointToShip is set up for shop.example.com**
> - Comments become issues in GitLab, project `acme/shop`.
> - GitLab CI works them with Claude Code. About 60 comments a month fit the free minutes.
> - Changes go live when Vercel deploys `main`. Risky ones wait as a preview first.
> - The test comment went through and shipped in 2 minutes 40 seconds.
>
> Open your site once in each browser with this link, and the dot appears:
> `shop.example.com/?pointtoship=k7f2-9qa1`

Add a last line only if something is left for the user, and say exactly what.
