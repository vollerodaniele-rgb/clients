/* Client Portal (shared)
   ------------------------------------------------------------
   Everything on this page comes from data/plan.json.
   Edit that one file to update the portal.
   ------------------------------------------------------------ */
/* Which client this page belongs to comes from the folder name in
   the URL, so every client folder holds byte identical files and a
   new client needs no code at all. */
function currentClient() {
  const parts = location.pathname.split('/').filter(Boolean);
  // the repo name leads the path on the project URL, so step past it
  if (parts[0] === 'clients') parts.shift();
  return (parts[0] || '').toLowerCase();
}
const CLIENT = currentClient();
const DATA_URL = '../data/' + CLIENT + '.json';

const CONFIG = {
  owner: 'vollerodaniele-rgb',
  repo: 'clients',
  submitUrl: 'https://kresha-idea-box.vollerodaniele.workers.dev',
  site: 'clients'
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", loadPlan);

async function loadPlan() {
  // before the data, so the other pages are tucked away at once rather
  // than showing for as long as the fetch takes
  setupTabs();

  let data;
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    data = await res.json();
  } catch (err) {
    $("tagline").textContent = "Could not load the plan data.";
    console.error("plan load failed:", err);
    return;
  }

  // the example only: everything below then draws a current month
  // without knowing that is what it is doing
  if (data.rolling) rollTheExample(data);

  const name = data.name || CLIENT.toUpperCase();
  $("client-name").textContent = name;
  document.title = name + " | Content Portal";

  $("tagline").textContent = data.tagline || "";
  $("deal-notes").textContent = data.dealNotes || "";

  // an optional line under the tagline, used by the example portal to
  // say it is an example. Built here rather than in the template so
  // every existing client picks it up without being touched.
  if (data.notice) {
    const note = document.createElement("p");
    note.className = "hero-notice";
    note.textContent = data.notice;
    $("tagline").after(note);
  }

  const isProject = data.kind === "project";

  renderDeal(data.deal || []);
  renderShoot(data.nextShoot);
  setupShootPick(data.shootPick, data.rolling);
  renderFilmPlan(data.filmPlan);
  renderMonths(data.months || []);
  renderIntro(data, isProject);
  renderProgress(data.months || []);
  renderResults(data.posts || []);
  renderDocs(data.documents || [], data.deliveries || []);
  renderInvoices(data.invoices || []);
  renderFooter(data.contact, isProject);
  // last, so it can override headings the renders above just set
  if (isProject) setupProject(data);
  else setupPosts(data.posts || []);

  loadRequests();
  if (CONFIG.submitUrl) setupRequestForm();
}

/* ============ THE PAGES OF THE PORTAL ============ */
/* One address, five pages: the month, the posts, the files, the bills
   and the ideas. Which one is open lives in the hash, so a link can
   point straight at billing and a reload stays where it was.

   The pages are all visible in the markup and this is what hides them.
   So a cached copy of the old script, which knows nothing of tabs,
   shows one long page the way the portal used to look, instead of
   leaving four pages hidden. A page cached from before the tabs has
   none of this markup, and everything below finds nothing to do. */

const VIEWS = ["month", "posts", "files", "billing", "ideas"];

// set once the tabs are wired, so the data can move the page later
let showView = () => {};

function setupTabs() {
  const tabs = [...document.querySelectorAll(".pt-tab")];
  if (!tabs.length) return;

  // read each time: a one off hides its posts tab after the data arrives
  const usable = () => tabs.filter((t) => !t.hidden);

  const show = (view, focus) => {
    if (!usable().some((t) => t.dataset.view === view)) view = "month";
    for (const t of tabs) {
      const on = t.dataset.view === view;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      const panel = $("v-" + t.dataset.view);
      if (panel) panel.hidden = !on;
      if (on && focus) t.focus();
    }
    if (location.hash.slice(1) !== view) history.replaceState(null, "", "#" + view);
  };

  for (const t of tabs) {
    t.addEventListener("click", () => { show(t.dataset.view); window.scrollTo(0, 0); });
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const list = usable();
      const step = e.key === "ArrowRight" ? 1 : list.length - 1;
      show(list[(list.indexOf(t) + step) % list.length].dataset.view, true);
    });
  }

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { show(go.dataset.go); window.scrollTo(0, 0); }
  });

  // an address from before the tabs (#billing, #requests) still lands on
  // the page that now holds that section
  const hash = location.hash.slice(1);
  const target = hash && !VIEWS.includes(hash) && document.getElementById(hash);
  const holder = target && target.closest(".pt-view");
  show(holder ? holder.id.slice(2) : hash);
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));
  showView = show;
}

const activeMonth = (months) => months.find((m) => m.status === "active") || null;

function shortDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const fmtNum = (n) => Number(n || 0).toLocaleString("en-GB");

/* The top of the month page: which month, and the state of it in two
   small pills. */
function renderIntro(data, isProject) {
  const title = $("month-title");
  if (!title) return;

  const now = activeMonth(data.months || []);
  const what = (data.project && data.project.what) || "";

  if (isProject) {
    $("month-kicker").textContent = "Your project";
    // the description is a sentence; only a short one reads as a title
    title.textContent = what && what.length <= 60 ? what : "Your film";
  } else {
    $("month-kicker").textContent = "Your month";
    title.textContent = (now && now.label) || (data.filmPlan && data.filmPlan.month) || "Your portal";
  }

  const pills = $("month-pills");
  if (!pills) return;
  const add = (text, cls, id) => {
    const pill = document.createElement("span");
    pill.className = "pt-pill" + (cls ? " " + cls : "");
    pill.textContent = text;
    if (id) pill.id = id;
    pills.appendChild(pill);
  };

  if (!isProject && now) add("Month in progress", "live");

  const shoot = data.nextShoot;
  const pick = data.shootPick;
  // the same test setupShootPick uses, so this pill is only made when
  // something is coming to replace its text
  const asking = pick && pick.asked && (pick.options || []).some((o) => o && o.date);
  if (asking) add("Checking your shoot day", "", "shoot-pill");
  else if (shoot && shoot.date) add("Shoot " + shortDate(shoot.date) + (shoot.time ? ", " + shoot.time : ""));
}

