/* Proposals, from the dashboard
   ------------------------------------------------------------
   Proposals live in this same repo: their pages under p/<slug>/
   and their content under proposals/<slug>.json. Addresses are
   random rather than readable, because a proposal carries prices
   and often a discount meant for one client alone.

   Loaded after dashboard.js, so it shares $, token, escHtml,
   commitFiles and OWNER from there.
   ------------------------------------------------------------ */

const PROPOSAL_SITE = location.origin;

onReady(() => {
  $("prop-create").addEventListener("click", createProposal);
  loadProposals();
});

function newSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function loadProposals() {
  const wrap = $("proposal-list");

  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (token()) headers.Authorization = "Bearer " + token();

    const [filesRes, acceptedRes, seenRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/proposals`,
        { headers, cache: "no-store" }),
      // open only, so clearing a wrong one actually clears it. Reading
      // every state meant a mistaken acceptance could never be undone
      // and the dashboard reported a signed client forever.
      fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?labels=accepted&state=open&per_page=100`,
        { headers, cache: "no-store" }),
      fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?labels=seen&state=all&per_page=100`,
        { headers, cache: "no-store" })
    ]);

    if (!filesRes.ok) throw new Error("GitHub " + filesRes.status);

    const slugs = (await filesRes.json())
      .filter((f) => f.type === "file" && f.name.endsWith(".json") && !f.name.startsWith("_"))
      .map((f) => f.name.replace(/\.json$/, ""));

    // which proposals have come back with an answer
    const accepted = {};
    if (acceptedRes.ok) {
      for (const issue of await acceptedRes.json()) {
        const tag = issue.labels.map((l) => l.name).find((n) => n.startsWith("proposal:"));
        if (!tag) continue;
        const slug = tag.slice("proposal:".length);
        (accepted[slug] = accepted[slug] || []).push({
          number: issue.number,
          title: issue.title.replace(/^Accepted:\s*/, ""),
          when: new Date(issue.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        });
      }
    }

    // how often each proposal has actually been opened
    const seen = {};
    if (seenRes.ok) {
      for (const issue of await seenRes.json()) {
        const tag = issue.labels.map((l) => l.name).find((n) => n.startsWith("proposal:"));
        if (!tag) continue;
        const times = (issue.body || "").match(/Opened (\d+) time/);
        const last = (issue.body || "").match(/Last on (\S+)/);
        seen[tag.slice("proposal:".length)] = {
          times: times ? Number(times[1]) : 0,
          last: last ? last[1] : ""
        };
      }
    }

    if (!slugs.length) {
      wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">No proposals yet.</p>';
      return;
    }

    const rows = await Promise.all(slugs.map(async (slug) => {
      let name = slug;
      try {
        const d = await (await fetch(`../proposals/${slug}.json`, { cache: "no-store" })).json();
        name = d.client || slug;
      } catch { /* an unreadable proposal still deserves a row */ }
      return { slug, name, accepted: accepted[slug] || [], seen: seen[slug] || null };
    }));

    wrap.innerHTML = "";
    for (const r of rows) wrap.appendChild(proposalRow(r));
  } catch (err) {
    console.error("proposals load failed:", err);
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read the proposals (' +
      escHtml(err.message) + ").</p>";
  }
}

function proposalRow({ slug, name, accepted, seen }) {
  const row = document.createElement("div");
  row.className = "pay-row";

  // waiting says nothing. Opened four times and still quiet is a call
  // to make; never opened at all is a different problem entirely,
  // usually that it never arrived.
  const answer = accepted.length
    ? accepted.map((a) => a.title + " · " + a.when).join(" / ")
    : !seen ? "not opened yet"
    : "opened " + seen.times + " time" + (seen.times === 1 ? "" : "s") +
      (seen.last ? ", last " + ago(seen.last) : "");

  row.innerHTML = `
    <span class="who">${escHtml(name)}</span>
    <span class="what">${escHtml(answer)}</span>
  `;
  if (accepted.length || seen) row.querySelector(".what").style.color = "var(--text)";

  const open = link(`${PROPOSAL_SITE}/p/${slug}/`, "Open", true);
  const edit = link("proposal.html#" + encodeURIComponent(slug), "Edit", false);

  const copy = smallButton("Copy link", async () => {
    const url = `${PROPOSAL_SITE}/p/${slug}/`;
    const done = await copyText(url);
    copy.textContent = done ? "Copied" : "Press Ctrl C";
    // always give the button back, whatever happened
    setTimeout(() => { copy.textContent = "Copy link"; }, 1800);
    if (!done) showForManualCopy(row, url);
  });

  const remove = smallButton("Remove", null);
  let armed = false;
  remove.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      remove.textContent = `Delete ${name}?`;
      setTimeout(() => { if (armed) { armed = false; remove.textContent = "Remove"; } }, 5000);
      return;
    }
    if (!token()) { $("prop-msg").textContent = "Save your access key first."; return; }

    remove.disabled = true;
    $("prop-msg").textContent = "Removing...";
    try {
      await commitFiles(null, `Remove the ${name} proposal`,
        [`p/${slug}/index.html`, `proposals/${slug}.json`]);
      $("prop-msg").textContent = "Removed.";
      loadProposals();
    } catch (err) {
      $("prop-msg").textContent = "Could not remove it: " + err.message;
      remove.disabled = false;
      armed = false;
      remove.textContent = "Remove";
    }
  });

  const message = messageButton("proposal", {
    name,
    url: `${PROPOSAL_SITE}/p/${slug}/`
  }, row);

  row.append(open, edit, copy, message, remove);
  if (accepted.length) row.insertBefore(notRealButton(name, accepted, row), remove);
  return row;
}

/* Takes back an acceptance that was never real: a test, a mis-tap, or
   somebody trying the page out. Without this the dashboard reports a
   signed client that is not signed, on the one screen meant to say
   where the business stands. */
function notRealButton(name, accepted, row) {
  const btn = smallButton("Not real", null);
  const many = accepted.length > 1;
  let armed = false;

  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = many ? `Clear all ${accepted.length}?` : "Sure?";
      setTimeout(() => { if (armed) { armed = false; btn.textContent = "Not real"; } }, 5000);
      return;
    }
    armed = false;

    const msg = $("prop-msg");
    if (!token()) { msg.textContent = "Save your access key first."; return; }

    btn.disabled = true;
    msg.textContent = "Taking it back...";

    try {
      for (const a of accepted) await setIssueState(a.number, "closed");
      msg.textContent = many
        ? `${name} is back to waiting, ${accepted.length} acceptances cleared.`
        : `${name} is back to waiting.`;
      loadProposals();
    } catch (err) {
      console.error("could not clear the acceptance:", err);
      msg.textContent = "Could not clear it: " + err.message +
        (/40[13]/.test(err.message) ? " (the key needs Issues read and write)" : "");
      btn.disabled = false;
      btn.textContent = "Not real";
    }
  });

  return btn;
}

/* "last 2 hours ago" tells you whether to pick up the phone. A
   timestamp does not. */
function ago(iso) {
  const then = Date.parse(iso);
  if (isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return mins + " minutes ago";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " hour" + (hours === 1 ? "" : "s") + " ago";
  const days = Math.floor(hours / 24);
  return days + " day" + (days === 1 ? "" : "s") + " ago";
}

function link(href, text, external) {
  const a = document.createElement("a");
  a.className = "btn-mini";
  a.style.padding = "0.25rem 0.7rem";
  a.href = href;
  a.textContent = text;
  if (external) { a.target = "_blank"; a.rel = "noopener"; }
  return a;
}

function smallButton(text, onClick) {
  const b = document.createElement("button");
  b.className = "btn-mini";
  b.style.padding = "0.25rem 0.7rem";
  b.textContent = text;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

async function createProposal() {
  const msg = $("prop-msg");
  const btn = $("prop-create");
  const client = $("prop-client").value.trim();

  if (!token()) { msg.textContent = "Save your access key first."; return; }
  if (!client) { msg.textContent = "Put in the brand name."; return; }

  const prices = [$("prop-p1").value.trim(), $("prop-p2").value.trim(), $("prop-p3").value.trim()];
  if (!prices.some(Boolean)) { msg.textContent = "Put in at least one price."; return; }

  const kind = $("prop-kind") ? $("prop-kind").value : "";

  btn.disabled = true;
  msg.textContent = "Building the proposal...";
  const slug = newSlug();

  try {
    const page = await fetch(`../_proposal/index.html`, { cache: "no-store" });
    if (!page.ok) throw new Error("template not readable (" + page.status + ")");

    await commitFiles({
      [`p/${slug}/index.html`]: await page.text(),
      [`proposals/${slug}.json`]: JSON.stringify(
        blankProposal(client, $("prop-sub").value.trim(), prices, kind), null, 2) + "\n"
    }, `Add the ${client} ${kind === "project" ? "one off " : ""}proposal`);

    msg.innerHTML = `Ready in about a minute at <b>${escHtml(PROPOSAL_SITE + "/p/" + slug + "/")}</b> &middot; ` +
      `<a href="proposal.html#${encodeURIComponent(slug)}">edit the wording</a>`;

    for (const id of ["prop-client", "prop-sub", "prop-p1", "prop-p2", "prop-p3"]) $(id).value = "";
    loadProposals();
  } catch (err) {
    console.error("create proposal failed:", err);
    msg.textContent = "Could not create it: " + err.message +
      (/40[13]/.test(err.message) ? " (the key needs Contents read and write)" : "") +
      (/\b422\b/.test(err.message) ? " (something else was saving at the same moment, try again)" : "");
  } finally {
    btn.disabled = false;
  }
}

/* The wording that repeats from one proposal to the next, with the
   prices dropped in. All of it is editable afterwards. */
/* A monthly deal and a one off job read differently in about fifteen
   places, from the word under every price to the last term. Rewriting
   all of that by hand for every project proposal is exactly the sort
   of thing that stops getting done, so the kind is chosen once and the
   whole document is written to match. Everything stays editable. */
const PROPOSAL_WORDING = {
  monthly: {
    kicker: "Videography Proposal · Monthly",
    per: "per month · VAT incl.",
    names: ["Essential", "Signature", "Rebrand"],
    nums: ["01 · Entry level", "02 · The working month", "03 · The full build"],
    tags: [
      "A steady monthly presence",
      "A full month of content, planned as one",
      "A new identity, then the production to carry it"
    ],
    // a proposal created with empty bullets is not sendable, so it
    // arrives carrying the real offering and he edits from there
    // catalogue keys, so a created proposal opens in the editor with
    // the right boxes already ticked instead of as free text
    features: [
      [["reels", 4], ["photos", 10]],
      [["reels", 10], ["interview", 1], ["photos", 15], ["brainstorm"]],
      [["reels", 10], ["interview", 2], ["photos", 20], ["brainstorm"], ["identity"], ["priority"]]
    ],
    processTitle: "The Shape of a Month",
    steps: [
      { n: "01", title: "Plan", text: "We agree the pieces for the month and the day to film them." },
      { n: "02", title: "Film", text: "One session on site. Everything for the month is captured in that day." },
      { n: "03", title: "Deliver", text: "You receive the finished pieces with the posting guide telling you what goes out and when." }
    ],
    firstNote: {
      title: "What a reel means here",
      body: "Ten reels means ten finished pieces, not ten single unbroken takes. A long continuous take is used when it earns its place."
    },
    portalNote: "Every collaboration comes with a personal portal, included in all packages. The plan for the month, the shoot day, the finished deliverables and the posting calendar all live in one place, updated as we work.",
    terms: [
      { k: "Prices", v: "Per month, VAT included, no hidden production costs" },
      { k: "Deposit", v: "33 percent on the first month, once only, to reserve the shoot" },
      { k: "Balance", v: "On delivery. Every month after is settled in one payment" },
      { k: "Invoices", v: "Payable within 30 days" },
      { k: "Shoot day", v: "One session per month, fixed together in advance" },
      { k: "Client portal", v: "Included in every package, from the first day" },
      { k: "Notice", v: "30 days before the next month" }
    ]
  },
  project: {
    kicker: "Videography Proposal · One off",
    per: "one off · VAT incl.",
    names: ["Essential", "Signature", "Complete"],
    nums: ["01 · The core", "02 · The full day", "03 · The full build"],
    tags: [
      "The day filmed, cleanly",
      "The day filmed, and the pieces to post from it",
      "Everything, from the plan to the last cutdown"
    ],
    features: [
      [["shootday", 1], ["photos", 60]],
      [["shootday", 1], ["reels", 4], ["photos", 150], ["brainstorm"]],
      [["shootday", 1], ["reels", 6], ["photos", 250], ["brainstorm"], ["secondcam"], ["delivery", 14]]
    ],
    processTitle: "The Shape of the Job",
    steps: [
      { n: "01", title: "Plan", text: "We agree what matters on the day and how long it takes to film properly." },
      { n: "02", title: "Film", text: "One day on site, shot around your running order rather than against it." },
      { n: "03", title: "Deliver", text: "The finished work lands in your portal, where you can follow it from the edit to delivery." }
    ],
    firstNote: {
      title: "How long it takes",
      body: "The finished work is delivered within three weeks of the shoot. You can follow where it has got to in your portal rather than having to ask."
    },
    portalNote: "The job comes with a personal portal. The shoot day, what we are filming, where the edit has got to and the delivery all live in one place, updated as we work.",
    terms: [
      { k: "Price", v: "For the job, VAT included, no hidden production costs" },
      { k: "Deposit", v: "50 percent to reserve the date" },
      { k: "Balance", v: "On delivery" },
      { k: "Invoices", v: "Payable within 30 days" },
      { k: "Shoot day", v: "Fixed together, with the length set by what we are filming" },
      { k: "Delivery", v: "Within three weeks of the shoot" },
      { k: "Client portal", v: "Included, from the day it is booked" }
    ]
  }
};


/* The same list the proposal editor ticks, so a proposal created here
   and a proposal edited there always word a thing the same way. */
const CATALOGUE = [
  { key: "reels", what: (n) => n + " planned reels",
    sub: "Chosen and written before the shoot day, filmed in one session." },
  { key: "interview", what: (n) => n + (n === 1 ? " interview reel" : " interview reels"),
    sub: "One of your people on camera, answering a question clients actually ask." },
  { key: "photos", what: (n) => n + " ready to post photographs",
    sub: "Edited, framed for feed and stories, delivered with the reels." },
  { key: "shootday", what: (n) => n === 1 ? "A full shoot day on site" : n + " shoot days on site",
    sub: "Shot around your day rather than against it." },
  { key: "brainstorm", what: () => "A brainstorm session",
    sub: "We plan it together before anything is filmed." },
  { key: "identity", what: () => "A new visual identity",
    sub: "How the brand looks and sounds on camera, agreed before we film." },
  { key: "secondcam", what: () => "A second camera",
    sub: "Two angles on the moments that only happen once." },
  { key: "priority", what: () => "Priority on the calendar",
    sub: "First choice of shoot dates." },
  { key: "delivery", what: (n) => "Delivery within " + n + " days",
    sub: "Counted from the shoot day." }
];

function fromCatalogue(key, n) {
  const item = CATALOGUE.find((i) => i.key === key);
  if (!item) return null;
  const entry = { key, what: item.what(n), sub: item.sub };
  if (n != null) entry.n = n;
  return entry;
}

function blankProposal(client, subtitle, prices, kind) {
  const w = PROPOSAL_WORDING[kind === "project" ? "project" : "monthly"];

  const packages = prices
    .map((price, i) => price ? {
      num: w.nums[i],
      name: w.names[i],
      tag: w.tags[i],
      price: price.startsWith("€") ? price : "€" + price,
      per: w.per,
      featured: i === 2,
      badge: i === 2 ? "Most complete" : "",
      features: (w.features[i] || []).map(([key, n]) => fromCatalogue(key, n)).filter(Boolean)
    } : null)
    .filter(Boolean);

  return {
    studio: "NOIR AU NOIR",
    client,
    subtitle,
    // carried so that accepting one can later build the right shape of
    // portal without asking again
    kind: kind === "project" ? "project" : "",
    kicker: w.kicker,
    footer: "Prepared for " + client + (subtitle ? " " + subtitle : ""),
    intro: { lead: packages.length > 1 ? "Ways to work together" : "How this would work", text: "" },
    packages,
    notes: [
      w.firstNote,
      { title: "Your client portal", body: w.portalNote }
    ],
    process: {
      num: "How it works",
      title: w.processTitle,
      steps: w.steps
    },
    terms: w.terms
  };
}
