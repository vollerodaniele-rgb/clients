/* Sheets
   ------------------------------------------------------------
   The dashboard grew to nine panels and became a page you scroll
   rather than a page you use. This puts them on tabs, the way a
   spreadsheet puts things on sheets: one at a time, and the one you
   were last on is the one you come back to.

   It only ever shows and hides. Every panel keeps its markup, its
   ids and its own script exactly as they were, so nothing here can
   break what draws inside them. A hidden panel is still drawn, which
   costs nothing and means switching is instant.
   ------------------------------------------------------------ */

const SHEET_MEMORY = "noir-sheet";

/* The order is the order he works in: who his clients are, what they
   owe, what is out, what is coming. The key is last because it is a
   thing you do once. */
const SHEETS = [
  // a sheet can hold more than one block. Adding a client belongs with
  // the clients, though in the page they are not neighbours.
  { id: "clients", name: "Clients", parts: ["clients", "clients-add"] },
  { id: "money", name: "Money" },
  { id: "proposals", name: "Proposals" },
  { id: "agenda", name: "Agenda" },
  { id: "partners", name: "Partners" },
  { id: "files", name: "Files" },
  { id: "boxes", name: "Boxes" },
  // short so the whole bar stays on one line, which is the point
  { id: "key", name: "Key" }
];

const partsOf = (sheet) => sheet.parts || [sheet.id];

onReady(() => {
  const bar = document.getElementById("sheet-tabs");
  if (!bar) return;

  for (const sheet of SHEETS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "sheet-tab";
    tab.textContent = sheet.name;
    tab.dataset.sheet = sheet.id;
    tab.addEventListener("click", () => showSheet(sheet.id));
    bar.appendChild(tab);
  }

  /* Without a key most panels can only say they need one, so a first
     visit opens on the key rather than on a wall of that sentence. */
  showSheet(hasKey() ? remembered() : "key");
});

function remembered() {
  try {
    const was = localStorage.getItem(SHEET_MEMORY);
    if (SHEETS.some((s) => s.id === was)) return was;
  } catch { /* a blocked storage just means it opens on the first one */ }
  return SHEETS[0].id;
}

function hasKey() {
  try {
    // the same name dashboard.js saves it under
    return !!localStorage.getItem("clients-admin-token");
  } catch {
    return true; // cannot tell, so do not nag
  }
}

function showSheet(id) {
  for (const sheet of SHEETS) {
    for (const part of partsOf(sheet)) {
      const block = document.getElementById("sheet-" + part);
      if (block) block.hidden = sheet.id !== id;
    }
  }

  for (const tab of document.querySelectorAll(".sheet-tab")) {
    const on = tab.dataset.sheet === id;
    tab.classList.toggle("on", on);
    tab.setAttribute("aria-current", on ? "true" : "false");
  }

  try {
    localStorage.setItem(SHEET_MEMORY, id);
  } catch { /* it just will not be remembered */ }

  // a tall sheet followed by a short one otherwise leaves you halfway
  // down a page that is no longer there
  window.scrollTo({ top: 0 });
}
