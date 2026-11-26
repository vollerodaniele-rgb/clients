/* Idea deck editor
   ------------------------------------------------------------
   Edits ideas/<slug>.json, the page at i/<slug>/. Which deck comes
   from the hash (#<slug>). Pictures for the moodboard go up the moment
   they are dropped in, shrunk in the browser first, into
   ideas/<slug>/; Save & Publish then writes the wording.
   Self contained, like the proposal editor, so changing the dashboard
   can never break this page.
   ------------------------------------------------------------ */
const OWNER = "vollerodaniele-rgb";
const REPO = "clients";
const TOKEN_KEY = "clients-admin-token";

const SLUG = decodeURIComponent(location.hash.replace(/^#/, "")) ||
             new URLSearchParams(location.search).get("i") || "";
const FILE = `ideas/${SLUG}.json`;

let plan = null;
const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem(TOKEN_KEY) || "";

function onReady(fn) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
  else setTimeout(fn, 0);
}

onReady(async () => {
  $("view-link").href = `../i/${encodeURIComponent(SLUG)}/`;
  $("save-btn").addEventListener("click", save);

  if (!/^[A-Za-z0-9_-]{6,40}$/.test(SLUG)) {
    $("app").innerHTML = '<p class="muted">No idea chosen. Go back and press Edit on one.</p>';
    return;
  }

  try {
    const res = await fetch(`../${FILE}?t=${Math.random()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    plan = fill(await res.json());
    $("editor-title").textContent = plan.client || "Idea";
    document.title = (plan.client || "Idea") + " | Edit idea";
    render();
  } catch (err) {
    $("app").innerHTML = `<p class="muted">Could not load this idea (${escHtml(err.message)}). ` +
      "A new one takes about a minute to appear; reload then.</p>";
  }
});

// every part the page knows, so an older file still edits cleanly
function fill(d) {
  d.intro = d.intro || { title: "Introduction", text: "" };
  d.pillars = d.pillars || { title: "", items: [] };
  d.pillars.items = d.pillars.items || [];
  d.concept = d.concept || { title: "The concept", points: [] };
  d.concept.points = d.concept.points || [];
  d.examples = d.examples || { title: "Example", note: "", videos: [] };
  d.examples.videos = d.examples.videos || [];
  d.moodboard = d.moodboard || { title: "Moodboard", images: [] };
  d.moodboard.images = d.moodboard.images || [];
  d.cta = d.cta || { title: "Ready?", button: "Book a call" };
  return d;
}

function render() {
  const app = $("app");
  app.innerHTML = "";

  app.appendChild(panel("The cover", (body) => {
    body.appendChild(row(
      textField("Small line on top", plan, "kicker"),
      textField("Who it is for", plan, "client"),
      textField("What it is", plan, "format")
    ));
    hint(body, "Like: Proposal / Michael Page / Short form documentary.");
  }));

  app.appendChild(panel("The hook", (body) => {
    body.appendChild(textField("One sentence that sets the idea", plan, "hook", true));
  }));

  app.appendChild(panel("Introduction", (body) => {
    body.appendChild(textField("Title", plan.intro, "title"));
    body.appendChild(textField("Text (an empty line starts a new paragraph)", plan.intro, "text", true));
  }));

  app.appendChild(panel("Three pillars", (body) => {
    body.appendChild(textField("Title above them", plan.pillars, "title"));
    body.appendChild(sublist(plan.pillars.items, () => ({ text: "" }), (item, box) => {
      box.appendChild(textField("Text", item, "text", true));
    }, "Add a pillar"));
  }));

  app.appendChild(panel("The concept", (body) => {
    body.appendChild(textField("Title", plan.concept, "title"));
    body.appendChild(linesField("The points, one per line", plan.concept, "points"));
  }));

  app.appendChild(panel("Examples", (body) => {
    body.appendChild(textField("Title", plan.examples, "title"));
    body.appendChild(sublist(plan.examples.videos, () => ({ url: "", label: "" }), (item, box) => {
      box.appendChild(row(textField("Link (YouTube, Vimeo or any page)", item, "url"), textField("Label (optional)", item, "label")));
    }, "Add a video"));
    body.appendChild(textField("A line under them", plan.examples, "note", true));
    hint(body, "YouTube and Vimeo links play right on the page. Other links open in a new tab.");
  }));

  app.appendChild(moodPanel());

  app.appendChild(panel("The closing line", (body) => {
    body.appendChild(textField("Shown big before the end", plan, "closing", true));
  }));

  app.appendChild(panel("The end", (body) => {
    body.appendChild(row(textField("Big word", plan.cta, "title"), textField("Button (opens the booking page)", plan.cta, "button")));
    hint(body, "There is always a second button, Write to us, which opens a mail to info@noiraunoir.com.");
  }));
}

/* ============ MOODBOARD ============ */

function moodPanel() {
  return panel("Moodboard", (body) => {
    body.appendChild(textField("Title", plan.moodboard, "title"));

    const pics = document.createElement("div");
    pics.className = "pics";
    const draw = () => {
      pics.innerHTML = "";
      plan.moodboard.images.forEach((p, i) => {
        const box = document.createElement("div");
        box.className = "pic";
        const img = document.createElement("img");
        img.src = "../" + p.src + "?t=" + (p.t || "");
        img.alt = "";
        const cap = document.createElement("input");
        cap.placeholder = "Caption (optional)";
        cap.value = p.caption || "";
        cap.addEventListener("input", () => { p.caption = cap.value; });
        const acts = document.createElement("div");
        acts.className = "acts";
        const move = (by) => () => {
          const to = i + by;
          if (to < 0 || to >= plan.moodboard.images.length) return;
          const list = plan.moodboard.images;
          [list[i], list[to]] = [list[to], list[i]];
          draw();
        };
        acts.append(
          button("←", move(-1)),
          button("→", move(1)),
          button("Remove", () => { plan.moodboard.images.splice(i, 1); draw(); })
        );
        box.append(img, cap, acts);
        pics.appendChild(box);
      });
    };
    draw();

    const drop = document.createElement("label");
    drop.className = "drop";
    drop.textContent = "Drop pictures here, or tap to choose them";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.hidden = true;
    drop.appendChild(input);
    const status = document.createElement("p");
    status.className = "form-msg";

    const take = async (files) => {
      files = [...files].filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      if (!token()) { status.textContent = "Save your access key on the dashboard first."; return; }
      let done = 0;
      for (const file of files) {
        status.textContent = `Uploading ${done + 1} of ${files.length}...`;
        try {
          const blob = await shrink(file, 1800, 0.84);
          const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ".jpg";
          const path = `ideas/${SLUG}/${name}`;
          await putFile(path, await toBase64(blob), `Moodboard picture for ${plan.client || SLUG}`);
          plan.moodboard.images.push({ src: path, caption: "", t: Date.now() });
          done++;
          draw();
        } catch (err) {
          console.error("picture failed:", err);
          status.textContent = `Could not upload ${file.name}: ${err.message}`;
          return;
        }
      }
      status.textContent = `${done} uploaded. Saving the page...`;
      await save();
      status.textContent = `${done} added. They show on the page in about a minute.`;
    };

    input.addEventListener("change", () => { take(input.files); input.value = ""; });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer.files); });

    body.append(pics, drop, status);
    hint(body, "Pictures are made smaller for the web first. Stills from films work well. Their shape is kept.");
  });
}

/* a picture made smaller in the browser, so the page stays quick */
function shrink(file, side, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("could not read the picture"))), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not a picture this browser can read")); };
    img.src = url;
  });
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("could not read the picture"));
    r.readAsDataURL(blob);
  });
}

/* ============ SAVE ============ */

const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
const headers = () => ({ Authorization: "Bearer " + token(), Accept: "application/vnd.github+json" });

/* writes one file; a 409 means another commit landed in the same
   second, so it reads again and repeats */
async function putFile(path, base64, message) {
  for (let attempt = 0; ; attempt++) {
    const cur = await fetch(API + path, { headers: headers(), cache: "no-store" });
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const put = await fetch(API + path, {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: base64, ...(sha ? { sha } : {}) })
    });
    if (put.ok) return;
    if ((put.status !== 409 && put.status !== 422) || attempt >= 4) throw new Error("GitHub " + put.status);
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
}

let saving = Promise.resolve();
function save() {
  saving = saving.then(saveNow, saveNow);
  return saving;
}

async function saveNow() {
  const msg = $("save-msg");
  const btn = $("save-btn");
  if (!token()) { msg.textContent = "Save your access key on the dashboard first."; return; }

  btn.disabled = true;
  msg.textContent = "Publishing...";
  try {
    // the stamps only refresh pictures in this editor, the page needs none
    const clean = JSON.parse(JSON.stringify(plan));
    for (const p of clean.moodboard.images) delete p.t;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(clean, null, 2) + "\n")));
    await putFile(FILE, content, `Update the ${plan.client || SLUG} idea`);
    msg.textContent = "Published. The page updates in about a minute.";
  } catch (err) {
    console.error("save failed:", err);
    msg.textContent = "Error: " + err.message +
      (/40[13]/.test(err.message) ? " (the key needs Contents read and write)" : "");
  } finally {
    btn.disabled = false;
  }
}

/* ============ PIECES ============ */

function panel(title, fill) {
  const div = document.createElement("div");
  div.className = "panel";
  div.innerHTML = `<h2>${escHtml(title)}</h2>`;
  fill(div);
  return div;
}

function hint(body, text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.style.cssText = "font-size:0.82rem;margin-top:0.5rem";
  p.textContent = text;
  body.appendChild(p);
}

function button(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn-mini";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function sublist(arr, blank, fillItem, addLabel) {
  const wrap = document.createElement("div");
  const draw = () => {
    wrap.innerHTML = "";
    arr.forEach((item, i) => {
      const box = document.createElement("div");
      box.className = "item";
      const rm = button("Remove", () => { arr.splice(i, 1); draw(); });
      rm.classList.add("remove");
      box.appendChild(rm);
      fillItem(item, box);
      wrap.appendChild(box);
    });
    wrap.appendChild(button("+ " + addLabel, () => { arr.push(blank()); draw(); }));
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

function linesField(label, obj, key) {
  const lab = document.createElement("label");
  lab.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const ta = document.createElement("textarea");
  ta.style.minHeight = "8rem";
  ta.value = (obj[key] || []).join("\n");
  ta.addEventListener("input", () => {
    obj[key] = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
  });
  lab.append(span, ta);
  return lab;
}

function escHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