/* This month's reels and photos, as two bars. A one off replaces this
   with its stages, from setupProject. */
function renderProgress(months) {
  const body = $("progress-body");
  if (!body) return;

  const now = activeMonth(months) || months.find((m) => m.status !== "done");
  if (!now) {
    body.innerHTML = `<p class="muted">Progress shows here once the month is planned.</p>`;
    return;
  }

  if ($("progress-meta")) $("progress-meta").textContent = now.label || "";

  const rows = [["Reels", now.reels], ["Photos", now.photos]].filter(([, v]) => v && Number(v.total));
  body.innerHTML = rows.length
    ? `<div class="pt-meters">${rows.map(([label, v]) => meter(label, v)).join("")}</div>`
    : `<p class="muted">Nothing counted for ${esc(now.label || "this month")} yet.</p>`;
}

function meter(label, v) {
  const done = Number(v.done) || 0;
  const total = Number(v.total);
  const pct = Math.min(100, Math.round((done / total) * 100));
  return `
    <div class="pt-meter">
      <div class="pt-meter-top"><span class="pt-meta">${esc(label)}</span><b>${done}<span> / ${total}</span></b></div>
      <span class="bar"><i style="width:${pct}%"></i></span>
    </div>`;
}

/* The latest month that has numbers, as one headline. Hidden until
   there is something counted, so a first month shows no zeros. */
function renderResults(posts) {
  const box = $("results");
  if (!box) return;

  const counted = posts.filter((p) => p && p.date && postCount(p, "views"));
  if (!counted.length) return;

  const latest = counted.map((p) => p.date.slice(0, 7)).sort().pop();
  const inMonth = counted.filter((p) => p.date.startsWith(latest));
  const sum = (which) => inMonth.reduce((t, p) => t + postCount(p, which), 0);
  const best = inMonth.reduce((a, b) => (postCount(b, "views") > postCount(a, "views") ? b : a));
  const month = MONTH_NAMES[Number(latest.slice(5, 7)) - 1];
  const many = inMonth.length > 1;

  box.innerHTML = `
    ${best.thumb ? `
      <figure class="pt-result-frame">
        <img src="${esc(frameUrl(best))}" alt="">
        <span class="pt-badge">${many ? "Best post" : "Post"} &middot; ${esc(shortDate(best.date))}</span>
      </figure>` : ""}
    <div class="pt-result-body">
      <p class="pt-eyebrow">How ${esc(month)} went</p>
      <p class="pt-big">${fmtNum(sum("views"))}</p>
      <p class="pt-lede">views across ${inMonth.length} post${many ? "s" : ""}.${many
        ? ` The best one had ${fmtNum(postCount(best, "views"))} on its own.` : ""}</p>
      <div class="pt-result-stats">
        <div><b>${fmtNum(sum("likes"))}</b><span class="pt-meta">Likes</span></div>
        <div><b>${fmtNum(sum("shares"))}</b><span class="pt-meta">Shares</span></div>
        <button type="button" class="btn-month" data-go="posts">See each post</button>
      </div>
    </div>`;

  const img = box.querySelector("img");
  if (img) img.addEventListener("error", () => img.closest("figure").remove());
  box.classList.toggle("has-frame", Boolean(best.thumb));
  box.hidden = false;
}

/* ============ POSTS ============ */
/* The posting plan, which used to be its own page. What goes out on
   which day, a frame from each piece, the caption ready to copy, and
   once a month has passed, how each one did. */

const frameUrl = (post) =>
  `${CONFIG.submitUrl}/thumb?client=${encodeURIComponent(CLIENT)}&post=${encodeURIComponent(post.thumb)}`;

/* A post can carry one file or, for a carousel, several. Older plans
   hold a single `video`, newer ones a `videos` list; both are read. */
const filesOf = (p) => {
  if (!p) return [];
  const list = Array.isArray(p.videos) ? p.videos : (p.video ? [p.video] : []);
  return list.filter((f) => f && f.month && f.name);
};

const fileUrl = (f) =>
  `${CONFIG.submitUrl}/file?client=${encodeURIComponent(CLIENT)}` +
  `&month=${encodeURIComponent(f.month)}&name=${encodeURIComponent(f.name)}`;

const hasFilm = (p) => filesOf(p).length > 0;

// a carousel of stills should not offer to download "the film"
const isPicture = (name) => /\.(jpe?g|png|webp|heic|heif|tiff?|gif)$/i.test(name);
const fileWord = (files) =>
  files.every((f) => isPicture(f.name)) ? "photo" : files.some((f) => isPicture(f.name)) ? "file" : "film";

function downloads(p) {
  const files = filesOf(p);
  if (!files.length) return "";

  if (files.length === 1) {
    const f = files[0];
    return `<a class="post-film" href="${esc(fileUrl(f))}" download="${esc(f.name)}">` +
      `Download the ${fileWord(files)}<span>${esc(f.name)}</span></a>`;
  }

  // one pill per piece, numbered in the order they go out
  const word = fileWord(files);
  return `<div class="post-films">` + files.map((f, i) =>
    `<a class="post-film" href="${esc(fileUrl(f))}" download="${esc(f.name)}">` +
    `${word === "file" ? "Piece" : word[0].toUpperCase() + word.slice(1)} ${i + 1} of ${files.length}` +
    `<span>${esc(f.name)}</span></a>`
  ).join("") + `</div>`;
}

