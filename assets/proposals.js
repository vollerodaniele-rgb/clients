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

document.addEventListener("DOMContentLoaded", () => {
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

    const [filesRes, acceptedRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/proposals`,
        { headers, cache: "no-store" }),
      fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?labels=accepted&state=all&per_page=100`,
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
          title: issue.title.replace(/^Accepted:\s*/, ""),
          when: new Date(issue.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        });
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
      return { slug, name, accepted: accepted[slug] || [] };
    }));

    wrap.innerHTML = "";
    for (const r of rows) wrap.appendChild(proposalRow(r));
  } catch (err) {
    console.error("proposals load failed:", err);
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read the proposals (' +
      escHtml(err.message) + ").</p>";
  }
}

function proposalRow({ slug, name, accepted }) {
  const row = document.createElement("div");
  row.className = "pay-row";

  const answer = accepted.length
    ? accepted.map((a) => a.title + " · " + a.when).join(" / ")
    : "waiting";

  row.innerHTML = `
    <span class="who">${escHtml(name)}</span>
    <span class="what">${escHtml(answer)}</span>
  `;
  if (accepted.length) row.querySelector(".what").style.color = "var(--text)";

  const open = link(`${PROPOSAL_SITE}/p/${slug}/`, "Open", true);
  const edit = link("proposal.html#" + encodeURIComponent(slug), "Edit", false);

  const copy = smallButton("Copy link", async () => {
    try {
      await navigator.clipboard.writeText(`${PROPOSAL_SITE}/p/${slug}/`);
      copy.textContent = "Copied";
      setTimeout(() => { copy.textContent = "Copy link"; }, 1600);
    } catch {
      copy.textContent = "Copy by hand: " + PROPOSAL_SITE + "/p/" + slug + "/";
    }
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

  row.append(open, edit, copy, remove);
  return row;
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

  btn.disabled = true;
  msg.textContent = "Building the proposal...";
  const slug = newSlug();

  try {
    const page = await fetch(`../_proposal/index.html`, { cache: "no-store" });
    if (!page.ok) throw new Error("template not readable (" + page.status + ")");

    await commitFiles({
      [`p/${slug}/index.html`]: await page.text(),
      [`proposals/${slug}.json`]: JSON.stringify(
        blankProposal(client, $("prop-sub").value.trim(), prices), null, 2) + "\n"
    }, `Add the ${client} proposal`);

    msg.innerHTML = `Ready in about a minute at <b>${escHtml(PROPOSAL_SITE + "/p/" + slug + "/")}</b> &middot; ` +
      `<a href="proposal.html#${encodeURIComponent(slug)}">edit the wording</a>`;

    for (const id of ["prop-client", "prop-sub", "prop-p1", "prop-p2", "prop-p3"]) $(id).value = "";
    loadProposals();
  } catch (err) {
    console.error("create proposal failed:", err);
    msg.textContent = "Could not create it: " + err.message +
      (/40[13]/.test(err.message) ? " (the key needs Contents read and write)" : "");
  } finally {
    btn.disabled = false;
  }
}

/* The wording that repeats from one proposal to the next, with the
   prices dropped in. All of it is editable afterwards. */
function blankProposal(client, subtitle, prices) {
  const names = ["Essential", "Signature", "Rebrand"];
  const tags = [
    "A steady monthly presence",
    "A full month of content, planned as one",
    "A new identity, then the production to carry it"
  ];
  const nums = ["01 · Entry level", "02 · The working month", "03 · The full build"];

  const packages = prices
    .map((price, i) => price ? {
      num: nums[i],
      name: names[i],
      tag: tags[i],
      price: price.startsWith("€") ? price : "€" + price,
      per: "per month · VAT incl.",
      featured: i === 2,
      badge: i === 2 ? "Most complete" : "",
      features: [{ what: "", sub: "" }]
    } : null)
    .filter(Boolean);

  return {
    studio: "NOIR AU NOIR",
    client,
    subtitle,
    kicker: "Videography Proposal · Monthly",
    footer: "Prepared for " + client + (subtitle ? " " + subtitle : ""),
    intro: { lead: "Three ways to work together", text: "" },
    packages,
    notes: [
      {
        title: "What a reel means here",
        body: "Ten reels means ten finished pieces, not ten single unbroken takes. A long continuous take is used when it earns its place."
      },
      {
        title: "Your client portal",
        body: "Every collaboration comes with a personal portal, included in all packages. The plan for the month, the shoot day, the finished deliverables and the posting calendar all live in one place, updated as we work."
      }
    ],
    process: {
      num: "How it works",
      title: "The Shape of a Month",
      steps: [
        { n: "01", title: "Plan", text: "We agree the pieces for the month and the day to film them." },
        { n: "02", title: "Film", text: "One session on site. Everything for the month is captured in that day." },
        { n: "03", title: "Deliver", text: "You receive the finished pieces with the posting guide telling you what goes out and when." }
      ]
    },
    terms: [
      { k: "Prices", v: "Per month, VAT included, no hidden production costs" },
      { k: "Deposit", v: "33 percent on the first month, once only, to reserve the shoot" },
      { k: "Balance", v: "On delivery. Every month after is settled in one payment" },
      { k: "Invoices", v: "Payable within 30 days" },
      { k: "Shoot day", v: "One session per month, fixed together in advance" },
      { k: "Client portal", v: "Included in every package, from the first day" },
      { k: "Notice", v: "30 days before the next month" }
    ]
  };
}
