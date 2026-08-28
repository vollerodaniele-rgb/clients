/* Loaded with a timestamp to dodge the ten minute cache, so this
   file can arrive after the document is already parsed. Waiting for an
   event that has been and gone would leave a blank page. */
function onReady(fn) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
  else fn();
}

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
const RESERVED = ["admin", "assets", "data", "_template", "p", "proposals", "_proposal", "i", "boxes", "_box", "uploads"];

const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem(TOKEN_KEY) || "";

onReady(() => {
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

  const options = $("client-options");
  if (options) {
    options.innerHTML = "";
    for (const n of names) {
      const opt = document.createElement("option");
      opt.value = n;
      options.appendChild(opt);
    }
  }
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

function describeStage(project) {
  const p = project || {};
  const stages = (p.stages || []).filter(Boolean);
  const list = stages.length ? stages : ["Booked", "Filmed", "Editing", "Delivered"];
  const at = Math.max(0, Math.min(list.length - 1, Number(p.stage) || 0));
  const where = list[at];
  return at === list.length - 1
    ? where
    : where + (p.deliverBy ? ", due " + p.deliverBy : "");
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

  // a one off job has no posting plan to report on, so the card shows
  // how far the work has got instead
  const isProject = plan.kind === "project";
  const posts = (plan.posts || []).length;
  const planned = (plan.posts || []).filter((p) => p.status !== "posted").length;
  const second = isProject
    ? describeStage(plan.project)
    : posts ? `${planned} of ${posts} posts still to go out` : "No posting plan yet";

  card.innerHTML = `
    <div class="client-name">${escHtml(title)}</div>
    <div class="client-line">${escHtml(shoot)}</div>
    <div class="client-line">${escHtml(second)}</div>
    ${requests ? `<span class="client-flag">${requests} request${requests === 1 ? "" : "s"} waiting</span>` : ""}
    <div class="client-links">
      <a class="btn-mini solid" href="../${name}/admin.html">Edit</a>
      <a class="btn-mini" href="../${name}/">Portal</a>
      ${isProject ? "" : `<a class="btn-mini" href="../${name}/schedule.html">Plan</a>`}
    </div>
    <p class="form-msg card-msg"></p>
  `;

  const links = card.querySelector(".client-links");
  links.appendChild(messageButton("portal", {
    name: plan.name || name,
    url: `${location.origin}/${name}/`
  }, links));
  links.appendChild(removeButton(name, card));
  return card;
}

/* Removing takes the whole client away, so it asks twice and names
   what it is about to delete. The commit stays in the history, so a
   mistake can still be undone. */
function removeButton(name, card) {
  const btn = document.createElement("button");
  btn.className = "btn-mini";
  btn.textContent = "Remove";
  let armed = false;

  btn.addEventListener("click", async () => {
    const msg = card.querySelector(".card-msg");

    if (!armed) {
      armed = true;
      btn.textContent = `Delete ${name}?`;
      msg.textContent = "This removes the portal, the plan and the admin.";
      setTimeout(() => {
        if (!armed) return;
        armed = false;
        btn.textContent = "Remove";
        msg.textContent = "";
      }, 5000);
      return;
    }

    if (!token()) { msg.textContent = "Save your access key first."; return; }

    btn.disabled = true;
    msg.textContent = "Removing...";

    try {
      await deleteClient(name);
      msg.textContent = "Removed.";
      card.style.opacity = "0.4";
      loadClients();
    } catch (err) {
      console.error("remove failed:", err);
      msg.textContent = "Could not remove it: " + err.message;
      btn.disabled = false;
      armed = false;
      btn.textContent = "Remove";
    }
  });

  return btn;
}

async function deleteClient(name) {
  const headers = {
    "Authorization": "Bearer " + token(),
    "Accept": "application/vnd.github+json"
  };

  // whatever the folder actually holds, so nothing is left behind
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(name)}`,
    { headers, cache: "no-store" }
  );

  const paths = res.ok
    ? (await res.json()).filter((f) => f.type === "file").map((f) => f.path)
    : [];
  paths.push(`data/${name}.json`);

  await commitFiles(null, `Remove ${name}`, paths);
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

/* ============ ADDING A CLIENT ============ */
/* Writes the four files as a single commit, so a client is never
   left half created if something fails partway. */

const TEMPLATE_FILES = ["index.html", "schedule.html", "admin.html"];

onReady(() => {
  const nameInput = $("new-name");
  const slugInput = $("new-slug");
  const preview = $("new-preview");

  const showPreview = () => {
    const s = slugify(slugInput.value || nameInput.value);
    preview.textContent = "clients.noiraunoir.com/" + (s || "<address>") + "/";
  };

  // the address follows the name until it is edited by hand
  let slugTouched = false;
  nameInput.addEventListener("input", () => {
    if (!slugTouched) slugInput.value = slugify(nameInput.value);
    showPreview();
  });
  slugInput.addEventListener("input", () => { slugTouched = true; showPreview(); });

  $("create-client").addEventListener("click", createClient);
});

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

async function createClient() {
  const msg = $("create-msg");
  const btn = $("create-client");
  const displayName = $("new-name").value.trim();
  const slug = slugify($("new-slug").value || displayName);

  if (!token()) { msg.textContent = "Save your access key first."; return; }
  if (!displayName) { msg.textContent = "Give the client a name."; return; }
  if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(slug)) {
    msg.textContent = "That address will not work. Use letters and numbers, for example fema.";
    return;
  }
  if (RESERVED.includes(slug)) {
    msg.textContent = `"${slug}" is used by the site itself. Pick another address.`;
    return;
  }

  btn.disabled = true;
  msg.textContent = "Building the portal...";

  try {
    const existing = await listClientNames();
    if (existing.includes(slug)) {
      msg.textContent = `There is already a client at /${slug}/.`;
      btn.disabled = false;
      return;
    }

    const pages = await Promise.all(TEMPLATE_FILES.map(async (f) => {
      const res = await fetch(`../_template/${f}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`template ${f} is not readable (${res.status})`);
      return [`${slug}/${f}`, await res.text()];
    }));

    const files = Object.fromEntries(pages);
    const kind = $("new-kind") ? $("new-kind").value : "";
    files[`data/${slug}.json`] = JSON.stringify(blankPlan(displayName, kind), null, 2) + "\n";

    await commitFiles(files, `Add ${displayName} as a client`);

    msg.innerHTML = `<b>${escHtml(displayName)}</b> is ready. ` +
      `It goes live in about a minute at clients.noiraunoir.com/${escHtml(slug)}/ ` +
      `<a href="../${escHtml(slug)}/admin.html">Open its admin</a>`;
    $("new-name").value = "";
    $("new-slug").value = "";
    loadClients();
  } catch (err) {
    console.error("create client failed:", err);
    msg.textContent = "Could not create it: " + err.message +
      (/40[13]/.test(err.message) ? " (the key needs Contents read and write)" : "");
  } finally {
    btn.disabled = false;
  }
}

