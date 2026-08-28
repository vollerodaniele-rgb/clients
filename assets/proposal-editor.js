/* Proposal editor
   ------------------------------------------------------------
   Edits proposals/<slug>.json in this repo. Which proposal comes
   from ?p=<slug> in the address. Self contained on purpose: the
   client admin uses its own copy of these helpers, and keeping
   them apart means changing one can never break the other.
   ------------------------------------------------------------ */
const OWNER = "vollerodaniele-rgb";
const REPO = "clients";
const TOKEN_KEY = "clients-admin-token";

// the hash survives the redirects some servers make, the query does not
const SLUG = new URLSearchParams(location.search).get("p") ||
             decodeURIComponent(location.hash.replace(/^#/, "")) || "";
const FILE = `proposals/${SLUG}.json`;

let plan = null;
const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem(TOKEN_KEY) || "";

/* This page loads this file alone, so it carries its own copy rather
   than borrowing the dashboard's. Loaded with a timestamp to dodge the
   ten minute cache, it can arrive after the document is parsed, and
   waiting for an event that has already fired would leave a blank
   page. */
function onReady(fn) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
  // deferred, never run on the spot: this file may arrive after the
  // page is parsed, and running now would reach declarations further
  // down that do not exist yet
  else setTimeout(fn, 0);
}

onReady(async () => {
  $("view-link").href = `../p/${SLUG}/`;
  $("save-btn").addEventListener("click", save);

  if (!SLUG) {
    $("app").innerHTML = '<p class="muted">No proposal chosen. Go back and press Edit on one.</p>';
    return;
  }

  try {
    const res = await fetch(`../${FILE}?t=${Math.random()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    plan = await res.json();
    $("editor-title").textContent = plan.client || SLUG;
    document.title = (plan.client || SLUG) + " | Edit proposal";
    render();
  } catch (err) {
    $("app").innerHTML = `<p class="muted">Could not load this proposal (${escHtml(err.message)}).</p>`;
  }
});

function render() {
  const app = $("app");
  app.innerHTML = "";

  app.appendChild(panel("The heading", (body) => {
    body.appendChild(row(
      textField("Brand", plan, "client"),
      textField("Under the name", plan, "subtitle")
    ));
    body.appendChild(row(
      textField("Line above the packages", plan, "kicker"),
      textField("Footer line", plan, "footer")
    ));
  }));

  if (!plan.intro) plan.intro = { lead: "", text: "" };
  app.appendChild(panel("Opening words", (body) => {
    body.appendChild(textField("Small line", plan.intro, "lead"));
    body.appendChild(textField("Paragraph", plan.intro, "text", true));
  }));

  if (!plan.packages) plan.packages = [];
  app.appendChild(listPanel("Packages", plan.packages, () => ({
    num: "", name: "", tag: "", price: "", per: "per month · VAT incl.",
    was: "", off: "", badge: "", featured: false, features: []
  }), (p, body) => {
    body.appendChild(row(
      textField("Small line above", p, "num"),
      textField("Name", p, "name")
    ));
    body.appendChild(textField("One line under the name", p, "tag"));
    body.appendChild(row(
      textField("Price", p, "price"),
      textField("Old price, if reduced", p, "was"),
      textField("Under the price", p, "per")
    ));
    body.appendChild(row(
      textField("Note under the price", p, "off"),
      textField("Badge", p, "badge"),
      checkField("Mark as the recommended one", p, "featured")
    ));
    if (!p.features) p.features = [];
    body.appendChild(catalogue(p));
    body.appendChild(customLines(p));

    if (!p.mix) p.mix = { label: "", chips: [] };
    body.appendChild(textField("Chip heading (optional)", p.mix, "label"));
    body.appendChild(linesField("Chips, one per line", p.mix, "chips"));
  }));

  if (!plan.notes) plan.notes = [];
  app.appendChild(listPanel("Notes", plan.notes, () => ({ title: "", body: "" }), (n, body) => {
    body.appendChild(textField("Heading", n, "title"));
    body.appendChild(textField("Text", n, "body", true));
  }));

  if (!plan.process) plan.process = { num: "", title: "", steps: [] };
  app.appendChild(panel("How it works", (body) => {
    body.appendChild(row(
      textField("Small line above", plan.process, "num"),
      textField("Heading", plan.process, "title")
    ));
    if (!plan.process.steps) plan.process.steps = [];
    body.appendChild(sublist(plan.process.steps, () => ({ n: "", title: "", text: "" }), (s, wrap) => {
      wrap.appendChild(row(
        textField("Number", s, "n"),
        textField("Title", s, "title")
      ));
      wrap.appendChild(textField("Text", s, "text", true));
    }, "Add a step"));
  }));

  if (!plan.terms) plan.terms = [];
  app.appendChild(listPanel("Terms", plan.terms, () => ({ k: "", v: "" }), (t, body) => {
    body.appendChild(row(
      textField("Term", t, "k"),
      textField("What it says", t, "v")
    ));
  }));
}

/* ============ FORM BUILDING ============ */

/* ============ WHAT IS IN A PACKAGE ============ */
/* Typing the same six lines into every proposal is how wording drifts
   and how a package quietly ends up promising something different from
   the last one. These are the things actually sold, so they are ticked
   rather than typed, with a number where a number makes sense.

   A ticked line is stored with its `key`, so the editor knows it came
   from here. Anything without a key was typed by hand and is left
   completely alone. */

const CATALOGUE = [
  { key: "reels", n: 10, what: (n) => n + " planned reels",
    sub: "Chosen and written before the shoot day, filmed in one session." },
  { key: "interview", n: 1, what: (n) => n + (n === 1 ? " interview reel" : " interview reels"),
    sub: "One of your people on camera, answering a question clients actually ask." },
  { key: "photos", n: 15, what: (n) => n + " ready to post photographs",
    sub: "Edited, framed for feed and stories, delivered with the reels." },
  { key: "shootday", n: 1, what: (n) => n === 1 ? "A full shoot day on site" : n + " shoot days on site",
    sub: "Shot around your day rather than against it." },
  { key: "brainstorm", what: () => "A brainstorm session",
    sub: "We plan it together before anything is filmed." },
  { key: "identity", what: () => "A new visual identity",
    sub: "How the brand looks and sounds on camera, agreed before we film." },
  { key: "secondcam", what: () => "A second camera",
    sub: "Two angles on the moments that only happen once." },
  { key: "priority", what: () => "Priority on the calendar",
    sub: "First choice of shoot dates." },
  { key: "delivery", n: 10, what: (n) => "Delivery within " + n + " days",
    sub: "Counted from the shoot day." }
];

function catalogue(p) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "margin:0.9rem 0 1rem";

  const head = document.createElement("p");
  head.className = "muted";
  head.style.cssText = "font-size:0.82rem;margin-bottom:0.6rem";
  head.textContent = "Tick what is in this package. The wording is written for you.";
  wrap.appendChild(head);

  for (const item of CATALOGUE) {
    const on = p.features.find((f) => f.key === item.key);

    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:0.7rem;padding:0.35rem 0;font-size:0.95rem";

    const tick = document.createElement("input");
    tick.type = "checkbox";
    tick.checked = !!on;
    tick.style.cssText = "width:1.05rem;height:1.05rem;padding:0;border:0;accent-color:#ffffff;cursor:pointer";

    const num = document.createElement("input");
    num.type = "number";
    num.min = "1";
    num.value = on && on.n != null ? on.n : (item.n != null ? item.n : "");
    num.style.cssText = "width:4.2rem;padding:0.35rem 0.5rem;font-size:0.9rem";
    num.hidden = item.n == null;
    num.disabled = !tick.checked;

    const text = document.createElement("span");
    const label = () => item.what(Number(num.value) || item.n || 1);
    text.textContent = label();
    text.style.color = tick.checked ? "var(--text)" : "var(--dim)";

    const apply = () => {
      num.disabled = !tick.checked;
      text.textContent = label();
      text.style.color = tick.checked ? "var(--text)" : "var(--dim)";
      rebuild(p, item.key, tick.checked ? {
        key: item.key,
        n: item.n == null ? undefined : (Number(num.value) || item.n),
        what: label(),
        sub: item.sub
      } : null);
    };

    tick.addEventListener("change", apply);
    num.addEventListener("input", apply);

    row.append(tick, num, text);
    wrap.appendChild(row);
  }

  return wrap;
}

/* Keeps the ticked lines in catalogue order and never disturbs the
   hand written ones, which always sit after them. */
function rebuild(p, key, entry) {
  const rest = p.features.filter((f) => f.key !== key);
  if (entry) rest.push(entry);
  const keyed = CATALOGUE
    .map((i) => rest.find((f) => f.key === i.key))
    .filter(Boolean);
  p.features.length = 0;
  p.features.push(...keyed, ...rest.filter((f) => !f.key));
}

/* Anything the list does not cover. */
function customLines(p) {
  const wrap = document.createElement("div");

  const draw = () => {
    wrap.innerHTML = "";
    for (const f of p.features.filter((x) => !x.key)) {
      const box = document.createElement("div");
      box.className = "item";
      const rm = document.createElement("button");
      rm.className = "btn-mini danger remove";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => {
        p.features.splice(p.features.indexOf(f), 1);
        draw();
      });
      box.appendChild(rm);
      box.appendChild(textField("What is included", f, "what"));
      box.appendChild(textField("The line under it", f, "sub", true));
      wrap.appendChild(box);
    }
    const add = document.createElement("button");
    add.className = "btn-mini";
    add.textContent = "+ Add something not on the list";
    add.addEventListener("click", () => { p.features.push({ what: "", sub: "" }); draw(); });
    wrap.appendChild(add);
  };

  draw();
  return wrap;
}

function panel(title, fill) {
  const div = document.createElement("div");
  div.className = "panel";
  div.innerHTML = `<h2>${escHtml(title)}</h2>`;
  fill(div);
  return div;
}

function listPanel(title, arr, blank, fillItem) {
  return panel(title, (body) => body.appendChild(sublist(arr, blank, fillItem, "Add")));
}

function sublist(arr, blank, fillItem, addLabel) {
  const wrap = document.createElement("div");
  const draw = () => {
    wrap.innerHTML = "";
    arr.forEach((item, i) => {
      const box = document.createElement("div");
      box.className = "item";
      const rm = document.createElement("button");
      rm.className = "btn-mini remove";
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

function checkField(label, obj, key) {
  const lab = document.createElement("label");
  lab.className = "check";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = !!obj[key];
  box.addEventListener("change", () => { obj[key] = box.checked; });
  const span = document.createElement("span");
  span.textContent = label;
  lab.append(box, span);
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

  if (!token()) { msg.textContent = "Save your access key on the dashboard first."; return; }

  btn.disabled = true;
  msg.textContent = "Publishing...";

  try {
    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;
    const headers = {
      Authorization: "Bearer " + token(),
      Accept: "application/vnd.github+json"
    };

    const cur = await fetch(api, { headers, cache: "no-store" });
    if (!cur.ok) throw new Error("could not read the current file (" + cur.status + ")");
    const { sha } = await cur.json();

    const put = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Update the ${plan.client || SLUG} proposal`,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(plan, null, 2) + "\n"))),
        sha
      })
    });
    if (!put.ok) throw new Error("publish failed (" + put.status + ")");

    msg.textContent = "Published. The proposal updates in about a minute.";
  } catch (err) {
    console.error("save failed:", err);
    msg.textContent = "Error: " + err.message +
      (/40[13]/.test(err.message) ? " (the key needs Contents read and write)" : "");
  } finally {
    btn.disabled = false;
  }
}

function escHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
