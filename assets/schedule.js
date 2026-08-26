/* Posting Plan (shared)
   ------------------------------------------------------------
   Reads the same data/plan.json as the portal. Posts live under
   "posts" and are edited from the admin page, so there is still
   only one file to update.
   ------------------------------------------------------------ */
function currentClient() {
  const parts = location.pathname.split('/').filter(Boolean);
  // the repo name leads the path on the project URL, so step past it
  if (parts[0] === 'clients') parts.shift();
  return (parts[0] || '').toLowerCase();
}
const CLIENT = currentClient();
const DATA_URL = '../data/' + CLIENT + '.json';

const $ = (id) => document.getElementById(id);
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

let posts = [];
let view = new Date();

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    const data = await res.json();
    posts = (data.posts || []).filter((p) => p && p.date).sort((a, b) => a.date.localeCompare(b.date));
    if (data.contact) renderFooter(data.contact);
    const nameEl = document.getElementById("client-name");
    if (nameEl) nameEl.textContent = data.name || CLIENT.toUpperCase();
    document.title = (data.name || CLIENT.toUpperCase()) + " | Posting Plan";
  } catch (err) {
    console.error("schedule load failed:", err);
    $("month-title").textContent = "Could not load the schedule.";
    return;
  }

  // open on the first month that still has something planned
  const next = posts.find((p) => p.status !== "posted") || posts[posts.length - 1];
  if (next) view = new Date(next.date + "T00:00:00");

  $("prev-month").addEventListener("click", () => shiftMonth(-1));
  $("next-month").addEventListener("click", () => shiftMonth(1));
  $("today-month").addEventListener("click", () => { view = new Date(); draw(); });

  draw();
});

function shiftMonth(by) {
  view = new Date(view.getFullYear(), view.getMonth() + by, 1);
  draw();
}

function draw() {
  drawCalendar();
  drawPosts();
}

function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

function drawCalendar() {
  const year = view.getFullYear(), month = view.getMonth();
  $("month-title").textContent = MONTHS[month] + " " + year;

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // week starts on Monday
  const lead = (first.getDay() + 6) % 7;
  const todayIso = iso(new Date());

  const cal = $("cal");
  cal.innerHTML = "";

  for (const d of ["Mo","Tu","We","Th","Fr","Sa","Su"]) {
    const h = document.createElement("div");
    h.className = "cal-head";
    h.textContent = d;
    cal.appendChild(h);
  }

  for (let i = 0; i < lead; i++) {
    cal.appendChild(Object.assign(document.createElement("div"), { className: "cal-cell empty" }));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayIso = iso(new Date(year, month, day));
    const onDay = posts.filter((p) => p.date === dayIso);

    const cell = document.createElement("div");
    cell.className = "cal-cell" + (onDay.length ? " has-posts" : "") + (dayIso === todayIso ? " today" : "");

    const num = document.createElement("span");
    num.className = "cal-num";
    num.textContent = day;
    cell.appendChild(num);

    if (onDay.length) {
      const dots = document.createElement("span");
      dots.className = "cal-dots";
      for (const p of onDay.slice(0, 4)) {
        const dot = document.createElement("span");
        dot.className = "dot " + (p.status === "posted" ? "posted" : "planned");
        dots.appendChild(dot);
      }
      cell.appendChild(dots);
      cell.title = onDay.map((p) => p.title).join(", ");
      cell.addEventListener("click", () => {
        const target = document.querySelector(`[data-date="${dayIso}"]`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    cal.appendChild(cell);
  }
}

function drawPosts() {
  const wrap = $("post-list");
  const year = view.getFullYear(), month = view.getMonth();
  const prefix = year + "-" + String(month + 1).padStart(2, "0");
  const monthPosts = posts.filter((p) => p.date.startsWith(prefix));

  wrap.innerHTML = "";
  if (!monthPosts.length) {
    wrap.innerHTML = `<p class="muted">Nothing planned for ${MONTHS[month]} yet.</p>`;
    $("posts-lede").textContent = "Tap a caption to copy it.";
    return;
  }

  const done = monthPosts.filter((p) => p.status === "posted").length;
  $("posts-lede").textContent =
    `${monthPosts.length} post${monthPosts.length === 1 ? "" : "s"} this month, ${done} already out. Tap a caption to copy it.`;

  for (const p of monthPosts) {
    const d = new Date(p.date + "T00:00:00");
    const card = document.createElement("article");
    card.className = "post-card" + (p.status === "posted" ? " posted" : "");
    card.setAttribute("data-date", p.date);

    card.innerHTML = `
      <div class="post-when">
        <span class="post-day">${d.getDate()}</span>
        <span class="post-dow">${d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
        ${p.time ? `<span class="post-time">${esc(p.time)}</span>` : ""}
      </div>
      <div class="post-body">
        <div class="post-top">
          ${p.platform ? `<span class="post-platform">${esc(p.platform)}</span>` : ""}
          <span class="badge ${p.status === "posted" ? "done" : ""}">${p.status === "posted" ? "Posted" : "Planned"}</span>
        </div>
        <h3 class="post-title">${esc(p.title || "Untitled")}</h3>
        ${p.caption ? `<div class="caption" role="button" tabindex="0" title="Tap to copy">${esc(p.caption)}<span class="copy-hint">copy</span></div>` : ""}
      </div>
    `;

    const cap = card.querySelector(".caption");
    if (cap) {
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(p.caption);
          cap.classList.add("copied");
          cap.querySelector(".copy-hint").textContent = "copied";
          setTimeout(() => {
            cap.classList.remove("copied");
            cap.querySelector(".copy-hint").textContent = "copy";
          }, 1600);
        } catch {
          // clipboard blocked: select the text so it can be copied by hand
          const range = document.createRange();
          range.selectNodeContents(cap);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          cap.querySelector(".copy-hint").textContent = "selected, press copy";
        }
      };
      cap.addEventListener("click", copy);
      cap.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copy(); } });
    }

    wrap.appendChild(card);
  }
}

function renderFooter(contact) {
  if (contact.line) $("contact-line").textContent = contact.line;
  if (contact.email) {
    document.querySelector(".footer .muted").innerHTML =
      `Questions about the plan? <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`;
  }
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
