/* Client Portal (shared)
   ------------------------------------------------------------
   Everything on this page comes from data/plan.json.
   Edit that one file to update the portal.
   ------------------------------------------------------------ */
/* Which client this page belongs to comes from the folder name in
   the URL, so every client folder holds byte identical files and a
   new client needs no code at all. */
function currentClient() {
  const parts = location.pathname.split('/').filter(Boolean);
  // the repo name leads the path on the project URL, so step past it
  if (parts[0] === 'clients') parts.shift();
  return (parts[0] || '').toLowerCase();
}
const CLIENT = currentClient();
const DATA_URL = '../data/' + CLIENT + '.json';

const CONFIG = {
  owner: 'vollerodaniele-rgb',
  repo: 'clients',
  submitUrl: 'https://kresha-idea-box.vollerodaniele.workers.dev',
  site: 'clients'
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", loadPlan);

async function loadPlan() {
  let data;
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    data = await res.json();
  } catch (err) {
    $("tagline").textContent = "Could not load the plan data.";
    console.error("plan load failed:", err);
    return;
  }

  const name = data.name || CLIENT.toUpperCase();
  $("client-name").textContent = name;
  document.title = name + " | Content Portal";

  $("tagline").textContent = data.tagline || "";
  $("deal-notes").textContent = data.dealNotes || "";

  // an optional line under the tagline, used by the example portal to
  // say it is an example. Built here rather than in the template so
  // every existing client picks it up without being touched.
  if (data.notice) {
    const note = document.createElement("p");
    note.className = "hero-notice";
    note.textContent = data.notice;
    $("tagline").after(note);
  }

  renderDeal(data.deal || []);
  renderShoot(data.nextShoot);
  setupShootPick(data.shootPick);
  renderFilmPlan(data.filmPlan);
  renderMonths(data.months || []);
  renderDocs(data.documents || [], data.deliveries || []);
  renderInvoices(data.invoices || []);
  const isProject = data.kind === "project";
  renderFooter(data.contact, isProject);
  // last, so it can override headings the renders above just set
  if (isProject) setupProject(data);

  loadRequests();
  if (CONFIG.submitUrl) setupRequestForm();
}

/* ============ IDEAS & REQUESTS ============ */

async function loadRequests() {
  const grid = $("request-grid");
  const status = $("request-status");
  try {
    // read through the relay: it is authenticated, so visitors never
    // run into GitHub's limit for anonymous requests
    const res = await fetch(
      `${CONFIG.submitUrl}/ideas?site=${encodeURIComponent(CONFIG.site)}&client=${encodeURIComponent(CLIENT)}`, {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("relay " + res.status);
    const { ideas } = await res.json();

    if (!ideas.length) {
      status.textContent = "No requests yet. The floor is yours.";
      return;
    }
    grid.innerHTML = "";
    for (const r of ideas) {
      grid.appendChild(requestCard(r.text, r.author));
    }
  } catch (err) {
    status.textContent = "Could not load requests right now.";
    console.error("requests load failed:", err);
  }
}

function requestCard(text, author) {
  const card = document.createElement("article");
  card.className = "request-card";
  card.innerHTML = `
    <p class="request-body">${esc(text.slice(0, 300))}</p>
    <p class="request-meta">from ${esc(author)}</p>
  `;
  return card;
}

function setupRequestForm() {
  const form = $("request-form");
  form.hidden = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("request-msg");
    const btn = $("request-submit");
    const idea = $("request-text").value.trim();
    const name = $("request-name").value.trim();

    if (idea.length < 10) {
      msg.textContent = "Give it a few more words (at least 10 characters).";
      return;
    }

    btn.disabled = true;
    msg.textContent = "Sending...";

    try {
      const res = await fetch(CONFIG.submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: CONFIG.site, client: CLIENT, idea, name,
          website: $("request-website").value
        })
      });
      if (!res.ok) throw new Error("relay " + res.status);

      msg.textContent = "Received! It is in our planning now.";
      form.reset();

      const grid = $("request-grid");
      const status = $("request-status");
      if (status) status.remove();
      grid.prepend(requestCard(idea, name || "anonymous"));
    } catch (err) {
      console.error("request submit failed:", err);
      msg.textContent = "Could not send right now. Try again in a minute.";
    } finally {
      btn.disabled = false;
    }
  });
}

