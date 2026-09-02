/* Booking a call
   ------------------------------------------------------------
   The same shape as a client picking a shoot date, pointed at
   somebody who is not a client yet. Tapping a time only chooses
   it; booking is a separate press, so a mis-tap costs nothing.

   Times come from the relay and disappear the moment somebody
   takes one, so two people cannot book the same slot.
   ------------------------------------------------------------ */

const RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";

const $ = (id) => document.getElementById(id);
let picked = null;

document.addEventListener("DOMContentLoaded", () => {
  // wired once, here. Wiring it at the top of the file as well is how
  // one press becomes two bookings.
  $("book").addEventListener("click", book);
  load();
});

async function load() {
  try {
    const res = await fetch(`${RELAY}/call/slots`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();

    if (!data.slots.length) {
      $("intro").textContent =
        "There are no times on offer at the moment. Send a message instead and we will find one.";
      return;
    }

    $("intro").textContent = data.note ||
      `Pick a time that suits you. ${data.minutes} minutes, no pitch.`;

    draw(data.slots);
  } catch (err) {
    console.error("slots failed:", err);
    $("intro").textContent = "Could not load the times right now. Try again in a minute.";
  }
}

function draw(slots) {
  const wrap = $("slots");
  wrap.innerHTML = "";

  for (const slot of slots) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pick-card";
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `
      <span class="pick-day">${esc(longDate(slot.date))}</span>
      <span class="pick-meta">${esc(slot.time)}</span>
      <span class="pick-cta">Pick this one</span>
    `;
    btn.addEventListener("click", () => choose(slot, btn));
    wrap.appendChild(btn);
  }
}

function choose(slot, btn) {
  picked = slot;

  for (const card of document.querySelectorAll(".pick-card")) {
    const on = card === btn;
    card.classList.toggle("chosen", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
    const cta = card.querySelector(".pick-cta");
    if (cta) cta.textContent = on ? "Chosen" : "Pick this one";
  }

  $("chosen").textContent = longDate(slot.date) + " at " + slot.time + ".";
  $("details").hidden = false;
  $("msg").textContent = "";
  $("who").focus();
}

async function book() {
  const msg = $("msg");
  const btn = $("book");
  if (!picked) { msg.textContent = "Pick a time first."; return; }

  const name = $("who").value.trim();
  const email = $("mail").value.trim();

  if (!name) { msg.textContent = "Please add your name."; $("who").focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    msg.textContent = "Please add an email I can confirm it to.";
    $("mail").focus();
    return;
  }

  btn.disabled = true;
  msg.textContent = "Booking...";

  try {
    const res = await fetch(`${RELAY}/call/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: picked.date,
        time: picked.time,
        name,
        email,
        note: $("about").value.trim(),
        website: $("website").value
      })
    });

    if (res.status === 409) {
      // somebody else took it while this page was open
      msg.textContent = "That time has just gone. Pick another.";
      btn.disabled = false;
      load();
      return;
    }
    if (!res.ok) throw new Error(String(res.status));

    done(name, email);
  } catch (err) {
    console.error("booking failed:", err);
    msg.textContent = "Could not book that. Try again in a minute.";
    btn.disabled = false;
  }
}

function done(name, email) {
  document.querySelector("main").innerHTML = `
    <p class="transfer-kicker">NOIR AU NOIR</p>
    <h1 class="transfer-title">We are on.</h1>
    <p class="transfer-note">
      ${esc(longDate(picked.date))} at ${esc(picked.time)}. A confirmation is on its way to
      ${esc(email)}, with a calendar invitation so it does not get forgotten.
    </p>
    <p class="transfer-expiry">Something come up? Reply to that email and we will move it.</p>
  `;
  document.title = "Booked";
}

function longDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
