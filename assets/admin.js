/* SAKAS Portal Admin
   ------------------------------------------------------------
   Loads data/plan.json into editable forms and publishes changes
   back to GitHub with the Contents API. The access token is a
   fine-grained GitHub token (Contents: read and write, this repo
   only) and lives in this browser's localStorage, nowhere else.
   ------------------------------------------------------------ */
function currentClient() {
  const parts = location.pathname.split('/').filter(Boolean);
  // the repo name leads the path on the project URL, so step past it
  if (parts[0] === 'clients') parts.shift();
  return (parts[0] || '').toLowerCase();
}

const CLIENT = currentClient();
const OWNER = "vollerodaniele-rgb";
const REPO = "clients";
const FILE = "data/" + CLIENT + ".json";
const TOKEN_KEY = "clients-admin-token";
const CLIENT_LABEL = "client:" + CLIENT;

let plan = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  wireTokenPanel();
  try {
    const titleEl = $("admin-title");
    if (titleEl) titleEl.textContent = CLIENT.toUpperCase() + " Admin";
    document.title = CLIENT.toUpperCase() + " | Portal Admin";

    const res = await fetch("../" + FILE + "?t=" + Math.random(), { cache: "no-store" });
    plan = await res.json();
    render();
  } catch (err) {
    $("app").innerHTML = `<p class="muted">Could not load ${FILE}: ${err}</p>`;
  }
  $("save-btn").addEventListener("click", save);
});

/* ============ TOKEN ============ */

function wireTokenPanel() {
  const msg = $("token-msg");
  if (localStorage.getItem(TOKEN_KEY)) {
    msg.textContent = "A key is saved in this browser.";
  }
  $("token-save").addEventListener("click", () => {
    const v = $("token-input").value.trim();
    if (!v) { msg.textContent = "Paste the token first."; return; }
    localStorage.setItem(TOKEN_KEY, v);
    $("token-input").value = "";
    msg.textContent = "Key saved in this browser.";
  });
  $("token-clear").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    msg.textContent = "Key removed from this browser.";
  });
}

/* ============ FORM BUILDING ============ */

