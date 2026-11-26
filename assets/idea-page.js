/* An idea deck, as a page
   ------------------------------------------------------------
   What used to go out as a PowerPoint: the cover, the hook, who we
   are, the three pillars, the concept, examples, the moodboard and
   the ask. It reads ideas/<slug>.json, where <slug> is the folder
   this page sits in (i/<slug>/), and the pictures beside it in
   ideas/<slug>/. Anything left empty in the dashboard is simply not
   shown, and the section numbers close up around it.
   ------------------------------------------------------------ */

const SLUG = (location.pathname.match(/\/i\/([^/]+)\/?/) || [])[1] || "";
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = (text) => String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("");
const filled = (list) => (list || []).filter((x) => x && String(typeof x === "string" ? x : x.text || x.url || x.src || "").trim());

async function load() {
  const main = $("idea");
  if (!SLUG) { main.innerHTML = '<p class="idea-loading">This link is not complete.</p>'; return; }

  let d;
  try {
    const res = await fetch(`../../ideas/${encodeURIComponent(SLUG)}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    d = await res.json();
  } catch (err) {
    console.error("idea failed:", err);
    main.innerHTML = '<p class="idea-loading">This page could not be opened just now. Try again in a minute.</p>';
    return;
  }

  document.title = (d.client ? d.client + " | " : "") + "Noir au Noir";
  const tag = esc((d.format || "Proposal") + " / Noir au Noir");
  let phase = 0;
  const head = () => {
    phase += 1;
    return `<div class="idea-bar"><span>${tag}</span><span>PHASE:${String(phase).padStart(2, "0")}</span></div>`;
  };

  const out = [];

  // the cover
  out.push(`
    <section class="idea-cover">
      <p class="idea-kicker">${esc(d.kicker || "Proposal")}</p>
      <div class="idea-rule"></div>
      <h1 class="idea-client">${esc(d.client || "")}</h1>
      <div class="idea-rule"></div>
      <p class="idea-format">${esc(d.format || "")}<br>Noir au Noir</p>
    </section>`);

  if (String(d.hook || "").trim()) {
    out.push(`<section class="idea-sec">${head()}<blockquote class="idea-quote">${esc(d.hook)}</blockquote></section>`);
  }

  if (d.intro && String(d.intro.text || "").trim()) {
    out.push(`<section class="idea-sec">${head()}
      <h2 class="idea-h">${esc(d.intro.title || "Introduction")}</h2>
      <div class="idea-text">${paras(d.intro.text)}</div></section>`);
  }

  const pillars = filled(d.pillars && d.pillars.items);
  if (pillars.length) {
    out.push(`<section class="idea-sec">${head()}
      ${d.pillars.title ? `<h2 class="idea-h idea-serif">${esc(d.pillars.title)}</h2>` : ""}
      <div class="idea-pillars">${pillars.map((p, i) => `
        <div class="idea-pillar"><b>${String(i + 1).padStart(2, "0")}</b><p>${esc(p.text)}</p></div>`).join("")}
      </div></section>`);
  }

  const points = filled(d.concept && d.concept.points);
  if (points.length) {
    out.push(`<section class="idea-sec">${head()}
      <div class="idea-split">
        <h2 class="idea-h">${esc((d.concept && d.concept.title) || "The concept")}</h2>
        <ul class="idea-points">${points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      </div></section>`);
  }

  const videos = filled(d.examples && d.examples.videos);
  if (videos.length) {
    out.push(`<section class="idea-sec">${head()}
      <h2 class="idea-h idea-serif">${esc((d.examples && d.examples.title) || "Example")}</h2>
      <div class="idea-videos">${videos.map(videoBlock).join("")}</div>
      ${d.examples.note ? `<p class="idea-note">${esc(d.examples.note)}</p>` : ""}</section>`);
  }

  const pics = filled(d.moodboard && d.moodboard.images);
  if (pics.length) {
    out.push(`<section class="idea-sec">${head()}
      <h2 class="idea-h idea-serif">${esc((d.moodboard && d.moodboard.title) || "Moodboard")}</h2>
      <div class="idea-mood">${pics.map((p) => `
        <button type="button" class="idea-pic" data-src="${esc(picUrl(p.src))}">
          <img src="${esc(picUrl(p.src))}" alt="${esc(p.caption || "")}">
          ${p.caption ? `<span>${esc(p.caption)}</span>` : ""}
        </button>`).join("")}</div></section>`);
  }

  if (String(d.closing || "").trim()) {
    out.push(`<section class="idea-sec">${head()}<blockquote class="idea-quote">${esc(d.closing)}</blockquote></section>`);
  }

  // the ask: a call, or a reply
  const cta = d.cta || {};
  const subject = encodeURIComponent((d.client ? d.client + ": " : "") + ((d.format || "Your idea")));
  out.push(`<section class="idea-sec idea-end">${head()}
    <h2 class="idea-ready">${esc(cta.title || "Ready?")}</h2>
    <div class="idea-answer" id="idea-answer">
      <p class="idea-ask">What do you think of the idea?</p>
      <div class="idea-acts">
        <button type="button" class="btn-send" id="idea-like">I like it</button>
        <button type="button" class="idea-ghost" id="idea-change">Change something</button>
      </div>
      <div class="idea-change-box" id="idea-change-box" hidden>
        <textarea id="idea-note" maxlength="1000" rows="4" placeholder="What would you change?"></textarea>
        <button type="button" class="btn-send" id="idea-send">Send</button>
      </div>
      <p class="idea-answer-msg" id="idea-answer-msg" role="status"></p>
    </div>
    <div class="idea-acts idea-acts-small">
      <a class="idea-ghost" href="/call/">${esc(cta.button || "Book a call")}</a>
      <a class="idea-ghost" href="mailto:info@noiraunoir.com?subject=${subject}">Write to us</a>
    </div>
    <p class="idea-by">NOIR AU NOIR</p>
  </section>`);

  main.innerHTML = out.join("");
  noteOpened();
  wireAnswer(d, subject);

  for (const b of main.querySelectorAll(".idea-pic")) {
    b.addEventListener("click", () => openBox(b.dataset.src, b.querySelector("img").alt));
  }
}

/* "I like it" is one tap; "Change something" asks what first. Either
   lands in the studio's Telegram. If the relay cannot be reached the
   same answer opens as a mail instead, so a tap is never lost. */
function wireAnswer(d, subject) {
  const msg = $("idea-answer-msg");
  const box = $("idea-change-box");

  const send = async (answer, note) => {
    msg.textContent = "Sending...";
    for (const b of document.querySelectorAll("#idea-answer button")) b.disabled = true;
    try {
      const res = await fetch("https://kresha-idea-box.vollerodaniele.workers.dev/idea/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: SLUG, answer, note: note || "" })
      });
      if (!res.ok) throw new Error(String(res.status));
      $("idea-answer").querySelector(".idea-acts").hidden = true;
      box.hidden = true;
      msg.textContent = answer === "like"
        ? "Thank you. We will be in touch to plan it."
        : "Thank you. We will look at it and come back to you.";
    } catch (err) {
      console.error("answer failed:", err);
      const body = answer === "like" ? "I like the idea." : "I would change: " + (note || "");
      location.href = "mailto:info@noiraunoir.com?subject=" + subject + "&body=" + encodeURIComponent(body);
      msg.textContent = "Your mail app should open with the answer in it.";
      for (const b of document.querySelectorAll("#idea-answer button")) b.disabled = false;
    }
  };

  $("idea-like").addEventListener("click", () => send("like"));
  $("idea-change").addEventListener("click", () => {
    box.hidden = !box.hidden;
    if (!box.hidden) $("idea-note").focus();
  });
  $("idea-send").addEventListener("click", () => {
    const note = $("idea-note").value.trim();
    if (!note) { msg.textContent = "Write what you would change first."; $("idea-note").focus(); return; }
    send("change", note);
  });
}

/* Tells the studio it was opened, exactly as a proposal does: a
   Telegram message with the device, the area and the network, and a
   count on the dashboard. Not your own visits (an admin key in this
   browser means it is you), and only after five seconds on screen, so
   a WhatsApp or mail link preview fetching the page does not count. */
function noteOpened() {
  try {
    if (localStorage.getItem("clients-admin-token")) return;
  } catch { /* storage blocked, carry on */ }
  setTimeout(() => {
    if (document.visibilityState !== "visible") return;
    fetch("https://kresha-idea-box.vollerodaniele.workers.dev/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: SLUG, kind: "idea" })
    }).catch(() => { /* never let this bother the reader */ });
  }, 5000);
}

/* pictures sit beside the deck's file; a full address is used as it is */
function picUrl(src) {
  src = String(src || "");
  return /^https?:\/\//.test(src) ? src : "../../" + src.replace(/^\/+/, "");
}

/* YouTube and Vimeo play right on the page; anything else becomes a
   card that opens it. youtube-nocookie keeps YouTube's tracking off
   until somebody presses play. */
function videoBlock(v) {
  const url = String(v.url || "").trim();
  const label = v.label ? `<p class="idea-vlabel">${esc(v.label)}</p>` : "";
  let id = (url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/) || [])[1];
  if (id) {
    return `<div class="idea-video"><div class="idea-frame"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0"
      title="${esc(v.label || "Example")}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>${label}</div>`;
  }
  id = (url.match(/vimeo\.com\/(?:video\/)?(\d+)/) || [])[1];
  if (id) {
    return `<div class="idea-video"><div class="idea-frame"><iframe src="https://player.vimeo.com/video/${esc(id)}?dnt=1"
      title="${esc(v.label || "Example")}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>${label}</div>`;
  }
  if (!/^https?:\/\//.test(url)) return "";
  return `<a class="idea-video idea-vcard" href="${esc(url)}" target="_blank" rel="noopener">
    <span>&#9654;</span><b>${esc(v.label || "Watch the example")}</b></a>`;
}

function openBox(src, alt) {
  $("idea-box-img").src = src;
  $("idea-box-img").alt = alt || "";
  $("idea-box").hidden = false;
}
function closeBox() { $("idea-box").hidden = true; $("idea-box-img").removeAttribute("src"); }
$("idea-box").addEventListener("click", (e) => { if (e.target.id !== "idea-box-img") closeBox(); });
addEventListener("keydown", (e) => { if (e.key === "Escape") closeBox(); });

load();
