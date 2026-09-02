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

document.addEventListener("DOMContentLoaded", () => { load(); wireAsk(); });

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

/* The ask. A restaurant owner reading this on a phone between two
   services will not go and pick an hour out of a calendar, so this
   takes three fields and rings them back instead.

   Which partner sent them travels with it, because that is what
   decides who gets paid. */
function wireAsk() {
  const form = $("ask");
  if (!form) return;

  const send = $("ask-send");
  const msg = $("ask-msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = $("ask-name").value.trim();
    const phone = $("ask-phone").value.trim();
    const email = $("ask-email").value.trim();

    // said here rather than by the browser, so all three read alike
    if (!name) return say("Your name, so we know who we are ringing.");
    if (!phone) return say("A number, or there is nobody to call.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say("That email does not look right.");

    send.disabled = true;
    msg.textContent = "Sending...";

    try {
      const res = await fetch(`${RELAY}/call/back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone, email,
          website: $("ask-website").value,
          ref: REF || ""
        })
      });

      if (!res.ok) throw new Error("relay said " + res.status);

      form.innerHTML =
        `<p class="ref-done">We have your number.</p>
         <p class="ref-small">We will ring within one working day. There is a note in your inbox in the meantime.</p>`;
    } catch (err) {
      console.error("call back failed:", err);
      send.disabled = false;
      say("That did not send. Try again, or write to info@noiraunoir.com.");
    }
  });

  function say(what) {
    msg.textContent = what;
  }
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
