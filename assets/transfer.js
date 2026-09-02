/* A transfer page
   ------------------------------------------------------------
   One page serves every link. The id comes from the hash rather
   than a query string, because a hash survives every redirect and
   every server, and this link gets pasted into mail clients and
   chat apps that rewrite what they touch.

   There is no key here on purpose. Holding the link is the
   permission, which is what makes it sendable to anyone. Everything
   the page shows comes from the relay, which is also the only thing
   that can reach the files.
   ------------------------------------------------------------ */

const RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";
const ID = location.hash.replace(/^#/, "").trim();

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", load);
// pasting a different link into the same tab should just work
window.addEventListener("hashchange", () => location.reload());

async function load() {
  if (!ID) return gone("No link");

  try {
    const res = await fetch(`${RELAY}/transfer?id=${encodeURIComponent(ID)}`, { cache: "no-store" });
    if (!res.ok) return gone();
    const data = await res.json();

    const title = data.title || "Files for you";
    $("title").textContent = title;
    document.title = title;

    if (data.note) $("note").textContent = data.note;

    if (data.expires) {
      $("expiry").textContent = "This link works until " + longDate(data.expires) + ".";
    }

    render(data.files || []);
  } catch (err) {
    console.error("transfer load failed:", err);
    gone();
  }
}

/* A link that was killed and a link that never existed look the same,
   deliberately: there is nothing to learn by trying one. */
function gone(title) {
  $("title").textContent = title || "This link has expired";
  document.title = "Gone";
  $("files").innerHTML =
    '<p class="muted">If you were expecting something, ask for a new link.</p>';
}

function render(files) {
  const wrap = $("files");
  wrap.innerHTML = "";

  if (!files.length) {
    wrap.innerHTML = '<p class="muted">Nothing here.</p>';
    return;
  }

  const href = (name) =>
    `${RELAY}/transfer/file?id=${encodeURIComponent(ID)}&name=${encodeURIComponent(name)}`;

  for (const f of files) {
    const a = document.createElement("a");
    a.className = "delivery-file";
    a.href = href(f.name);
    a.innerHTML = `
      <span class="delivery-name">${esc(f.name)}</span>
      <span class="delivery-size">${esc(readableSize(f.size))}</span>
    `;
    wrap.appendChild(a);
  }

  if (files.length > 1) wrap.appendChild(downloadAll(files, href));
}

/* Starts each file rather than building a zip, for the same reason as
   a delivery: a zip has to be assembled somewhere and nobody should
   wait for that. */
function downloadAll(files, href) {
  const wrap = document.createElement("div");
  wrap.className = "delivery-all";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-send";
  btn.textContent = "Download all " + files.length;

  const note = document.createElement("span");
  note.className = "delivery-size";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    for (let i = 0; i < files.length; i++) {
      note.textContent = "Starting " + (i + 1) + " of " + files.length;
      const a = document.createElement("a");
      a.href = href(files[i].name);
      a.download = files[i].name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 700));
    }
    note.textContent = "All " + files.length + " started. Check your downloads.";
    btn.disabled = false;
  });

  wrap.append(btn, note);
  return wrap;
}

function readableSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function longDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
