/* Client Portal Admin (shared)
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

/* The page loads this file with a timestamp to dodge the ten minute
   cache, which means it can arrive after the document is already
   parsed. Waiting for an event that has been and gone would leave a
   blank page, so check before listening. */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  // deferred, so the rest of this file finishes declaring itself
  setTimeout(boot, 0);
}

async function boot() {
  wireTokenPanel();
  // the key panel is written into the page rather than built here, so
  // it has to be folded up separately
  makeCollapsible($("token-panel"));
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
}

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

  // a retainer repeats every month, a one off runs once and finishes.
  // anything without a kind is a retainer, so nothing that predates
  // this changes
  const isProject = plan.kind === "project";

  app.appendChild(kindPanel(isProject));

  app.appendChild(panel("Intro texts", (body) => {
    body.appendChild(textField("Tagline (under the big title)", plan, "tagline", true));
    body.appendChild(textField("Deal intro line", plan, "dealNotes", true));
  }));

  app.appendChild(listPanel("Deal tiles", plan.deal, () => ({ num: "", label: "" }), (item, body) => {
    body.appendChild(row(
      textField("Number (e.g. 12 or 1 week)", item, "num"),
      textField("Label", item, "label")
    ));
  }, count(plan.deal, "tiles")));

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
    body.appendChild(clearShootControl());
  }, plan.nextShoot.date || "not planned"));

  app.appendChild(shootPickPanel());

  app.appendChild(panel(isProject ? "What we film" : "What we film this month", (body) => {
    // a one off has no month to name
    if (!isProject) {
      body.appendChild(textField("Month title (e.g. September 2026)", plan.filmPlan, "month"));
    }
    body.appendChild(sublist(plan.filmPlan.items, () => ({ what: "", note: "" }), (item, wrap) => {
      wrap.appendChild(row(
        textField("What", item, "what"),
        textField("Note", item, "note")
      ));
    }, "Add shot"));
  }, count(plan.filmPlan.items, "shots")));

  // months and a posting plan only mean something for a repeating deal
  if (!isProject) {
    /* A new month copies the totals of the last one rather than a
       fixed 12 and 20. Usually right, and it means a portal that
       counts no photographs does not silently start counting them
       again the next time a month is added. */
    app.appendChild(listPanel("Months", plan.months, () => {
      const last = (plan.months || []).slice(-1)[0];
      const fresh = { label: "", status: "planned", reels: { done: 0, total: 12 }, notes: "" };
      if (last) {
        if (last.reels) fresh.reels = { done: 0, total: last.reels.total || 0 };
        if (last.photos) fresh.photos = { done: 0, total: last.photos.total || 0 };
      } else {
        fresh.photos = { done: 0, total: 20 };
      }
      return fresh;
    }, (m, body) => {
      body.appendChild(row(
        textField("Month label", m, "label"),
        selectField("Status", m, "status", ["planned", "active", "done"])
      ));
      body.appendChild(row(
        countField("Reels done", m, "reels", "done", PAIR),
        countField("Reels total", m, "reels", "total", PAIR),
        countField("Photos done", m, "photos", "done", PAIR),
        countField("Photos total", m, "photos", "total", PAIR)
      ));
      body.appendChild(textField("Notes", m, "notes", true));
    }, count(plan.months, "months"), monthRowLabel));
  }

  if (!plan.posts) plan.posts = [];
  if (!isProject) {
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

      /* How it did, filled in a month later, and one frame from the
         piece. Together these turn the posting plan into the record of
         what the month actually achieved, on the same calendar. */
      body.appendChild(row(
        countField("Views", post, "how", "views"),
        countField("Likes", post, "how", "likes"),
        countField("Shares", post, "how", "shares")
      ));
      body.appendChild(thumbField(post));
    }, plan.posts.length
      ? plan.posts.filter((p) => p.status === "posted").length + " of " + plan.posts.length + " posted"
      : "empty", postRowLabel));

    app.appendChild(importPanel());
  }

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
  }, count(plan.documents, "files")));

  app.appendChild(deliveriesPanel());

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
  }, plan.invoices.length
    ? plan.invoices.filter((i) => i.status === "open").length + " open"
    : "empty"));

  app.appendChild(requestsPanel());

  app.appendChild(panel("Contact footer", (body) => {
    body.appendChild(row(
      textField("Footer line", plan.contact, "line"),
      textField("Email", plan.contact, "email")
    ));
    body.appendChild(textField(
      isProject
        ? "Question above the email (blank uses: Questions about the day or the film?)"
        : "Question above the email (blank uses: Questions about planning or content?)",
      plan.contact, "note"));
  }, plan.contact.line || ""));
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

