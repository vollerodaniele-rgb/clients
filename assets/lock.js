/* The lock
   ------------------------------------------------------------
   Every page he edits from opens closed on a browser that has never
   been used for it: the dashboard and each client's editor. Paste the
   key once and that browser goes straight in from then on. The key is
   what proves who you are, so asking for it every visit would only
   train him to keep it somewhere handy, which is the opposite of safe.

   Nothing under the lock is drawn and nothing is fetched until it
   opens. A locked page is not a page with a cover over it, it is a
   page that has not begun.

   Be clear about what this is: a door on the interface, not on the
   data. Every page here is a static file in a public repo, so the
   portals, the plans and this file itself can be read by anybody with
   the address, lock or no lock. What it stops is a stranger sitting at
   an open browser and using the key saved in it.

   It leans on whichever of dashboard.js or admin.js loaded before it
   for OWNER, REPO and TOKEN_KEY, which both spell the same way.
   ------------------------------------------------------------ */

/* ============ WHAT WAITS FOR IT ============ */
let pageOpen = false;
const openWaiting = [];

function whenUnlocked(fn) {
  if (pageOpen) { fn(); return; }
  openWaiting.push(fn);
}

function unlockPage() {
  if (pageOpen) return;
  pageOpen = true;
  document.documentElement.classList.remove("locked");
  while (openWaiting.length) {
    const fn = openWaiting.shift();
    // one thing failing to start must not stop the next
    try { fn(); } catch (err) { console.error("opening the page failed:", err); }
  }
}

/* Runs while the page is still being parsed, on purpose. Deciding at
   DOMContentLoaded would show the lock for a frame to somebody who
   already has a key. */
let openedOnTrust = false;

(function () {
  let saved = "";
  try { saved = localStorage.getItem(TOKEN_KEY) || ""; } catch { /* blocked storage stays shut */ }
  if (saved) { openedOnTrust = true; unlockPage(); }
})();

/* Is this key still any good? A key that has expired or been withdrawn
   still reads a public repo perfectly well, so the page looks right and
   only fails at the moment something is saved, which is the worst
   moment to find out. */
async function vet(key) {
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
      headers: { Authorization: "Bearer " + key, Accept: "application/vnd.github+json" },
      cache: "no-store"
    });
  } catch (err) {
    console.error("key check failed:", err);
    return "unknown"; // no line to GitHub is not a bad key
  }

  if (res.status === 401 || res.status === 403) return "refused";
  if (!res.ok) return "unknown";

  const info = await res.json();
  return info.permissions && info.permissions.push ? "good" : "readonly";
}

/* ============ THE SCREEN ITSELF ============ */
/* This file is asked for with a timestamp to dodge the ten minute
   cache, so it can land after the document is parsed. Waiting for an
   event that has been and gone would leave the lock dead. */
(function () {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else setTimeout(wire, 0);

  function wire() {
    const lock = document.getElementById("lock");
    if (!lock) return;

    const input = document.getElementById("lock-input");
    const msg = document.getElementById("lock-msg");
    const btn = document.getElementById("lock-open");

    const refuse = (why) => {
      msg.textContent = why;
      input.value = "";
      input.focus();
    };

    /* A new key is checked with GitHub before it is kept, because the
       alternative is a page that looks fine and cannot save. */
    const open = async (key) => {
      msg.textContent = "Checking...";

      const verdict = await vet(key);
      if (verdict === "refused") { refuse("Not accepted."); return; }
      if (verdict === "readonly") { refuse("That key cannot write."); return; }
      if (verdict === "unknown") { refuse("No line to GitHub."); return; }

      localStorage.setItem(TOKEN_KEY, key);
      openedOnTrust = false;
      unlockPage();
    };

    btn.addEventListener("click", () => {
      const key = input.value.trim();
      if (!key) { input.focus(); return; }
      btn.disabled = true;
      open(key).finally(() => { btn.disabled = false; });
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); btn.click(); }
    });

    if (!pageOpen) { input.focus(); return; }

    /* Opened on the key that was already here. It let him in without a
       wait, which is the point, but it is worth knowing quietly whether
       it can still write, and shutting the door again if it cannot. */
    if (openedOnTrust) {
      vet(localStorage.getItem(TOKEN_KEY) || "").then((verdict) => {
        if (verdict === "good" || verdict === "unknown") return;
        try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing to forget */ }
        pageOpen = false;
        document.documentElement.classList.add("locked");
        msg.textContent = verdict === "readonly"
          ? "That key can no longer write. Paste a new one."
          : "That key has stopped working. Paste a new one.";
        input.focus();
      });
    }
  }
})();

/* Shutting it again, for a machine he is handing over or leaving. The
   key is forgotten here, so the next person needs their own. */
function lockAgain() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing to forget */ }
  location.reload();
}
