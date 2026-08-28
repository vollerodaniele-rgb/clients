/* Idea boxes, from the dashboard
   ------------------------------------------------------------
   Pages live at i/<slug>/, wording at boxes/<slug>.json, and the
   ideas are issues labelled idea and box:<slug> in this repo, so
   one box never shows another's.

   Loaded after dashboard.js, so it shares $, token, escHtml,
   commitFiles, OWNER and REPO from there.
   ------------------------------------------------------------ */

const BOX_FILES = ["index.html", "admin.html"];

onReady(() => {
  $("box-create").addEventListener("click", createBox);

  // typing a title suggests the address, until it is edited by hand
  let touched = false;
  $("box-slug").addEventListener("input", () => { touched = true; });
  $("box-title").addEventListener("input", () => {
    if (!touched) $("box-slug").value = slugifyBox($("box-title").value);
  });

  loadBoxes();
});

function slugifyBox(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

async function loadBoxes() {
  const wrap = $("box-list");

  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (token()) headers.Authorization = "Bearer " + token();

    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/boxes`,
      { headers, cache: "no-store" });

    if (res.status === 404) {
      wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">No idea boxes yet.</p>';
      return;
    }
    if (!res.ok) throw new Error("GitHub " + res.status);

    const slugs = (await res.json())
      .filter((f) => f.type === "file" && f.name.endsWith(".json") && !f.name.startsWith("_"))
      .map((f) => f.name.replace(/\.json$/, ""));

    if (!slugs.length) {
      wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">No idea boxes yet.</p>';
      return;
    }

    const rows = await Promise.all(slugs.map(async (slug) => {
      let title = slug;
      try {
        const d = await (await fetch(`../boxes/${slug}.json`, { cache: "no-store" })).json();
        title = d.title || slug;
      } catch { /* an unreadable box still deserves a row */ }
      return { slug, title, ideas: await countBoxIdeas(slug) };
    }));

    wrap.innerHTML = "";
    for (const r of rows) wrap.appendChild(boxRow(r));
  } catch (err) {
    console.error("boxes load failed:", err);
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read the idea boxes (' +
      escHtml(err.message) + ").</p>";
  }
}

async function countBoxIdeas(slug) {
  try {
    const res = await fetch(`${RELAY}/ideas?site=box&client=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return (await res.json()).ideas.length;
  } catch {
    return null;
  }
}

function boxRow({ slug, title, ideas }) {
  const row = document.createElement("div");
  row.className = "pay-row";

  const count = ideas === null ? "" : `${ideas} idea${ideas === 1 ? "" : "s"} on the wall`;
  row.innerHTML = `
    <span class="who">${escHtml(title)}</span>
    <span class="what">${escHtml(count)}</span>
  `;

  const open = link(`${location.origin}/i/${slug}/`, "Open", true);
  const moderate = link(`${location.origin}/i/${slug}/admin.html`, "Moderate", true);

  const copy = smallButton("Copy link", async () => {
    const url = `${location.origin}/i/${slug}/`;
    const done = await copyText(url);
    copy.textContent = done ? "Copied" : "Press Ctrl C";
    setTimeout(() => { copy.textContent = "Copy link"; }, 1800);
    if (!done) showForManualCopy(row, url);
  });

  const remove = smallButton("Remove", null);
  let armed = false;
  remove.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      remove.textContent = `Delete ${slug}?`;
      setTimeout(() => { if (armed) { armed = false; remove.textContent = "Remove"; } }, 5000);
      return;
    }
    if (!token()) { $("box-msg").textContent = "Save your access key first."; return; }

    remove.disabled = true;
    $("box-msg").textContent = "Removing...";
    try {
      await commitFiles(null, `Remove the ${slug} idea box`,
        [`i/${slug}/index.html`, `i/${slug}/admin.html`, `boxes/${slug}.json`]);
      $("box-msg").textContent = "Removed.";
      loadBoxes();
    } catch (err) {
      $("box-msg").textContent = "Could not remove it: " + err.message;
      remove.disabled = false;
      armed = false;
      remove.textContent = "Remove";
    }
  });

  const message = messageButton("box", {
    title,
    url: `${location.origin}/i/${slug}/`
  }, row);

  row.append(open, moderate, copy, message, remove);
  return row;
}

async function createBox() {
  const msg = $("box-msg");
  const btn = $("box-create");
  const title = $("box-title").value.trim();
  const slug = slugifyBox($("box-slug").value || title);

  if (!token()) { msg.textContent = "Save your access key first."; return; }
  if (!title) { msg.textContent = "Give the box a title."; return; }
  if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(slug)) {
    msg.textContent = "That address will not work. Use letters and numbers, for example kresha.";
    return;
  }
  if (RESERVED.includes(slug)) {
    msg.textContent = `"${slug}" is used by the site itself. Pick another address.`;
    return;
  }

  btn.disabled = true;
  msg.textContent = "Building the idea box...";

  try {
    const pages = await Promise.all(BOX_FILES.map(async (f) => {
      const res = await fetch(`../_box/${f}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`template ${f} is not readable (${res.status})`);
      return [`i/${slug}/${f}`, await res.text()];
    }));

    const files = Object.fromEntries(pages);
    files[`boxes/${slug}.json`] = JSON.stringify({
      kicker: $("box-kicker").value.trim(),
      title,
      intro: $("box-intro").value.trim(),
      placeholder: "Start anywhere.",
      wall: "The Wall",
      footer: "NOIR AU NOIR"
    }, null, 2) + "\n";

    await commitFiles(files, `Add the ${title} idea box`);

    msg.innerHTML = `<b>${escHtml(title)}</b> is ready in about a minute at ` +
      `${escHtml(location.origin + "/i/" + slug + "/")}`;
    for (const id of ["box-slug", "box-kicker", "box-title", "box-intro"]) $(id).value = "";
    loadBoxes();
  } catch (err) {
    console.error("create box failed:", err);
    msg.textContent = "Could not create it: " + err.message +
      (/40[13]/.test(err.message) ? " (the key needs Contents read and write)" : "");
  } finally {
    btn.disabled = false;
  }
}
