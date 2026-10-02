/* Contacts
   ------------------------------------------------------------
   Everybody who filled in a form: booked a call on the call page, the
   reels page or a personal link, asked to be rung from a partner's page
   or the reels page, or signed in to an event gallery. One line per
   person, newest first, kept after the booking itself is gone. Event
   guests are grouped in a folder per event.

   The list lives in the relay's private storage, never in a repo, and
   is read and changed only with the key. Loaded after dashboard.js, so
   it shares $, token, escHtml, dangerButton and whenSheet.
   ------------------------------------------------------------ */

const PEOPLE_RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";

const CAME_FROM = {
  reels: "Reels page",
  call: "Call page",
  invite: "Personal link",
  callback: "Asked to be rung",
  event: "Event gallery"
};

let peopleKnown = [];

onReady(() => {
  const wrap = $("people-list");
  if (!wrap) return;
  whenSheet("people", drawPeople);

  const search = $("people-search");
  if (search) search.addEventListener("input", () => drawPeopleRows(search.value));

  const exp = $("people-export");
  if (exp) exp.addEventListener("click", exportPeople);
});

async function drawPeople() {
  const wrap = $("people-list");
  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to see your contacts.</p>';
    return;
  }
  wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Reading your contacts...</p>';

  try {
    const res = await fetch(`${PEOPLE_RELAY}/people`, { headers: { "X-Studio-Key": token() }, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    peopleKnown = (await res.json()).people || [];
  } catch (err) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read your contacts (' + escHtml(err.message) + ").</p>";
    return;
  }

  drawPeopleRows(($("people-search") || {}).value || "");
}

function peopleDay(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ============ ONE LINE PER PERSON ============ */
function personRow(p) {
  const row = document.createElement("div");
  row.className = "item";
  row.style.cssText = "display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap";

  const text = document.createElement("div");
  text.style.cssText = "flex:1;min-width:14rem";
  const from = (p.sources || []).map((s) => CAME_FROM[s] || s).join(", ");
  const tel = String(p.phone || "").replace(/[^\d+]/g, "");
  text.innerHTML = `
    <p style="font-size:0.98rem"><b>${escHtml(p.name || "No name given")}</b></p>
    ${p.phone
      // tappable, because on a phone ringing them is the point
      ? `<p style="font-size:1.02rem;margin-top:0.15rem"><a href="tel:${escHtml(tel)}" style="color:var(--text)">${escHtml(p.phone)}</a></p>`
      : ""}
    <p class="muted" style="font-size:0.78rem;margin-top:0.25rem">
      ${p.email ? escHtml(p.email) + " &middot; " : ""}${escHtml(from)}${p.ref ? " &middot; sent by " + escHtml(p.ref) : ""}
      &middot; ${escHtml(peopleDay(p.first))}${p.count > 1 ? " &middot; " + p.count + " times, last " + escHtml(peopleDay(p.last)) : ""}
    </p>`;
  row.appendChild(text);

  row.appendChild(dangerButton("Remove", async () => {
    const res = await fetch(`${PEOPLE_RELAY}/people/remove`, {
      method: "POST",
      headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id })
    });
    if (!res.ok) throw new Error(String(res.status));
    peopleKnown = peopleKnown.filter((x) => x.id !== p.id);
    drawPeopleRows(($("people-search") || {}).value || "");
  }));
  return row;
}

/* ============ A FOLDER PER EVENT ============ */
/* Guests who signed in to an event gallery are kept under that event:
   one folder each, named after the event, with everybody's name and
   email, a button that copies all the addresses, and its own export.
   Somebody who only ever signed in to a gallery lives in the folder and
   not in the list below, which stays the people who booked or asked. */
const eventFoldersOpen = new Set();
const eventTitles = new Map();

// the event's own name, from its plan; its address until that arrives
function eventTitle(slug, into) {
  if (eventTitles.has(slug)) { into.textContent = eventTitles.get(slug); return; }
  into.textContent = slug;
  if (typeof planOf !== "function") return;
  planOf(slug).then((plan) => {
    const name = (plan.event && plan.event.title) || plan.name || slug;
    eventTitles.set(slug, name);
    into.textContent = name;
  }).catch(() => { /* the address stands */ });
}

