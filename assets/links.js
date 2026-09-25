/* Links
   ------------------------------------------------------------
   Every address this studio has, on one sheet, in the order he uses
   them: the pages he sends to strangers, then each client, then the
   proposals and the idea boxes, then the old addresses that only
   forward.

   Nothing is stored. The list is read from the same places the other
   sheets read: the data folder for clients, proposals/ and boxes/ for
   the rest. A missing key is fine, because the repo is public.
   ------------------------------------------------------------ */

const SITE = "https://noiraunoir.com";

/* The pages that exist whatever happens, in the order they matter.
   A link that is a base for personal links says so, because pasting
   the base alone is a mistake worth catching here. */
const STUDIO_LINKS = [
  { name: "The studio page", url: SITE + "/", note: "Goes to the booking page" },
  { name: "Book a call", url: SITE + "/call/", note: "The official page, the one Google lists" },
  { name: "One take reels", url: SITE + "/reels/", note: "A partner's own link ends in #their-name too" },
  { name: "For photographers", url: SITE + "/r/", note: "A partner's own link ends in #their-name" },
  { name: "Send files", url: SITE + "/t/", note: "A transfer link ends in #its-id" },
  { name: "The example portal", url: SITE + "/demo/", note: "What a client page looks like" },
  { name: "This dashboard", url: SITE + "/admin/", note: "" }
];

/* Addresses from before the move. They still work, and knowing that
   they only forward is the point of listing them. */
const OLD_LINKS = [
  { name: "clients.noiraunoir.com", url: "https://clients.noiraunoir.com/", note: "Forwards here, keeps old links alive" },
  { name: "proposal.noiraunoir.com", url: "https://proposal.noiraunoir.com/", note: "Forwards to a proposal" },
  { name: "kresha.noiraunoir.com", url: "https://kresha.noiraunoir.com/", note: "MC Kresha idea box" },
  { name: "sakasidea.noiraunoir.com", url: "https://sakasidea.noiraunoir.com/", note: "Sakas idea box" }
];

onReady(() => {
  const wrap = document.getElementById("link-list");
  if (!wrap) return;
  whenSheet("links", () => drawLinks(wrap));

  const again = document.getElementById("links-again");
  if (again) again.addEventListener("click", () => drawLinks(wrap));
});

async function drawLinks(wrap) {
  wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Reading what is live...</p>';

  const groups = [{ title: "The pages you send", links: STUDIO_LINKS }];

  const [clients, proposals, boxes] = await Promise.all([
    listNamesIn("data"), listNamesIn("proposals"), listNamesIn("boxes")
  ]);

  for (const name of clients) {
    groups.push({
      title: name.toUpperCase(),
      links: [
        { name: "Their portal", url: SITE + "/" + name + "/", note: "" },
        { name: "Their posting plan", url: SITE + "/" + name + "/#posts", note: "" },
        { name: "Where you edit it", url: SITE + "/" + name + "/admin.html", note: "Never send this one" }
      ]
    });
  }

  if (proposals.length) {
    groups.push({
      title: "Proposals",
      links: proposals.map((slug) => ({
        name: slug, url: SITE + "/p/" + slug + "/", note: "Carries prices, so only to that client"
      }))
    });
  }

  if (boxes.length) {
    groups.push({
      title: "Idea boxes",
      links: boxes.flatMap((slug) => [
        { name: slug, url: SITE + "/i/" + slug + "/", note: "" },
        { name: slug + ", moderation", url: SITE + "/i/" + slug + "/admin.html", note: "Never send this one" }
      ])
    });
  }

  groups.push({ title: "Old addresses", links: OLD_LINKS });

  wrap.innerHTML = "";
  for (const group of groups) {
    const head = document.createElement("p");
    head.className = "link-head";
    head.textContent = group.title;
    wrap.appendChild(head);

    for (const link of group.links) wrap.appendChild(linkRow(link));
  }
}

/* The three folders that decide what exists. A folder that is not
   there yet is simply empty, which is what a new studio looks like. */
async function listNamesIn(folder) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token()) headers.Authorization = "Bearer " + token();

  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${folder}`,
      { headers, cache: "no-store" });
    if (!res.ok) return [];

    return (await res.json())
      .filter((f) => f.type === "file" && f.name.endsWith(".json") && !f.name.startsWith("_"))
      .map((f) => f.name.replace(/\.json$/, ""))
      .filter((n) => folder !== "data" || !RESERVED.includes(n))
      .sort();
  } catch (err) {
    console.error("listing " + folder + " failed:", err);
    return [];
  }
}

function linkRow({ name, url, note }) {
  const row = document.createElement("div");
  row.className = "link-row";

  const left = document.createElement("div");
  left.className = "link-what";
  left.innerHTML = `<b>${escHtml(name)}</b><a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(url.replace(/^https:\/\//, ""))}</a>` +
    (note ? `<span class="muted">${escHtml(note)}</span>` : "");

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn-mini";
  copy.textContent = "Copy";
  copy.addEventListener("click", async () => {
    const done = await copyText(url);
    copy.textContent = done ? "Copied" : "Press copy";
    if (!done) showForManualCopy(row, url);
    setTimeout(() => { copy.textContent = "Copy"; }, 1600);
  });

  const open = document.createElement("a");
  open.className = "btn-mini";
  open.href = url;
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = "Open";

  row.append(left, copy, open);
  return row;
}
