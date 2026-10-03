/*! PointToShip overlay 0.1.0. MIT. https://github.com/brnkmnn/pointtoship
 *
 * Point at something on the live site, say what should change, follow it to
 * Done. Loaded by the loader in the page head, only in browsers that opened
 * the site's secret link. Framework-free, no dependencies; everything it
 * draws lives in a shadow root, so the site's CSS and this CSS never meet.
 */
(() => {
  if (window.__pointtoship) return;
  window.__pointtoship = true;

  const VERSION = "0.1.0";
  const cfg = window.PointToShip ?? {};
  const ENDPOINT = cfg.endpoint ?? document.currentScript?.dataset.endpoint ?? "/api/pointtoship";
  const KEY = "pointtoship";
  const SHOW_KEY = "pointtoship-show";

  // ------------------------------------------------------------- storage

  const store = {
    get: () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set: (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
    clear: () => { try { localStorage.removeItem(KEY); } catch {} },
  };

  const deviceName = () => {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
      : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
      : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
    return os ? `${browser} on ${os}` : browser;
  };

  // ----------------------------------------------------------------- api

  const api = async (action, extra = {}) => {
    const device = store.get();
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, device: device && { id: device.id, token: device.token, name: device.name }, ...extra }),
      });
    } catch {
      throw new Error("The site's PointToShip endpoint did not answer. Check the connection and try again.");
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      if (action !== "register") { store.clear(); teardown(); }
      throw new Error(body.error ?? "This browser may not send comments.");
    }
    if (!res.ok) throw new Error(body.error ?? `PointToShip answered ${res.status}.`);
    return body;
  };

  // -------------------------------------------------------------- pointer

  const squash = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const fileOf = (src) => { try { return new URL(src, location.href).pathname.split("/").pop(); } catch { return src; } };

  const GENERATED_ID = /\d{3,}|^[:_]|^(radix|headlessui|react|mui|chakra|ember|vue)-/i;

  /** A plain CSS path: the nearest stable id, then tag and position. */
  const cssPath = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id && !GENERATED_ID.test(n.id) && document.querySelectorAll(`#${CSS.escape(n.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(n.id)}`);
        break;
      }
      if (n === document.body) { parts.unshift("body"); break; }
      const tag = n.localName;
      const same = [...n.parentElement.children].filter((c) => c.localName === tag);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
    }
    return parts.join(" > ");
  };

  const headingBefore = (el) => {
    let last = null;
    for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      if (h === el || h.contains(el)) return squash(h.innerText);
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) last = h;
    }
    return last ? squash(last.innerText) : "";
  };

  const describe = (el) => {
    const text = cut(squash(el.innerText ?? el.textContent), 48);
    const tag = el.localName;
    const near = () => { const h = headingBefore(el); return h ? ` near “${cut(h, 40)}”` : ""; };
    if (tag === "img" || tag === "picture") return `Image “${cut(el.alt || fileOf(el.currentSrc || el.src || ""), 40)}”`;
    if (tag === "svg") return `Icon${near()}`;
    if (tag === "video") return `Video${near()}`;
    if (/^h[1-6]$/.test(tag)) return `Heading “${text}”`;
    if (tag === "a") return `Link “${text}”`;
    if (tag === "button" || el.getAttribute("role") === "button") return `Button “${text || el.getAttribute("aria-label") || ""}”`;
    if (["input", "textarea", "select"].includes(tag)) return `Field “${el.labels?.[0]?.innerText ?? el.placeholder ?? el.name ?? ""}”`;
    if (["p", "li", "blockquote", "span", "em", "strong", "label", "small", "figcaption"].includes(tag)) return `Text “${text}”`;
    const h = el.querySelector("h1, h2, h3, h4, h5, h6");
    if (h) return `Section “${cut(squash(h.innerText), 40)}”`;
    return text ? `${tag} “${text}”` : `${tag}${near()}`;
  };

  const STYLE_KEYS = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "backgroundColor", "textAlign", "width", "height", "margin", "padding", "gap", "borderRadius"];

  const pointerOf = (el) => {
    if (!el) return { kind: "page", label: "The whole page" };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const text = cut(squash(el.innerText ?? el.textContent), 300);
    let before = "", after = "";
    const around = squash(el.parentElement?.innerText ?? "");
    const at = text ? around.indexOf(text.replace(/…$/, "")) : -1;
    if (at >= 0) { before = around.slice(Math.max(0, at - 60), at); after = around.slice(at + text.length, at + text.length + 60); }
    const media = [el, ...el.querySelectorAll("img, video, source")].slice(0, 6).flatMap((m) => {
      if (m.localName === "img") return [{ file: fileOf(m.currentSrc || m.src), alt: m.alt ?? "" }];
      if (m.localName === "video" || m.localName === "source") return m.src ? [{ file: fileOf(m.src) }] : [];
      const bg = getComputedStyle(m).backgroundImage.match(/url\(["']?([^"')]+)/);
      return bg ? [{ file: fileOf(bg[1]) }] : [];
    });
    return {
      kind: "element",
      label: describe(el),
      source: [...new Set([el, ...el.querySelectorAll("[data-ps]")].map((n) => n.closest?.("[data-ps]")?.dataset.ps).filter(Boolean))].slice(0, 8),
      id: el.closest("[data-ps-id]")?.dataset.psId,
      text: text ? { exact: text, before, after } : undefined,
      media: media.length ? media : undefined,
      link: el.closest("a")?.href,
      heading: headingBefore(el),
      selector: cssPath(el),
      tag: el.localName,
      box: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      style: Object.fromEntries(STYLE_KEYS.map((k) => [k, cs[k]])),
    };
  };

  const viewNow = () => {
    const url = new URL(location.href);
    url.searchParams.delete("pointtoship");
    url.searchParams.delete("pts");
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    return {
      url: url.href, path: url.pathname + url.search + url.hash,
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio, device: deviceName(),
      scroll: Math.round(scrollY), theme: document.documentElement.dataset.theme ?? (dark ? "dark" : "light"),
      overlays: [...document.querySelectorAll("dialog[open], [aria-modal='true']")].map((d) => describe(d)).slice(0, 3),
    };
  };

  // ------------------------------------------------------------- picking

  let host, root, outline;

  const ours = (el) => el === host;

  /** What the pointer means at (x, y): small media first, then the element. */
  const pick = (x, y) => {
    const stack = document.elementsFromPoint(x, y).filter((el) => !ours(el));
    let el = stack[0];
    if (!el || el === document.documentElement || el === document.body) return null;
    el = el.closest("svg") ?? el;
    // Line icons and transparent images only hit on their ink; test boxes.
    const inside = (m) => { const r = m.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width * r.height > 0; };
    const small = [...el.querySelectorAll("svg, img, video, canvas")].slice(0, 200).filter(inside)
      .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0];
    return small ?? el;
  };

  /** One step out: the parent, skipping wrappers of the same size. */
  const wider = (el) => {
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const q = p.getBoundingClientRect();
      if (q.width > r.width + 2 || q.height > r.height + 2) return p;
    }
    return el;
  };

  const place = (el) => {
    if (!el) { outline.hidden = true; return; }
    const r = el.getBoundingClientRect();
    Object.assign(outline.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    outline.hidden = false;
  };

  // --------------------------------------------------------------- show

  /** The changed element and its neighbours get transition names, so the
   *  element morphs and the neighbours slide instead of crossfading. */
  const mark = (el, on) => {
    if (!el?.parentElement) return;
    el.style.viewTransitionName = on ? "pts-target" : "";
    [...el.parentElement.children].filter((c) => c !== el).slice(0, 40)
      .forEach((c, i) => { c.style.viewTransitionName = on ? `pts-near-${i}` : ""; });
  };

  let leaving = null;
  addEventListener("pageswap", (e) => { if (e.viewTransition && leaving) mark(leaving, true); });

  const TRANSITION_CSS = "@view-transition{navigation:auto}"
    + "::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation-duration:1s;animation-timing-function:cubic-bezier(.5,0,.25,1)}"
    + "::view-transition-group(root),::view-transition-old(root),::view-transition-new(root){animation-duration:.25s}"
    + "@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}}";

  const show = (item) => {
    const path = item.after?.path ?? item.path ?? "/";
    const base = item.status === "ready" && item.preview ? item.preview : location.origin;
    const url = new URL(path, base);
    url.searchParams.set("pts", item.id);
    const here = new URL(path, location.origin).pathname === location.pathname;
    leaving = here && item.selector ? document.querySelector(item.selector) : null;
    const top = leaving ? Math.round(leaving.getBoundingClientRect().top) : null;
    try { sessionStorage.setItem(SHOW_KEY, JSON.stringify({ id: item.id, selector: item.after?.selector ?? item.selector, top })); } catch {}
    // The old page opts in to the transition right before it leaves.
    const style = document.createElement("style");
    style.textContent = TRANSITION_CSS;
    document.head.append(style);
    location.href = url.href;
  };

  const shown = (el) => {
    if (!(el instanceof Element)) return;
    place(el);
    setTimeout(() => place(null), 2200);
    const url = new URL(location.href);
    if (url.searchParams.has("pts")) { url.searchParams.delete("pts"); history.replaceState(history.state, "", url.href); }
  };

  // ------------------------------------------------------------------- ui

  const ICON = {
    bubble: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    list: '<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="2" cy="3" r="1.1" fill="currentColor"/><circle cx="2" cy="7" r="1.1" fill="currentColor"/><circle cx="2" cy="11" r="1.1" fill="currentColor"/><path d="M5 3h8M5 7h8M5 11h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    arrow: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5V12l2.8-2.6 1.9 3.6 1.7-.8-1.8-3.5 3.7-.2z" fill="currentColor" stroke-linejoin="round"/></svg>',
  };
  const LABEL = { queued: "Queued", working: "Working", "needs-you": "Needs you", ready: "Ready to look", ship: "Shipping", done: "Done" };

  const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.ui { font: 15px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #131211; -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, textarea:focus-visible { outline: 2px solid #2f5bff; outline-offset: 2px; }
.dock { position: fixed; right: max(20px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom)); display: flex; gap: 8px; align-items: flex-end; }
.btn { appearance: none; height: 34px; padding: 0 14px 0 12px; display: inline-flex; align-items: center; gap: 7px; border: 1px solid #131211; background: #f8f5f1; border-radius: 999px; font-size: 14px; }
.btn.primary { background: #131211; color: #f8f5f1; }
.btn svg { width: 14px; height: 14px; flex: none; }
.btn:disabled { opacity: .5; cursor: default; }
.dot { appearance: none; position: relative; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%; background: #131211; color: #f8f5f1; display: grid; place-items: center; box-shadow: 0 2px 10px rgba(0,0,0,.18); }
.dot svg { width: 16px; height: 16px; }
.ping { position: absolute; top: -1px; right: -1px; width: 10px; height: 10px; border-radius: 50%; background: #d2462c; border: 1.5px solid #f8f5f1; }
.outline { position: fixed; pointer-events: none; border: 2.5px solid #2f5bff; border-radius: 5px; background: rgba(47, 91, 255, .08); transition: left .12s, top .12s, width .12s, height .12s; }
.outline[hidden], [hidden] { display: none !important; }
.hint { position: fixed; top: max(12px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); background: #f8f5f1; border: 1px solid #131211; border-radius: 999px; padding: 7px 14px; font-size: 14px; white-space: nowrap; }
.sheet { position: fixed; right: max(10px, env(safe-area-inset-right)); left: max(10px, env(safe-area-inset-left)); bottom: max(10px, env(safe-area-inset-bottom)); max-height: min(75vh, calc(100dvh - 20px)); overflow: auto; background: #f8f5f1; border: 1px solid #131211; border-radius: 10px; padding: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.14); }
@media (min-width: 640px) { .sheet { left: auto; right: max(20px, env(safe-area-inset-right)); width: 400px; } }
.what { font-size: 13px; margin-bottom: 8px; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.chip { appearance: none; border: 1px solid rgba(19,18,17,.35); background: transparent; font-size: 13px; padding: 4px 10px; border-radius: 999px; }
textarea { width: 100%; min-height: 76px; font: inherit; font-size: 16px; padding: 10px; border: 1px solid rgba(19,18,17,.4); border-radius: 6px; background: #fff; color: inherit; resize: vertical; }
.row { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 10px; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.h { font-size: 13px; opacity: .7; }
.item { border-top: 1px solid rgba(19,18,17,.13); padding: 10px 0; }
.item:first-of-type { border-top: 0; }
.line { display: flex; gap: 8px; align-items: baseline; width: 100%; appearance: none; border: 0; background: none; padding: 0; text-align: left; }
.pill { flex: none; font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid currentColor; }
.pill.working, .pill.ship { color: #2f5bff; }
.pill.needs-you { color: #d2462c; }
.pill.ready { color: #8a5a00; }
.pill.done { color: #3f7d4e; }
.title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.time { flex: none; font-size: 12px; opacity: .6; }
.said { font-size: 13px; margin-top: 8px; padding: 8px; background: #fff; border-radius: 6px; white-space: pre-wrap; }
.note { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(max(18px, env(safe-area-inset-bottom)) + 48px); max-width: min(420px, calc(100vw - 20px)); background: #131211; color: #f8f5f1; border-radius: 10px; padding: 9px 14px; font-size: 14px; }
.empty { font-size: 13px; opacity: .7; padding: 6px 0; }
`;

  const state = { mode: "idle", target: null, items: [], open: null, busy: false };
  let ui, noteEl, timer;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} d`;
  };

  const note = (text, ms = 4000) => {
    noteEl.textContent = text;
    noteEl.hidden = false;
    clearTimeout(note.t);
    note.t = setTimeout(() => { noteEl.hidden = true; }, ms);
  };

  const waiting = () => state.items.filter((i) => i.status === "needs-you" || i.status === "ready").length;

  const render = () => {
    const { mode, target } = state;
    const touch = matchMedia("(pointer: coarse)").matches;
    let html = "";
    if (mode === "idle" || mode === "unfolded") {
      html = `<div class="dock">${mode === "unfolded" ? `
        <button class="btn" data-act="issues">${ICON.list}Issues</button>
        <button class="btn primary" data-act="select">${ICON.arrow}Select</button>` : ""}
        <button class="dot" data-act="dot" aria-label="${mode === "unfolded" ? "Close PointToShip" : "PointToShip"}" aria-expanded="${mode === "unfolded"}">
          ${mode === "unfolded" ? ICON.close : ICON.bubble}${mode === "idle" && waiting() ? '<span class="ping"></span>' : ""}</button></div>`;
    } else if (mode === "pointing") {
      html = `<div class="hint">${touch ? "Tap" : "Click"} what you mean.</div>
        <div class="dock"><button class="btn" data-act="page">Whole page</button><button class="btn primary" data-act="cancel">Cancel</button></div>`;
    } else if (mode === "composing") {
      html = `<div class="sheet" role="dialog" aria-label="New comment">
        <div class="what">${esc(target ? describe(target) : "The whole page")}</div>
        <div class="chips">${target ? '<button class="chip" data-act="wider">Wider</button>' : ""}
          <button class="chip" data-act="select">Point again</button>${target ? '<button class="chip" data-act="page">Whole page</button>' : ""}</div>
        <textarea id="text" placeholder="What should change?" aria-label="What should change?"></textarea>
        <div class="row"><button class="btn" data-act="cancel">Cancel</button><button class="btn primary" data-act="send" ${state.busy ? "disabled" : ""}>Send</button></div></div>`;
    } else if (mode === "panel") {
      html = `<div class="sheet" role="dialog" aria-label="Issues">
        <div class="head"><span class="h">Issues</span><button class="dot" data-act="cancel" aria-label="Close issues">${ICON.close}</button></div>
        ${state.items.length ? state.items.map((i) => `<div class="item">
          <button class="line" data-act="open" data-id="${esc(i.id)}" aria-expanded="${state.open === i.id}">
            <span class="pill ${esc(i.status)}">${esc(LABEL[i.status] ?? i.status)}</span>
            <span class="title">#${esc(i.id)} ${esc(i.title)}</span><span class="time">${ago(i.updated)}</span></button>
          ${state.open === i.id ? `${i.said ? `<div class="said">${esc(i.said)}</div>` : ""}
            ${i.status === "needs-you" || i.status === "ready" ? `<textarea id="answer" style="margin-top:8px;min-height:60px" placeholder="${i.status === "ready" ? "What should be different?" : "Your answer"}" aria-label="Your answer"></textarea>` : ""}
            <div class="row">
              ${i.status === "done" || i.status === "ready" ? `<button class="btn" data-act="show" data-id="${esc(i.id)}" style="margin-right:auto">Show</button>` : ""}
              ${i.status === "ready" ? `<button class="btn primary" data-act="ship" data-id="${esc(i.id)}">Ship it</button>` : ""}
              ${i.status === "needs-you" || i.status === "ready" ? `<button class="btn${i.status === "ready" ? "" : " primary"}" data-act="answer" data-id="${esc(i.id)}">${i.status === "ready" ? "Not like this" : "Send"}</button>` : ""}
            </div>` : ""}</div>`).join("") : '<div class="empty">Nothing yet. Select something on the page and say what should change.</div>'}</div>`;
    }
    ui.innerHTML = html;
    place(mode === "composing" ? target : null);
    ui.querySelector("textarea#text")?.focus();
  };

  const set = (mode) => { state.mode = mode; render(); };

  const refresh = async () => {
    try {
      state.items = (await api("list")).items;
      if (state.mode === "panel" || state.mode === "idle") render();
    } catch (err) { if (state.mode === "panel") note(err.message); }
  };

  const poll = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (document.visibilityState === "visible") await refresh();
      poll();
    }, state.mode === "panel" ? 8000 : 60000);
  };

  const send = async () => {
    const text = ui.querySelector("#text")?.value.trim();
    if (!text || state.busy) return;
    state.busy = true;
    render();
    try {
      const { item } = await api("send", { comment: text, pointer: pointerOf(state.target), view: viewNow() });
      state.items = [item, ...state.items.filter((i) => i.id !== item.id)];
      state.target = null;
      state.busy = false;
      set("idle");
      note(`Sent as #${item.id}. It shows up under Issues.`);
      poll();
    } catch (err) {
      state.busy = false;
      render();
      ui.querySelector("#text").value = text;
      note(err.message, 6000);
    }
  };

  const act = async (name, id) => {
    const item = state.items.find((i) => i.id === id);
    if (name === "dot") set(state.mode === "unfolded" ? "idle" : "unfolded");
    else if (name === "select") { state.target = null; set("pointing"); }
    else if (name === "cancel") { state.target = null; set("idle"); poll(); }
    else if (name === "page") { state.target = null; set("composing"); }
    else if (name === "wider") { state.target = wider(state.target); render(); }
    else if (name === "send") await send();
    else if (name === "issues") { set("panel"); await refresh(); poll(); }
    else if (name === "open") { state.open = state.open === id ? null : id; render(); }
    else if (name === "show" && item) show(item);
    else if (name === "ship" && item) {
      try { await api("ship", { id }); item.status = "ship"; render(); note("Shipping. Show works once it is Done."); } catch (err) { note(err.message, 6000); }
    } else if (name === "answer" && item) {
      const text = ui.querySelector("#answer")?.value.trim();
      if (!text) { ui.querySelector("#answer")?.focus(); return; }
      try { await api("answer", { id, text }); item.status = "queued"; state.open = null; render(); note("Sent. It is back in the queue."); } catch (err) { note(err.message, 6000); }
    }
  };

  // ------------------------------------------------------------- events

  const onMove = (e) => { if (state.mode === "pointing" && e.pointerType !== "touch") place(pick(e.clientX, e.clientY)); };
  const onClick = (e) => {
    if (state.mode !== "pointing" || e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = pick(e.clientX, e.clientY);
    if (!el) return;
    state.target = el;
    set("composing");
  };
  const onKey = (e) => {
    if (e.key === "Escape" && state.mode !== "idle") { state.target = null; set("idle"); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && state.mode === "composing") send();
  };
  const onScroll = () => { if (state.mode === "composing") place(state.target); };

  const teardown = () => {
    removeEventListener("pointermove", onMove, true);
    removeEventListener("click", onClick, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("scroll", onScroll, true);
    clearTimeout(timer);
    host?.remove();
  };

  const mount = () => {
    host = document.createElement("div");
    host.setAttribute("data-pointtoship", VERSION);
    host.style.cssText = "position:fixed;inset:0 auto auto 0;z-index:2147483600;width:0;height:0";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLES}</style><div class="ui"><div class="outline" hidden></div><div class="layer"></div><div class="note" role="status" hidden></div></div>`;
    outline = root.querySelector(".outline");
    ui = root.querySelector(".layer");
    noteEl = root.querySelector(".note");
    ui.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (b) act(b.dataset.act, b.dataset.id);
    });
    // On <html>, not <body>, so a transformed body cannot move it.
    document.documentElement.append(host);
    addEventListener("pointermove", onMove, true);
    addEventListener("click", onClick, true);
    addEventListener("keydown", onKey, true);
    addEventListener("scroll", onScroll, true);
    render();
  };

  // ---------------------------------------------------------------- start

  const start = async () => {
    const url = new URL(location.href);
    const secret = url.searchParams.get("pointtoship");
    if (secret) {
      url.searchParams.delete("pointtoship");
      history.replaceState(history.state, "", url.href);
      const existing = store.get();
      const id = existing?.id ?? crypto.randomUUID();
      const name = deviceName();
      try {
        const { token } = await api("register", { secret, device: { id, name } });
        store.set({ id, token, name });
      } catch (err) {
        mount();
        note(err.message, 8000);
        return;
      }
      mount();
      note("PointToShip is on in this browser.");
    } else if (store.get()) {
      mount();
    } else {
      return;
    }
    // Arriving from Show: the loader marked the element; outline it.
    if (window.__pointtoshipShown) shown(window.__pointtoshipShown);
    addEventListener("pointtoship:shown", (e) => shown(e.detail));
    await refresh();
    poll();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
