// Stands in for a coding agent: reads the request, changes the test site the
// way FAKE_MODE says, writes result.json. Run by the runner with PTS_RUN_DIR.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.PTS_RUN_DIR;
const request = JSON.parse(readFileSync(join(dir, "request.json"), "utf8"));
const mode = process.env.FAKE_MODE ?? "done";
const result = (r) => writeFileSync(join(dir, "result.json"), JSON.stringify(r));

if (!request.comment || !request.pointer?.selector) throw new Error("request.json is missing the comment or the pointer");
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, `${JSON.stringify(request.thread)}\n`);

if (mode === "done") {
  const page = readFileSync("index.html", "utf8");
  writeFileSync("index.html", page.replace('class="icon small"', 'class="icon"'));
  result({ status: "done", ship: "live", message: "Made the icon the same size as the other two.", commit: "Feature icons: same size", after: { selector: request.pointer.selector, path: "/" } });
} else if (mode === "forbidden") {
  writeFileSync(".pointtoship/config.json", "{}");
  result({ status: "done", message: "Changed the settings." });
} else if (mode === "question") {
  result({ status: "needs-you", message: "Bigger than the other two, or the same size? a) the same (my pick) b) bigger" });
}
console.log("fake agent:", mode, "for", JSON.stringify(request.comment));
