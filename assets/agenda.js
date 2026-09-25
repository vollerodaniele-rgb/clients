/* The agenda
   ------------------------------------------------------------
   One list of everything with a date on it: shoots from every
   client's portal, and calls people have booked.

   The shoots are not stored here. They are read from the client
   files that already hold them, so the agenda cannot drift out of
   step with what a client is being told. Calls come from the relay.

   Loaded after dashboard.js, so it shares $, token and escHtml.
   ------------------------------------------------------------ */

const AGENDA_RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";

/* The line under a panel that says what went wrong. Silence after a
   button press reads as success, which is how a delete that refused
   looked like a delete that worked. */
function say(id, what) {
  const line = $(id);
  if (line) line.textContent = what;
}

onReady(() => {
  whenSheet("agenda", () => {
    loadAgenda();
    drawMainLink();
    drawAsks();
    drawInvites();
    drawHours();
    drawSlotEditor();
  });
  // partners are their own sheet, so they wait for their own tab
  whenSheet("partners", drawPartners);
  const make = $("ref-make");
  if (make) make.addEventListener("click", makePartner);
});

/* ============ REFERRAL PARTNERS ============ */
/* A page per photographer, and now the money that comes of it.

   Two levels and no more. Whoever brought a client gets PARTNER_SHARE
   of what that client pays; whoever brought that partner in gets
   RECRUITER_SHARE of it too. Together that is the most a referred
   client can ever cost, because there is no third level for anything
   to hide in. Only money marked paid counts, and only for the first
   PARTNER_MONTHS of each client, counted from its first payment.

   The payments live in the private repo, which only this page can
   read, so the sums are done here and each partner's board is handed
   to the relay afterwards. Nothing a partner sees is worked out by
   anyone but you. */

const PARTNER_SHARE = 0.20;
const RECRUITER_SHARE = 0.10;
const PARTNER_MONTHS = 12;

let partnersKnown = [];

function monthsLater(iso, months) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/* Every partner's figures from the payments and the two relations. */
function partnerFigures(partners, book) {
  const byId = new Map(partners.map((p) => [p.id, p]));
  const broughtBy = new Map();
  for (const p of partners) for (const c of p.clients || []) broughtBy.set(c, p.id);

  const now = new Date();
  const thisMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

  const fig = new Map(partners.map((p) => [p.id, {
    earned: 0, thisMonth: 0, paidOut: 0, clients: new Map(), recruits: new Map()
  }]));

  const paid = (book.entries || []).filter((e) =>
    e.status === "paid" && broughtBy.has(String(e.client || "").toLowerCase()));

  // the window of each client opens at its first payment
  const first = new Map();
  for (const e of paid) {
    const c = String(e.client).toLowerCase();
    if (!first.has(c) || e.date < first.get(c)) first.set(c, e.date);
  }

  for (const e of paid) {
    const c = String(e.client).toLowerCase();
    if (e.date >= monthsLater(first.get(c), PARTNER_MONTHS)) continue;

    const amount = Number(e.amount) || 0;
    const direct = broughtBy.get(c);
    const mine = fig.get(direct);
    const share = amount * PARTNER_SHARE;
    mine.earned += share;
    if (String(e.date).startsWith(thisMonth)) mine.thisMonth += share;
    mine.clients.set(c, (mine.clients.get(c) || 0) + share);

    const up = (byId.get(direct) || {}).by;
    if (up && fig.has(up)) {
      const theirs = fig.get(up);
      const cut = amount * RECRUITER_SHARE;
      theirs.earned += cut;
      if (String(e.date).startsWith(thisMonth)) theirs.thisMonth += cut;
      theirs.recruits.set(direct, (theirs.recruits.get(direct) || 0) + cut);
    }
  }

  for (const out of book.payouts || []) {
    if (fig.has(out.partner)) fig.get(out.partner).paidOut += Number(out.amount) || 0;
  }

  for (const [, f] of fig) f.owed = f.earned - f.paidOut;
  return fig;
}

/* What each partner's own board shows, in the shape the relay keeps. */
function boardsFrom(partners, fig) {
  const byId = new Map(partners.map((p) => [p.id, p]));
  const boards = {};
  for (const p of partners) {
    const f = fig.get(p.id);
    boards[p.id] = {
      earned: f.earned, paidOut: f.paidOut, owed: f.owed, thisMonth: f.thisMonth,
      clients: [...f.clients].map(([c, earned]) => ({ name: c.toUpperCase(), earned })),
      recruits: [...f.recruits].map(([id, earned]) => ({ name: (byId.get(id) || {}).name || id, earned })),
      share: PARTNER_SHARE * 100, recruitShare: RECRUITER_SHARE * 100, months: PARTNER_MONTHS
    };
  }
  return boards;
}

async function readPartners() {
  const res = await fetch(`${AGENDA_RELAY}/refs`, {
    headers: { "X-Studio-Key": token() }, cache: "no-store"
  });
  if (!res.ok) throw new Error(String(res.status));
  partnersKnown = (await res.json()).partners || [];
  return partnersKnown;
}

/* Hands every board to the relay. Called when the sheet is drawn and
   after any payment is saved, so a partner never reads stale money. */
async function syncPartnerBoards(partners, fig) {
  if (!token()) return;
  if (!partners) partners = await readPartners();
  if (!partners.length) return;
  if (!fig) fig = partnerFigures(partners, await ensureMoney());

  const res = await fetch(`${AGENDA_RELAY}/ref/boards`, {
    method: "POST",
    headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
    body: JSON.stringify({ boards: boardsFrom(partners, fig) })
  });
  if (!res.ok) throw new Error("boards " + res.status);
}