/* ============ DELIVERING THE WORK ============ */
/* The month's finished files, dragged in here and stored where the
   client can fetch them again next year. The data file only records
   which months exist and what you said about them; the files
   themselves live in the bucket and are listed from it, so uploading
   one never means editing anything. */

const RELAY_URL = "https://kresha-idea-box.vollerodaniele.workers.dev";

function deliveriesPanel() {
  if (!Array.isArray(plan.deliveries)) plan.deliveries = [];

  return panel("Deliveries", (body) => {
    const note = document.createElement("p");
    note.className = "muted";
    note.style.cssText = "font-size:0.9rem;margin-bottom:1rem";
    note.textContent = "Add a month, then drag the finished files in. They land in the " +
      "client's portal straight away, no publishing needed, and the link never expires. " +
      "One file at a time, up to 95MB each.";
    body.appendChild(note);

    body.appendChild(sublist(plan.deliveries, () => ({
      month: "", label: "", note: ""
    }), (d, wrap) => {
      wrap.appendChild(row(
        monthField("Which month", d),
        textField("Shown as", d, "label")
      ));
      wrap.appendChild(textField("What to say about it (optional)", d, "note", true));
      wrap.appendChild(fileArea(d));
    }, "Add a month"));
  }, count(plan.deliveries, "months"));
}

/* A month picker, because it gives a clean 2026-09 with no parsing and
   no chance of two months colliding. */
function monthField(label, d) {
  const lab = document.createElement("label");
  lab.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "month";
  input.value = d.month || "";

  input.addEventListener("input", () => {
    d.month = input.value;
    // name it for them, unless they have written their own
    if (!d.label || /^[A-Z][a-z]+ \d{4}$/.test(d.label)) {
      const [y, m] = input.value.split("-");
      if (y && m) {
        d.label = new Date(Number(y), Number(m) - 1, 1)
          .toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        const shown = lab.parentElement.querySelector('input:not([type="month"])');
        if (shown) shown.value = d.label;
      }
    }
  });

  lab.append(span, input);
  return lab;
}

function fileArea(d) {
  const wrap = document.createElement("div");
  wrap.style.marginTop = "0.6rem";

  const list = document.createElement("div");
  list.style.cssText = "font-size:0.9rem;margin-bottom:0.6rem";
  wrap.appendChild(list);

  const pick = document.createElement("input");
  pick.type = "file";
  pick.multiple = true;
  pick.style.cssText = "font-size:0.85rem";

  const msg = document.createElement("p");
  msg.className = "form-msg";
  msg.style.cssText = "font-size:0.85rem;margin-top:0.4rem";

  const draw = async () => {
    if (!d.month) { list.textContent = "Pick a month first."; return; }
    list.textContent = "Reading what is there...";
    try {
      const res = await fetch(
        `${RELAY_URL}/delivery?client=${encodeURIComponent(CLIENT)}&month=${encodeURIComponent(d.month)}`,
        { cache: "no-store" }
      );
      const { files } = await res.json();
      list.innerHTML = files.length
        ? files.map((f) => `<div>${escHtml(f.name)} <span class="muted">${readableSize(f.size)}</span></div>`).join("")
        : '<span class="muted">Nothing in this month yet.</span>';
    } catch (err) {
      list.textContent = "Could not read what is there.";
    }
  };

  pick.addEventListener("change", async () => {
    const files = [...pick.files];
    pick.value = "";
    if (!d.month) { msg.textContent = "Pick a month before adding files."; return; }
    if (!localStorage.getItem(TOKEN_KEY)) { msg.textContent = "Save your access key first."; return; }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const label = `${file.name} (${i + 1} of ${files.length})`;
      try {
        await uploadDelivery(d.month, file, (pct) => {
          msg.textContent = `Sending ${label} ${pct}%`;
        });
        msg.textContent = `Sent ${label}`;
      } catch (err) {
        msg.textContent = `${file.name} did not send: ${err.message}`;
        break;
      }
    }
    draw();
  });

  wrap.append(pick, msg);
  draw();
  return wrap;
}

/* XHR rather than fetch, only because it reports upload progress and a
   video file is long enough that silence feels broken. */
function uploadDelivery(month, file, onProgress) {
  return new Promise((resolve, reject) => {
    const url = `${RELAY_URL}/deliver?client=${encodeURIComponent(CLIENT)}` +
      `&month=${encodeURIComponent(month)}&name=${encodeURIComponent(file.name)}`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-Studio-Key", localStorage.getItem(TOKEN_KEY));
    xhr.setRequestHeader("X-File-Type", file.type || "application/octet-stream");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 201) return resolve();
      let why = "error " + xhr.status;
      try { why = JSON.parse(xhr.responseText).error || why; } catch { /* keep the code */ }
      reject(new Error(why));
    });

    xhr.addEventListener("error", () => reject(new Error("the connection dropped")));
    xhr.send(file);
  });
}

function readableSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

/* ============ WHAT KIND OF JOB ============ */
/* One switch decides which half of the portal applies. A retainer
   repeats: months, a posting plan, progress per month. A one off runs
   once: a stage tracker and a delivery date instead. */

const DEFAULT_STAGES = ["Booked", "Filmed", "Editing", "Delivered"];

function kindPanel(isProject) {
  if (!plan.project) plan.project = { what: "", stages: [...DEFAULT_STAGES], stage: 0, deliverBy: "" };
  const project = plan.project;
  if (!Array.isArray(project.stages) || !project.stages.length) {
    project.stages = [...DEFAULT_STAGES];
  }

  return panel("Kind of job", (body) => {
    const note = document.createElement("p");
    note.className = "muted";
    note.style.cssText = "font-size:0.9rem;margin-bottom:1rem";
    note.textContent = "A monthly deal shows months and a posting plan. A one off job shows " +
      "where the work has got to and when it lands, and hides the monthly parts on both the " +
      "portal and this page.";
    body.appendChild(note);

    // changing this changes which panels exist, so it redraws
    body.appendChild(switchField("This is a", plan, "kind",
      [["", "Monthly deal"], ["project", "One off job"]], render));

    if (!isProject) return;

    body.appendChild(textField("What the job is (one line)", project, "what"));
    body.appendChild(row(
      textField("Delivered by (YYYY-MM-DD)", project, "deliverBy"),
      stageField(project)
    ));
    body.appendChild(linesField("The stages, in order, one per line", project, "stages"));

    const hint = document.createElement("p");
    hint.className = "muted";
    hint.style.cssText = "font-size:0.82rem;margin-top:0.5rem";
    hint.textContent = "Rename these to whatever you call them. The client sees the one you " +
      "are on marked, everything before it filled in, everything after it grey.";
    body.appendChild(hint);
  }, isProject ? stageSummary(project) : "monthly");
}

function stageSummary(project) {
  const list = project.stages || DEFAULT_STAGES;
  const at = Math.max(0, Math.min(list.length - 1, Number(project.stage) || 0));
  return String(list[at] || "").toLowerCase() || "one off";
}

/* The current stage is picked by name but stored as a position, so
   renaming a stage never loses where the job is. */
