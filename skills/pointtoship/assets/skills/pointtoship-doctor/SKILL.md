---
name: pointtoship-doctor
description: Finds and fixes what keeps PointToShip from working on this site, in a fixed order, starting with a moved or updated agent and an expired login. Use when comments stay Queued, a run failed or was blocked, the dot does not appear, a deploy failed, or the owner says PointToShip is stuck or broken.
license: MIT
metadata:
  version: "0.1.0"
---

# Fix PointToShip

Something in the loop is not working. Go through the checks below in order
and stop at the first one that fails: fix it, then run the checks again from
the top. Most problems are the first two.

Read `.pointtoship/config.json` first. It says which tracker, which runner
and which host this site uses.

Never ask the owner for more detail about a comment when the problem is on
this side. Tell them once what broke and what you did, in two or three
sentences.

## 1. The agent: moved or updated?

The runner starts an agent by a path or a command. Updates move things.

- Run the command the runner uses with `--version`. It must start.
- **On a computer:** the runner must use a standalone install of the agent
  (from its own installer or package manager), never the copy bundled inside
  a desktop app, which moves on every app update. If it points into an app
  bundle, switch it to a standalone install and set its path in the runner's
  config.
- **In CI:** the job's image or setup step must install the agent. Check the
  last job log for "not found".

## 2. The login: expired?

- Run the agent once with a trivial prompt, headless, the way the runner
  does. An authentication error means the login expired.
- **On a computer:** use a long-lived token for runners (for Claude Code:
  `claude setup-token`), not an interactive login. The owner has to create
  it; tell them exactly what to run and where to paste it.
- **In CI:** the key is a CI variable. Check it exists, is not expired, and
  is available to the branch the job runs on (protected variables only reach
  protected branches).

## 3. The tracker: reachable?

- With the site's tracker token, read one issue. A 401 or 403 means the
  token expired or lost its scope; a 404 means the project moved.
- The token lives with the small function on the site's host, as an
  environment variable. Renew it there, never in the repository.

## 4. The queue: stuck?

- An issue labelled `pts-working` for more than 30 minutes with no run
  going is stuck. Look for the runner's lock (`.pointtoship/run.lock` on a
  computer, a running job in CI). If no run holds it, remove the lock and
  set the issue back to `pts-queued`.
- Issues labelled `pts-queued` that never start: the runner is off (computer
  asleep, launchd job unloaded) or the CI trigger is missing. Start it or
  restore the trigger.
- Only issues written by the site's own account start a run. An issue made
  by hand will wait forever; that is by design.

## 5. The deploy: failed?

- Find the last commit the runner pushed and the host's build for it. A
  failed build means the change is committed but not live.
- Fix the build error if it is in the allowed paths, commit, and let the
  runner ship it. Otherwise tell the owner what failed in one sentence.

## 6. The page: no dot?

- The owner must have opened the site once in this browser with the secret
  link. A new browser opens its own issue and waits for the owner to allow
  it there.
- The loader must be in the page head. Check the deployed HTML, not the
  source: a framework may have dropped it.
- The small function must answer. Open its URL; an error there usually means
  a missing environment variable on the host.

## When everything passes

Send a test comment through the whole loop, from the page to Done. If it
reaches Done, tell the owner it works again and what was wrong.
