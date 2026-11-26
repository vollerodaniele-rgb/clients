/* Idea decks, from the dashboard
   ------------------------------------------------------------
   The PowerPoint that went to a prospect with an idea, as a page
   instead: i/<slug>/ shows ideas/<slug>.json, pictures beside it in
   ideas/<slug>/. Random addresses, like proposals, since each is made
   for one person.

   Loaded after dashboard.js and proposals.js, so it shares $, token,
   escHtml, commitFiles, copyText, OWNER, REPO, newSlug, link and
   smallButton from them.
   ------------------------------------------------------------ */

onReady(() => {
  if (!$("idea-create")) return;
  $("idea-create").addEventListener("click", createIdea);
  whenSheet("proposals", loadIdeas);
});

async function loadIdeas() {
  const wrap = $("idea-list");
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (token()) headers.Authorization = "Bearer " + token();
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/ideas`, { headers, cache: "no-store" });
    if (res.status === 404) { wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">No ideas yet.</p>'; return; }
    if (!res.ok) throw new Error("GitHub " + res.status);

    const slugs = (await res.json())
      .filter((f) => f.type === "file" && f.name.endsWith(".json"))
      .map((f) => f.name.replace(/\.json$/, ""));
    if (!slugs.length) { wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">No ideas yet.</p>'; return; }

    const rows = await Promise.all(slugs.map(async (slug) => {
      try {
        const d = await (await fetch(`../ideas/${slug}.json`, { cache: "no-store" })).json();
        return { slug, name: d.client || slug, what: d.format || "" };
      } catch {
        return { slug, name: slug, what: "" };
      }
    }));

    wrap.innerHTML = "";
    for (const r of rows) wrap.appendChild(ideaRow(r));
  } catch (err) {
    console.error("ideas load failed:", err);
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read the ideas (' + escHtml(err.message) + ").</p>";
  }
}

function ideaRow({ slug, name, what }) {
  const row = document.createElement("div");
  row.className = "pay-row";
  row.innerHTML = `<span class="who">${escHtml(name)}</span><span class="what">${escHtml(what)}</span>`;

  const url = `${location.origin}/i/${slug}/`;
  const open = link(url, "Open", true);
  const edit = link("idea.html#" + encodeURIComponent(slug), "Edit", false);
  const copy = smallButton("Copy link", async () => {
    const done = await copyText(url);
    copy.textContent = done ? "Copied" : "Press Ctrl C";
    setTimeout(() => { copy.textContent = "Copy link"; }, 1800);
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
    if (!token()) { $("idea-msg").textContent = "Save your access key first."; return; }
    remove.disabled = true;
    $("idea-msg").textContent = "Removing...";
    try {
      // the pictures go with it
      const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/ideas/${slug}`, {
        headers: { Authorization: "Bearer " + token(), Accept: "application/vnd.github+json" }, cache: "no-store"
      });
      const pics = res.ok ? (await res.json()).filter((f) => f.type === "file").map((f) => f.path) : [];
      await commitFiles(null, `Remove the ${name} idea`, [`i/${slug}/index.html`, `ideas/${slug}.json`, ...pics]);
      $("idea-msg").textContent = "Removed.";
      loadIdeas();
    } catch (err) {
      $("idea-msg").textContent = "Could not remove it: " + err.message;
      remove.disabled = false;
      armed = false;
      remove.textContent = "Remove";
    }
  });

  row.append(open, edit, copy, remove);
  return row;
}

async function createIdea() {
  const msg = $("idea-msg");
  const btn = $("idea-create");
  const client = $("idea-client").value.trim();
  const format = $("idea-format").value.trim();

  if (!token()) { msg.textContent = "Save your access key first."; return; }
  if (!client) { msg.textContent = "Put in who it is for."; return; }

  btn.disabled = true;
  msg.textContent = "Building the page...";
  const slug = newSlug();

  try {
    const page = await fetch(`../_idea/index.html`, { cache: "no-store" });
    if (!page.ok) throw new Error("template not readable (" + page.status + ")");
    await commitFiles({
      [`i/${slug}/index.html`]: await page.text(),
      [`ideas/${slug}.json`]: JSON.stringify(blankIdea(client, format), null, 2) + "\n"
    }, `Add the ${client} idea`);

    msg.innerHTML = `Ready in about a minute at <b>${escHtml(location.origin + "/i/" + slug + "/")}</b> &middot; ` +
      `<a href="idea.html#${encodeURIComponent(slug)}">fill it in</a>`;
    $("idea-client").value = "";
    $("idea-format").value = "";
    loadIdeas();
  } catch (err) {
    console.error("create idea failed:", err);
    msg.textContent = "Could not create it: " + err.message +
      (/40[13]/.test(err.message) ? " (the key needs Contents read and write)" : "");
  } finally {
    btn.disabled = false;
  }
}

/* The wording that repeats from one deck to the next. Everything else
   is the idea itself, written per person. */
function blankIdea(client, format) {
  return {
    kicker: "Proposal",
    client,
    format: format || "Short form documentary",
    hook: "",
    intro: {
      title: "Introduction",
      text: "Noir au Noir is a creative production company specializing in high-end visual storytelling across fashion, luxury, hospitality, and culture.\n\nFrom cinematic campaigns and editorial photography to short documentaries, we create distinctive visuals that combine artistic direction, storytelling, and cinematic precision."
    },
    pillars: { title: "Precision. Passion. Perfection.", items: [{ text: "" }, { text: "" }, { text: "" }] },
    concept: { title: "The concept", points: [] },
    examples: {
      title: "Example",
      note: "This is a general idea of the concept. The final film would be shorter, more dynamic, and built specifically for social media.",
      videos: []
    },
    moodboard: { title: "Moodboard", images: [] },
    closing: "A project at this level deserves a real conversation. Let's discuss it properly.",
    cta: { title: "Ready?", button: "Book a call" }
  };
}
