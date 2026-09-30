/* Calendar
   ------------------------------------------------------------
   Everything with a date on it, on a month, the way the posting plan
   looks in a client's portal: every client's next shoot, every booked
   call, every planned and posted post, and the times offered in call
   links that nobody has picked yet.

   Nothing is stored here. It is read from the same places the Agenda
   reads (the client plans and the relay), so it cannot disagree with
   them. Tap a day for everything on it, with the Agenda's own buttons.

   Loaded after agenda.js: shares $, token, escHtml, whenSheet,
   listClientNames, planOf, agendaRow, hasHappened and AGENDA_RELAY.
   ------------------------------------------------------------ */

const BC_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const BC_KINDS = [
  { key: "shoot", label: "Shoots" },
  { key: "call", label: "Calls" },
  { key: "post", label: "Posts" },
  { key: "held", label: "Offered times" }
];
const BC_MEMORY = "noir-calendar-kinds";

let bcEvents = [];
let bcView = new Date();
let bcPick = "";
let bcShown = new Set(BC_KINDS.map((k) => k.key));

try {
  const kept = JSON.parse(localStorage.getItem(BC_MEMORY) || "null");
  if (Array.isArray(kept)) bcShown = new Set(kept);
} catch { /* all kinds on */ }

const bcIso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

onReady(() => {
  if (!$("bc-grid")) return;
  whenSheet("calendar", loadCalendar);
  $("bc-prev").addEventListener("click", () => bcShift(-1));
  $("bc-next").addEventListener("click", () => bcShift(1));
  $("bc-today").addEventListener("click", () => { bcView = new Date(); bcPick = bcIso(new Date()); drawCalendar(); });
  $("bc-refresh").addEventListener("click", loadCalendar);
  drawKindChips();
});

function bcShift(by) {
  bcView = new Date(bcView.getFullYear(), bcView.getMonth() + by, 1);
  bcPick = "";
  drawCalendar();
}

/* ============ GATHERING ============ */
async function loadCalendar() {
  $("bc-status").textContent = "Reading your clients and calls...";
  try {
    const [fromPlans, fromRelay] = await Promise.all([bcFromPlans(), bcFromRelay()]);
    bcEvents = [...fromPlans, ...fromRelay].filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date || ""));
    $("bc-status").textContent = "";
  } catch (err) {
    $("bc-status").textContent = "Could not read everything (" + err.message + "). What loaded is shown.";
  }
  if (!bcPick) bcPick = bcIso(new Date());
  drawCalendar();
}

/* Each client's next shoot and posting plan, from the files their
   portals are built from. */
async function bcFromPlans() {
  const names = await listClientNames();
  const out = [];
  await Promise.all(names.map(async (slug) => {
    let plan;
    try { plan = await planOf(slug); } catch { return; }
    // the example portals (they say so in their notice line) are not real work
    if (plan.rolling || plan.notice) return;
    const who = plan.name || slug.toUpperCase();
    const s = plan.nextShoot;
    if (s && s.date) {
      out.push({
        kind: "shoot", date: s.date, time: s.time || "", who, slug,
        what: s.focus || "Shoot", where: s.location || ""
      });
    }
    for (const p of plan.posts || []) {
      if (!p || !p.date) continue;
      out.push({
        kind: "post", date: p.date, time: p.time || "", who, slug,
        what: p.platform || "Post", title: p.title || "", caption: p.caption || "",
        posted: p.status === "posted"
      });
    }
  }));
  return out;
}

/* Booked calls, and the times offered in personal call links that are
   still waiting for an answer. One call to the relay for both. */