function renderDeal(tiles) {
  const wrap = $("deal-tiles");
  wrap.innerHTML = "";
  for (const t of tiles) {
    const el = document.createElement("div");
    el.className = "tile";
    el.innerHTML = `<div class="num">${esc(t.num)}</div><div class="lbl">${esc(t.label)}</div>`;
    wrap.appendChild(el);
  }
}

function renderShoot(shoot) {
  const card = $("shoot-card");
  if (!shoot || !shoot.date) {
    card.innerHTML = `<p class="muted">Next shoot date to be planned. Watch this space.</p>`;
    return;
  }

  const d = new Date(shoot.date + "T00:00:00");
  const dateStr = longDate(shoot.date);
  const days = Math.ceil((d - new Date()) / 86400000);
  const countdown =
    days > 1 ? `<div class="num">${days}</div><div class="lbl">days to go</div>` :
    days === 1 ? `<div class="num">1</div><div class="lbl">day to go</div>` :
    days === 0 ? `<div class="num">🎬</div><div class="lbl">today</div>` :
    `<div class="num">✓</div><div class="lbl">wrapped</div>`;

  card.innerHTML = `
    <div>
      <div class="shoot-date">${esc(dateStr)}${shoot.time ? " · " + esc(shoot.time) : ""}</div>
      <div class="shoot-meta">${esc(shoot.location || "")}</div>
      ${shoot.focus ? `<div class="shoot-meta">${esc(shoot.focus)}</div>` : ""}
    </div>
    <div class="shoot-count">${countdown}</div>
    ${(shoot.checklist && shoot.checklist.length)
      ? `<div class="shoot-checklist">${shoot.checklist.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`
      : ""}
  `;
}

/* ============ ONE OFF PROJECTS ============ */
/* A retainer is organised around time: months repeating, a posting
   plan, progress bars per month. A one off is organised around
   progress: there is one job, and the only thing the client wants to
   know is where it is and when they get it. Same portal, same files,
   one field in the data decides which sections apply. Anything without
   a kind is a retainer, so every client that predates this is
   untouched. */

const DEFAULT_STAGES = ["Booked", "Filmed", "Editing", "Delivered"];

function setupProject(data) {
  const project = data.project || {};

  // months and the posting plan measure a repeating deal, so neither
  // means anything for a single job
  const months = $("months");
  if (months) months.hidden = true;
  const nav = document.querySelector(".hero-nav");
  if (nav) nav.hidden = true;

  const dealHead = document.querySelector("#deal .section-head h2");
  if (dealHead) dealHead.textContent = "What You Get";
  const filmTitle = $("filmplan-title");
  if (filmTitle) filmTitle.textContent = "What We Film";

  renderStages(project);
}

/* The strip that answers "where is my film" without an email. */
function renderStages(project) {
  const stages = (project.stages || []).filter(Boolean);
  const list = stages.length ? stages : DEFAULT_STAGES;
  const at = Math.max(0, Math.min(list.length - 1, Number(project.stage) || 0));
  const done = at === list.length - 1;

  const section = document.createElement("section");
  section.id = "progress";
  section.className = "section";
  section.innerHTML = `
    <div class="section-head"><h2>Where We Are</h2></div>
    ${project.what ? `<p class="section-lede">${esc(project.what)}</p>` : ""}
    <div class="stage-row">
      ${list.map((name, i) => `
        <div class="stage ${i < at ? "done" : i === at ? "now" : ""}">
          <span class="stage-name">${esc(name)}</span>
        </div>
      `).join("")}
    </div>
    ${deliveryLine(project, done)}
  `;

  const deal = $("deal");
  if (deal) deal.before(section);
}

function deliveryLine(project, done) {
  if (done) {
    return `<p class="stage-note">${project.deliverBy
      ? "Delivered on " + esc(longDate(project.deliverBy)) + "."
      : "Delivered."}</p>`;
  }
  if (!project.deliverBy) return "";
  return `<p class="stage-note">Delivered by ${esc(longDate(project.deliverBy))}.</p>`;
}

/* ============ PICK A SHOOT DATE ============ */
/* Rather than a mail thread, the portal can offer a few dates and let
   the client tap one. The tap rides the same relay as a request but is
   labelled "shoot" instead of "idea", so it pings Telegram straight
   away and never shows up on the requests wall. Nothing is written to
   the site from here: the pick is an issue until it is confirmed in
   the admin, so this page needs no key of any kind. */

const PICK_SITE = "shoot";
// the first line of a pick is written to be read by both a person and
// this regex, so the admin can lift the date straight back out
const PICK_RE = /Picked (\d{4}-\d{2}-\d{2})(?: at (\d{1,2}:\d{2}))?/;

// the option the client has tapped, held until they press Send
let picked = null;

async function setupShootPick(pick) {
  const options = ((pick && pick.options) || []).filter((o) => o && o.date);
  if (!pick || !pick.asked || !options.length) return;

  // while we are asking, the picker stands in for the shoot card
  const card = $("shoot-card");
  card.hidden = true;

  const wrap = document.createElement("div");
  wrap.id = "pick-wrap";
  card.after(wrap);

  const already = await loadExistingPick();
  if (already) {
    drawPicked(wrap, already);
    return;
  }
  drawOptions(wrap, options, pick.note);
}

/* A pick that was already made shows as picked, so reloading the page
   or opening it on another phone cannot book the shoot twice. */
async function loadExistingPick() {
  try {
    const res = await fetch(
      `${CONFIG.submitUrl}/ideas?site=${PICK_SITE}&client=${encodeURIComponent(CLIENT)}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("relay " + res.status);
    const { ideas } = await res.json();
    for (const item of ideas || []) {
      const m = String(item.text || "").match(PICK_RE);
      if (m) return { date: m[1], time: m[2] || "" };
    }
  } catch (err) {
    console.error("pick load failed:", err);
  }
  return null;
}

function drawOptions(wrap, options, note) {
  wrap.innerHTML = `
    <p class="pick-lede">${esc(note || "Pick whichever date suits you and we lock it in.")}</p>
    <div class="pick-grid"></div>
    <div class="pick-confirm" hidden>
      <p class="pick-chosen"></p>
      <button type="button" class="btn-send pick-send">Send</button>
    </div>
    <p class="form-msg" id="pick-msg" role="status"></p>
  `;

  picked = null;
  const grid = wrap.querySelector(".pick-grid");
  for (const opt of options) grid.appendChild(pickCard(wrap, opt));

  wrap.querySelector(".pick-send").addEventListener("click", () => {
    if (picked) sendPick(wrap, picked);
  });
}

function pickCard(wrap, opt) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pick-card";
  btn.setAttribute("aria-pressed", "false");
  btn.innerHTML = `
    <span class="pick-day">${esc(longDate(opt.date))}</span>
    ${opt.time ? `<span class="pick-meta">${esc(opt.time)}</span>` : ""}
    ${opt.location ? `<span class="pick-meta">${esc(opt.location)}</span>` : ""}
    ${opt.focus ? `<span class="pick-meta">${esc(opt.focus)}</span>` : ""}
    <span class="pick-cta">Pick this one</span>
  `;

  // tapping only chooses, it never sends. Sending is the button below,
  // so a mis-tap costs nothing and the choice is plain to see.
  btn.addEventListener("click", () => selectPick(wrap, btn, opt));

  return btn;
}

function selectPick(wrap, btn, opt) {
  picked = opt;

  for (const card of wrap.querySelectorAll(".pick-card")) {
    const on = card === btn;
    card.classList.toggle("chosen", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
    const cta = card.querySelector(".pick-cta");
    if (cta) cta.textContent = on ? "Chosen" : "Pick this one";
  }

  wrap.querySelector(".pick-chosen").textContent =
    longDate(opt.date) + (opt.time ? " at " + opt.time : "") + ". Send it and we lock it in.";
  wrap.querySelector(".pick-confirm").hidden = false;
  wrap.querySelector("#pick-msg").textContent = "";
}

async function sendPick(wrap, opt) {
  const msg = wrap.querySelector("#pick-msg");
  const buttons = wrap.querySelectorAll(".pick-card");
  const send = wrap.querySelector(".pick-send");
  buttons.forEach((b) => { b.disabled = true; });
  if (send) send.disabled = true;
  msg.textContent = "Sending...";

  const idea =
    `Picked ${opt.date}${opt.time ? " at " + opt.time : ""} (${longDate(opt.date)})` +
    (opt.location ? `\nWhere: ${opt.location}` : "") +
    (opt.focus ? `\nFocus: ${opt.focus}` : "");

  try {
    const res = await fetch(CONFIG.submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: PICK_SITE, client: CLIENT, idea, name: "" })
    });
    if (!res.ok) throw new Error("relay " + res.status);
    drawPicked(wrap, { date: opt.date, time: opt.time || "" });
  } catch (err) {
    console.error("pick submit failed:", err);
    msg.textContent = "Could not send that right now. Try again in a minute.";
    buttons.forEach((b) => { b.disabled = false; });
    if (send) send.disabled = false;
  }
}

function drawPicked(wrap, chosen) {
  wrap.innerHTML = `
    <div class="pick-done">
      <p class="pick-kicker">Your pick is in</p>
      <div class="shoot-date">${esc(longDate(chosen.date))}${chosen.time ? " · " + esc(chosen.time) : ""}</div>
      <p class="pick-meta">Thanks. We confirm it shortly and this page fills in with the full details.</p>
    </div>
  `;
}

function longDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function renderFilmPlan(plan) {
  const list = $("plan-list");
  list.innerHTML = "";
  if (!plan || !plan.items || !plan.items.length) {
    list.innerHTML = `<li><span class="plan-what muted">Shot list for the next shoot lands here soon.</span></li>`;
    return;
  }
  if (plan.month) {
    $("filmplan-title").textContent = "What We Film: " + plan.month;
  }
  plan.items.forEach((item, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="plan-num">${String(i + 1).padStart(2, "0")}</span>
      <span>
        <span class="plan-what">${esc(item.what)}</span>
        ${item.note ? `<div class="plan-note">${esc(item.note)}</div>` : ""}
      </span>
    `;
    list.appendChild(li);
  });
}

function renderMonths(months) {
  const wrap = $("month-list");
  wrap.innerHTML = "";

  // a heading over nothing looks broken. On day one this is simply not
  // filled in yet, and saying so reads as in progress rather than wrong.
  if (!months.length) {
    wrap.innerHTML = `<p class="muted">The first month appears here once we have planned it together.</p>`;
    return;
  }

  for (const m of months) {
    const badgeClass =
      m.status === "done" ? "done" :
      m.status === "active" ? "active" : "";
    const badgeText =
      m.status === "done" ? "Delivered" :
      m.status === "active" ? "In progress" : "Planned";

    const card = document.createElement("div");
    card.className = "month-card";
    card.innerHTML = `
      <div class="month-top">
        <span class="month-title">${esc(m.label)}</span>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      ${bar("Reels", m.reels)}
      ${bar("Photos", m.photos)}
      ${m.notes ? `<p class="month-notes">${esc(m.notes)}</p>` : ""}
    `;
    wrap.appendChild(card);
  }
}

function bar(label, v) {
  if (!v || !v.total) return "";
  const pct = Math.min(100, Math.round((v.done / v.total) * 100));
  return `
    <div class="progress-row">
      <span class="plabel">${esc(label)}</span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="pcount">${v.done} / ${v.total}</span>
    </div>
  `;
}

/* The finished work, month by month. Files are listed from storage
   rather than from the data file, so a month is right the moment
   something is added to it and there is nothing to keep in step.

   Each month opens on a tap and fetches only then, so a client with a
   year of deliveries does not pay for twelve lists to see one. */
function renderDeliveries(deliveries) {
  const wrap = $("doc-grid");
  if (!deliveries.length) return;

  const box = document.createElement("div");
  box.className = "delivery-list";

  for (const d of deliveries.filter((x) => x && x.month)) {
    const item = document.createElement("div");
    item.className = "delivery";

    const head = document.createElement("button");
    head.type = "button";
    head.className = "delivery-head";
    head.innerHTML = `
      <span class="delivery-month">${esc(d.label || d.month)}</span>
      <span class="delivery-count"></span>
      <svg class="delivery-arrow" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;

    const body = document.createElement("div");
    body.className = "delivery-body";
    body.hidden = true;

    if (d.note) {
      const note = document.createElement("p");
      note.className = "delivery-note";
      note.textContent = d.note;
      body.appendChild(note);
    }

    const files = document.createElement("div");
    files.className = "delivery-files";
    files.innerHTML = `<p class="muted">Loading...</p>`;
    body.appendChild(files);

    let loaded = false;
    head.addEventListener("click", async () => {
      const open = head.getAttribute("aria-expanded") !== "true";
      head.setAttribute("aria-expanded", open ? "true" : "false");
      head.classList.toggle("open", open);
      body.hidden = !open;
      if (open && !loaded) {
        loaded = true;
        await fillDelivery(d.month, files, head.querySelector(".delivery-count"));
      }
    });

    item.append(head, body);
    box.appendChild(item);
  }

  wrap.appendChild(box);
}

async function fillDelivery(month, files, counter) {
  try {
    const res = await fetch(
      `${CONFIG.submitUrl}/delivery?client=${encodeURIComponent(CLIENT)}&month=${encodeURIComponent(month)}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(String(res.status));
    const list = (await res.json()).files || [];

    if (!list.length) {
      files.innerHTML = `<p class="muted">Nothing here yet.</p>`;
      return;
    }

    counter.textContent = list.length + (list.length === 1 ? " file" : " files");
    files.innerHTML = "";

    const href = (name) => `${CONFIG.submitUrl}/file?client=${encodeURIComponent(CLIENT)}` +
      `&month=${encodeURIComponent(month)}&name=${encodeURIComponent(name)}`;

    for (const f of list) {
      const a = document.createElement("a");
      a.className = "delivery-file";
      a.href = href(f.name);
      a.innerHTML = `
        <span class="delivery-name">${esc(f.name)}</span>
        <span class="delivery-size">${esc(readableSize(f.size))}</span>
      `;
      files.appendChild(a);
    }

    // always, including for a single file: a row that happens to be a
    // link does not read as something you can take away
    files.appendChild(downloadAll(list, href));
  } catch (err) {
    console.error("delivery load failed:", err);
    files.innerHTML = `<p class="muted">Could not load these right now.</p>`;
  }
}

/* Starts every file, one after another, rather than handing over a zip.
   A zip would have to be built somewhere, and building one out of
   gigabytes of video is exactly the kind of work that does not belong
   in front of a waiting client. Browsers ask once whether to allow
   several downloads, then get on with it. */
function downloadAll(list, href) {
  const wrap = document.createElement("div");
  wrap.className = "delivery-all";

  const many = list.length > 1;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-send";
  btn.textContent = many ? "Download all " + list.length : "Download";

  const note = document.createElement("span");
  note.className = "delivery-size";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    for (let i = 0; i < list.length; i++) {
      if (many) note.textContent = "Starting " + (i + 1) + " of " + list.length;
      const a = document.createElement("a");
      a.href = href(list[i].name);
      a.download = list[i].name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // spaced out, or the browser treats the burst as a popup
      if (many) await new Promise((r) => setTimeout(r, 700));
    }
    note.textContent = many
      ? "All " + list.length + " started. Check your downloads."
      : "Started. Check your downloads.";
    btn.disabled = false;
  });

  wrap.append(btn, note);
  return wrap;
}

function readableSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function renderDocs(docs, deliveries) {
  const wrap = $("doc-grid");
  wrap.innerHTML = "";

  renderDeliveries(deliveries || []);

  if (!docs.length) {
    if (!(deliveries || []).length) {
      wrap.innerHTML = `<p class="muted">Contracts and finished work appear here as they are ready.</p>`;
    }
    return;
  }

  for (const doc of docs) {
    const a = document.createElement("a");
    a.className = "doc-card" + (doc.url ? "" : " pending");
    if (doc.url) {
      a.href = doc.url;
      a.target = "_blank";
      a.rel = "noopener";
    }
    a.innerHTML = `
      <div class="doc-type">${esc(doc.type || "File")}</div>
      <div class="doc-title">${esc(doc.title)}</div>
      <div class="doc-note">${esc(doc.note || "")}${doc.url ? "" : " · link coming soon"}</div>
    `;
    wrap.appendChild(a);
  }
}

function renderInvoices(invoices) {
  const tbody = $("invoice-rows");
  tbody.innerHTML = "";
  if (!invoices.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No invoices yet.</td></tr>`;
    return;
  }
  for (const inv of invoices) {
    const cls = ["paid", "open", "upcoming"].includes(inv.status) ? inv.status : "upcoming";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(inv.number)}</td>
      <td>${esc(inv.period)}</td>
      <td>${esc(inv.issued || "")}</td>
      <td><span class="pill ${cls}">${esc(inv.status)}</span></td>
      <td>${inv.url ? `<a href="${esc(inv.url)}" target="_blank" rel="noopener">View</a>` : ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderFooter(contact, isProject) {
  if (!contact) return;
  $("contact-line").textContent = contact.line || "NOIR AU NOIR";

  // "planning and content" is retainer language. A wedding client is
  // not planning anything, they are waiting for a film.
  const question = contact.note || (isProject
    ? "Questions about the day or the film?"
    : "Questions about planning or content?");

  const p = document.querySelector(".footer .muted");
  p.innerHTML = contact.email
    ? `${esc(question)} <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`
    : `${esc(question)} One message away.`;
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