const postCount = (p, which) => Number(p.how && p.how[which]) || 0;
const postHasNumbers = (p) => postCount(p, "views") || postCount(p, "likes") || postCount(p, "shares");

// 12400 reads worse than 12.4k on a card this size
function shortNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

const isoDay = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
  "-" + String(d.getDate()).padStart(2, "0");

let postList = [];
let postView = new Date();

function setupPosts(posts) {
  if (!$("cal") || !$("post-list")) return;

  postList = posts.filter((p) => p && p.date).sort((a, b) => a.date.localeCompare(b.date));

  // open on the first month that still has something planned
  const next = postList.find((p) => p.status !== "posted") || postList[postList.length - 1];
  if (next) postView = new Date(next.date + "T00:00:00");

  $("prev-month").addEventListener("click", () => shiftPostMonth(-1));
  $("next-month").addEventListener("click", () => shiftPostMonth(1));
  $("today-month").addEventListener("click", () => { postView = new Date(); drawPostMonth(); });

  drawPostMonth();
}

function shiftPostMonth(by) {
  postView = new Date(postView.getFullYear(), postView.getMonth() + by, 1);
  drawPostMonth();
}

function drawPostMonth() {
  const year = postView.getFullYear();
  const month = postView.getMonth();
  const prefix = year + "-" + String(month + 1).padStart(2, "0");
  const monthPosts = postList.filter((p) => p.date.startsWith(prefix));

  $("cal-title").textContent = MONTH_NAMES[month] + " " + year;
  drawPostCalendar(year, month);
  drawPostTotals(monthPosts);
  drawPostCards(monthPosts, MONTH_NAMES[month]);
}

function drawPostCalendar(year, month) {
  const cal = $("cal");
  cal.innerHTML = "";

  for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
    cal.appendChild(Object.assign(document.createElement("div"), { className: "cal-head", textContent: d }));
  }

  // weeks start on Monday
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) {
    cal.appendChild(Object.assign(document.createElement("div"), { className: "cal-cell empty" }));
  }

  const today = isoDay(new Date());
  const days = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= days; day++) {
    const iso = isoDay(new Date(year, month, day));
    const onDay = postList.filter((p) => p.date === iso);

    const cell = document.createElement(onDay.length ? "button" : "div");
    cell.className = "cal-cell" + (onDay.length ? " has-posts" : "") + (iso === today ? " today" : "");
    cell.innerHTML = `<span class="cal-num">${day}</span>`;

    /* Not lazy: absolutely positioned inside a grid cell, a lazy frame
       sat at 0x0 and never loaded. A month is a dozen small images. */
    const withFrame = onDay.find((p) => p.thumb);
    if (withFrame) {
      const frame = document.createElement("img");
      frame.className = "cal-frame";
      frame.src = frameUrl(withFrame);
      frame.alt = "";
      frame.addEventListener("error", () => frame.remove());
      cell.appendChild(frame);
      cell.classList.add("has-frame");
    }

    if (onDay.length) {
      cell.type = "button";
      const views = onDay.reduce((t, p) => t + postCount(p, "views"), 0);
      if (views) cell.insertAdjacentHTML("beforeend", `<span class="cal-views">${shortNum(views)}</span>`);
      if (onDay.some(hasFilm)) {
        cell.classList.add("has-film");
        cell.insertAdjacentHTML("beforeend", '<span class="cal-film" aria-hidden="true">↓</span>');
      }

      const dots = document.createElement("span");
      dots.className = "cal-dots";
      for (const p of onDay.slice(0, 4)) {
        dots.appendChild(Object.assign(document.createElement("span"), {
          className: "dot " + (p.status === "posted" ? "posted" : "planned")
        }));
      }
      cell.appendChild(dots);
      cell.setAttribute("aria-label", day + " " + MONTH_NAMES[month] + ": " +
        onDay.map((p) => p.title || "a post").join(", ") +
        (onDay.some(hasFilm)
          ? ", " + onDay.reduce((n, p) => n + filesOf(p).length, 0) + " to download"
          : ""));
      cell.addEventListener("click", () => {
        const card = document.querySelector(`.post-card[data-date="${iso}"]`);
        if (!card) return;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.remove("flash");
        void card.offsetWidth;
        card.classList.add("flash");
      });
    }

    cal.appendChild(cell);
  }
}

/* What the month did, added up. Only once there is something to add up,
   so a month still being filmed does not show three zeros. */
function drawPostTotals(monthPosts) {
  const wrap = $("month-totals");
  const counted = monthPosts.filter(postHasNumbers);
  wrap.hidden = !counted.length;
  if (!counted.length) return;

  const sum = (which) => counted.reduce((t, p) => t + postCount(p, which), 0);
  wrap.innerHTML = ["views", "likes", "shares"].map((k) => `
    <div><b>${fmtNum(sum(k))}</b><span class="pt-meta">${k}</span></div>`).join("");
}

