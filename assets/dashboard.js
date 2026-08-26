/* Clients dashboard
   ------------------------------------------------------------
   Lists every client by reading the data folder from GitHub, so a
   new client shows up here the moment its file is committed and
   there is no list to keep in step by hand.
   ------------------------------------------------------------ */
const OWNER = "vollerodaniele-rgb";
const REPO = "clients";
const TOKEN_KEY = "clients-admin-token";
const RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";

// folders that are part of the site rather than a client
const RESERVED = ["admin", "assets", "data", "_template"];

const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem(TOKEN_KEY) || "";

document.addEventListener("DOMContentLoaded", () => {
  wireTokenPanel();
  loadClients();
});

function wireTokenPanel() {
  const msg = $("token-msg");
  if (token()) msg.textContent = "A key is saved in this browser.";

  $("token-save").addEventListener("click", () => {
    const v = $("token-input").value.trim();
    if (!v) { msg.textContent = "Paste the token first."; return; }
    localStorage.setItem(TOKEN_KEY, v);
    $("token-input").value = "";
    msg.textContent = "Key saved. Every client admin on this site can use it now.";
    loadClients();
  });

  $("token-clear").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    msg.textContent = "Key removed from this browser.";
  });
}

async function loadClients() {
  const grid = $("client-grid");

  let names = [];
  try {
    names = await listClientNames();
  } catch (err) {
    console.error("could not list clients:", err);
    grid.innerHTML = '<p class="muted">Could not read the client list (' +
      escHtml(err.message) + ').</p>';
    return;
  }

  if (!names.length) {
    grid.innerHTML = '<p class="muted">No clients yet. Add one as described below.</p>';
    return;
  }

  // each client's own details come from the site, not the API, so this
  // stays cheap however many clients there are
  const clients = await Promise.all(names.map(async (name) => {
    let plan = {};
    try {
      plan = await (await fetch(`../data/${name}.json`, { cache: "no-store" })).json();
    } catch { /* a client with unreadable data still deserves a card */ }
    return { name, plan, requests: await countRequests(name) };
  }));

  grid.innerHTML = "";
  for (const c of clients) grid.appendChild(clientCard(c));
}

async function listClientNames() {
  const headers = { Accept: "application/vnd.github+json" };
  if (token()) headers.Authorization = "Bearer " + token();

  let res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data`, {
    headers, cache: "no-store"
  });

  // a stale key should never hide the list: the repo is public
  if ((res.status === 401 || res.status === 403) && token()) {
    res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data`, {
      headers: { Accept: "application/vnd.github+json" }, cache: "no-store"
    });
    $("token-msg").textContent = "GitHub refused the saved key. Paste a fresh one to edit.";
  }

  if (!res.ok) throw new Error("GitHub API " + res.status);

  return (await res.json())
    .filter((f) => f.type === "file" && f.name.endsWith(".json") && !f.name.startsWith("_"))
    .map((f) => f.name.replace(/\.json$/, ""))
    .filter((n) => !RESERVED.includes(n))
    .sort();
}

async function countRequests(name) {
  try {
    const res = await fetch(`${RELAY}/ideas?site=clients&client=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    return (await res.json()).ideas.length;
  } catch {
    return null;
  }
}

function clientCard({ name, plan, requests }) {
  const card = document.createElement("article");
  card.className = "client-card";

  const title = plan.name || name.toUpperCase();
  const shoot = plan.nextShoot && plan.nextShoot.date
    ? describeShoot(plan.nextShoot.date)
    : "No shoot planned";

  const posts = (plan.posts || []).length;
  const planned = (plan.posts || []).filter((p) => p.status !== "posted").length;

  card.innerHTML = `
    <div class="client-name">${escHtml(title)}</div>
    <div class="client-line">${escHtml(shoot)}</div>
    <div class="client-line">${posts ? `${planned} of ${posts} posts still to go out` : "No posting plan yet"}</div>
    ${requests ? `<span class="client-flag">${requests} request${requests === 1 ? "" : "s"} waiting</span>` : ""}
    <div class="client-links">
      <a class="btn-mini solid" href="../${name}/admin.html">Edit</a>
      <a class="btn-mini" href="../${name}/">Portal</a>
      <a class="btn-mini" href="../${name}/schedule.html">Plan</a>
    </div>
  `;
  return card;
}

function describeShoot(date) {
  const d = new Date(date + "T00:00:00");
  const when = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const days = Math.ceil((d - new Date()) / 86400000);
  if (days > 1) return `Next shoot ${when}, in ${days} days`;
  if (days === 1) return `Next shoot ${when}, tomorrow`;
  if (days === 0) return `Shooting today`;
  return `Last shoot ${when}`;
}

function escHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