async function drawPartners() {
  const wrap = $("ref-list");
  if (!wrap) return;

  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to see your partners.</p>';
    return;
  }

  let partners, book, clientNames;
  try {
    [partners, book, clientNames] = await Promise.all([
      readPartners(),
      ensureMoney().catch(() => ({ entries: [] })),
      listClientNames().catch(() => [])
    ]);
  } catch (err) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read your partners (' +
      escHtml(err.message) + ").</p>";
    return;
  }

  drawRecruiterChoice(partners);

  if (!partners.length) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">No partners yet.</p>';
    drawPartnerTotals(null);
    return;
  }

  const fig = partnerFigures(partners, book);
  drawPartnerTotals(fig);

  wrap.innerHTML = "";
  for (const p of partners) wrap.appendChild(partnerRow(p, partners, fig.get(p.id), clientNames));

  syncPartnerBoards(partners, fig).catch((err) => {
    console.error("board sync failed:", err);
    say("ref-msg", "The partners' own boards could not be updated just now.");
  });
}

/* The main overview: what you owe partners, what you paid them, and
   what the programme has cost this month. */
function drawPartnerTotals(fig) {
  const box = $("ref-totals");
  if (!box) return;
  if (!fig) { box.innerHTML = ""; return; }

  let owed = 0, paidOut = 0, month = 0;
  for (const [, f] of fig) { owed += f.owed; paidOut += f.paidOut; month += f.thisMonth; }

  box.innerHTML = `
    <div class="total"><div class="num">${euro(owed)}</div><div class="lbl">Owed to partners</div></div>
    <div class="total quiet"><div class="num">${euro(paidOut)}</div><div class="lbl">Paid out so far</div></div>
    <div class="total quiet"><div class="num">${euro(month)}</div><div class="lbl">Earned by them this month</div></div>
  `;
}

/* A new partner can be brought in by one who already exists. */
function drawRecruiterChoice(partners) {
  const sel = $("ref-by");
  if (!sel) return;
  const was = sel.value;
  sel.innerHTML = '<option value="">Nobody, they came to me</option>' +
    partners.map((p) => `<option value="${escHtml(p.id)}">${escHtml(p.name || p.id)}</option>`).join("");
  sel.value = was;
}

async function setPartner(id, change) {
  const res = await fetch(`${AGENDA_RELAY}/ref/set`, {
    method: "POST",
    headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...change })
  });
  let body = {};
  try { body = await res.json(); } catch { /* keep the status */ }
  if (!res.ok) throw new Error(body.error || String(res.status));
  return body;
}

