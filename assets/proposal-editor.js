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

document.addEventListener("DOMContentLoaded", async () => {
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
    body.appendChild(sublist(p.features, () => ({ what: "", sub: "" }), (f, wrap) => {
      wrap.appendChild(textField("What is included", f, "what"));
      wrap.appendChild(textField("The line under it", f, "sub", true));
    }, "Add a line"));

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
