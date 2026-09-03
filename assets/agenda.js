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
  loadAgenda();
  drawAsks();
  drawInvites();
  drawHours();
  drawSlotEditor();
  drawPartners();
  const make = $("ref-make");
  if (make) make.addEventListener("click", makePartner);
});

/* ============ REFERRAL PARTNERS ============ */
/* A page per photographer. What matters here is not the page, it is
   knowing who actually sent somebody, because that is what a fee is
   paid on. So each row shows opens and, more importantly, bookings. */

async function drawPartners() {
  const wrap = $("ref-list");
  if (!wrap) return;

  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to see your partners.</p>';
    return;
  }

  try {
    const res = await fetch(`${AGENDA_RELAY}/refs`, {
      headers: { "X-Studio-Key": token() }, cache: "no-store"
    });
    if (!res.ok) throw new Error(String(res.status));
    const { partners } = await res.json();

    if (!partners.length) {
      wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">No partners yet.</p>';
      return;
    }

    wrap.innerHTML = "";
    for (const p of partners) wrap.appendChild(partnerRow(p));
  } catch (err) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read your partners (' +
      escHtml(err.message) + ").</p>";
  }
}

function partnerRow(p) {
  const row = document.createElement("div");
  row.className = "item";
  const link = location.origin + "/r/#" + p.id;

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap";

  const text = document.createElement("div");
  text.style.flex = "1";
  text.innerHTML = `
    <p style="font-size:0.95rem"><b>${escHtml(p.name)}</b></p>
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

  const copy = document.createElement("button");
  copy.className = "btn-mini";
  copy.textContent = "Copy link";
  copy.addEventListener("click", async () => {
    const done = await copyText(link);
    copy.textContent = done ? "Copied" : "Select it";
    setTimeout(() => { copy.textContent = "Copy link"; }, 1800);
  });
  head.appendChild(copy);

  const view = document.createElement("a");
  view.className = "btn-mini";
  view.href = link;
  view.target = "_blank";
  view.rel = "noopener";
  view.textContent = "View";
  head.appendChild(view);

  const remove = document.createElement("button");
  remove.className = "btn-mini danger";
  remove.textContent = "Remove";
  let armed = false;
  remove.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      remove.textContent = "Sure?";
      setTimeout(() => { if (armed) { armed = false; remove.textContent = "Remove"; } }, 4000);
      return;
    }
    armed = false;
    remove.disabled = true;
    /* Redrawing regardless of the answer made a refusal look like a
       deletion: the row came back and nothing said why. */
    try {
      const res = await fetch(`${AGENDA_RELAY}/ref/remove`, {
        method: "POST",
        headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id })
      });
      if (!res.ok) {
        let why = String(res.status);
        try { why = (await res.json()).error || why; } catch { /* keep the number */ }
        say("ref-msg", "Could not remove " + (p.name || p.id) + ": " + why);
        remove.disabled = false;
        remove.textContent = "Remove";
        return;
      }
      say("ref-msg", "");
      drawPartners();
    } catch (err) {
      say("ref-msg", "Could not reach the relay to remove that partner.");
      console.error("partner remove failed:", err);
      remove.disabled = false;
      remove.textContent = "Remove";
    }
  });
  head.appendChild(remove);

  row.appendChild(head);
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
      body: JSON.stringify({ name, discount: $("ref-discount").value.trim() })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || String(res.status));

    msg.textContent = name + " has a page. Copy the link below and send it to them.";
    $("ref-name").value = "";
    $("ref-discount").value = "";
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

  const remove = document.createElement("button");
  remove.className = "btn-mini danger";
  remove.textContent = "Remove";
  let armed = false;
  remove.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      remove.textContent = "Sure?";
      setTimeout(() => { if (armed) { armed = false; remove.textContent = "Remove"; } }, 4000);
      return;
    }
    armed = false;
    remove.disabled = true;
    try {
      await fetch(`${AGENDA_RELAY}/call/uninvite`, {
        method: "POST",
        headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: inv.id })
      });
      drawInvites();
    } catch {
      remove.disabled = false;
    }
  });
  head.appendChild(remove);

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

    // yesterday is not an agenda
    const today = new Date().toISOString().slice(0, 10);
    const ahead = entries.filter((e) => e.date >= today);

    if (!ahead.length) {
      wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Nothing booked. No shoots planned and no calls.</p>';
      return;
    }

    wrap.innerHTML = "";
    for (const e of ahead) wrap.appendChild(agendaRow(e));
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
      const plan = await (await fetch(`../data/${name}.json`, { cache: "no-store" })).json();
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

function agendaRow(e) {
  const row = document.createElement("div");
  row.className = "item";

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
  } else {
    head.appendChild(cancelCallButton(e, row));
  }

  row.appendChild(head);
  return row;
}

function cancelCallButton(e, row) {
  const btn = document.createElement("button");
  btn.className = "btn-mini danger";
  btn.textContent = "Cancel";
  let armed = false;

  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = "Sure?";
      setTimeout(() => { if (armed) { armed = false; btn.textContent = "Cancel"; } }, 4000);
      return;
    }
    armed = false;
    btn.disabled = true;

    try {
      const res = await fetch(`${AGENDA_RELAY}/call/cancel`, {
        method: "POST",
        headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id })
      });
      if (!res.ok) throw new Error(String(res.status));
      // the slot goes back on offer, so both lists need redrawing
      loadAgenda();
      drawSlotEditor();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Did not cancel";
    }
  });

  return btn;
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
      setTimeout(() => { drawHours(); drawSlotEditor(); }, 700);
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