function partnerRow(p, partners, f, clientNames) {
  const row = document.createElement("div");
  row.className = "item";
  const link = location.origin + "/r/#" + p.id;

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap";

  const recruiter = partners.find((x) => x.id === p.by);

  const text = document.createElement("div");
  text.style.flex = "1";
  text.innerHTML = `
    <p style="font-size:0.95rem"><b>${escHtml(p.name)}</b>${recruiter ? `<span class="muted" style="font-size:0.78rem"> &middot; brought in by ${escHtml(recruiter.name)}</span>` : ""}</p>
    <p style="font-size:0.85rem;margin-top:0.3rem">
      <b>${euro(f.owed)}</b> owed
      <span class="muted">&middot; ${euro(f.earned)} earned &middot; ${euro(f.paidOut)} paid out</span>
    </p>
    <p class="muted" style="font-size:0.78rem;margin-top:0.2rem">
      ${p.opens} open${p.opens === 1 ? "" : "s"}${p.lastOpen ? ", last " + escHtml(sinceThen(p.lastOpen)) : ""}
      ${p.discount ? " &middot; " + escHtml(p.discount) : ""}
    </p>
    <p style="font-size:0.8rem;margin-top:0.3rem;color:${p.calls ? "var(--text)" : "var(--dim)"}">
      ${p.calls
        ? "&#10003; " + p.calls + " call" + (p.calls === 1 ? "" : "s") + " booked: " +
          escHtml(p.who.map((w) => w.name).join(", "))
        : "Nobody has booked from it yet"}
    </p>
  `;
  head.appendChild(text);

  const copyButton = (label, get) => {
    const b = document.createElement("button");
    b.className = "btn-mini";
    b.textContent = label;
    b.addEventListener("click", async () => {
      let url;
      try { url = await get(); } catch (err) { say("ref-msg", "Could not get that link: " + err.message); return; }
      const done = await copyText(url);
      b.textContent = done ? "Copied" : "Select it";
      setTimeout(() => { b.textContent = label; }, 1800);
    });
    return b;
  };

  head.appendChild(copyButton("Copy link", async () => link));
  /* The same partner, sending the reels page instead. The booking made
     there carries their id exactly as one made from their own page. */
  head.appendChild(copyButton("Copy reels link", async () => location.origin + "/reels/#" + p.id));
  /* Their own board, behind a long random key rather than their name,
     since it shows money. Send it to them and nobody else. */
  head.appendChild(copyButton("Copy their board", async () => {
    const res = await fetch(`${AGENDA_RELAY}/ref/key`, {
      method: "POST",
      headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || String(res.status));
    return location.origin + "/partner/#" + body.key;
  }));

  /* Redrawing regardless of the answer made a refusal look like a
     deletion: the row came back and nothing said why. */
  head.appendChild(dangerButton("Remove", async () => {
    let res;
    try {
      res = await fetch(`${AGENDA_RELAY}/ref/remove`, {
        method: "POST",
        headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id })
      });
    } catch (err) {
      say("ref-msg", "Could not reach the relay to remove that partner.");
      throw err;
    }

    if (!res.ok) {
      let why = String(res.status);
      try { why = (await res.json()).error || why; } catch { /* keep the number */ }
      say("ref-msg", "Could not remove " + (p.name || p.id) + ": " + why);
      return;
    }

    say("ref-msg", "");
    drawPartners();
  }));

  row.appendChild(head);

  /* ---- the two relations the money follows ---- */
  const links = document.createElement("div");
  links.className = "row";
  links.style.marginTop = "0.8rem";

  const by = document.createElement("select");
  by.innerHTML = '<option value="">Nobody</option>' + partners
    .filter((x) => x.id !== p.id)
    .map((x) => `<option value="${escHtml(x.id)}">${escHtml(x.name || x.id)}</option>`).join("");
  by.value = p.by || "";
  by.addEventListener("change", async () => {
    try {
      await setPartner(p.id, { by: by.value });
      say("ref-msg", "");
      drawPartners();
    } catch (err) {
      say("ref-msg", "Could not change that: " + err.message);
      by.value = p.by || "";
    }
  });
  const byField = document.createElement("label");
  byField.className = "field";
  byField.style.cssText = "flex:1;min-width:10rem";
  byField.innerHTML = "<span>Brought in by</span>";
  byField.appendChild(by);

  const clientsBox = document.createElement("div");
  clientsBox.className = "field";
  clientsBox.style.cssText = "flex:2;min-width:14rem";
  const clientsLabel = document.createElement("span");
  clientsLabel.textContent = "Clients they brought";
  clientsBox.appendChild(clientsLabel);

  const chips = document.createElement("div");
  chips.style.cssText = "display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center";
  const mine = p.clients || [];
  for (const c of mine) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "btn-mini";
    chip.title = "Take this client off " + (p.name || p.id);
    chip.textContent = c.toUpperCase() + " \u00d7";
    chip.addEventListener("click", async () => {
      try {
        await setPartner(p.id, { clients: mine.filter((x) => x !== c) });
        drawPartners();
      } catch (err) { say("ref-msg", "Could not change that: " + err.message); }
    });
    chips.appendChild(chip);
  }

  const free = clientNames.filter((c) => !mine.includes(c));
  if (free.length) {
    const add = document.createElement("select");
    add.innerHTML = '<option value="">+ add a client</option>' +
      free.map((c) => `<option value="${escHtml(c)}">${escHtml(c.toUpperCase())}</option>`).join("");
    add.style.maxWidth = "12rem";
    add.addEventListener("change", async () => {
      if (!add.value) return;
      // a client can only earn for one partner; the relay moves it
      const owner = partners.find((x) => x.id !== p.id && (x.clients || []).includes(add.value));
      if (owner && !confirm(add.value.toUpperCase() + " is counted for " + owner.name + " now. Move it to " + p.name + "?")) {
        add.value = "";
        return;
      }
      try {
        await setPartner(p.id, { clients: [...mine, add.value] });
        drawPartners();
      } catch (err) { say("ref-msg", "Could not change that: " + err.message); }
    });
    chips.appendChild(add);
  } else if (!mine.length) {
    const none = document.createElement("span");
    none.className = "muted";
    none.style.fontSize = "0.8rem";
    none.textContent = "No clients yet";
    chips.appendChild(none);
  }
  clientsBox.appendChild(chips);

  links.append(byField, clientsBox);
  row.appendChild(links);

  /* ---- paying them ---- */
  const pay = document.createElement("div");
  pay.className = "row";
  pay.style.cssText = "margin-top:0.6rem;align-items:flex-end";

  const amount = document.createElement("input");
  amount.type = "number";
  amount.min = "0";
  amount.step = "0.01";
  amount.placeholder = f.owed > 0 ? String(Math.round(f.owed * 100) / 100) : "0";
  const amountField = document.createElement("label");
  amountField.className = "field";
  amountField.style.cssText = "max-width:9rem";
  amountField.innerHTML = "<span>Paid them</span>";
  amountField.appendChild(amount);

  const record = document.createElement("button");
  record.className = "btn-mini";
  record.textContent = "Record payout";
  record.addEventListener("click", async () => {
    const value = Number(amount.value || amount.placeholder);
    if (!(value > 0)) { say("ref-msg", "Put in what you paid " + (p.name || p.id) + "."); return; }
    record.disabled = true;
    try {
      await ensureMoney();
      if (!Array.isArray(money.payouts)) money.payouts = [];
      const today = new Date();
      money.payouts.push({
        date: today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0"),
        partner: p.id,
        amount: Math.round(value * 100) / 100
      });
      // saving runs the board sync as well
      const ok = await saveMoney("Paid out " + value + " to " + (p.name || p.id));
      if (!ok) throw new Error("the money file did not save");
      say("ref-msg", "Recorded " + euro(value) + " paid to " + (p.name || p.id) + ".");
      drawPartners();
    } catch (err) {
      say("ref-msg", "Could not record it: " + err.message);
    } finally {
      record.disabled = false;
    }
  });

  pay.append(amountField, record);
  row.appendChild(pay);
  return row;
}

