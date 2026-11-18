#!/usr/bin/env python3
"""Builds the static /privacy/ and /support/ pages from pages/*.md (app stores link to these URLs).
Usage: python3 tools/build-pages.py   (writes privacy/index.html and support/index.html; outputs are committed)"""
import html, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
EFFECTIVE = "November 18, 2026"

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: f'<a href="{html.escape(m.group(2))}"{" rel=\"noopener\"" if m.group(2).startswith("http") else ""}>{m.group(1)}</a>', s)
    return s

def md(text):
    out, para, items = [], [], []
    def flush():
        nonlocal para, items
        if para: out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
        if items: out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>"); items = []
    for line in text.splitlines():
        if not line.strip(): flush(); continue
        m = re.match(r"^(#{1,3}) (.*)", line)
        if m: flush(); n = len(m.group(1)); out.append(f"<h{n}>{inline(m.group(2))}</h{n}>"); continue
        if line.startswith("- "):
            if para: flush()
            items.append(line[2:]); continue
        if items: flush()
        para.append(line.strip())
    flush()
    return "\n".join(out)

TPL = """<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>{title} · Plenty Map</title>
<meta name="description" content="{desc}">
<link rel="icon" href="../icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../css/page.css">
</head>
<body>
<header class="bar"><a class="brand" href="../"><img src="../icons/plenty-map-mark-small.svg" alt="" width="30" height="30"><span>Plenty Map</span></a><a class="open" href="../#/find">Open the app</a></header>
<main class="page">
{body}
</main>
<footer class="foot"><a href="../privacy/">Privacy</a> · <a href="../support/">Help and support</a> · <a href="mailto:hello@plentymap.com">hello@plentymap.com</a></footer>
</body>
</html>
"""

for name, title, desc in [("privacy", "Privacy Policy", "Plenty Map collects nothing about you. No accounts, no ads, no tracking."),
                          ("support", "Help and Support", "Help using Plenty Map, and how to reach us.")]:
    src = (ROOT / "pages" / f"{name}.md").read_text().replace("{{EFFECTIVE_DATE}}", EFFECTIVE)
    body = md(src).replace('href="/privacy"', 'href="../privacy/"')
    (ROOT / name).mkdir(exist_ok=True)
    (ROOT / name / "index.html").write_text(TPL.format(title=title, desc=desc, body=body))
print("pages built")