function drawPostCards(monthPosts, monthName) {
  const wrap = $("post-list");
  wrap.innerHTML = "";

  if (!monthPosts.length) {
    wrap.innerHTML = `<p class="muted pt-empty">Nothing planned for ${esc(monthName)} yet.</p>`;
    $("posts-lede").textContent = "Tap a day to jump to its post. Tap a caption to copy it.";
    return;
  }

  const done = monthPosts.filter((p) => p.status === "posted").length;
  $("posts-lede").textContent =
    `${monthPosts.length} post${monthPosts.length === 1 ? "" : "s"} in ${monthName}, ${done} already out. ` +
    "Tap a caption to copy it.";

  for (const p of monthPosts) {
    const d = new Date(p.date + "T00:00:00");
    const card = document.createElement("article");
    card.className = "post-card" + (p.status === "posted" ? " posted" : "");
    card.dataset.date = p.date;

    card.innerHTML = `
      ${p.thumb ? `<img class="post-frame" src="${esc(frameUrl(p))}" alt="">` : ""}
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
        ${p.title ? `<h3 class="post-title">${esc(p.title)}</h3>` : ""}
        ${postHasNumbers(p) ? `
          <div class="post-numbers">
            <span><b>${shortNum(postCount(p, "views"))}</b> views</span>
            <span><b>${shortNum(postCount(p, "likes"))}</b> likes</span>
            <span><b>${shortNum(postCount(p, "shares"))}</b> shares</span>
          </div>` : ""}
        ${p.caption ? `<div class="caption" role="button" tabindex="0" title="Tap to copy">${esc(p.caption)}<span class="copy-hint">copy</span></div>` : ""}
        ${downloads(p)}
      </div>
    `;

    const frame = card.querySelector(".post-frame");
    if (frame) frame.addEventListener("error", () => frame.remove());

    const cap = card.querySelector(".caption");
    if (cap) wireCopy(cap, p.caption);

    wrap.appendChild(card);
  }
}

function wireCopy(cap, text) {
  const hint = cap.querySelector(".copy-hint");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      cap.classList.add("copied");
      hint.textContent = "copied";
      setTimeout(() => { cap.classList.remove("copied"); hint.textContent = "copy"; }, 1600);
    } catch {
      // clipboard blocked: select the text so it can be copied by hand
      const range = document.createRange();
      range.selectNodeContents(cap);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      hint.textContent = "selected, press copy";
    }
  };
  cap.addEventListener("click", copy);
  cap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copy(); }
  });
}

/* ============ IDEAS & REQUESTS ============ */

async function loadRequests() {
  const grid = $("request-grid");
  const status = $("request-status");
  try {
    // read through the relay: it is authenticated, so visitors never
    // run into GitHub's limit for anonymous requests
    const res = await fetch(
      `${CONFIG.submitUrl}/ideas?site=${encodeURIComponent(CONFIG.site)}&client=${encodeURIComponent(CLIENT)}`, {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("relay " + res.status);
    const { ideas } = await res.json();

    if (!ideas.length) {
      status.textContent = "No requests yet. The floor is yours.";
      return;
    }
    grid.innerHTML = "";
    for (const r of ideas) {
      grid.appendChild(requestCard(r.text, r.author));
    }
  } catch (err) {
    status.textContent = "Could not load requests right now.";
    console.error("requests load failed:", err);
  }
}

function requestCard(text, author) {
  const card = document.createElement("article");
  card.className = "request-card";
  card.innerHTML = `
    <p class="request-body">${esc(text.slice(0, 300))}</p>
    <p class="request-meta">from ${esc(author)}</p>
  `;
  return card;
}

function setupRequestForm() {
  const form = $("request-form");
  form.hidden = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("request-msg");
    const btn = $("request-submit");
    const idea = $("request-text").value.trim();
    const name = $("request-name").value.trim();

    if (idea.length < 10) {
      msg.textContent = "Give it a few more words (at least 10 characters).";
      return;
    }

    btn.disabled = true;
    msg.textContent = "Sending...";

    try {
      const res = await fetch(CONFIG.submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: CONFIG.site, client: CLIENT, idea, name,
          website: $("request-website").value
        })
      });
      if (!res.ok) throw new Error("relay " + res.status);

      msg.textContent = "Received! It is in our planning now.";
      form.reset();

      const grid = $("request-grid");
      const status = $("request-status");
      if (status) status.remove();
      grid.prepend(requestCard(idea, name || "anonymous"));
    } catch (err) {
      console.error("request submit failed:", err);
      msg.textContent = "Could not send right now. Try again in a minute.";
    } finally {
      btn.disabled = false;
    }
  });
}

function renderDeal(tiles) {
  const wrap = $("deal-tiles");
  wrap.innerHTML = "";
  for (const t of tiles) {
    const el = document.createElement("div");
    el.className = "tile";
    el.innerHTML = `<div class="num">${esc(t.num)}</div><div class="lbl">${esc(t.label)}</div>`;
    wrap.appendChild(el);
  }
}