async function makePartner() {
  const msg = $("ref-msg");
  const name = $("ref-name").value.trim();
  if (!name) { msg.textContent = "Put in their name."; return; }
  if (!token()) { msg.textContent = "Save your access key first."; return; }

  const btn = $("ref-make");
  btn.disabled = true;
  msg.textContent = "Making it...";

  try {
    const res = await fetch(`${AGENDA_RELAY}/ref/new`, {
      method: "POST",
      headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        discount: $("ref-discount").value.trim(),
        by: $("ref-by") ? $("ref-by").value : ""
      })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || String(res.status));
    msg.textContent = name + " has a page. Copy the link below and send it to them.";
    $("ref-name").value = "";
    $("ref-discount").value = "";
    if ($("ref-by")) $("ref-by").value = "";
    drawPartners();
  } catch (err) {
    msg.textContent = "Could not make it: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

/* ============ A LINK FOR ONE PERSON ============ */
/* Type a name, give them a few times, send them the link. The times
   are theirs, but the booking is not: an hour taken on anybody's link
   disappears from everybody's, so offering the same Tuesday to three
   people cannot double book you. */

/* People who left a number instead of taking an hour. They have no
   date, so they cannot sit in the agenda above; they sit under it,
   newest first, until they have been rung. */
async function drawAsks() {
  const wrap = $("agenda-asks");
  if (!wrap) return;

  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to see who asked for a call.</p>';
    return;
  }

  let asks = [];
  try {
    const res = await fetch(`${AGENDA_RELAY}/call/list`, {
      headers: { "X-Studio-Key": token() }, cache: "no-store"
    });
    if (res.ok) asks = (await res.json()).asks || [];
  } catch { /* an unreachable relay should not empty the panel silently */ }

  const waiting = asks.filter((x) => !x.done).length;

  wrap.innerHTML = `
    <h3 style="font-family:var(--font-display);font-size:1.15rem;font-weight:600">
      Asked for a call${waiting ? " (" + waiting + " to ring)" : ""}
    </h3>
    <p class="how" style="margin:0.4rem 0 0.8rem">
      Left their number on a partner page. Ring them, then tick it.
    </p>
    <div id="ask-list"></div>`;

  const list = $("ask-list");
  if (!asks.length) {
    list.innerHTML = '<p class="muted" style="font-size:0.9rem">Nobody has asked yet.</p>';
    return;
  }
  for (const ask of asks) list.appendChild(askRow(ask));
}

function askRow(ask) {
  const row = document.createElement("div");
  row.className = "item";
  if (ask.done) row.style.opacity = "0.55";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap";

  const text = document.createElement("div");
  text.style.flex = "1";
  // the number is the point of the row, so it is the loudest thing in it
  text.innerHTML = `
    <p style="font-size:0.95rem"><b>${escHtml(ask.name || "Someone")}</b></p>
    <p style="font-size:1.05rem;margin-top:0.2rem"><b>${escHtml(ask.phone || "")}</b></p>
    <p class="muted" style="font-size:0.78rem;margin-top:0.2rem">
      ${escHtml(ask.email || "")}${ask.ref ? " &middot; sent by " + escHtml(ask.ref) : ""}
      &middot; ${escHtml(whenAsked(ask.at))}
    </p>`;
  head.appendChild(text);

  const tick = document.createElement("button");
  tick.className = ask.done ? "btn-mini" : "btn-mini solid";
  tick.textContent = ask.done ? "Not yet" : "Called";
  tick.addEventListener("click", async () => {
    tick.disabled = true;
    await askAction("called", { id: ask.id, done: !ask.done });
    drawAsks();
  });
  head.appendChild(tick);

  const drop = document.createElement("button");
  drop.className = "btn-mini";
  drop.textContent = "Remove";
  drop.addEventListener("click", async () => {
    if (!confirm("Remove " + (ask.name || "this request") + "? Their number goes with it.")) return;
    drop.disabled = true;
    await askAction("forget", { id: ask.id });
    drawAsks();
  });
  head.appendChild(drop);

  row.appendChild(head);
  return row;
}