function blankPlan(displayName, kind) {
  const plan = {
    name: displayName.toUpperCase(),
    tagline: "",
    dealNotes: "",
    deal: [],
    nextShoot: { date: "", time: "", location: "", focus: "", checklist: [] },
    filmPlan: { month: "", items: [] },
    months: [],
    documents: [],
    invoices: [],
    posts: [],
    contact: { line: displayName.toUpperCase() + " x NOIR AU NOIR", email: "info@noiraunoir.com", note: "" }
  };

  // a one off starts with the stages already in place, so the portal
  // says something the moment it exists
  if (kind === "project") {
    plan.kind = "project";
    plan.project = {
      what: "",
      stages: ["Booked", "Filmed", "Editing", "Delivered"],
      stage: 0,
      deliverBy: ""
    };
  }

  return plan;
}

/* One commit holding every change, built with the git data API.
   `files` is a map of path to content to write, `removePaths` a list
   of paths to delete. Doing both in a single commit means a client is
   never half added or half removed. */
/* GitHub can answer "where is main" with a position that is a moment
   out of date, usually just after something else has pushed. The
   commit then looks like it is not a fast forward and the branch
   update comes back 422. Nothing is wrong and nothing was written, so
   the cure is simply to look again and redo it. Each attempt re-reads
   the branch, so a stale answer corrects itself. */
async function commitFiles(files, message, removePaths, repo) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await commitOnce(files, message, removePaths, repo);
    } catch (err) {
      if (attempt >= 3 || !/\b422\b/.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

async function commitOnce(files, message, removePaths, repo) {
  const api = `https://api.github.com/repos/${OWNER}/${repo || REPO}/git`;
  const headers = {
    "Authorization": "Bearer " + token(),
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };

  const call = async (path, init) => {
    const res = await fetch(api + path, { headers, ...init });
    if (!res.ok) throw new Error("GitHub " + res.status + " on " + path);
    return res.json();
  };

  const ref = await call("/ref/heads/main", {});
  const baseCommit = await call("/commits/" + ref.object.sha, {});

  const tree = await call("/trees", {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: [
        ...Object.entries(files || {}).map(([path, content]) => ({
          path, mode: "100644", type: "blob", content
        })),
        // a null sha is how the tree API says "drop this file"
        ...(removePaths || []).map((path) => ({
          path, mode: "100644", type: "blob", sha: null
        }))
      ]
    })
  });

  const commit = await call("/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] })
  });

  await call("/refs/heads/main", {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha })
  });
}