function renderShoot(shoot) {
  const card = $("shoot-card");
  if (!shoot || !shoot.date) {
    card.innerHTML = `<p class="muted">Next shoot date to be planned. Watch this space.</p>`;
    return;
  }

  const d = new Date(shoot.date + "T00:00:00");
  const dateStr = longDate(shoot.date);
  const days = Math.ceil((d - new Date()) / 86400000);
  const countdown =
    days > 1 ? `<div class="num">${days}</div><div class="lbl">days to go</div>` :
    days === 1 ? `<div class="num">1</div><div class="lbl">day to go</div>` :
    days === 0 ? `<div class="num">🎬</div><div class="lbl">today</div>` :
    `<div class="num">✓</div><div class="lbl">wrapped</div>`;

  card.innerHTML = `
    <div>
      <div class="shoot-date">${esc(dateStr)}${shoot.time ? " · " + esc(shoot.time) : ""}</div>
      <div class="shoot-meta">${esc(shoot.location || "")}</div>
      ${shoot.focus ? `<div class="shoot-meta">${esc(shoot.focus)}</div>` : ""}
    </div>
    <div class="shoot-count">${countdown}</div>
    ${(shoot.checklist && shoot.checklist.length)
      ? `<div class="shoot-checklist">${shoot.checklist.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`
      : ""}
  `;
}

/* ============ ONE OFF PROJECTS ============ */
/* A retainer is organised around time: months repeating, a posting
   plan, progress bars per month. A one off is organised around
   progress: there is one job, and the only thing the client wants to
   know is where it is and when they get it. Same portal, same files,
   one field in the data decides which sections apply. Anything without
   a kind is a retainer, so every client that predates this is
   untouched. */

const DEFAULT_STAGES = ["Booked", "Filmed", "Editing", "Delivered"];

function setupProject(data) {
  const project = data.project || {};

  // months and the posting plan measure a repeating deal, so neither
  // means anything for a single job
  const months = $("months");
  if (months) months.hidden = true;
  const nav = document.querySelector(".hero-nav");
  if (nav) nav.hidden = true;

  // one job has no posting plan, and its first page is not a month
  const postsTab = document.querySelector('.pt-tab[data-view="posts"]');
  if (postsTab) {
    postsTab.hidden = true;
    $("v-posts").hidden = true;
    if (location.hash === "#posts") showView("month");
  }
  const firstTab = document.querySelector('.pt-tab[data-view="month"]');
  if (firstTab) firstTab.firstChild.textContent = "Project";

  const dealHead = document.querySelector("#deal .section-head h2");
  if (dealHead) dealHead.textContent = "What you get";
  const filmTitle = $("filmplan-title");
  if (filmTitle) filmTitle.textContent = "What we film";

  renderStages(project);
}

/* The strip that answers "where is my film" without an email. */
function renderStages(project) {
  const stages = (project.stages || []).filter(Boolean);
  const list = stages.length ? stages : DEFAULT_STAGES;
  const at = Math.max(0, Math.min(list.length - 1, Number(project.stage) || 0));
  const done = at === list.length - 1;

  const body = $("progress-body");
  // on the tabbed page a short description is already the page title
  const title = $("month-title");
  const said = body && title && title.textContent === project.what;

  const strip = `
    ${project.what && !said ? `<p class="section-lede">${esc(project.what)}</p>` : ""}
    <div class="stage-row">
      ${list.map((name, i) => `
        <div class="stage ${i < at ? "done" : i === at ? "now" : ""}">
          <span class="stage-name">${esc(name)}</span>
        </div>
      `).join("")}
    </div>
    ${deliveryLine(project, done)}
  `;

  // the tabbed page has a pane waiting for this; an older cached page
  // does not, and gets its own section as before
  if (body) {
    body.innerHTML = strip;
    const meta = $("progress-meta");
    if (meta) meta.textContent = list[at];
    return;
  }

  const section = document.createElement("section");
  section.id = "progress";
  section.className = "section";
  section.innerHTML = `<div class="section-head"><h2>Where We Are</h2></div>${strip}`;

  const deal = $("deal");
  if (deal) deal.before(section);
}

function deliveryLine(project, done) {
  if (done) {
    return `<p class="stage-note">${project.deliverBy
      ? "Delivered on " + esc(longDate(project.deliverBy)) + "."
      : "Delivered."}</p>`;
  }
  if (!project.deliverBy) return "";
  return `<p class="stage-note">Delivered by ${esc(longDate(project.deliverBy))}.</p>`;
}

/* ============ PICK A SHOOT DATE ============ */
/* Rather than a mail thread, the portal can offer a few dates and let
   the client tap one. The tap rides the same relay as a request but is
   labelled "shoot" instead of "idea", so it pings Telegram straight
   away and never shows up on the requests wall. Nothing is written to
   the site from here: the pick is an issue until it is confirmed in
   the admin, so this page needs no key of any kind. */

const PICK_SITE = "shoot";
// the first line of a pick is written to be read by both a person and
// this regex, so the admin can lift the date straight back out
const PICK_RE = /Picked (\d{4}-\d{2}-\d{2})(?: at (\d{1,2}:\d{2}))?/;

// the option the client has tapped, held until they press Send
let picked = null;

/* ============ AN EXAMPLE THAT NEVER GOES STALE ============ */
/* The demo is the only thing a prospect can look at before buying, and
   it was written around one month. Left alone it becomes a portal
   showing last spring, which says the opposite of what it is there to
   say.

   So everything dated in it is moved on at render time, by however
   many whole months it takes to make the month marked active the month
   it actually is. Whole months, so the shape stays intact: two months
   delivered, this one running, the invoices matching.

   Nothing is written anywhere. The file keeps the dates he typed, and
   only the example carries the flag that turns this on. */

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
                     "July", "August", "September", "October", "November", "December"];

function readMonthLabel(label) {
  const m = String(label || "").match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const at = MONTH_NAMES.indexOf(m[1]);
  return at < 0 ? null : { y: Number(m[2]), m: at };
}

const writeMonthLabel = (y, m) => MONTH_NAMES[m] + " " + y;

/* Adding months to a date has one trap: the 31st of a month followed
   by a 30 day one. Clamped to the last day rather than rolling into
   the next month, which would put an invoice in the wrong period. */
function addMonths(iso, by) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;

  const y = Number(m[1]), mo = Number(m[2]) - 1, day = Number(m[3]);
  const target = new Date(Date.UTC(y, mo + by, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));

  const pad = (n) => String(n).padStart(2, "0");
  return target.getUTCFullYear() + "-" + pad(target.getUTCMonth() + 1) + "-" + pad(target.getUTCDate());
}

/* How far the whole file has to move: from the month it calls active
   to the month it is. */
function monthsToNow(data) {
  const active = (data.months || []).find((m) => m.status === "active")
    || (data.months || [])[(data.months || []).length - 1];
  const from = readMonthLabel(active && active.label) || readMonthLabel(data.filmPlan && data.filmPlan.month);
  if (!from) return 0;

  const now = new Date();
  return (now.getFullYear() - from.y) * 12 + (now.getMonth() - from.m);
}