async function askAction(what, body) {
  try {
    await fetch(`${AGENDA_RELAY}/call/${what}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Studio-Key": token() },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error("could not update the request:", err);
  }
}

/* Rung this morning reads differently from rung last week. */
function whenAsked(iso) {
  const then = Date.parse(iso || "");
  if (!then) return "just now";
  const hours = Math.floor((Date.now() - then) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : days + " days ago";
}

async function drawInvites() {
  const wrap = $("agenda-invites");
  if (!wrap) return;

  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to make call links.</p>';
    return;
  }

  let invites = [];
  try {
    const res = await fetch(`${AGENDA_RELAY}/call/list`, {
      headers: { "X-Studio-Key": token() }, cache: "no-store"
    });
    if (res.ok) invites = (await res.json()).invites || [];
  } catch { /* the maker below still works */ }

  wrap.innerHTML = `
    <p class="how" style="margin-bottom:0.6rem">
      A call link for one person. Put in their name and the times you can do. Add their
      email and it goes straight to them, or leave it out and copy the link yourself.
    </p>
    <div class="row">
      <label class="field" style="flex:1;min-width:11rem"><span>Their name</span>
        <input id="inv-name" type="text" maxlength="60" placeholder="Marie">
      </label>
      <label class="field" style="min-width:7rem"><span>How long</span>
        <input id="inv-minutes" type="number" min="10" max="180" value="20">
      </label>
    </div>
    <div class="row">
      <label class="field" style="flex:1;min-width:14rem"><span>A line they see (optional)</span>
        <input id="inv-note" type="text" maxlength="300" placeholder="Twenty minutes, no pitch.">
      </label>
      <label class="field" style="flex:1;min-width:12rem"><span>Their email (optional)</span>
        <input id="inv-email" type="email" maxlength="120" placeholder="Sends it to them straight away">
      </label>
    </div>
    <div class="row" style="margin-top:0.4rem">
      <label class="field" style="min-width:16rem"><span>What they get to choose from</span>
        <select id="inv-mode">
          <option value="slots">Three times I name below</option>
          <option value="hours">My hours, they pick a day</option>
        </select>
      </label>
    </div>
    <div class="row" id="inv-times">
      ${[0, 1, 2].map((i) => `
        <label class="field" style="min-width:9rem"><span>Date ${i + 1}</span>
          <input id="inv-d${i}" type="date">
        </label>
        <label class="field" style="min-width:6rem"><span>Time</span>
          <input id="inv-t${i}" type="time">
        </label>`).join("")}
    </div>
    <div class="row" style="margin-top:0.4rem">
      <button class="btn-mini solid" id="inv-make">Make the link</button>
    </div>
    <p class="form-msg" id="inv-msg" style="margin-top:0.6rem"></p>
    <div id="inv-list" style="margin-top:1rem"></div>
  `;

  $("inv-make").addEventListener("click", makeInvite);

  // naming times is pointless when the link hands over the window
  const mode = $("inv-mode");
  const asHours = () => { $("inv-times").hidden = mode.value === "hours"; };
  mode.addEventListener("change", asHours);
  asHours();

  drawInviteList(invites);
}

/* Returns true, or the reason it did not go. The caller decides what
   to do with that, because on the maker a failed send still leaves a
   perfectly good link to copy. */
async function sendInvite(id, to) {
  try {
    const res = await fetch(`${AGENDA_RELAY}/call/send`, {
      method: "POST",
      headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
      body: JSON.stringify({ id, to })
    });
    if (res.ok) return true;
    try {
      return (await res.json()).error || String(res.status);
    } catch {
      return String(res.status);
    }
  } catch (err) {
    console.error("invite send failed:", err);
    return "the relay could not be reached";
  }
}

function drawInviteList(invites) {
  const list = $("inv-list");
  if (!invites.length) {
    list.innerHTML = '<p class="muted" style="font-size:0.9rem">No call links yet.</p>';
    return;
  }

  list.innerHTML = "";
  for (const inv of invites) list.appendChild(inviteRow(inv));
}

function inviteRow(inv) {
  const row = document.createElement("div");
  row.className = "item";
  const link = location.origin + "/call/#" + inv.id;

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap";

  const text = document.createElement("div");
  text.style.flex = "1";
  text.innerHTML = `
    <p style="font-size:0.95rem"><b>${escHtml(inv.name || "Someone")}</b></p>
    <p class="muted" style="font-size:0.78rem;margin-top:0.2rem">
      ${inv.mode === "hours"
        ? "your hours"
        : (inv.slots || []).length + " time" + ((inv.slots || []).length === 1 ? "" : "s") + " offered"}
      &middot; ${inv.minutes} minutes
    </p>
    <p style="font-size:0.8rem;margin-top:0.3rem;color:${inv.booked ? "var(--text)" : "var(--dim)"}">
      ${inv.booked
        ? "&#10003; Booked " + escHtml(inv.booked.date) + " at " + escHtml(inv.booked.time)
        : (inv.sent || []).length
          ? "Sent to " + escHtml(inv.sent.map((s) => s.to).join(", ")) + ", waiting for them to pick"
          : "Waiting for them to pick"}
    </p>
  `;
  head.appendChild(text);

  const copy = document.createElement("button");
  copy.className = "btn-mini";
  copy.textContent = "Copy link";
  copy.addEventListener("click", async () => {
    const done = await copyText(link);
    copy.textContent = done ? "Copied" : "Select it";
    setTimeout(() => { copy.textContent = "Copy link"; }, 1800);
  });
  head.appendChild(copy);

  /* Sending it later, or again to a second address. A used link has
     nothing left to offer, so it is not offered either. */
  if (!inv.booked) {
    const mail = document.createElement("button");
    mail.className = "btn-mini";
    mail.textContent = (inv.sent || []).length ? "Send again" : "Email it";
    mail.addEventListener("click", async () => {
      const last = (inv.sent || []).slice(-1)[0];
      const to = prompt("Send this to which address?", last ? last.to : "");
      if (!to) return;
      mail.disabled = true;
      mail.textContent = "Sending...";
      const done = await sendInvite(inv.id, to.trim());
      mail.disabled = false;
      if (done === true) {
        mail.textContent = "Sent";
        setTimeout(drawInvites, 900);
      } else {
        mail.textContent = "Email it";
        say("inv-msg", "Could not send to " + to.trim() + ": " + done);
      }
    });
    head.appendChild(mail);
  }

  const open = document.createElement("a");
  open.className = "btn-mini";
  open.href = link;
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = "View";
  head.appendChild(open);

  head.appendChild(dangerButton("Remove", async () => {
    await fetch(`${AGENDA_RELAY}/call/uninvite`, {
      method: "POST",
      headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: inv.id })
    });
    drawInvites();
  }));

  row.appendChild(head);
  return row;
}

async function makeInvite() {
  const msg = $("inv-msg");
  const btn = $("inv-make");

  const slots = [0, 1, 2]
    .map((i) => ({ date: $("inv-d" + i).value, time: $("inv-t" + i).value }))
    .filter((s) => s.date && s.time);

  if ($("inv-mode").value !== "hours" && !slots.length) {
    msg.textContent = "Give it at least one date and time.";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Making it...";

  try {
    const res = await fetch(`${AGENDA_RELAY}/call/invite`, {
      method: "POST",
      headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("inv-name").value.trim(),
        note: $("inv-note").value.trim(),
        mode: $("inv-mode").value,
        minutes: Number($("inv-minutes").value) || 20,
        slots
      })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || String(res.status));

    const email = $("inv-email").value.trim();
    if (email) {
      msg.textContent = "Made. Sending it...";
      const sent = await sendInvite(body.id, email);
      msg.textContent = sent === true
        ? "Sent to " + email + "."
        : "Made, but it did not send: " + sent + ". Copy the link below instead.";
    } else {
      msg.textContent = "Made. Copy the link below and send it.";
    }

    $("inv-email").value = "";
    drawInvites();
  } catch (err) {
    msg.textContent = "Could not make it: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function loadAgenda() {
  const wrap = $("agenda-list");

  try {
    const [shoots, calls] = await Promise.all([shootsFromClients(), bookedCalls()]);
    const entries = [...shoots, ...calls]
      .filter((e) => e.date)
      .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

    /* An agenda is what is still coming. It used to drop things the
       day after, which left this morning's finished call sitting there
       until midnight, and it threw the past away entirely so there was
       no way to look back at who you had spoken to.

       Now the line is the hour, not the day, and everything behind it
       is kept and folded away rather than lost. */
    const ahead = entries.filter((e) => !hasHappened(e));
    const gone = entries.filter(hasHappened).reverse();

    if (!ahead.length) {
      wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Nothing booked. No shoots planned and no calls.</p>';
    } else {
      wrap.innerHTML = "";
      for (const e of ahead) wrap.appendChild(agendaRow(e));
    }

    drawPast(gone);
  } catch (err) {
    console.error("agenda failed:", err);
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not build the agenda (' +
      escHtml(err.message) + ").</p>";
  }
}

/* Read straight from the client files the portals are built from. */
async function shootsFromClients() {
  const names = await listClientNames();
  const found = await Promise.all(names.map(async (name) => {
    try {
      const plan = await planOf(name);
      if (!plan.nextShoot || !plan.nextShoot.date) return null;
      return {
        kind: "shoot",
        date: plan.nextShoot.date,
        time: plan.nextShoot.time || "",
        who: plan.name || name.toUpperCase(),
        what: plan.nextShoot.focus || "Shoot",
        where: plan.nextShoot.location || "",
        slug: name
      };
    } catch {
      return null;
    }
  }));
  return found.filter(Boolean);
}

async function bookedCalls() {
  if (!token()) return [];
  try {
    const res = await fetch(`${AGENDA_RELAY}/call/list`, {
      headers: { "X-Studio-Key": token() }, cache: "no-store"
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.booked || []).map((b) => ({
      kind: "call",
      date: b.date,
      time: b.time || "",
      minutes: b.minutes || 30,
      who: b.name,
      what: b.minutes + " minute call",
      where: b.email,
      phone: b.phone || "",
      note: b.note || "",
      id: b.id
    }));
  } catch {
    return [];
  }
}

/* Past by the hour rather than by the day. A call at eleven is over at
   half past, and leaving it in the agenda until midnight is how the
   list stops being something you trust.

   Something with no time on it counts as over at the end of its day,
   because a shoot with no hour could still be happening. */
function hasHappened(e) {
  const end = e.time
    ? new Date(e.date + "T" + e.time + ":00")
    : new Date(e.date + "T23:59:59");
  if (isNaN(end.getTime())) return false;
  // a call is over when it is over, not when it starts
  if (e.time) end.setMinutes(end.getMinutes() + (e.minutes || 30));
  return end.getTime() < Date.now();
}

/* Everything that has been and gone, newest first, folded away. It is
   never deleted: the calls live in storage for good and this is the
   only place you can read them back. */
function drawPast(gone) {
  const wrap = $("agenda-past");
  if (!wrap) return;

  if (!gone.length) {
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = `
    <button type="button" class="fold-head" id="past-toggle" aria-expanded="false" aria-controls="past-body">
      <span class="fold-title" style="font-size:1.05rem">Been and gone</span>
      <span class="muted" style="font-size:0.78rem">${gone.length}</span>
      <svg class="fold-arrow" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    </button>
    <div id="past-body" hidden style="padding-top:0.9rem">
      <p class="how" style="margin-bottom:0.8rem">
        Kept, not deleted. Calls are here for good; shoots only go back as far as
        each portal still remembers, since a portal holds one shoot at a time.
      </p>
      <div id="past-list"></div>
    </div>
  `;

  const list = $("past-list");
  for (const e of gone) list.appendChild(agendaRow(e, true));

  const toggle = $("past-toggle");
  const body = $("past-body");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.classList.toggle("open", open);
    body.hidden = !open;
  });
}

function agendaRow(e, past) {
  const row = document.createElement("div");
  row.className = "item";
  if (past) row.style.opacity = "0.6";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap";

  const left = document.createElement("div");
  left.style.flex = "1";
  left.innerHTML = `
    <p style="font-size:0.95rem">
      <b>${escHtml(whenLine(e.date, e.time))}</b>
      <span class="muted" style="font-size:0.8rem">&middot; ${e.kind === "call" ? "Call" : "Shoot"}</span>
    </p>
    <p style="font-size:0.92rem;margin-top:0.2rem">${escHtml(e.who)}${e.what ? " &middot; " + escHtml(e.what) : ""}</p>
    ${e.where ? `<p class="muted" style="font-size:0.8rem;margin-top:0.2rem">${escHtml(e.where)}</p>` : ""}
    ${e.phone
      // tappable, because on a phone this is the whole point of the row
      ? `<p style="font-size:0.9rem;margin-top:0.2rem"><a href="tel:${escHtml(e.phone.replace(/[^\d+]/g, ""))}" style="color:var(--text)">${escHtml(e.phone)}</a></p>`
      : ""}
    ${e.note ? `<p class="muted" style="font-size:0.8rem;margin-top:0.3rem">&ldquo;${escHtml(e.note)}&rdquo;</p>` : ""}
  `;
  head.appendChild(left);

  if (e.kind === "shoot") {
    const open = document.createElement("a");
    open.className = "btn-mini";
    open.href = `../${e.slug}/admin.html`;
    open.textContent = "Open";
    head.appendChild(open);
  } else if (!past) {
    head.appendChild(cancelCallButton(e, row));
  }

  row.appendChild(head);
  return row;
}

function cancelCallButton(e, row) {
  return dangerButton("Cancel", async () => {
    const res = await fetch(`${AGENDA_RELAY}/call/cancel`, {
      method: "POST",
      headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id })
    });
    if (!res.ok) throw new Error(String(res.status));
    // the slot goes back on offer, so both lists need redrawing
    loadAgenda();
    drawSlotEditor();
  });
}

/* "Thursday 10 September, 19:00" reads faster than a date does, and
   tomorrow being tomorrow matters more than its date. */
function whenLine(date, time) {
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d - today) / 86400000);
  const near = days === 0 ? "Today" : days === 1 ? "Tomorrow" : "";

  const full = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (near ? near + ", " : "") + full + (time ? ", " + time : "");
}

/* ============ THE TIMES ON OFFER ============ */

/* ============ THE MAIN LINK ============ */
/* One address he can hand to fifty people at once.

   The personal links below are used up: one booking and they are
   spent, which is right for "Marie, here are three times". This one is
   not. Fifty people can hold it and fifty can book, each taking a
   different hour out of the same calendar until the calendar runs out.

   So it never needs making, only copying, and the only thing worth
   showing about it is whether anybody opened it. */

async function drawMainLink() {
  const wrap = $("agenda-main");
  if (!wrap) return;

  const link = location.origin + "/call/";

  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to see your main call link.</p>';
    return;
  }

  let data = {};
  try {
    const res = await fetch(`${AGENDA_RELAY}/call/list`, {
      headers: { "X-Studio-Key": token() }, cache: "no-store"
    });
    if (res.ok) data = await res.json();
  } catch { /* the link still works, it just will not report */ }

  const main = data.main || { opens: 0, lastOpen: "" };
  // a booking with no personal link behind it came through this one
  const through = (data.booked || []).filter((b) => !b.invite).length;
  const open = (data.hours && data.hours.on)
    ? "your hours"
    : (data.slots || []).length + " fixed time" + ((data.slots || []).length === 1 ? "" : "s");

  wrap.innerHTML = `
    <h3 style="font-family:var(--font-display);font-size:1.15rem;font-weight:600">Your main call link</h3>
    <p class="how" style="margin:0.4rem 0 0.9rem">
      Send this one to as many people as you like. It is never used up: everybody who
      has it picks from the same calendar, and each hour disappears as it is taken.
      It is offering ${escHtml(open)}.
    </p>

    <div class="row">
      <label class="field" style="flex:1;min-width:16rem"><span>The link</span>
        <input id="main-link" type="text" readonly value="${escHtml(link)}">
      </label>
      <button class="btn-mini solid" id="main-copy" style="align-self:flex-end">Copy link</button>
      <a class="btn-mini" href="../call/" target="_blank" rel="noopener" style="align-self:flex-end">Open it</a>
    </div>

    <p class="muted" style="font-size:0.82rem;margin-top:0.7rem">
      ${main.opens} open${main.opens === 1 ? "" : "s"}${main.lastOpen ? ", last " + escHtml(sinceThen(main.lastOpen)) : ""}
      &middot; ${through} booked through it
    </p>
  `;

  const copy = $("main-copy");
  copy.addEventListener("click", async () => {
    const done = await copyText(link);
    copy.textContent = done ? "Copied" : "Select it";
    if (!done) $("main-link").select();
    setTimeout(() => { copy.textContent = "Copy link"; }, 1800);
  });
}

/* ============ THE HOURS HE IS FREE ============ */
/* The other way of offering a call. Instead of naming three times, he
   names a window and the days it applies to, and whoever has the link
   picks a day and an hour out of it.

   While this is on it wins over the hand picked times below, because
   switching it on is the deliberate act and two live offers would be
   two calendars to keep in step. */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function drawHours() {
  const wrap = $("agenda-hours");
  if (!wrap) return;

  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to set your hours.</p>';
    return;
  }

  let hours = null;
  try {
    const res = await fetch(`${AGENDA_RELAY}/call/list`, {
      headers: { "X-Studio-Key": token() }, cache: "no-store"
    });
    if (res.ok) hours = (await res.json()).hours;
  } catch { /* the editor below still works, it just starts empty */ }

  const h = hours || { on: false, days: [1, 2, 3, 4, 5], from: "10:00", to: "18:00", minutes: 30, notice: 12, ahead: 21, note: "" };

  wrap.innerHTML = `
    <h3 style="font-family:var(--font-display);font-size:1.15rem;font-weight:600">
      Your hours${h.on ? " (on)" : ""}
    </h3>
    <p class="how" style="margin:0.4rem 0 0.8rem">
      Say when you are willing to be rung and they pick a day and an hour themselves.
      While this is on it replaces the fixed times below.
    </p>

    <div class="row">
      <label class="field" style="min-width:7rem"><span>From</span>
        <input id="hrs-from" type="time" value="${escHtml(h.from)}">
      </label>
      <label class="field" style="min-width:7rem"><span>Until</span>
        <input id="hrs-to" type="time" value="${escHtml(h.to)}">
      </label>
      <label class="field" style="min-width:7rem"><span>Each call</span>
        <input id="hrs-minutes" type="number" min="10" max="180" step="5" value="${escHtml(String(h.minutes))}">
      </label>
      <label class="field" style="min-width:8rem"><span>Notice (hours)</span>
        <input id="hrs-notice" type="number" min="0" max="336" value="${escHtml(String(h.notice))}">
      </label>
      <label class="field" style="min-width:8rem"><span>Bookable ahead (days)</span>
        <input id="hrs-ahead" type="number" min="1" max="120" value="${escHtml(String(h.ahead))}">
      </label>
    </div>

    <div class="row" style="margin-top:0.6rem">
      <div class="field" style="flex:1;min-width:16rem">
        <span>Days</span>
        <div class="day-row" id="hrs-days"></div>
      </div>
    </div>

    <div class="row" style="margin-top:0.6rem">
      <label class="field" style="flex:1;min-width:14rem"><span>A line they see (optional)</span>
        <input id="hrs-note" type="text" maxlength="300" value="${escHtml(h.note || "")}">
      </label>
    </div>

    <div class="row" style="margin-top:0.8rem">
      <button class="btn-mini ${h.on ? "" : "solid"}" id="hrs-save">${h.on ? "Save the hours" : "Turn them on"}</button>
      ${h.on ? '<button class="btn-mini" id="hrs-off">Switch off</button>' : ""}
      <a class="btn-mini" href="../call/" target="_blank" rel="noopener">See the booking page</a>
    </div>
    <p class="form-msg" id="hrs-msg" style="margin-top:0.6rem"></p>
  `;

  // Monday first, which is how a week reads here
  const picked = new Set(h.days);
  const row = $("hrs-days");
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day" + (picked.has(day) ? " on" : "");
    btn.textContent = DAY_NAMES[day];
    btn.addEventListener("click", () => {
      if (picked.has(day)) picked.delete(day); else picked.add(day);
      btn.classList.toggle("on", picked.has(day));
    });
    row.appendChild(btn);
  }

  const send = async (on) => {
    const body = {
      on,
      days: [...picked],
      from: $("hrs-from").value,
      to: $("hrs-to").value,
      minutes: Number($("hrs-minutes").value) || 30,
      notice: Number($("hrs-notice").value) || 0,
      ahead: Number($("hrs-ahead").value) || 21,
      note: $("hrs-note").value.trim()
    };

    if (on && !body.days.length) { say("hrs-msg", "Pick at least one day."); return; }

    say("hrs-msg", "Saving...");
    try {
      const res = await fetch(`${AGENDA_RELAY}/call/hours`, {
        method: "POST",
        headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const answer = await res.json();
      if (!res.ok) throw new Error(answer.error || String(res.status));

      say("hrs-msg", on
        ? "On. " + answer.open + " time" + (answer.open === 1 ? "" : "s") + " to choose from."
        : "Off. The fixed times below are what is on offer now.");
      setTimeout(() => { drawHours(); drawSlotEditor(); drawMainLink(); }, 700);
    } catch (err) {
      say("hrs-msg", "Could not save that: " + err.message);
    }
  };

  $("hrs-save").addEventListener("click", () => send(true));
  if ($("hrs-off")) $("hrs-off").addEventListener("click", () => send(false));
}

async function drawSlotEditor() {
  const wrap = $("agenda-slots");
  if (!wrap) return;

  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to offer call times.</p>';
    return;
  }

  let data = { slots: [], minutes: 20, note: "" };
  try {
    const res = await fetch(`${AGENDA_RELAY}/call/list`, {
      headers: { "X-Studio-Key": token() }, cache: "no-store"
    });
    if (res.ok) data = await res.json();
  } catch { /* an empty editor is still usable */ }

  const slots = (data.slots || []).slice();
  const overridden = !!(data.hours && data.hours.on);

  wrap.innerHTML = `
    <h3 style="font-family:var(--font-display);font-size:1.15rem;font-weight:600">
      Or a few fixed times${overridden ? " (not in use)" : ""}
    </h3>
    <p class="how" style="margin:0.4rem 0 0.6rem">
      ${overridden
        ? "Your hours are on, so these are not what anyone is being offered. Switch the hours off above to use these instead."
        : "Times you are offering for a call. Anyone with the booking link picks one, it disappears, and they get a confirmation with a calendar invitation."}
    </p>
    <div class="row">
      <label class="field" style="min-width:8rem"><span>How long</span>
        <input id="slot-minutes" type="number" min="10" max="180" value="${escHtml(String(data.minutes || 20))}">
      </label>
      <label class="field" style="flex:1;min-width:14rem"><span>A line they see (optional)</span>
        <input id="slot-note" type="text" maxlength="300" value="${escHtml(data.note || "")}">
      </label>
    </div>
    <div id="slot-rows" style="margin-top:0.6rem"></div>
    <div class="row" style="margin-top:0.6rem">
      <button class="btn-mini" id="slot-add">+ Add a time</button>
      <button class="btn-mini solid" id="slot-save">Save the times</button>
      <a class="btn-mini" id="slot-link" href="../call/" target="_blank" rel="noopener">See the booking page</a>
    </div>
    <p class="form-msg" id="slot-msg" style="margin-top:0.6rem"></p>
  `;

  const rows = $("slot-rows");
  const draw = () => {
    rows.innerHTML = "";
    slots.forEach((s, i) => {
      const line = document.createElement("div");
      line.className = "row";
      line.innerHTML = `
        <label class="field" style="min-width:10rem"><span>Date</span>
          <input type="date" value="${escHtml(s.date || "")}">
        </label>
        <label class="field" style="min-width:7rem"><span>Time</span>
          <input type="time" value="${escHtml(s.time || "")}">
        </label>
      `;
      const [dateEl, timeEl] = line.querySelectorAll("input");
      dateEl.addEventListener("input", () => { s.date = dateEl.value; });
      timeEl.addEventListener("input", () => { s.time = timeEl.value; });

      const rm = document.createElement("button");
      rm.className = "btn-mini danger";
      rm.style.alignSelf = "flex-end";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => { slots.splice(i, 1); draw(); });
      line.appendChild(rm);

      rows.appendChild(line);
    });
    if (!slots.length) {
      rows.innerHTML = '<p class="muted" style="font-size:0.9rem">No times on offer, so the booking page has nothing to show.</p>';
    }
  };
  draw();

  $("slot-add").addEventListener("click", () => { slots.push({ date: "", time: "" }); draw(); });

  $("slot-save").addEventListener("click", async () => {
    const msg = $("slot-msg");
    const usable = slots.filter((s) => s.date && s.time);
    msg.textContent = "Saving...";
    try {
      const res = await fetch(`${AGENDA_RELAY}/call/offer`, {
        method: "POST",
        headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: usable,
          minutes: Number($("slot-minutes").value) || 20,
          note: $("slot-note").value
        })
      });
      const body = await res.json();
      msg.textContent = res.ok
        ? usable.length + " time" + (usable.length === 1 ? "" : "s") + " on offer."
        : "Did not save: " + (body.error || res.status);
    } catch (err) {
      msg.textContent = "Did not save: " + err.message;
    }
  });
}