function stageField(project) {
  const lab = document.createElement("label");
  lab.className = "field";
  const span = document.createElement("span");
  span.textContent = "Where it is now";
  const sel = document.createElement("select");

  (project.stages || DEFAULT_STAGES).forEach((name, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = name;
    if (Number(project.stage) === i) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.addEventListener("change", () => { project.stage = Number(sel.value); });
  lab.append(span, sel);
  return lab;
}

/* Like selectField, but the stored value and the label differ and a
   change can trigger something, which the kind switch needs. */
function switchField(label, obj, key, pairs, onChange) {
  const lab = document.createElement("label");
  lab.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const sel = document.createElement("select");

  for (const [value, text] of pairs) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if ((obj[key] || "") === value) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.addEventListener("change", () => {
    obj[key] = sel.value;
    if (onChange) onChange();
  });

  lab.append(span, sel);
  return lab;
}

/* Wipes the shoot once it is done or once it is called off, so the
   portal goes back to saying it is still to be planned rather than
   showing a date that has been and gone. */

function clearShootControl() {
  const wrap = document.createElement("div");

  const btn = document.createElement("button");
  btn.className = "btn-mini danger";
  btn.style.marginTop = "0.3rem";
  btn.textContent = "Clear the next shoot";

  let armed = false;
  btn.addEventListener("click", () => {
    // it changes what the client sees, so it takes two taps
    if (!armed) {
      armed = true;
      btn.textContent = "Sure?";
      setTimeout(() => {
        if (armed) { armed = false; btn.textContent = "Clear the next shoot"; }
      }, 4000);
      return;
    }
    armed = false;
    clearNextShoot(btn);
  });

  const note = document.createElement("p");
  note.className = "muted";
  note.style.cssText = "font-size:0.82rem;margin-top:0.5rem";
  note.textContent = "Empties the date, time, focus and checklist, so the portal goes back to " +
    "saying the next shoot is still to be planned. The location stays. To hand the choice " +
    "of a new date to the client, use Ask again in the panel below.";

  const msg = document.createElement("p");
  msg.className = "form-msg";
  msg.id = "shoot-msg";

  wrap.append(btn, note, msg);
  return wrap;
}

async function clearNextShoot(btn) {
  const msg = $("shoot-msg");
  if (!localStorage.getItem(TOKEN_KEY)) {
    msg.textContent = "Save your access key first (top of the page).";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Clearing...";

  const before = JSON.parse(JSON.stringify(plan.nextShoot));
  plan.nextShoot.date = "";
  plan.nextShoot.time = "";
  plan.nextShoot.focus = "";
  plan.nextShoot.checklist = [];

  if (!await save()) {
    plan.nextShoot = before;
    msg.textContent = "Nothing was changed. See the message at the bottom of the page.";
    btn.disabled = false;
    return;
  }

  render();
  const after = $("shoot-msg");
  if (after) after.textContent = "Cleared. The portal says the next shoot is still to be planned.";
}

/* ============ LET THE CLIENT PICK THE DATE ============ */
/* Offer a few dates on the portal, the client taps one, it arrives as
   a "shoot" labelled issue and as a Telegram message. Confirming here
   writes the pick into Next shoot and stops the portal asking. */

function shootPickPanel() {
  if (!plan.shootPick) plan.shootPick = { asked: false, note: "", options: [] };
  const pick = plan.shootPick;
  if (!Array.isArray(pick.options)) pick.options = [];
  if (!plan.nextShoot) plan.nextShoot = {};

  const box = panel("Let the client pick the date", (body) => {
    const note = document.createElement("p");
    note.className = "muted";
    note.style.cssText = "font-size:0.9rem;margin-bottom:1rem";
    note.textContent = "Offer two or three dates. While this is switched on the portal shows " +
      "them in place of the next shoot card. The client taps one, you get a Telegram message, " +
      "and confirming it below writes it into Next shoot above and switches the question off.";
    body.appendChild(note);

    body.appendChild(checkField("Show these dates on the portal", pick, "asked"));
    body.appendChild(textField("Line above the dates (optional)", pick, "note", true));

    body.appendChild(sublist(pick.options, () => ({
      date: "",
      time: plan.nextShoot.time || "",
      location: plan.nextShoot.location || "",
      focus: ""
    }), (opt, wrap) => {
      wrap.appendChild(row(
        textField("Date (YYYY-MM-DD)", opt, "date"),
        textField("Time", opt, "time")
      ));
      wrap.appendChild(row(
        textField("Location", opt, "location"),
        textField("Focus (one line)", opt, "focus")
      ));
    }, "Add a date"));

    const head = document.createElement("h3");
    head.style.cssText = "font-family:var(--font-display);font-size:1.05rem;margin:1.5rem 0 0.7rem";
    head.textContent = "Picked so far";
    body.appendChild(head);

    const msg = document.createElement("p");
    msg.className = "form-msg";
    msg.id = "pick-msg";
    body.appendChild(msg);

    const list = document.createElement("div");
    list.id = "pick-list";
    list.innerHTML = '<p class="muted" style="font-size:0.9rem">Loading picks...</p>';
    body.appendChild(list);

    const reset = document.createElement("button");
    reset.className = "btn-mini danger";
    reset.style.marginTop = "0.8rem";
    reset.textContent = "Ask again";
    let armed = false;
    reset.addEventListener("click", () => {
      // it changes what the client sees, so it takes two taps like
      // every other live change on this page
      if (!armed) {
        armed = true;
        reset.textContent = "Sure?";
        setTimeout(() => { if (armed) { armed = false; reset.textContent = "Ask again"; } }, 4000);
        return;
      }
      armed = false;
      resetPicks(reset);
    });
    body.appendChild(reset);

    const resetNote = document.createElement("p");
    resetNote.className = "muted";
    resetNote.style.cssText = "font-size:0.82rem;margin-top:0.5rem";
    resetNote.textContent = "Clears anything already picked and puts the question back on the " +
      "portal with the dates above. Use it to offer new dates, to change a date you already " +
      "confirmed, or to put the example portal back the way it was.";
    body.appendChild(resetNote);
  }, pick.asked ? count(pick.options, "dates") + " offered" : "off");

  loadPicks();
  return box;
}

async function loadPicks() {
  try {
    // read first, then look the element up: this panel is not in the
    // page yet at the moment the call is made
    const picks = await fetchRequests("open", "shoot");
    drawPicks($("pick-list"), picks);
  } catch (err) {
    console.error("picks load failed:", err);
    const list = $("pick-list");
    if (list) {
      list.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not load picks (' +
        err.message + ').</p>';
    }
  }
}

function drawPicks(wrap, items) {
  if (!wrap) return;
  wrap.innerHTML = "";

  // anything that is not machine readable is not a pick we can confirm
  const picks = items
    .map((i) => Object.assign({ pick: parsePick(i.text) }, i))
    .filter((i) => i.pick);

  if (!picks.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.style.fontSize = "0.9rem";
    p.textContent = "Nothing picked yet.";
    wrap.appendChild(p);
    return;
  }

  for (const item of picks) {
    const el = document.createElement("div");
    el.className = "item";

    const btn = document.createElement("button");
    btn.className = "btn-mini remove";
    btn.textContent = "Confirm";
    btn.addEventListener("click", () => confirmPick(item, btn));

    const p = document.createElement("p");
    p.style.cssText = "font-size:0.92rem;padding-right:7rem";
    p.textContent = item.text.split("\n").filter(Boolean).join(" · ");

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.style.cssText = "font-size:0.78rem;margin-top:0.4rem";
    meta.textContent = "picked " + item.date;

    el.append(btn, p, meta);
    wrap.appendChild(el);
  }
}

function parsePick(text) {
  const s = String(text || "");
  const when = s.match(/Picked (\d{4}-\d{2}-\d{2})(?: at (\d{1,2}:\d{2}))?/);
  if (!when) return null;
  const where = s.match(/^Where: (.+)$/m);
  const focus = s.match(/^Focus: (.+)$/m);
  return {
    date: when[1],
    time: when[2] || "",
    location: where ? where[1].trim() : "",
    focus: focus ? focus[1].trim() : ""
  };
}

async function confirmPick(item, btn) {
  const msg = $("pick-msg");
  if (!localStorage.getItem(TOKEN_KEY)) {
    msg.textContent = "Save your access key first (top of the page).";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Confirming...";

  // keep a copy: if publishing fails, the page must not be left showing
  // a shoot date that was never saved
  const before = {
    nextShoot: JSON.parse(JSON.stringify(plan.nextShoot)),
    shootPick: JSON.parse(JSON.stringify(plan.shootPick))
  };

  plan.nextShoot.date = item.pick.date;
  plan.nextShoot.time = item.pick.time || plan.nextShoot.time || "";
  if (item.pick.location) plan.nextShoot.location = item.pick.location;
  if (item.pick.focus) plan.nextShoot.focus = item.pick.focus;
  // the dates stay in the file: "Ask again" below reuses them, which is
  // how you change a date you already confirmed
  plan.shootPick.asked = false;

  if (!await save()) {
    plan.nextShoot = before.nextShoot;
    plan.shootPick = before.shootPick;
    msg.textContent = "Nothing was changed. See the message at the bottom of the page.";
    btn.disabled = false;
    return;
  }

  // the pick is answered, so take it off the list. A failure here is
  // harmless: the portal has already stopped asking.
  let closed = true;
  try {
    await setIssueState(item.number, "closed");
  } catch (err) {
    console.error("could not close the pick:", err);
    closed = false;
  }

  const invite = await inviteToShoot(item.pick);

  render();
  const after = $("pick-msg");
  if (after) {
    after.textContent = (closed
      ? "Confirmed. That is the next shoot now and the portal has stopped asking."
      : "Confirmed and published, but the pick could not be ticked off. Check the key has Issues read and write.")
      + " " + invite;
  }
}

/* The client gets a calendar entry, not just a date on a page. Their
   address lives in the private repo, so it is read here where the key
   can reach it, and handed to the relay which mails it. */
async function inviteToShoot(pick) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/studio-private/contents/contacts.json`,
      { headers: { Authorization: "Bearer " + localStorage.getItem(TOKEN_KEY), Accept: "application/vnd.github+json" }, cache: "no-store" }
    );
    if (!res.ok) return "";

    const file = await res.json();
    const contacts = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, "")))));
    const who = contacts[CLIENT];
    if (!who || !who.email) return "No address on file, so no calendar invite was sent.";

    const sent = await fetch("https://kresha-idea-box.vollerodaniele.workers.dev/shoot-confirmed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: localStorage.getItem(TOKEN_KEY),
        client: CLIENT,
        email: who.email,
        name: who.person || who.name || "",
        date: pick.date,
        time: pick.time,
        location: pick.location || plan.nextShoot.location || "",
        focus: pick.focus || plan.nextShoot.focus || ""
      })
    });

    if (sent.ok) return "A calendar invite is on its way to " + who.email + ".";
    const body = await sent.json().catch(() => ({}));
    return "The calendar invite did not send (" + (body.error || sent.status) + ").";
  } catch (err) {
    console.error("could not send the invite:", err);
    return "The calendar invite did not send.";
  }
}

/* Puts the question back: clears every pick made so far and switches
   the portal back to asking. This is also how the example portal gets
   put back after somebody has tapped a date on it. */
async function resetPicks(btn) {
  const msg = $("pick-msg");
  if (!localStorage.getItem(TOKEN_KEY)) {
    msg.textContent = "Save your access key first (top of the page).";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Putting the question back...";

  let stuck = 0;
  try {
    for (const p of await fetchRequests("open", "shoot")) {
      try {
        await setIssueState(p.number, "closed");
      } catch (err) {
        console.error("could not clear a pick:", err);
        stuck++;
      }
    }
  } catch (err) {
    console.error("could not read the picks:", err);
    msg.textContent = "Could not read the picks (" + err.message + "). Nothing was changed.";
    btn.disabled = false;
    return;
  }

  const before = JSON.parse(JSON.stringify(plan.shootPick));
  plan.shootPick.asked = true;

  if (!await save()) {
    plan.shootPick = before;
    msg.textContent = "The picks were cleared, but the portal setting could not be published. " +
      "See the message at the bottom of the page.";
    btn.disabled = false;
    return;
  }

  render();
  const after = $("pick-msg");
  if (after) {
    after.textContent = stuck
      ? "Put back, but " + stuck + " pick(s) could not be cleared. Check the key has Issues read and write."
      : "Put back. The portal is asking again and anything picked before is cleared.";
  }
}

function checkField(label, obj, key) {
  const lab = document.createElement("label");
  lab.className = "field check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!obj[key];
  input.addEventListener("change", () => { obj[key] = input.checked; });
  const span = document.createElement("span");
  span.textContent = label;
  lab.append(input, span);
  return lab;
}

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
    setPanelSummary("Ideas & requests", open.length ? open.length + " waiting" : "none waiting");
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

/* Reads this client's issues for one label: "idea" is a request,
   "shoot" is a date the client picked on the portal. */
async function fetchRequests(state, label) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/issues` +
    `?labels=${encodeURIComponent((label || "idea") + "," + CLIENT_LABEL)}` +
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
    // the wording after "via" differs per site, so match any of them
    const m = body.match(/\n*-{3,}\nSubmitted by: (.+?) \(via [^)]*\)\s*$/);
    if (m) { author = m[1]; body = body.slice(0, m.index); }
    return {
      number: i.number,
      text: body.trim() || i.title.replace(/^(Idea|Shoot|Accepted):\s*/, ""),
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
    await setIssueState(item.number, state);

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

/* Opening or closing an issue: a removed request and a confirmed pick
   are the same GitHub call. Throws the status code so the caller can
   tell a permissions problem from anything else. */
async function setIssueState(number, state) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${number}`, {
    method: "PATCH",
    headers: {
      "Authorization": "Bearer " + localStorage.getItem(TOKEN_KEY),
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ state })
  });
  if (!res.ok) throw new Error(String(res.status));
}

function panel(title, fill, summary) {
  const div = document.createElement("div");
  div.className = "panel";
  div.innerHTML = `<h2>${title}</h2>`;
  fill(div);
  return makeCollapsible(div, summary);
}

/* summary is the finished line shown on the closed heading, so a panel
   that wants to say more than a count just says it */
function listPanel(title, arr, blank, fillItem, summary, rowLabel) {
  return panel(title, (body) => {
    body.appendChild(sublist(arr, blank, fillItem, "Add", rowLabel));
  }, summary);
}

/* One line describing a post while it is folded: when it goes out,
   what it is, and whether it has been. Enough to find the one you
   want without opening any of them. */
function postRowLabel(post, i) {
  const when = post.date
    ? new Date(post.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "No date";
  const what = post.title || post.platform || "Untitled";
  const state = post.status === "posted" ? " · posted" : "";
  const counted = post.how && (post.how.views || post.how.likes || post.how.shares) ? " · counted" : "";
  return when + " · " + what + state + counted;
}

function monthRowLabel(m, i) {
  const reels = m.reels ? m.reels.done + "/" + m.reels.total + " reels" : "";
  return (m.label || "Month " + (i + 1)) + (reels ? " · " + reels : "") + (m.status ? " · " + m.status : "");
}

/* ============ FOLDING THE PANELS AWAY ============ */
/* There are thirteen of these now, which is more scrolling than any of
   them is worth. Everything starts shut, with the heading carrying
   enough of a summary that you rarely need to open it at all. What you
   left open is remembered, because saving redraws the whole page and
   the panel you were working in must not slam shut. */

const OPEN_KEY = "clients-admin-open:" + CLIENT;

function makeCollapsible(box, summary) {
  if (!box) return box;
  const heading = box.querySelector("h2");
  if (!heading) return box;

  const name = heading.textContent.trim();

  const body = document.createElement("div");
  body.className = "panel-body";
  while (heading.nextSibling) body.appendChild(heading.nextSibling);
  heading.remove();

  const head = document.createElement("button");
  head.type = "button";
  head.className = "panel-head";

  const title = document.createElement("span");
  title.className = "panel-title";
  title.textContent = name;

  const note = document.createElement("span");
  note.className = "panel-summary";
  note.textContent = summary || "";

  head.append(title, note, chevron());
  box.classList.add("collapsible");
  box.append(head, body);

  setPanelOpen(box, openPanels().includes(name));

  head.addEventListener("click", () => {
    const open = head.getAttribute("aria-expanded") !== "true";
    setPanelOpen(box, open);
    rememberPanel(name, open);
  });

  return box;
}

function setPanelOpen(box, open) {
  box.classList.toggle("open", open);
  box.querySelector(".panel-head").setAttribute("aria-expanded", open ? "true" : "false");
  box.querySelector(".panel-body").hidden = !open;
}

function openPanels() {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function rememberPanel(name, open) {
  const list = openPanels().filter((n) => n !== name);
  if (open) list.push(name);
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("could not remember the open panels:", err);
  }
}

/* Counts that arrive later, once a network call has finished. */
function setPanelSummary(name, text) {
  for (const t of document.querySelectorAll(".panel-title")) {
    if (t.textContent.trim() === name) {
      const note = t.parentElement.querySelector(".panel-summary");
      if (note) note.textContent = text;
      return;
    }
  }
}

function count(arr, noun) {
  const n = (arr || []).length;
  if (!n) return "empty";
  return n + " " + (n === 1 && noun ? noun.replace(/s$/, "") : noun || "");
}

function chevron() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "panel-arrow");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M9 5l7 7-7 7");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

/* A list of things to edit.

   `rowLabel` makes each entry fold: give it a function that describes
   an entry in one line and the list becomes rows you can run your eye
   down, opening the one you want. Without it every entry stays open,
   which is right for a list of two field things.

   It matters most on the posting schedule. A month is a dozen posts
   and a post is now ten fields, a set of numbers and a frame, so fully
   open that panel was several screens of scrolling to reach the last
   one.

   Which row is open is not remembered. Entries move, and restoring by
   position would open whichever post had since taken that place. */
function sublist(arr, blank, fillItem, addLabel, rowLabel) {
  const wrap = document.createElement("div");
  let openAt = -1;

  const draw = () => {
    wrap.innerHTML = "";

    arr.forEach((item, i) => {
      const box = document.createElement("div");
      box.className = "item";

      const rm = document.createElement("button");
      rm.className = "btn-mini danger remove";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => {
        arr.splice(i, 1);
        if (openAt === i) openAt = -1;
        else if (openAt > i) openAt--;
        draw();
      });

      if (!rowLabel) {
        box.appendChild(rm);
        fillItem(item, box);
        wrap.appendChild(box);
        return;
      }

      const head = document.createElement("button");
      head.type = "button";
      head.className = "fold-head row-head";
      head.setAttribute("aria-expanded", openAt === i ? "true" : "false");
      if (openAt === i) head.classList.add("open");

      const title = document.createElement("span");
      title.className = "fold-title";
      title.style.fontSize = "0.95rem";
      title.textContent = rowLabel(item, i);

      head.append(title, foldChevron());

      const body = document.createElement("div");
      body.className = "row-body";
      body.hidden = openAt !== i;
      fillItem(item, body);

      head.addEventListener("click", () => {
        // one at a time, so the panel cannot grow back into the wall
        // of fields this exists to get rid of
        openAt = openAt === i ? -1 : i;
        draw();
      });

      box.append(rm, head, body);
      wrap.appendChild(box);
    });

    const add = document.createElement("button");
    add.className = "btn-mini";
    add.textContent = "+ " + addLabel;
    add.addEventListener("click", () => {
      arr.push(blank());
      // whatever was just added is the thing you want to type into
      openAt = arr.length - 1;
      draw();
    });
    wrap.appendChild(add);
  };

  draw();
  return wrap;
}

// a progress pair is meaningless with only one half of it
const PAIR = { done: 0, total: 0 };

function foldChevron() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "fold-arrow");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M9 5l7 7-7 7");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
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

/* ============ ONE FRAME FROM A POST ============ */
/* A still, so the calendar reads as pictures rather than dots.

   Shrunk here rather than uploaded whole: a frame off a timeline is
   several megabytes and this is a thumbnail. It also gets an id of its
   own the first time one is attached, because a post has no id and
   naming the file after its position in the list would move the wrong
   picture the moment the order changed. */

const THUMB_RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";

function newPostId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function shrinkFrame(file) {
  const bitmap = await createImageBitmap(file);
  const wide = 640;
  const scale = Math.min(1, wide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.6]) {
    const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", quality));
    if (blob && blob.size <= 900 * 1024) return blob;
  }
  throw new Error("that frame will not shrink small enough");
}

const thumbUrl = (post) =>
  `${THUMB_RELAY}/thumb?client=${encodeURIComponent(CLIENT)}&post=${encodeURIComponent(post.thumb)}`;

function thumbField(post) {
  const wrap = document.createElement("div");
  wrap.className = "pic-field";

  const label = document.createElement("span");
  label.className = "pic-label";
  label.textContent = "One frame from it";
  wrap.appendChild(label);

  const rowEl = document.createElement("div");
  rowEl.className = "pic-row";

  const preview = document.createElement("img");
  preview.className = "pic-preview";
  preview.alt = "";
  preview.hidden = !post.thumb;
  if (post.thumb) preview.src = thumbUrl(post) + "&t=" + Date.now();
  rowEl.appendChild(preview);

  const pick = document.createElement("label");
  pick.className = "btn-file";
  pick.textContent = post.thumb ? "Replace" : "Choose a frame";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  pick.appendChild(input);
  rowEl.appendChild(pick);

  const said = document.createElement("span");
  said.className = "pic-name";
  said.textContent = post.thumb ? "" : "No frame yet";
  rowEl.appendChild(said);

  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "btn-clear";
  drop.textContent = "Remove";
  drop.hidden = !post.thumb;
  rowEl.appendChild(drop);

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;

    if (!localStorage.getItem(TOKEN_KEY)) { said.textContent = "Save your access key first."; return; }

    said.textContent = "Shrinking...";
    let blob;
    try {
      blob = await shrinkFrame(file);
    } catch (err) {
      said.textContent = err.message;
      return;
    }

    // the id is the post's for good, so replacing a frame overwrites
    // rather than leaving the old one behind
    const id = post.thumb || newPostId();
    said.textContent = "Sending...";

    try {
      const res = await fetch(
        `${THUMB_RELAY}/thumb?client=${encodeURIComponent(CLIENT)}&post=${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "X-Studio-Key": localStorage.getItem(TOKEN_KEY), "X-File-Type": "image/jpeg" },
          body: blob
        }
      );
      const answer = await res.json();
      if (!res.ok) throw new Error(answer.error || String(res.status));

      post.thumb = id;
      preview.src = URL.createObjectURL(blob);
      preview.hidden = false;
      drop.hidden = false;
      pick.textContent = "Replace";
      said.textContent = "Frame saved. Publish to show it on the calendar.";
    } catch (err) {
      said.textContent = "Could not send that frame: " + err.message;
    }
    input.value = "";
  });

  drop.addEventListener("click", async () => {
    if (!post.thumb) return;
    said.textContent = "Removing...";
    try {
      await fetch(
        `${THUMB_RELAY}/thumb/drop?client=${encodeURIComponent(CLIENT)}&post=${encodeURIComponent(post.thumb)}`,
        { method: "POST", headers: { "X-Studio-Key": localStorage.getItem(TOKEN_KEY) } }
      );
    } catch { /* the record going is what matters */ }
    delete post.thumb;
    preview.hidden = true;
    preview.removeAttribute("src");
    drop.hidden = true;
    pick.textContent = "Choose a frame";
    said.textContent = "Frame removed. Publish to update the calendar.";
  });

  wrap.appendChild(rowEl);
  return wrap;
}

/* A counter for something a month may not be counting at all.

   Reading .done off a block that is not there took the whole editor
   down with a TypeError, which is what happened the moment the
   example portal stopped carrying photos. So the block is read
   defensively and created only when a number is actually typed. */
function countField(label, owner, block, key, blank) {
  const lab = document.createElement("label");
  lab.className = "field";

  const span = document.createElement("span");
  span.textContent = label;

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  const have = owner[block];
  input.value = have && have[key] != null ? have[key] : "";

  input.addEventListener("input", () => {
    /* A progress pair wants its other half to exist, or the bar
       divides by undefined. A set of view counts wants nothing it was
       not given: it was writing done and total into every post's
       numbers, which meant nothing and sat in the file forever. */
    if (!owner[block]) owner[block] = blank ? { ...blank } : {};
    owner[block][key] = Number(input.value) || 0;
  });

  lab.append(span, input);
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
    return true;
  } catch (err) {
    console.error("save failed:", err);
    msg.textContent = "Error: " + err.message + (String(err.message).includes("401") || String(err.message).includes("403")
      ? " (check the access key and its permissions)" : "");
    return false;
  } finally {
    btn.disabled = false;
  }
}

function escHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
