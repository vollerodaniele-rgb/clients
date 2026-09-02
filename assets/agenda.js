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

onReady(() => {
  loadAgenda();
  drawInvites();
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
    try {
      await fetch(`${AGENDA_RELAY}/ref/remove`, {
        method: "POST",
        headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id })
      });
      drawPartners();
    } catch {
      remove.disabled = false;
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
      A call link for one person. Put in their name and the times you can do, and send
      them what it gives you.
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
    </div>
    <div class="row">
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
  drawInviteList(invites);
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
      ${(inv.slots || []).length} time${(inv.slots || []).length === 1 ? "" : "s"} offered
      &middot; ${inv.minutes} minutes
    </p>
    <p style="font-size:0.8rem;margin-top:0.3rem;color:${inv.booked ? "var(--text)" : "var(--dim)"}">
      ${inv.booked
        ? "&#10003; Booked " + escHtml(inv.booked.date) + " at " + escHtml(inv.booked.time)
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

  if (!slots.length) { msg.textContent = "Give it at least one date and time."; return; }

  btn.disabled = true;
  msg.textContent = "Making it...";

  try {
    const res = await fetch(`${AGENDA_RELAY}/call/invite`, {
      method: "POST",
      headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("inv-name").value.trim(),
        note: $("inv-note").value.trim(),
        minutes: Number($("inv-minutes").value) || 20,
        slots
      })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || String(res.status));

    msg.textContent = "Made. Copy the link below and send it.";
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

  wrap.innerHTML = `
    <p class="how" style="margin-bottom:0.6rem">
      Times you are offering for a call. Anyone with the booking link picks one, it
      disappears, and they get a confirmation with a calendar invitation.
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