async function bcFromRelay() {
  if (!token()) return [];
  const res = await fetch(`${AGENDA_RELAY}/call/list`, { headers: { "X-Studio-Key": token() }, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const out = (data.booked || []).map((b) => ({
    kind: "call", date: b.date, time: b.time || "", minutes: b.minutes || 30,
    who: b.name, what: (b.minutes || 30) + " minute call", where: b.email,
    phone: b.phone || "", note: b.note || "", id: b.id, email: b.email || "",
    reels: b.reels || null, client: b.client || ""
  }));
  for (const inv of data.invites || []) {
    if (inv.booked || inv.mode === "hours") continue;
    for (const slot of inv.slots || []) {
      const date = typeof slot === "string" ? slot.slice(0, 10) : slot.date;
      const time = typeof slot === "string" ? slot.slice(11, 16) : slot.time || "";
      if (date) out.push({ kind: "held", date, time, who: inv.name || "Someone", minutes: inv.minutes || 20 });
    }
  }
  return out;
}

/* ============ THE MONTH ============ */
function drawKindChips() {
  const wrap = $("bc-kinds");
  wrap.innerHTML = "";
  for (const k of BC_KINDS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bc-kind " + k.key;
    b.setAttribute("aria-pressed", bcShown.has(k.key) ? "true" : "false");
    b.innerHTML = `<span class="bc-swatch ${k.key}" aria-hidden="true"></span>${escHtml(k.label)}`;
    b.addEventListener("click", () => {
      if (bcShown.has(k.key)) bcShown.delete(k.key); else bcShown.add(k.key);
      try { localStorage.setItem(BC_MEMORY, JSON.stringify([...bcShown])); } catch { /* not remembered */ }
      drawKindChips();
      drawCalendar();
    });
    wrap.appendChild(b);
  }
}

const bcOrder = (a, b) => (a.time || "99").localeCompare(b.time || "99") ||
  ["shoot", "call", "held", "post"].indexOf(a.kind) - ["shoot", "call", "held", "post"].indexOf(b.kind);

function eventsOn(iso) {
  return bcEvents.filter((e) => e.date === iso && bcShown.has(e.kind)).sort(bcOrder);
}

/* Posts are many and alike, so a day shows one line per client for them. */
function chipsFor(list) {
  const chips = [];
  const posts = new Map();
  for (const e of list) {
    if (e.kind !== "post") { chips.push(e); continue; }
    if (!posts.has(e.who)) { posts.set(e.who, { kind: "post", who: e.who, n: 0, posted: true, time: "99" }); chips.push(posts.get(e.who)); }
    const g = posts.get(e.who);
    g.n++;
    g.posted = g.posted && e.posted;
  }
  return chips;
}

function chipText(e) {
  if (e.kind === "post") return e.who + (e.n > 1 ? " ×" + e.n : "");
  const t = e.time ? e.time + " " : "";
  if (e.kind === "held") return t + e.who + "?";
  return t + e.who;
}

function drawCalendar() {
  const year = bcView.getFullYear();
  const month = bcView.getMonth();
  $("bc-title").textContent = BC_MONTHS[month] + " " + year;

  const grid = $("bc-grid");
  grid.innerHTML = "";
  for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
    grid.appendChild(Object.assign(document.createElement("div"), { className: "cal-head", textContent: d }));
  }

  // six full weeks from the Monday on or before the 1st, so the days
  // either side of the month show what is on them too
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const today = bcIso(new Date());
  const weeks = new Date(year, month + 1, 0).getDate() + ((first.getDay() + 6) % 7) > 35 ? 6 : 5;

  for (let i = 0; i < weeks * 7; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = bcIso(day);
    const list = eventsOn(iso);
    const chips = chipsFor(list);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "bc-cell" +
      (day.getMonth() !== month ? " other" : "") +
      (iso === today ? " today" : "") +
      (iso < today ? " past" : "") +
      (iso === bcPick ? " on" : "");
    cell.setAttribute("aria-label", day.getDate() + " " + BC_MONTHS[day.getMonth()] + ": " +
      (list.length ? list.length + (list.length === 1 ? " thing" : " things") : "nothing"));

    cell.insertAdjacentHTML("beforeend", `<span class="bc-num">${day.getDate()}</span>`);
    const room = 3;
    for (const c of chips.slice(0, chips.length > room ? room - 1 : room)) {
      const chip = document.createElement("span");
      chip.className = "bc-chip " + c.kind + (c.kind === "post" && !c.posted ? " planned" : "");
      chip.textContent = chipText(c);
      cell.appendChild(chip);
    }
    if (chips.length > room) cell.insertAdjacentHTML("beforeend", `<span class="bc-more">+${chips.length - room + 1} more</span>`);

    // on a phone the chips give way to one mark per kind
    if (chips.length) {
      const dots = document.createElement("span");
      dots.className = "bc-dots";
      for (const k of ["shoot", "call", "held", "post"]) {
        if (list.some((e) => e.kind === k)) dots.appendChild(Object.assign(document.createElement("span"), { className: "bc-swatch " + k }));
      }
      cell.appendChild(dots);
    }

    cell.addEventListener("click", () => { bcPick = iso; drawCalendar(); });
    grid.appendChild(cell);
  }

  drawDay();
}

/* ============ ONE DAY ============ */
function drawDay() {
  const wrap = $("bc-day");
  if (!bcPick) { wrap.innerHTML = ""; return; }
  const d = new Date(bcPick + "T00:00:00");
  const list = eventsOn(bcPick);
  const name = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  wrap.innerHTML = `<p class="bc-day-title">${escHtml(name)}</p>`;
  if (!list.length) {
    wrap.insertAdjacentHTML("beforeend", '<p class="muted" style="font-size:0.9rem">Nothing on this day.</p>');
    return;
  }

  for (const e of list) {
    if (e.kind === "shoot" || e.kind === "call") {
      // the Agenda's own row, with its Open, Cancel and call buttons
      wrap.appendChild(agendaRow(e, hasHappened(e)));
      continue;
    }
    const row = document.createElement("div");
    row.className = "item";
    row.style.cssText = "display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap";
    if (e.kind === "held") {
      row.innerHTML = `<div style="flex:1;min-width:12rem">
        <p style="font-size:0.95rem"><b>${escHtml(e.time || "Any time")}</b> <span class="muted" style="font-size:0.8rem">&middot; Offered</span></p>
        <p style="font-size:0.9rem;margin-top:0.2rem">${escHtml(e.who)} hasn't picked a time yet. This is one of the ${escHtml(String(e.minutes))} minute times in their link.</p></div>`;
    } else {
      const text = e.title || e.caption || "";
      row.innerHTML = `<div style="flex:1;min-width:12rem">
        <p style="font-size:0.95rem"><b>${escHtml(e.who)}</b> <span class="muted" style="font-size:0.8rem">&middot; ${escHtml(e.what)} &middot; ${e.posted ? "Posted" : "Planned"}</span></p>
        ${text ? `<p class="muted" style="font-size:0.84rem;margin-top:0.2rem">${escHtml(text.length > 140 ? text.slice(0, 140) + "..." : text)}</p>` : ""}</div>`;
      const open = document.createElement("a");
      open.className = "btn-mini";
      open.href = `../${e.slug}/admin.html`;
      open.textContent = "Open";
      row.appendChild(open);
    }
    wrap.appendChild(row);
  }
}