/* ============ MONEY ============ */
/* Amounts never touch the client data files, because those pages are
   public. They live in a separate private repo that only a request
   carrying the key can read, so a visitor here sees nothing at all. */

const MONEY_REPO = "studio-private";
const MONEY_FILE = "money.json";

let money = { entries: [] };
let moneySha = null;

onReady(() => {
  const today = new Date();
  $("pay-date").value = today.getFullYear() + "-" +
    String(today.getMonth() + 1).padStart(2, "0") + "-" +
    String(today.getDate()).padStart(2, "0");

  $("pay-add").addEventListener("click", addPayment);
  loadMoney();
});

async function loadMoney() {
  const msg = $("money-msg");

  if (!token()) {
    $("money-totals").innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to see the money.</p>';
    return;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${MONEY_REPO}/contents/${MONEY_FILE}`,
      { headers: { Authorization: "Bearer " + token(), Accept: "application/vnd.github+json" }, cache: "no-store" }
    );

    if (res.status === 404) {
      // nothing recorded yet, or the private repo is not there yet
      money = { entries: [] };
      moneySha = null;
      msg.textContent = "No money file yet. Adding the first payment creates it.";
      drawMoney();
      return;
    }
    if (!res.ok) throw new Error(String(res.status));

    const file = await res.json();
    moneySha = file.sha;
    money = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, "")))));
    if (!Array.isArray(money.entries)) money.entries = [];
    msg.textContent = "";
    drawMoney();
  } catch (err) {
    console.error("money load failed:", err);
    $("money-totals").innerHTML = "";
    msg.textContent = err.message === "403" || err.message === "401"
      ? "The key cannot read the private money repo yet."
      : "Could not load the money file (" + err.message + ").";
  }
}

function drawMoney() {
  const now = new Date();
  const year = now.getFullYear();
  const thisMonth = year + "-" + String(now.getMonth() + 1).padStart(2, "0");

  const paid = money.entries.filter((e) => e.status === "paid");
  const open = money.entries.filter((e) => e.status !== "paid");

  const sum = (list) => list.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const paidThisYear = sum(paid.filter((e) => String(e.date).startsWith(String(year))));
  const paidThisMonth = sum(paid.filter((e) => String(e.date).startsWith(thisMonth)));
  const outstanding = sum(open);

  // anything unpaid past the thirty day term
  const overdue = open.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return (now - d) / 86400000 > 30;
  });

  $("money-totals").innerHTML = `
    <div class="total"><div class="num">${euro(paidThisYear)}</div><div class="lbl">Paid in ${year}</div></div>
    <div class="total quiet"><div class="num">${euro(paidThisMonth)}</div><div class="lbl">This month</div></div>
    <div class="total quiet"><div class="num">${euro(outstanding)}</div><div class="lbl">Outstanding${overdue.length ? ", " + overdue.length + " overdue" : ""}</div></div>
  `;

  const list = $("money-list");
  list.innerHTML = "";
  const recent = [...money.entries].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);

  for (const e of recent) {
    const row = document.createElement("div");
    row.className = "pay-row" + (e.status === "paid" ? "" : " open");
    row.innerHTML = `
      <span class="when">${escHtml(e.date)}</span>
      <span class="who">${escHtml(e.client || "")}</span>
      <span class="what">${escHtml(e.what || "")}</span>
      <span class="amt">${euro(e.amount)}</span>
    `;

    const action = document.createElement("button");
    action.className = "btn-mini";
    action.style.padding = "0.25rem 0.7rem";
    action.textContent = e.status === "paid" ? "Undo" : "Mark paid";
    action.addEventListener("click", async () => {
      e.status = e.status === "paid" ? "open" : "paid";
      await saveMoney(e.status === "paid" ? "Mark paid" : "Mark open");
    });

    const remove = document.createElement("button");
    remove.className = "btn-mini";
    remove.style.padding = "0.25rem 0.7rem";
    remove.textContent = "Remove";
    let armed = false;
    remove.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        remove.textContent = "Sure?";
        setTimeout(() => { if (armed) { armed = false; remove.textContent = "Remove"; } }, 4000);
        return;
      }
      money.entries = money.entries.filter((x) => x !== e);
      await saveMoney("Remove a payment");
    });

    row.append(action, remove);
    list.appendChild(row);
  }

  if (money.entries.length > recent.length) {
    const more = document.createElement("p");
    more.className = "muted";
    more.style.cssText = "font-size:0.8rem;margin-top:0.6rem";
    more.textContent = `${money.entries.length - recent.length} older entries not shown, still counted in the totals.`;
    list.appendChild(more);
  }
}

async function addPayment() {
  const msg = $("money-msg");
  const amount = Number($("pay-amount").value);
  const entry = {
    date: $("pay-date").value,
    client: $("pay-client").value.trim().toLowerCase(),
    what: $("pay-what").value.trim(),
    amount,
    status: $("pay-status").value
  };

  if (!token()) { msg.textContent = "Save your access key first."; return; }
  if (!entry.date) { msg.textContent = "Pick a date."; return; }
  if (!(amount > 0)) { msg.textContent = "Put in an amount."; return; }

  money.entries.push(entry);
  const ok = await saveMoney(`Add ${entry.client || "payment"} ${entry.amount}`);
  if (ok) {
    $("pay-what").value = "";
    $("pay-amount").value = "";
  }
}

async function saveMoney(message) {
  const msg = $("money-msg");
  msg.textContent = "Saving...";

  try {
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(money, null, 2) + "\n")))
    };
    if (moneySha) body.sha = moneySha;

    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${MONEY_REPO}/contents/${MONEY_FILE}`,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token(),
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) throw new Error(String(res.status));
    moneySha = (await res.json()).content.sha;
    msg.textContent = "Saved.";
    drawMoney();
    return true;
  } catch (err) {
    console.error("money save failed:", err);
    msg.textContent = "Could not save (" + err.message + ")" +
      (/40[134]/.test(err.message) ? ": the key needs Contents read and write on the private repo." : ".");
    await loadMoney();
    return false;
  }
}

