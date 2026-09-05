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

/* A still from each piece, and how it did. Both are optional: a month
   that is still to come has neither, and the page reads as a plan.
   Once they are there the same calendar reads as the report. */
const FRAME_RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";
const frameUrl = (post) =>
  `${FRAME_RELAY}/thumb?client=${encodeURIComponent(currentClient())}&post=${encodeURIComponent(post.thumb)}`;

const countOf = (p, which) => Number(p.how && p.how[which]) || 0;
const hasNumbers = (p) => countOf(p, "views") || countOf(p, "likes") || countOf(p, "shares");

// 12400 reads worse than 12.4k on a card this size
function short(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/.0$/, "") + "m";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/.0$/, "") + "k";
  return String(n);
}
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

    /* The frame sits behind the day. A month of pictures says more
       about what was made than a month of dots ever did. */
    const withFrame = onDay.find((p) => p.thumb);
    if (withFrame) {
      const frame = document.createElement("img");
      frame.className = "cal-frame";
      frame.src = frameUrl(withFrame);
      frame.alt = "";
      frame.loading = "lazy";
      // a frame that will not load must not leave a broken box
      frame.addEventListener("error", () => frame.remove());
      cell.appendChild(frame);
      cell.classList.add("has-frame");
    }

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

  drawMonthTotals(monthPosts);

  for (const p of monthPosts) {
    const d = new Date(p.date + "T00:00:00");
    const card = document.createElement("article");
    card.className = "post-card" + (p.status === "posted" ? " posted" : "");
    card.setAttribute("data-date", p.date);

    card.innerHTML = `
      ${p.thumb ? `<img class="post-frame" src="${esc(frameUrl(p))}" alt="" loading="lazy">` : ""}
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
        ${hasNumbers(p) ? `
          <div class="post-numbers">
            <span><b>${short(countOf(p, "views"))}</b> views</span>
            <span><b>${short(countOf(p, "likes"))}</b> likes</span>
            <span><b>${short(countOf(p, "shares"))}</b> shares</span>
          </div>` : ""}
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

/* What the month did, added up. Only shown once there is something to
   add up, so a month still being filmed does not display three zeros
   and look like a failure. */
function drawMonthTotals(monthPosts) {
  const wrap = $("month-totals");
  if (!wrap) return;

  const counted = monthPosts.filter(hasNumbers);
  if (!counted.length) {
    wrap.hidden = true;
    return;
  }

  const sum = (which) => counted.reduce((t, p) => t + countOf(p, which), 0);

  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="mt"><b>${short(sum("views"))}</b><span>Views</span></div>
    <div class="mt"><b>${short(sum("likes"))}</b><span>Likes</span></div>
    <div class="mt"><b>${short(sum("shares"))}</b><span>Shares</span></div>
    <p class="mt-note">Across ${counted.length} of ${monthPosts.length} post${monthPosts.length === 1 ? "" : "s"}, counted about a month after each went out.</p>
  `;
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