function render() {
  const app = $("app");
  app.innerHTML = "";

  app.appendChild(panel("Intro texts", (body) => {
    body.appendChild(textField("Tagline (under the big SAKAS title)", plan, "tagline", true));
    body.appendChild(textField("Deal intro line", plan, "dealNotes", true));
  }));

  app.appendChild(listPanel("Deal tiles", plan.deal, () => ({ num: "", label: "" }), (item, body) => {
    body.appendChild(row(
      textField("Number (e.g. 12 or 1 week)", item, "num"),
      textField("Label", item, "label")
    ));
  }));

  app.appendChild(panel("Next shoot", (body) => {
    body.appendChild(row(
      textField("Date (YYYY-MM-DD)", plan.nextShoot, "date"),
      textField("Time", plan.nextShoot, "time")
    ));
    body.appendChild(row(
      textField("Location", plan.nextShoot, "location"),
      textField("Focus (one line)", plan.nextShoot, "focus")
    ));
    body.appendChild(linesField("Checklist for the client (one per line)", plan.nextShoot, "checklist"));
  }));

  app.appendChild(panel("What we film this month", (body) => {
    body.appendChild(textField("Month title (e.g. September 2026)", plan.filmPlan, "month"));
    body.appendChild(sublist(plan.filmPlan.items, () => ({ what: "", note: "" }), (item, wrap) => {
      wrap.appendChild(row(
        textField("What", item, "what"),
        textField("Note", item, "note")
      ));
    }, "Add shot"));
  }));

  app.appendChild(listPanel("Months", plan.months, () => ({
    label: "", status: "planned",
    reels: { done: 0, total: 12 }, photos: { done: 0, total: 20 }, notes: ""
  }), (m, body) => {
    body.appendChild(row(
      textField("Month label", m, "label"),
      selectField("Status", m, "status", ["planned", "active", "done"])
    ));
    body.appendChild(row(
      numField("Reels done", m.reels, "done"),
      numField("Reels total", m.reels, "total"),
      numField("Photos done", m.photos, "done"),
      numField("Photos total", m.photos, "total")
    ));
    body.appendChild(textField("Notes", m, "notes", true));
  }));

  if (!plan.posts) plan.posts = [];
  app.appendChild(listPanel("Posting schedule", plan.posts, () => ({
    date: "", time: "", platform: "Instagram Reel", title: "", caption: "", status: "planned"
  }), (post, body) => {
    body.appendChild(row(
      textField("Date (YYYY-MM-DD)", post, "date"),
      textField("Time", post, "time"),
      selectField("Where", post, "platform",
        ["Instagram Reel", "Instagram Photo", "Carousel", "Story", "TikTok", "Facebook", "Other"]),
      selectField("Status", post, "status", ["planned", "posted"])
    ));
    body.appendChild(textField("What goes out", post, "title"));
    body.appendChild(textField("Caption", post, "caption", true));
  }));

  app.appendChild(importPanel());

  app.appendChild(listPanel("Documents & deliveries", plan.documents, () => ({
    type: "Delivery", title: "", note: "", url: ""
  }), (doc, body) => {
    body.appendChild(row(
      textField("Type (Contract / Brief / Delivery)", doc, "type"),
      textField("Title", doc, "title")
    ));
    body.appendChild(row(
      textField("Note", doc, "note"),
      textField("Link (WeTransfer, Drive...)", doc, "url")
    ));
  }));

  app.appendChild(listPanel("Invoices", plan.invoices, () => ({
    number: "", period: "", issued: "", status: "upcoming", url: ""
  }), (inv, body) => {
    body.appendChild(row(
      textField("Invoice number", inv, "number"),
      textField("Period", inv, "period")
    ));
    body.appendChild(row(
      textField("Issued (YYYY-MM-DD)", inv, "issued"),
      selectField("Status", inv, "status", ["upcoming", "open", "paid"]),
      textField("Link to PDF (optional)", inv, "url")
    ));
  }));

  app.appendChild(requestsPanel());

  app.appendChild(panel("Contact footer", (body) => {
    body.appendChild(row(
      textField("Footer line", plan.contact, "line"),
      textField("Email", plan.contact, "email")
    ));
  }));
}

/* ============ IMPORT A WRITTEN PLAN ============ */
/* Paste a month of posts as text and let it fill the schedule,
   instead of typing every row by hand. */

const IMPORT_SHAPE =
  "2026-09-12 | 18:00 | Instagram Reel | Signature dish reel\n" +
  "The one everybody comes back for.\n" +
  "#sakas #gent\n" +
  "\n" +
  "2026-09-15 | 12:30 | Instagram Photo | Lunch set, window light\n" +
  "Midday at Sakas. Window seat, short break, long lunch.";

