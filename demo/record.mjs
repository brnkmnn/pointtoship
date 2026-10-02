// Records the demo flow on index.html: scroll to the cards, open the dot,
// Select, click the small icon, type "bigger", send, wait for Done, Show (a
// real navigation with a view transition). Writes ../docs/img/demo.gif.
// Needs ffmpeg on PATH. Run: npm install && npm run record
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const out_gif = resolve(here, "../docs/img/demo.gif");
const size = { width: 1200, height: 700 };

// View transitions need a real origin, so the page is served, not opened.
const server = createServer((req, res) => {
  if (new URL(req.url, "http://x").pathname !== "/") { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(readFileSync(join(here, "index.html")));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const page_url = `http://127.0.0.1:${server.address().port}/`;

// Headless video has no cursor, so the page gets a drawn one that follows
// the mouse, dips on each click and keeps its place across a navigation.
const cursor_script = () => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 14 14"><path d="M3 1.5 L3 12 L5.8 9.4 L7.7 13 L9.4 12.2 L7.6 8.7 L11.3 8.5 Z" fill="#131211" stroke="#fff" stroke-width=".9" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "100000", pointerEvents: "none", transformOrigin: "4px 2px", transition: "scale .12s" });
    document.body.append(c);
    const put = (x, y) => { c.style.translate = `${x - 5}px ${y - 2}px`; };
    const last = JSON.parse(sessionStorage.getItem("demo-cursor") ?? "null");
    if (last) put(last.x, last.y);
    addEventListener("mousemove", (e) => {
      put(e.clientX, e.clientY);
      sessionStorage.setItem("demo-cursor", JSON.stringify({ x: e.clientX, y: e.clientY }));
    }, true);
    addEventListener("mousedown", () => { c.style.scale = ".82"; }, true);
    addEventListener("mouseup", () => { c.style.scale = "1"; }, true);
  });
};

const tmp = mkdtempSync(join(tmpdir(), "pts-demo-"));
const browser = await chromium.launch();
const started = Date.now();
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: tmp, size } });
await context.addInitScript(cursor_script);
const page = await context.newPage();

let at = { x: 640, y: 360 };
const wait = (ms) => page.waitForTimeout(ms);

// Eased glide, so the cursor reads like a hand and not a jump.
const glide = async (x, y, ms = 650) => {
  const from = at;
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await wait(16);
  }
  at = { x, y };
};

const centre = async (selector) => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`not on screen: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const click = async (selector, ms) => {
  const { x, y } = await centre(selector);
  await glide(x, y, ms);
  await wait(180);
  await page.mouse.down();
  await wait(90);
  await page.mouse.up();
};

try {
  await page.goto(page_url);
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(at.x, at.y);
  const ready = Date.now();
  await wait(1400);

  // Down to the cards, in small wheel steps so it reads as a scroll.
  const goal = await page.evaluate(() => document.querySelector("#features h2").getBoundingClientRect().top - 40);
  for (let done = 0; done < goal; done += 24) {
    await page.mouse.wheel(0, Math.min(24, goal - done));
    await wait(16);
  }
  await wait(700);

  await click(".fbm-dot", 900);
  await wait(650);
  await click('[data-act="select"]', 450);
  await wait(700);

  // Look around before choosing, the way a person does.
  const heading = await centre(".card:nth-child(1) h3");
  await glide(heading.x, heading.y, 900);
  await wait(450);
  const second = await centre(".card:nth-child(2) .icon");
  await glide(second.x, second.y, 550);
  await wait(400);
  await click(".card:nth-child(3) .icon", 600);
  await wait(700);

  await page.keyboard.type("bigger", { delay: 150 });
  await wait(600);
  await click('[data-act="send"]', 600);

  await page.locator(".fbm-pill.done").first().waitFor();
  await page.waitForFunction(() => document.querySelector('[data-act="show"]'));
  await wait(1700);
  await click('[data-act="show"]', 700);
  await page.waitForURL(/pts=12/);
  await wait(3400);

  await context.close();
  await browser.close();

  const video = join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm")));
  const skip = ((ready - started) / 1000).toFixed(2);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", skip, "-i", video,
    "-vf", "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop", "0", out_gif,
  ]);
  console.log(`wrote ${out_gif}`);
} finally {
  await browser.close().catch(() => {});
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
