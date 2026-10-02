/* Contacts
   ------------------------------------------------------------
   Everybody who filled in a form with a phone number: booked a call on
   the call page, the reels page or a personal link, or asked to be rung
   from a partner's page or the reels page. One line per person, newest
   first, kept after the booking itself is gone.

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

function drawPeopleRows(query) {
  const wrap = $("people-list");
  const q = String(query || "").trim().toLowerCase();
  const digits = q.replace(/\D/g, "");

  // a search matches a name, an address, or any run of the number
  const shown = peopleKnown.filter((p) => !q ||
    String(p.name || "").toLowerCase().includes(q) ||
    String(p.email || "").toLowerCase().includes(q) ||
    (digits.length >= 3 && String(p.phone || "").replace(/\D/g, "").includes(digits)));

  const count = $("people-count");
  if (count) {
    count.textContent = peopleKnown.length
      ? (q ? shown.length + " of " : "") + peopleKnown.length + " contact" + (peopleKnown.length === 1 ? "" : "s")
      : "";
  }

  if (!peopleKnown.length) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Nobody yet. Everyone who books a call or asks to be rung lands here.</p>';
    return;
  }
  if (!shown.length) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Nobody matches that.</p>';
    return;
  }

  wrap.innerHTML = "";
  for (const p of shown) {
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
        ${p.email ? escHtml(p.email) + " &middot; " : ""}${escHtml(from)}${(p.events || []).length ? " (" + escHtml(p.events.join(", ")) + ")" : ""}${p.ref ? " &middot; sent by " + escHtml(p.ref) : ""}
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

    wrap.appendChild(row);
  }
}

/* The whole list as a spreadsheet file. Semicolons and a byte order mark,
   because that is what Excel set to Dutch or French opens as columns. */
function exportPeople() {
  if (!peopleKnown.length) return;
  const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = [["Name", "Phone", "Email", "Came from", "Sent by", "First", "Last", "Times"].map(cell).join(";")];
  for (const p of peopleKnown) {
    lines.push([
      p.name, p.phone, p.email, (p.sources || []).map((s) => CAME_FROM[s] || s).join(", "),
      p.ref || "", String(p.first || "").slice(0, 10), String(p.last || "").slice(0, 10), p.count || 1
    ].map(cell).join(";"));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "noir-contacts-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
