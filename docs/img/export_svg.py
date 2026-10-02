"""Run after changing a diagram on the concept page.

Export the concept page's inline diagrams as standalone light and dark SVGs for GitHub."""
import re, sys
from pathlib import Path

OUT = Path(__file__).resolve().parent
SRC = OUT.parent.parent / "concept" / "index.html"
FONTS = {
    "--display": '"Helvetica Neue", Arial, sans-serif',
    "--body": 'Georgia, "Times New Roman", serif',
    "--mono": 'ui-monospace, Menlo, Consolas, monospace',
}

html = SRC.read_text()

def tokens(block):
    return dict(re.findall(r"(--[\w-]+):\s*([^;]+);", block))

root = re.search(r":root \{(.*?)\n\}", html, re.S).group(1)
dark = re.search(r':root\[data-theme="dark"\] \{(.*?)\}', html, re.S).group(1)
light_t = tokens(root)
dark_t = {**light_t, **tokens(dark)}

dg_rules = "\n".join(l for l in html.splitlines() if l.startswith(".dg "))
if not dg_rules:
    sys.exit("no .dg rules found")

def css(t):
    out = dg_rules
    for k, v in {**t, **FONTS}.items():
        out = out.replace(f"var({k})", v.strip())
    if "var(" in out:
        sys.exit("unresolved token: " + re.search(r"var\([^)]*\)", out).group(0))
    return out

svgs = re.findall(r'(<svg class="dg".*?</svg>)', html, re.S)
if len(svgs) != 3:
    sys.exit(f"expected 3 diagrams, found {len(svgs)}")

def inner(svg):
    return re.sub(r"^<svg[^>]*>|</svg>$", "", svg.strip(), flags=re.S)

def heading(x, title, sub, accent):
    cls = ' class="acc"' if accent else ""
    return (f'<text x="{x}" y="22" style="font-size:12px;letter-spacing:.08em;font-weight:700"{cls}>{title}</text>'
            f'<text class="small" x="{x}" y="40" style="font-size:12px">{sub}</text>')

naming, pointing, loop = svgs
compare_body = (
    heading(150, "NAMING IT", "You need to know what it is called, or describe it.", False)
    + f'<g transform="translate(0 50)">{inner(naming)}</g>'
    + heading(690, "POINTING AT IT", "It does not matter what it is called.", True)
    + f'<g transform="translate(540 50)">{inner(pointing)}</g>'
)
figures = {
    "why": ('0 0 1060 285', compare_body,
            "Naming it versus pointing at it: describing the burger, the red call to action and a photo in words, or one click on the button with the comment Change text to Book now."),
    "loop": ('0 0 880 450', inner(loop),
             "The loop in eight steps: point and comment, an issue opens, the runner starts an agent, the agent follows the method, commits, the runner checks and pushes, the host deploys, status and Show come back to the page."),
}
for name, (vb, body, label) in figures.items():
    for theme, t in (("light", light_t), ("dark", dark_t)):
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" class="dg" viewBox="{vb}" role="img" aria-label="{label}">'
               f"<style>{css(t)}</style>{body}</svg>\n")
        (OUT / f"{name}-{theme}.svg").write_text(svg)
        print("wrote", name, theme, len(svg))