function rollTheExample(data) {
  const by = monthsToNow(data);
  if (!by) return data;

  for (const m of data.months || []) {
    const at = readMonthLabel(m.label);
    if (at) m.label = writeMonthLabel(...(() => {
      const d = new Date(Date.UTC(at.y, at.m + by, 1));
      return [d.getUTCFullYear(), d.getUTCMonth()];
    })());
  }

  if (data.filmPlan) {
    const at = readMonthLabel(data.filmPlan.month);
    if (at) {
      const d = new Date(Date.UTC(at.y, at.m + by, 1));
      data.filmPlan.month = writeMonthLabel(d.getUTCFullYear(), d.getUTCMonth());
    }
  }

  for (const post of data.posts || []) post.date = addMonths(post.date, by);

  for (const inv of data.invoices || []) {
    inv.issued = addMonths(inv.issued, by);
    const at = readMonthLabel(inv.period);
    if (at) {
      const d = new Date(Date.UTC(at.y, at.m + by, 1));
      inv.period = writeMonthLabel(d.getUTCFullYear(), d.getUTCMonth());
    }
  }

  if (data.nextShoot && data.nextShoot.date) {
    data.nextShoot.date = addMonths(data.nextShoot.date, by);
  }

  if (data.shootPick && Array.isArray(data.shootPick.options)) {
    data.shootPick.options = data.shootPick.options.map((o) => ({ ...o, date: addMonths(o.date, by) }));
  }

  return data;
}

/* An example portal has to keep working without anybody tending it.

   Its offered dates were fixed, so they quietly went into the past and
   a prospect opening it was asked to pick a day that had already been.
   With `rolling` set, a date that has gone is walked forward a week at
   a time until it is ahead again, which keeps its weekday: a Tuesday
   stays a Tuesday.

   Only the example sets that flag. A real client's dates must be
   exactly the ones he offered, and shifting those would have somebody
   booking a shoot he never proposed. */
function rollForward(options) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = options.map((o) => new Date(o.date + "T00:00:00"));
  if (days.some((d) => isNaN(d.getTime()))) return options;

  /* The whole set moves by the same number of weeks, decided by the
     earliest one. Rolling each date on its own closed the gaps between
     them: a tenth, a fifteenth and a twenty second became two offers
     on the same day. Whole weeks, so every date keeps its weekday. */
  const earliest = new Date(Math.min(...days));
  let weeks = 0;
  while (new Date(earliest).setDate(earliest.getDate() + weeks * 7) <= +today) weeks++;
  if (!weeks) return options;

  const pad = (n) => String(n).padStart(2, "0");
  return options.map((o, i) => {
    const d = days[i];
    d.setDate(d.getDate() + weeks * 7);
    return { ...o, date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) };
  });
}

async function setupShootPick(pick, rolling) {
  let options = ((pick && pick.options) || []).filter((o) => o && o.date);
  if (!pick || !pick.asked || !options.length) return;

  /* The month shift has already moved these. Anything still behind is
     a day early in the month that has been and gone, so it is walked
     on by whole weeks as well.

     Either flag will do. A page and its script are cached separately,
     so for ten minutes after a change one version of this file can
     meet the other version of the data, and reading only one of them
     is how the example quietly stopped rolling at all. */
  if (rolling || (pick && pick.rolling)) options = rollForward(options);

  // while we are asking, the picker stands in for the shoot card
  const card = $("shoot-card");
  card.hidden = true;

  const wrap = document.createElement("div");
  wrap.id = "pick-wrap";
  card.after(wrap);

  const already = await loadExistingPick();
  if (already) {
    drawPicked(wrap, already);
    setShootHeading("Next shoot", "Your pick is in", false, already);
    return;
  }
  drawOptions(wrap, options, pick.note);
  // the one thing on the page that is waiting on the client
  setShootHeading("Needs you", "Pick your shoot day", true);
}

function setShootHeading(kicker, title, waiting, chosen) {
  if ($("shoot-kicker")) $("shoot-kicker").textContent = kicker;
  if ($("shoot-title")) $("shoot-title").textContent = title;
  if ($("needs-dot")) $("needs-dot").hidden = !waiting;
  const pill = $("shoot-pill");
  if (pill) pill.textContent = waiting ? "Shoot day not set yet"
    : "Shoot " + shortDate(chosen.date) + (chosen.time ? ", " + chosen.time : "");
}

/* A pick that was already made shows as picked, so reloading the page
   or opening it on another phone cannot book the shoot twice. */