function euro(n) {
  return "€" + Math.round(Number(n) || 0).toLocaleString("nl-BE");
}

/* ============ COPYING, AND THE MESSAGE TO SEND ============ */

/* Copying should just work. The modern clipboard call needs a secure
   page, a real click and a focused document, and throws quietly when
   any of that is missing, so fall back to the old select and copy
   trick before giving up. */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the older way */ }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* Last resort: put the text on screen, already selected, so the
   keyboard can take it. */
function showForManualCopy(row, text) {
  let box = row.querySelector(".manual-copy");
  if (!box) {
    box = document.createElement("textarea");
    box.className = "manual-copy";
    box.readOnly = true;
    box.rows = text.length > 90 ? 4 : 1;
    box.style.cssText = "flex-basis:100%;margin-top:0.5rem;background:var(--bg);" +
      "border:1px solid var(--text);border-radius:8px;color:var(--text);" +
      "font-family:var(--font-body);font-size:0.82rem;padding:0.5rem 0.7rem;resize:vertical";
    row.appendChild(box);
  }
  box.value = text;
  box.focus();
  box.select();
}

/* The line you would otherwise type by hand every time. Written to be
   pasted straight into WhatsApp, so it is short and says what the
   person can do with the link. */
function composeMessage(kind, { name, url, title }) {
  const who = name ? `Hi ${greetable(name)},` : "Hi,";

  if (kind === "portal") {
    return `${who}\n\nYour portal is live: ${url}\n\n` +
      `You will find the plan for the month, the shoot date and what we are filming, ` +
      `plus the posting plan with the captions ready to copy.\n\n` +
      `Anything you would like us to film, drop it in the requests box at the bottom ` +
      `and it comes straight to me.`;
  }

  if (kind === "proposal") {
    return `${who}\n\nHere is the proposal: ${url}\n\n` +
      `Three ways we could work together, with what is included in each and what it costs. ` +
      `If one of them fits, press the button on it and I will come back to you the same day.`;
  }

  if (kind === "box") {
    return `${title || "The idea box"} is open: ${url}\n\n` +
      `Send an idea in a line of text, a picture or a voice message. ` +
      `No account, no sign up, it takes ten seconds.`;
  }

  return url;
}

/* A button that copies that message, used by clients, proposals and
   idea boxes alike. */
function messageButton(kind, details, row) {
  const btn = document.createElement("button");
  btn.className = "btn-mini";
  btn.style.padding = "0.25rem 0.7rem";
  btn.textContent = "Message";
  btn.title = "Copy a ready to send message with the link";

  btn.addEventListener("click", async () => {
    const text = composeMessage(kind, details);
    const done = await copyText(text);
    btn.textContent = done ? "Copied" : "Press Ctrl C";
    setTimeout(() => { btn.textContent = "Message"; }, 1800);
    if (!done) showForManualCopy(row, text);
  });

  return btn;
}

/* Portal titles are set in capitals because that is how they look on
   the page. Shouting at someone in a message is a different matter, so
   an all-caps name gets softened for the greeting. */
function greetable(name) {
  const s = String(name).trim();
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
}
