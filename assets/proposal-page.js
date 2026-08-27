/* Proposal (shared)
   ------------------------------------------------------------
   One copy of this file serves every proposal. Which one it is
   comes from the folder in the URL, and the content from
   data/<slug>.json. Choosing a package pings the studio.
   ------------------------------------------------------------ */
const RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";

function currentSlug() {
  // pages live at /p/<slug>/, so the slug follows the p segment
  const parts = location.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("p");
  return (i >= 0 ? parts[i + 1] : parts[parts.length - 1]) || "";
}

const SLUG = currentSlug();
const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  let data;
  try {
    const res = await fetch(`../../proposals/${SLUG}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch (err) {
    console.error("proposal load failed:", err);
    $("client-title").textContent = "Not found";
    return;
  }
  render(data);
});

function render(d) {
  document.title = `${d.client || "Proposal"} | ${d.kicker || "Proposal"}`;

  $("brand").textContent = d.studio || "NOIR AU NOIR";
  $("client-title").textContent = d.client || "";
  $("client-sub").textContent = d.subtitle || "";
  $("for-line").textContent = d.kicker || "";
  $("foot-brand").textContent = d.studio || "NOIR AU NOIR";
  $("foot-meta").textContent = d.footer || "";

  if (d.intro) {
    $("intro-lead").textContent = d.intro.lead || "";
    $("intro-text").textContent = d.intro.text || "";
  } else {
    $("intro").hidden = true;
  }

  renderPackages(d.packages || []);
  renderNotes(d.notes || []);
  renderProcess(d.process);
  renderTerms(d.terms || []);
}

function renderPackages(packages) {
  const wrap = $("packages");
  wrap.innerHTML = "";

  packages.forEach((p, i) => {
    const section = document.createElement("div");

    const head = document.createElement("div");
    head.className = "sec-head";
    head.innerHTML = `
      <div class="num">${esc(p.num || String(i + 1).padStart(2, "0"))}</div>
      <h2>${esc(p.name || "")}</h2>
    `;
    section.appendChild(head);

    const card = document.createElement("div");
    card.className = "pkg" + (p.featured ? " featured" : "");
    card.innerHTML = `
      <div class="pkg-top">
        <div>
          ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
          <div class="pkg-name">${esc(p.name || "")}</div>
          ${p.tag ? `<div class="pkg-tag">${esc(p.tag)}</div>` : ""}
        </div>
        <div class="price">
          ${p.was ? `<div class="was">${esc(p.was)}</div>` : ""}
          <div class="amt">${esc(p.price || "")}</div>
          ${p.per ? `<div class="per">${esc(p.per)}</div>` : ""}
          ${p.off ? `<div class="off">${esc(p.off)}</div>` : ""}
        </div>
      </div>
      ${(p.features && p.features.length) ? `
        <div class="pkg-body">
          <ul class="feat">
            ${p.features.map((f) => `
              <li><b>${esc(f.what || "")}</b>
                ${f.sub ? `<span class="sub">${esc(f.sub)}</span>` : ""}
              </li>`).join("")}
          </ul>
        </div>` : ""}
      ${(p.mix && p.mix.chips && p.mix.chips.length) ? `
        <div class="mix">
          ${p.mix.label ? `<div class="label">${esc(p.mix.label)}</div>` : ""}
          <div class="chips">${p.mix.chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
        </div>` : ""}
    `;

    card.appendChild(chooseArea(p.name || `Package ${i + 1}`));
    section.appendChild(card);
    wrap.appendChild(section);
  });
}

/* Choosing is two steps on purpose: the button opens a small form
   rather than firing something irreversible on a single tap. */
function chooseArea(packageName) {
  const area = document.createElement("div");
  area.className = "pkg-choose";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-choose";
  btn.textContent = "Choose this package";

  const note = document.createElement("span");
  note.className = "choose-note";

  area.append(btn, note);

  const box = document.createElement("div");
  box.className = "choose-box";
  box.hidden = true;
  box.innerHTML = `
    <label><span>Your name</span><input type="text" maxlength="60" placeholder="Who is choosing?"></label>
    <label><span>Anything to add (optional)</span><input type="text" maxlength="200" placeholder="A question, a date, a change"></label>
  `;

  const send = document.createElement("button");
  send.type = "button";
  send.className = "btn-send";
  send.textContent = "Send";
  box.appendChild(send);

  btn.addEventListener("click", () => {
    box.hidden = !box.hidden;
    btn.textContent = box.hidden ? "Choose this package" : "Cancel";
    if (!box.hidden) box.querySelector("input").focus();
  });

  send.addEventListener("click", async () => {
    const [nameInput, msgInput] = box.querySelectorAll("input");
    const who = nameInput.value.trim();
    if (!who) { note.textContent = "Please add your name."; nameInput.focus(); return; }

    send.disabled = true;
    note.textContent = "Sending...";

    try {
      const res = await fetch(RELAY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: "proposal",
          client: SLUG,
          name: who,
          idea: `Chose the ${packageName} package.` +
            (msgInput.value.trim() ? ` Note: ${msgInput.value.trim()}` : "")
        })
      });
      if (!res.ok) throw new Error(String(res.status));

      box.hidden = true;
      btn.hidden = true;
      note.textContent = `Thank you. We have your choice of ${packageName} and will be in touch.`;
    } catch (err) {
      console.error("choose failed:", err);
      note.textContent = "That did not send. Try again, or reply to the email.";
      send.disabled = false;
    }
  });

  const holder = document.createDocumentFragment();
  holder.append(area, box);
  return holder;
}

function renderNotes(notes) {
  const wrap = $("notes");
  wrap.innerHTML = notes.map((n) => `
    <div class="note">
      ${n.title ? `<div class="t">${esc(n.title)}</div>` : ""}
      ${String(n.body || "").split("\n\n").map((para) => `<p>${esc(para)}</p>`).join("")}
      ${n.link && n.link.url
        ? `<p><a class="note-link" href="${esc(n.link.url)}" target="_blank" rel="noopener">${esc(n.link.text || "Have a look")}</a></p>`
        : ""}
    </div>
  `).join("");
}

function renderProcess(process) {
  if (!process || !process.steps || !process.steps.length) {
    $("process-section").hidden = true;
    return;
  }
  $("process-num").textContent = process.num || "How it works";
  $("process-title").textContent = process.title || "";
  $("steps").innerHTML = process.steps.map((s, i) => `
    <div class="step">
      <div class="n">${esc(s.n || String(i + 1).padStart(2, "0"))}</div>
      <h4>${esc(s.title || "")}</h4>
      <p>${esc(s.text || "")}</p>
    </div>
  `).join("");
}

function renderTerms(terms) {
  if (!terms.length) { $("terms-section").hidden = true; return; }
  $("terms-grid").innerHTML = terms.map((t) => `
    <div class="term"><div class="k">${esc(t.k || "")}</div><div class="v">${esc(t.v || "")}</div></div>
  `).join("");
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
