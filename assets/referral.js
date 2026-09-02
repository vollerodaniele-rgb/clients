/* A partner's page
   ------------------------------------------------------------
   What a photographer sends to their own client. One page serves
   every partner; the id in the hash decides whose name is on it.

   The name is the whole point. Somebody arriving here was sent by
   a person they already trust, and saying so is worth more than
   anything else on the page.
   ------------------------------------------------------------ */

const RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";
const REF = location.hash.replace(/^#/, "").trim();

/* Remembered so the booking page can tell you who sent them. Same
   origin, short lived, and only ever an id we issued. */
const REF_MEMORY = "noir-ref";

/* Shown when there is no partner behind the link, or when we cannot
   reach the relay to find out who it is. Written once because it is
   the headline, and a headline that disagrees with itself in three
   places is worse than no headline. */
const NO_PARTNER = "Monthly video for restaurants in Belgium.";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", load);

async function load() {
  if (!REF) {
    // no partner, so it is just the studio's own page
    $("sent").textContent = NO_PARTNER;
    return;
  }

  try {
    localStorage.setItem(REF_MEMORY, JSON.stringify({ id: REF, at: Date.now() }));
  } catch { /* a blocked storage only costs the attribution */ }

  try {
    const res = await fetch(`${RELAY}/ref?id=${encodeURIComponent(REF)}`, { cache: "no-store" });
    if (!res.ok) {
      $("sent").textContent = NO_PARTNER;
      return;
    }

    const partner = await res.json();

    $("sent").innerHTML = partner.name
      ? `${esc(partner.name)} sent you this.<br><span class="ref-second">${esc(
          partner.note || "They shoot your food. We film the rest.")}</span>`
      : NO_PARTNER;

    if (partner.discount) {
      $("offer").textContent = `Because ${partner.name || "they"} sent you, ${partner.discount}.`;
    }

    // counted after the page is up, so it never delays anything
    fetch(`${RELAY}/ref/seen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: REF })
    }).catch(() => { /* a missed count is not worth a broken page */ });
  } catch (err) {
    console.error("partner load failed:", err);
    $("sent").textContent = NO_PARTNER;
  }
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
