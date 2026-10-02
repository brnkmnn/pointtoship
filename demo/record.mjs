// Records the demo flow on index.html: open the dot, Select, click the small
// icon, type "bigger", send, wait for Done, Show. Writes ../docs/img/demo.gif.
// Needs ffmpeg on PATH. Run: npm install && npm run record
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const page_url = pathToFileURL(join(here, "index.html")).href;
const out_gif = resolve(here, "../docs/img/demo.gif");
const size = { width: 1200, height: 700 };

// Headless video has no cursor, so the page gets a drawn one that follows
// the mouse and dips on each click.
const cursor_script = () => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 14 14"><path d="M3 1.5 L3 12 L5.8 9.4 L7.7 13 L9.4 12.2 L7.6 8.7 L11.3 8.5 Z" fill="#131211" stroke="#fff" stroke-width=".9" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "100000", pointerEvents: "none", transformOrigin: "4px 2px", transition: "scale .12s" });
    document.body.append(c);
    addEventListener("mousemove", (e) => { c.style.translate = `${e.clientX - 5}px ${e.clientY - 2}px`; }, true);
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

let at = { x: 600, y: 420 };
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
  await wait(1300);

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
  await wait(3200);

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
  rmSync(tmp, { recursive: true, force: true });
}
