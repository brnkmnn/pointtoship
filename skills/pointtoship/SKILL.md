---
name: pointtoship
description: Sets up PointToShip on a website project, so the owner can point at something on the live site, say what should change, and have a coding agent work it, ship it and report back on the page. Use when the user asks to set up, install, configure, repair or remove PointToShip, or wants point-and-comment feedback on their site handled by an agent.
license: MIT
metadata:
  version: "0.1.0"
  status: beta
---

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
| Tracker | Issues where the code lives: GitHub, GitLab, Gitea, Forgejo or Codeberg. See [trackers](references/trackers.md). |
| Small function | On the site's own host, with the framework's template. A separate Cloudflare Worker when the site has no server or runs on another stack. Never a hosted relay. See [hosts](references/hosts.md). |
| Agent | The one you are running in, if it has a headless mode. See [runners](references/runners.md). |
| Runner | The tracker's CI, unless the project clearly runs elsewhere. |
| How much ships alone | *Preview when risky* where the host builds previews for free, otherwise *straight to live*. |
| Allowed paths | The folders that hold the site's content, components and styles. Never build config, CI, server code with secrets, or `.pointtoship/`. |
| Checks | The project's own lint, type and test commands that run in a minute or two. |
| Source codes | Only when the framework stamps them cheaply. |

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

Everything below comes from `assets/`. Copy files, do not rewrite them; adapt
only paths, names and the values in the config.

1. **The shared code.** Copy `assets/lib/` to `.pointtoship/lib/` in the
   repository.
2. **The method and the doctor.** Copy `assets/skills/pointtoship-method/` and
   `assets/skills/pointtoship-doctor/` to `.pointtoship/skills/`. The runner
   points the agent at the method there, so it works with every agent. Also
   copy them into the skills folder the owner's agent reads, so they can run
   the doctor by asking.
3. **The config.** Write `.pointtoship/config.json` with what you decided. The
   format is in
   [run-files.md](assets/skills/pointtoship-method/references/run-files.md).
   Add `.pointtoship/notes.md` with what the agent needs to know that the code
   does not say: where content comes from, words that must stay, who to ask.
4. **The function.** Copy the template from `assets/hosts/` for this
   framework or host and fix its import path. Set its environment variables on
   the host (`assets/hosts/README.md`); generate `PTS_SECRET` with
   `node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"`.
   Tokens the owner must create: say exactly where, one at a time, and wait.
5. **The loader.** Put `assets/overlay/loader.html` in the head of every page
   ([hosts](references/hosts.md) says where for each framework). Set
   `ENDPOINT`; keep `SCRIPT` on the pinned CDN copy unless the site's
   Content-Security-Policy or the owner prefers a copy on the site.
6. **The runner.** Copy the CI file from `assets/ci/` (or set up the
   computer service) and its secrets. Install the agent as a standalone
   command, never a desktop app's bundled copy.
7. **Labels and health.** Run `node .pointtoship/lib/pointtoship-runner.mjs
   --setup` with the runner's token. It creates the labels and says what is
   still missing. Fix everything it lists.
8. **Commit** the PointToShip files following the project's own rules for
   branches and reviews, and let it deploy.

## 5. Prove it

Send one test comment through the whole loop before you call it done:

1. Open the live site with the secret link in a browser you can drive (or
   call the function directly: `register` with the secret, then `send`).
2. Send: "PointToShip test from the installer: change nothing and report that
   the loop works."
3. Watch the issue go from Queued through Working to Done, with the agent's
   note on it.
4. Close the test browser's device issue if it was not the owner's.

If any step fails, fix it or tell the owner exactly what is missing. Never
report success without this run.

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