function eventFolder(slug, guests) {
  const box = document.createElement("details");
  box.className = "people-folder";
  box.open = eventFoldersOpen.has(slug);
  box.addEventListener("toggle", () => { if (box.open) eventFoldersOpen.add(slug); else eventFoldersOpen.delete(slug); });

  const head = document.createElement("summary");
  head.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>
    <b></b>
    <span class="muted">${guests.length} ${guests.length === 1 ? "guest" : "guests"}</span>`;
  eventTitle(slug, head.querySelector("b"));
  box.appendChild(head);

  const body = document.createElement("div");
  body.className = "people-folder-body";

  const tools = document.createElement("div");
  tools.className = "row";
  tools.style.cssText = "align-items:center;margin-bottom:0.4rem";
  const emails = guests.map((g) => g.email).filter(Boolean);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn-mini";
  copy.textContent = "Copy all emails";
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(emails.join(", ")); copy.textContent = emails.length + " copied"; }
    catch { copy.textContent = "Could not copy"; }
    setTimeout(() => { copy.textContent = "Copy all emails"; }, 2000);
  });

  const exp = document.createElement("button");
  exp.type = "button";
  exp.className = "btn-mini";
  exp.textContent = "Export this event";
  exp.addEventListener("click", () => exportPeople(guests, "noir-event-" + slug));

  const open = document.createElement("a");
  open.className = "btn-mini";
  open.href = "../" + slug + "/admin.html";
  open.textContent = "Open the event";

  tools.append(copy, exp, open);
  body.appendChild(tools);
  for (const g of guests) body.appendChild(personRow(g));
  box.appendChild(body);
  return box;
}

function drawPeopleRows(query) {
  const wrap = $("people-list");
  const folders = $("people-events");
  const q = String(query || "").trim().toLowerCase();
  const digits = q.replace(/\D/g, "");

  // a search matches a name, an address, or any run of the number
  const shown = peopleKnown.filter((p) => !q ||
    String(p.name || "").toLowerCase().includes(q) ||
    String(p.email || "").toLowerCase().includes(q) ||
    (digits.length >= 3 && String(p.phone || "").replace(/\D/g, "").includes(digits)));

  // by event, newest sign-in first
  const byEvent = new Map();
  for (const p of shown) {
    for (const slug of p.events || []) {
      if (!byEvent.has(slug)) byEvent.set(slug, []);
      byEvent.get(slug).push(p);
    }
  }
  // the list below is everybody who did more than sign in to a gallery
  const onlyGuest = (p) => (p.events || []).length && (p.sources || []).every((s) => s === "event");
  const listed = shown.filter((p) => !onlyGuest(p));
  const guestsInAll = peopleKnown.filter((p) => (p.events || []).length).length;

  const count = $("people-count");
  if (count) {
    count.textContent = peopleKnown.length
      ? (q ? shown.length + " of " : "") + peopleKnown.length + " contact" + (peopleKnown.length === 1 ? "" : "s") +
        (guestsInAll ? ", " + guestsInAll + " of them event guests" : "")
      : "";
  }

  if (folders) {
    folders.innerHTML = "";
    if (byEvent.size) {
      folders.insertAdjacentHTML("beforeend", '<p class="link-head">Events</p>');
      for (const [slug, guests] of [...byEvent].sort((a, b) => a[0].localeCompare(b[0]))) {
        // a search opens the folders it found something in
        if (q) eventFoldersOpen.add(slug);
        folders.appendChild(eventFolder(slug, guests));
      }
    }
  }

  if (!peopleKnown.length) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Nobody yet. Everyone who books a call, asks to be rung or signs in to an event gallery lands here.</p>';
    return;
  }

  wrap.innerHTML = byEvent.size ? '<p class="link-head">Booked or asked</p>' : "";
  if (!listed.length) {
    wrap.insertAdjacentHTML("beforeend", `<p class="muted" style="font-size:0.9rem">${q && !byEvent.size ? "Nobody matches that." : "Nobody here" + (q ? " matches that." : " yet.")}</p>`);
    return;
  }
  for (const p of listed) wrap.appendChild(personRow(p));
}

/* The whole list as a spreadsheet file. Semicolons and a byte order mark,
   because that is what Excel set to Dutch or French opens as columns. */
function exportPeople(list, fileName) {
  // the button hands over its click; only a real list replaces everybody
  const people = Array.isArray(list) ? list : peopleKnown;
  if (!people.length) return;
  const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = [["Name", "Phone", "Email", "Came from", "Events", "Sent by", "First", "Last", "Times"].map(cell).join(";")];
  for (const p of people) {
    lines.push([
      p.name, p.phone, p.email, (p.sources || []).map((s) => CAME_FROM[s] || s).join(", "),
      (p.events || []).join(", "),
      p.ref || "", String(p.first || "").slice(0, 10), String(p.last || "").slice(0, 10), p.count || 1
    ].map(cell).join(";"));
  }
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (typeof fileName === "string" ? fileName : "noir-contacts") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