async function loadExistingPick() {
  try {
    const res = await fetch(
      `${CONFIG.submitUrl}/ideas?site=${PICK_SITE}&client=${encodeURIComponent(CLIENT)}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("relay " + res.status);
    const { ideas } = await res.json();
    for (const item of ideas || []) {
      const m = String(item.text || "").match(PICK_RE);
      if (m) return { date: m[1], time: m[2] || "" };
    }
  } catch (err) {
    console.error("pick load failed:", err);
  }
  return null;
}

function drawOptions(wrap, options, note) {
  wrap.innerHTML = `
    <p class="pick-lede">${esc(note || "Pick whichever date suits you and we lock it in.")}</p>
    <div class="pick-grid"></div>
    <div class="pick-confirm" hidden>
      <p class="pick-chosen"></p>
      <button type="button" class="btn-send pick-send">Send</button>
    </div>
    <p class="form-msg" id="pick-msg" role="status"></p>
  `;

  picked = null;
  const grid = wrap.querySelector(".pick-grid");
  for (const opt of options) grid.appendChild(pickCard(wrap, opt));

  wrap.querySelector(".pick-send").addEventListener("click", () => {
    if (picked) sendPick(wrap, picked);
  });
}

function pickCard(wrap, opt) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pick-card";
  btn.setAttribute("aria-pressed", "false");
  btn.innerHTML = `
    <span class="pick-day">${esc(longDate(opt.date))}</span>
    ${opt.time ? `<span class="pick-meta">${esc(opt.time)}</span>` : ""}
    ${opt.location ? `<span class="pick-meta">${esc(opt.location)}</span>` : ""}
    ${opt.focus ? `<span class="pick-meta">${esc(opt.focus)}</span>` : ""}
    <span class="pick-cta">Pick this one</span>
  `;

  // tapping only chooses, it never sends. Sending is the button below,
  // so a mis-tap costs nothing and the choice is plain to see.
  btn.addEventListener("click", () => selectPick(wrap, btn, opt));

  return btn;
}

function selectPick(wrap, btn, opt) {
  picked = opt;

  for (const card of wrap.querySelectorAll(".pick-card")) {
    const on = card === btn;
    card.classList.toggle("chosen", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
    const cta = card.querySelector(".pick-cta");
    if (cta) cta.textContent = on ? "Chosen" : "Pick this one";
  }

  wrap.querySelector(".pick-chosen").textContent =
    longDate(opt.date) + (opt.time ? " at " + opt.time : "") + ". Send it and we lock it in.";
  wrap.querySelector(".pick-confirm").hidden = false;
  wrap.querySelector("#pick-msg").textContent = "";
}

async function sendPick(wrap, opt) {
  const msg = wrap.querySelector("#pick-msg");
  const buttons = wrap.querySelectorAll(".pick-card");
  const send = wrap.querySelector(".pick-send");
  buttons.forEach((b) => { b.disabled = true; });
  if (send) send.disabled = true;
  msg.textContent = "Sending...";

  const idea =
    `Picked ${opt.date}${opt.time ? " at " + opt.time : ""} (${longDate(opt.date)})` +
    (opt.location ? `\nWhere: ${opt.location}` : "") +
    (opt.focus ? `\nFocus: ${opt.focus}` : "");

  try {
    const res = await fetch(CONFIG.submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: PICK_SITE, client: CLIENT, idea, name: "" })
    });
    if (!res.ok) throw new Error("relay " + res.status);
    drawPicked(wrap, { date: opt.date, time: opt.time || "" });
    setShootHeading("Next shoot", "Your pick is in", false, opt);
  } catch (err) {
    console.error("pick submit failed:", err);
    msg.textContent = "Could not send that right now. Try again in a minute.";
    buttons.forEach((b) => { b.disabled = false; });
    if (send) send.disabled = false;
  }
}

function drawPicked(wrap, chosen) {
  wrap.innerHTML = `
    <div class="pick-done">
      <p class="pick-kicker">Your pick is in</p>
      <div class="shoot-date">${esc(longDate(chosen.date))}${chosen.time ? " · " + esc(chosen.time) : ""}</div>
      <p class="pick-meta">Thanks. We confirm it shortly and this page fills in with the full details.</p>
    </div>
  `;
}

function longDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function renderFilmPlan(plan) {
  const list = $("plan-list");
  list.innerHTML = "";
  if (!plan || !plan.items || !plan.items.length) {
    list.innerHTML = `<li><span class="plan-what muted">Shot list for the next shoot lands here soon.</span></li>`;
    return;
  }
  if (plan.month) {
    $("filmplan-title").textContent = "What we film in " + plan.month;
  }
  plan.items.forEach((item, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="plan-num">${String(i + 1).padStart(2, "0")}</span>
      <span>
        <span class="plan-what">${esc(item.what)}</span>
        ${item.note ? `<div class="plan-note">${esc(item.note)}</div>` : ""}
      </span>
    `;
    list.appendChild(li);
  });
}

function renderMonths(months) {
  const wrap = $("month-list");
  // the tabbed page dropped this list; the progress pane covers this month
  if (!wrap) return;
  wrap.innerHTML = "";

  // a heading over nothing looks broken. On day one this is simply not
  // filled in yet, and saying so reads as in progress rather than wrong.
  if (!months.length) {
    wrap.innerHTML = `<p class="muted">The first month appears here once we have planned it together.</p>`;
    return;
  }

  for (const m of months) {
    const badgeClass =
      m.status === "done" ? "done" :
      m.status === "active" ? "active" : "";
    const badgeText =
      m.status === "done" ? "Delivered" :
      m.status === "active" ? "In progress" : "Planned";

    const card = document.createElement("div");
    card.className = "month-card";
    card.innerHTML = `
      <div class="month-top">
        <span class="month-title">${esc(m.label)}</span>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      ${bar("Reels", m.reels)}
      ${bar("Photos", m.photos)}
      ${m.notes ? `<p class="month-notes">${esc(m.notes)}</p>` : ""}
    `;
    wrap.appendChild(card);
  }
}

function bar(label, v) {
  if (!v || !v.total) return "";
  // a total typed before a done would otherwise divide by nothing
  const done = Number(v.done) || 0;
  const pct = Math.min(100, Math.round((done / v.total) * 100));
  return `
    <div class="progress-row">
      <span class="plabel">${esc(label)}</span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="pcount">${done} / ${v.total}</span>
    </div>
  `;
}

/* The finished work, month by month. Files are listed from storage
   rather than from the data file, so a month is right the moment
   something is added to it and there is nothing to keep in step.

   Each month opens on a tap and fetches only then, so a client with a
   year of deliveries does not pay for twelve lists to see one. */
