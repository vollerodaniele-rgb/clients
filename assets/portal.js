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

  renderDeal(data.deal || []);
  renderShoot(data.nextShoot);
  renderFilmPlan(data.filmPlan);
  renderMonths(data.months || []);
  renderDocs(data.documents || []);
  renderInvoices(data.invoices || []);
  renderFooter(data.contact);

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
  const dateStr = d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
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

function renderDocs(docs) {
  const wrap = $("doc-grid");
  wrap.innerHTML = "";
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

function renderFooter(contact) {
  if (!contact) return;
  $("contact-line").textContent = contact.line || "NOIR AU NOIR";
  if (contact.email) {
    const p = document.querySelector(".footer .muted");
    p.innerHTML = `Questions about planning or content? <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`;
  }
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