function importPanel() {
  return panel("Import a plan", (body) => {
    const help = document.createElement("p");
    help.className = "muted";
    help.style.cssText = "font-size:0.9rem;margin-bottom:0.8rem";
    help.textContent = "Paste a written plan and it fills the schedule above. " +
      "One post per block, blank line between posts. First line is " +
      "date | time | where | what, the lines under it are the caption.";
    body.appendChild(help);

    const example = document.createElement("pre");
    example.style.cssText = "font-size:0.78rem;color:var(--dim);border:1px solid var(--line-soft);" +
      "border-radius:8px;padding:0.8rem;overflow-x:auto;margin-bottom:1rem;white-space:pre-wrap";
    example.textContent = IMPORT_SHAPE;
    body.appendChild(example);

    const ta = document.createElement("textarea");
    ta.id = "import-text";
    ta.rows = 8;
    ta.placeholder = "Paste the plan here...";
    ta.style.cssText = "width:100%;background:var(--bg);border:1px solid var(--line);" +
      "border-radius:8px;color:var(--text);font-family:var(--font-body);font-size:0.9rem;padding:0.7rem 0.9rem";
    body.appendChild(ta);

    const controls = document.createElement("div");
    controls.className = "row";
    controls.style.marginTop = "0.8rem";

    const read = document.createElement("button");
    read.className = "btn-mini";
    read.textContent = "Read it";

    const add = document.createElement("button");
    add.className = "btn-mini";
    add.textContent = "Add to schedule";
    add.hidden = true;

    controls.append(read, add);
    body.appendChild(controls);

    const msg = document.createElement("p");
    msg.className = "form-msg";
    msg.style.marginTop = "0.7rem";
    body.appendChild(msg);

    let found = [];

    read.addEventListener("click", () => {
      found = parsePlan(ta.value);
      if (!found.length) {
        msg.textContent = "Could not find any posts. Check that each block starts with a date.";
        add.hidden = true;
        return;
      }
      msg.innerHTML = `Found ${found.length} post${found.length === 1 ? "" : "s"}. ` +
        `They land in the schedule above, where you can read the captions before publishing.<br>` +
        found.map((p) => `<span class="muted">${p.date}${p.time ? " " + p.time : ""} &middot; ${escHtml(p.title)}</span>`).join("<br>");
      add.hidden = false;
    });

    add.addEventListener("click", () => {
      if (!found.length) return;
      plan.posts = (plan.posts || []).concat(found);
      plan.posts.sort((a, b) => a.date.localeCompare(b.date));
      const n = found.length;
      found = [];
      ta.value = "";
      render();
      const note = document.querySelector(".savebar .form-msg");
      if (note) note.textContent = `${n} post${n === 1 ? "" : "s"} added. Press Save & Publish to put them live.`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* A new post starts at every line that begins with a date. Everything
   under it is that post's caption, blank lines and all, so a caption
   can breathe without being read as a separate post. */
function parsePlan(text) {
  const posts = [];
  let current = null;

  for (const raw of String(text).split("\n")) {
    const head = stripDecoration(raw);
    const parsed = head ? parseHeader(head) : null;

    if (parsed) {
      if (current) posts.push(finish(current));
      current = { ...parsed, lines: [] };
    } else if (current) {
      current.lines.push(raw.trim());
    }
  }
  if (current) posts.push(finish(current));

  return posts;
}

// bullets, list numbering and bold markers, without touching the date
function stripDecoration(line) {
  return line
    .replace(/^[\s\-*#>]+/, "")
    .replace(/^\d{1,2}[.)]\s+/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function parseHeader(head) {
  let date = "", time = "", platform = "", title = "";

  if (head.includes("|")) {
    const parts = head.split("|").map((p) => p.trim()).filter(Boolean);
    date = normalizeDate(parts.shift());
    if (!date) return null;
    if (parts.length && isTime(parts[0])) time = tidyTime(parts.shift());
    if (parts.length > 1) platform = parts.shift();
    title = parts.join(" ");
  } else {
    const m = head.match(/^(\S+)[\s,:-]+(.*)$/);
    if (!m) return null;
    date = normalizeDate(m[1]);
    if (!date) return null;
    let rest = m[2].trim();
    const t = rest.match(/^(\d{1,2}[:.h]\d{2})\s*[-,|]?\s*(.*)$/);
    if (t) { time = tidyTime(t[1]); rest = t[2]; }
    title = rest;
  }

  return { date, time, platform: platform || "Instagram Reel", title: title || "Untitled" };
}

function isTime(s) { return /^\d{1,2}[:.h]\d{2}$/.test(s); }
function tidyTime(s) { return s.replace(/[.h]/, ":"); }

function finish(p) {
  return {
    date: p.date,
    time: p.time,
    platform: p.platform,
    title: p.title,
    caption: p.lines.join("\n").replace(/^\n+|\n+$/g, ""),
    status: "planned"
  };
}

function normalizeDate(raw) {
  const s = String(raw || "").trim();
  const pad = (n) => String(n).padStart(2, "0");
  const thisYear = new Date().getFullYear();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  // day first, the European way: 12/09/2026 or 12-09-26
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${year}-${pad(m[2])}-${pad(m[1])}`;
  }

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (m) return `${thisYear}-${pad(m[2])}-${pad(m[1])}`;

  return "";
}

/* ============ IDEAS & REQUESTS ============ */
/* These are GitHub issues, not part of plan.json, so this panel acts
   on GitHub straight away. Nothing here waits for Save & Publish. */

function requestsPanel() {
  const box = panel("Ideas & requests", (body) => {
    const note = document.createElement("p");
    note.className = "muted";
    note.style.cssText = "font-size:0.9rem;margin-bottom:1rem";
    note.textContent = "Removing takes a request off the portal immediately. " +
      "It is not deleted, so you can put it back.";
    body.appendChild(note);

    const msg = document.createElement("p");
    msg.className = "form-msg";
    msg.id = "req-msg";
    body.appendChild(msg);

    const list = document.createElement("div");
    list.id = "req-list";
    list.innerHTML = '<p class="muted" style="font-size:0.9rem">Loading requests...</p>';
    body.appendChild(list);

    const toggle = document.createElement("button");
    toggle.className = "btn-mini";
    toggle.textContent = "Show removed";
    body.appendChild(toggle);

    const removed = document.createElement("div");
    removed.id = "req-removed";
    removed.hidden = true;
    removed.style.marginTop = "1rem";
    body.appendChild(removed);

    toggle.addEventListener("click", () => {
      removed.hidden = !removed.hidden;
      toggle.textContent = removed.hidden ? "Show removed" : "Hide removed";
    });
  });

  loadRequests();
  return box;
}

async function loadRequests() {
  requestKeyRejected = false;
  try {
    const [open, closed] = await Promise.all([fetchRequests("open"), fetchRequests("closed")]);
    drawRequests($("req-list"), open, false);
    drawRequests($("req-removed"), closed, true);
    const msg = $("req-msg");
    if (msg) {
      msg.textContent = requestKeyRejected
        ? "GitHub refused the saved key, so this list is read only. Paste a fresh key at the top of the page."
        : "";
    }
  } catch (err) {
    console.error("requests load failed:", err);
    const list = $("req-list");
    if (list) {
      list.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not load requests (' +
        err.message + ').</p>';
    }
  }
}

let requestKeyRejected = false;

async function fetchRequests(state) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/issues` +
    `?labels=${encodeURIComponent("idea," + CLIENT_LABEL)}` +
    `&state=${state}&sort=created&direction=desc&per_page=100`;

  const t = localStorage.getItem(TOKEN_KEY);
  let res = null;

  if (t) {
    res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + t },
      cache: "no-store"
    });
    // a stale key should not hide the requests: the repo is public,
    // so read them without it and flag the key instead
    if (res.status === 401 || res.status === 403) {
      requestKeyRejected = true;
      res = null;
    }
  }

  if (!res) {
    res = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
  }

  if (!res.ok) throw new Error("GitHub API " + res.status);

  return (await res.json()).filter((i) => !i.pull_request).map((i) => {
    let body = i.body || "";
    let author = i.user ? i.user.login : "anonymous";
    const m = body.match(/\n*-{3,}\nSubmitted by: (.+?) \(via the idea box\)\s*$/);
    if (m) { author = m[1]; body = body.slice(0, m.index); }
    return {
      number: i.number,
      text: body.trim() || i.title.replace(/^Idea:\s*/, ""),
      author,
      date: new Date(i.created_at).toLocaleDateString("en-GB",
        { day: "numeric", month: "short", year: "numeric" })
    };
  });
}

function drawRequests(wrap, items, isRemoved) {
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!items.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.style.fontSize = "0.9rem";
    p.textContent = isRemoved ? "Nothing removed yet." : "No requests yet.";
    wrap.appendChild(p);
    return;
  }

  for (const item of items) {
    const el = document.createElement("div");
    el.className = "item";

    const btn = document.createElement("button");
    btn.className = "btn-mini remove" + (isRemoved ? "" : " danger");
    btn.textContent = isRemoved ? "Restore" : "Remove";

    let armed = false;
    btn.addEventListener("click", async () => {
      if (!isRemoved && !armed) {
        armed = true;
        btn.textContent = "Sure?";
        setTimeout(() => { if (armed) { armed = false; btn.textContent = "Remove"; } }, 4000);
        return;
      }
      await setRequestState(item, isRemoved ? "open" : "closed", btn);
    });

    const p = document.createElement("p");
    p.style.cssText = "font-size:0.92rem;padding-right:6rem";
    p.textContent = item.text.slice(0, 300);

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.style.cssText = "font-size:0.78rem;margin-top:0.4rem";
    meta.textContent = `from ${item.author} · ${item.date}`;

    el.append(btn, p, meta);
    wrap.appendChild(el);
  }
}

async function setRequestState(item, state, btn) {
  const msg = $("req-msg");
  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    msg.textContent = "Save your access key first (top of the page).";
    btn.textContent = state === "closed" ? "Remove" : "Restore";
    return;
  }

  btn.disabled = true;
  msg.textContent = state === "closed" ? "Removing..." : "Restoring...";

  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${item.number}`, {
      method: "PATCH",
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ state })
    });
    if (!res.ok) throw new Error(String(res.status));

    msg.textContent = state === "closed"
      ? "Removed from the portal."
      : "Back on the portal.";
    await loadRequests();
  } catch (err) {
    console.error("request state change failed:", err);
    const code = String(err.message);
    msg.textContent = "Could not do that (error " + code + ")" +
      (code === "403" || code === "401"
        ? ": this key needs Issues read and write on this repo, on top of Contents."
        : ".");
    btn.disabled = false;
  }
}

function panel(title, fill) {
  const div = document.createElement("div");
  div.className = "panel";
  div.innerHTML = `<h2>${title}</h2>`;
  fill(div);
  return div;
}

function listPanel(title, arr, blank, fillItem) {
  return panel(title, (body) => {
    body.appendChild(sublist(arr, blank, fillItem, "Add"));
  });
}

function sublist(arr, blank, fillItem, addLabel) {
  const wrap = document.createElement("div");
  const draw = () => {
    wrap.innerHTML = "";
    arr.forEach((item, i) => {
      const box = document.createElement("div");
      box.className = "item";
      const rm = document.createElement("button");
      rm.className = "btn-mini danger remove";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => { arr.splice(i, 1); draw(); });
      box.appendChild(rm);
      fillItem(item, box);
      wrap.appendChild(box);
    });
    const add = document.createElement("button");
    add.className = "btn-mini";
    add.textContent = "+ " + addLabel;
    add.addEventListener("click", () => { arr.push(blank()); draw(); });
    wrap.appendChild(add);
  };
  draw();
  return wrap;
}

function row(...fields) {
  const div = document.createElement("div");
  div.className = "row";
  for (const f of fields) div.appendChild(f);
  return div;
}

function textField(label, obj, key, multiline) {
  const lab = document.createElement("label");
  lab.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement(multiline ? "textarea" : "input");
  input.value = obj[key] == null ? "" : obj[key];
  input.addEventListener("input", () => { obj[key] = input.value; });
  lab.append(span, input);
  return lab;
}

function numField(label, obj, key) {
  const lab = textField(label, obj, key);
  const input = lab.querySelector("input");
  input.type = "number";
  input.min = "0";
  input.addEventListener("input", () => { obj[key] = Number(input.value) || 0; });
  return lab;
}

function selectField(label, obj, key, options) {
  const lab = document.createElement("label");
  lab.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const sel = document.createElement("select");
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    if (obj[key] === o) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => { obj[key] = sel.value; });
  lab.append(span, sel);
  return lab;
}

function linesField(label, obj, key) {
  const lab = document.createElement("label");
  lab.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const ta = document.createElement("textarea");
  ta.value = (obj[key] || []).join("\n");
  ta.addEventListener("input", () => {
    obj[key] = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
  });
  lab.append(span, ta);
  return lab;
}

/* ============ SAVE ============ */

async function save() {
  const msg = $("save-msg");
  const btn = $("save-btn");
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    msg.textContent = "Save your access key first (top of the page).";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Publishing...";

  try {
    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;
    const headers = {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json"
    };

    const cur = await fetch(api, { headers });
    if (!cur.ok) throw new Error("could not read current file (" + cur.status + ")");
    const { sha } = await cur.json();

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(plan, null, 2) + "\n")));
    const put = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update plan via admin", content, sha })
    });
    if (!put.ok) throw new Error("publish failed (" + put.status + ")");

    msg.textContent = "Published! The live site updates in about a minute.";
  } catch (err) {
    console.error("save failed:", err);
    msg.textContent = "Error: " + err.message + (String(err.message).includes("401") || String(err.message).includes("403")
      ? " (check the access key and its permissions)" : "");
  } finally {
    btn.disabled = false;
  }
}

function escHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