function renderDeliveries(deliveries) {
  const wrap = $("doc-grid");
  if (!deliveries.length) return;

  const box = document.createElement("div");
  box.className = "delivery-list";

  for (const d of deliveries.filter((x) => x && x.month)) {
    const item = document.createElement("div");
    item.className = "delivery";

    const head = document.createElement("button");
    head.type = "button";
    head.className = "delivery-head";
    head.innerHTML = `
      <span class="delivery-month">${esc(d.label || d.month)}</span>
      <span class="delivery-count"></span>
      <svg class="delivery-arrow" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;

    const body = document.createElement("div");
    body.className = "delivery-body";
    body.hidden = true;

    if (d.note) {
      const note = document.createElement("p");
      note.className = "delivery-note";
      note.textContent = d.note;
      body.appendChild(note);
    }

    const files = document.createElement("div");
    files.className = "delivery-files";
    files.innerHTML = `<p class="muted">Loading...</p>`;
    body.appendChild(files);

    let loaded = false;
    head.addEventListener("click", async () => {
      const open = head.getAttribute("aria-expanded") !== "true";
      head.setAttribute("aria-expanded", open ? "true" : "false");
      head.classList.toggle("open", open);
      body.hidden = !open;
      if (open && !loaded) {
        loaded = true;
        await fillDelivery(d.month, files, head.querySelector(".delivery-count"));
      }
    });

    item.append(head, body);
    box.appendChild(item);
  }

  wrap.appendChild(box);
}

async function fillDelivery(month, files, counter) {
  try {
    const res = await fetch(
      `${CONFIG.submitUrl}/delivery?client=${encodeURIComponent(CLIENT)}&month=${encodeURIComponent(month)}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(String(res.status));
    const list = (await res.json()).files || [];

    if (!list.length) {
      files.innerHTML = `<p class="muted">Nothing here yet.</p>`;
      return;
    }

    counter.textContent = list.length + (list.length === 1 ? " file" : " files");
    files.innerHTML = "";

    const href = (name) => `${CONFIG.submitUrl}/file?client=${encodeURIComponent(CLIENT)}` +
      `&month=${encodeURIComponent(month)}&name=${encodeURIComponent(name)}`;

    for (const f of list) {
      const a = document.createElement("a");
      a.className = "delivery-file";
      a.href = href(f.name);
      a.innerHTML = `
        <span class="delivery-name">${esc(f.name)}</span>
        <span class="delivery-size">${esc(readableSize(f.size))}</span>
      `;
      files.appendChild(a);
    }

    // always, including for a single file: a row that happens to be a
    // link does not read as something you can take away
    files.appendChild(downloadAll(list, href));
  } catch (err) {
    console.error("delivery load failed:", err);
    files.innerHTML = `<p class="muted">Could not load these right now.</p>`;
  }
}

/* Starts every file, one after another, rather than handing over a zip.
   A zip would have to be built somewhere, and building one out of
   gigabytes of video is exactly the kind of work that does not belong
   in front of a waiting client. Browsers ask once whether to allow
   several downloads, then get on with it. */
function downloadAll(list, href) {
  const wrap = document.createElement("div");
  wrap.className = "delivery-all";

  const many = list.length > 1;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-send";
  btn.textContent = many ? "Download all " + list.length : "Download";

  const note = document.createElement("span");
  note.className = "delivery-size";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    for (let i = 0; i < list.length; i++) {
      if (many) note.textContent = "Starting " + (i + 1) + " of " + list.length;
      const a = document.createElement("a");
      a.href = href(list[i].name);
      a.download = list[i].name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // spaced out, or the browser treats the burst as a popup
      if (many) await new Promise((r) => setTimeout(r, 700));
    }
    note.textContent = many
      ? "All " + list.length + " started. Check your downloads."
      : "Started. Check your downloads.";
    btn.disabled = false;
  });

  wrap.append(btn, note);
  return wrap;
}

function readableSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function renderDocs(docs, deliveries) {
  const wrap = $("doc-grid");
  wrap.innerHTML = "";

  renderDeliveries(deliveries || []);

  if (!docs.length) {
    if (!(deliveries || []).length) {
      wrap.innerHTML = `<p class="muted">Contracts and finished work appear here as they are ready.</p>`;
    }
    return;
  }

  for (const doc of docs) {
    const a = document.createElement("a");
    a.className = "doc-card" + (doc.url ? "" : " pending");
    if (doc.url) {
      a.href = doc.url;
      a.target = "_blank";
      a.rel = "noopener";
    }
    a.innerHTML = `
      <div class="doc-type">${esc(doc.type || "File")}</div>
      <div class="doc-title">${esc(doc.title)}</div>
      <div class="doc-note">${esc(doc.note || "")}${doc.url ? "" : " · link coming soon"}</div>
    `;
    wrap.appendChild(a);
  }
}

function renderInvoices(invoices) {
  const tbody = $("invoice-rows");
  tbody.innerHTML = "";
  if (!invoices.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No invoices yet.</td></tr>`;
    return;
  }
  for (const inv of invoices) {
    const cls = ["paid", "open", "upcoming"].includes(inv.status) ? inv.status : "upcoming";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(inv.number)}</td>
      <td>${esc(inv.period)}</td>
      <td>${esc(inv.issued || "")}</td>
      <td><span class="pill ${cls}">${esc(inv.status)}</span></td>
      <td>${inv.url ? `<a href="${esc(inv.url)}" target="_blank" rel="noopener">View</a>` : ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderFooter(contact) {
  if (!contact) return;
  $("contact-line").textContent = contact.line || "NOIR AU NOIR";

  /* The line under it, asking whether they had questions and giving an
     address, is gone. A client who has this page already knows how to
     reach us, and it read like a sign-off on a newsletter.

     Emptied rather than left alone, because a page cached from before
     this change still carries the old sentence in its markup. */
  const line = document.querySelector(".footer .muted");
  if (line) line.remove();
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
