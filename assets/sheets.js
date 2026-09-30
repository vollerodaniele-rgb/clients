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
  { id: "calendar", name: "Calendar" },
  { id: "money", name: "Money" },
  { id: "proposals", name: "Proposals" },
  { id: "agenda", name: "Agenda" },
  { id: "people", name: "Contacts" },
  { id: "partners", name: "Partners" },
  { id: "files", name: "Files" },
  { id: "boxes", name: "Boxes" },
  { id: "links", name: "Links" },
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
  buildPhoneMenu();

  /* Nothing opens while the lock is up, because opening a sheet is what
     makes its panels fetch. Without a key most panels could only say
     they need one, so a browser that somehow gets past the lock without
     one lands on the key rather than on a wall of that sentence. */
  const open = () => showSheet(hasKey() ? remembered() : "key");
  if (typeof whenUnlocked === "function") whenUnlocked(open);
  else open();
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

/* ============ THE PHONE MENU ============ */
/* Eleven tabs wrap into four rows on a phone and push the sheet itself
   below the fold. So on a phone the bar gives way to one button at the
   bottom of the screen, where the thumb is, naming the sheet you are on.
   It opens a panel that rises from the bottom with every sheet in it. */
function buildPhoneMenu() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sheet-menu-btn";
  btn.id = "sheet-menu-btn";
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12"/></svg><span id="sheet-menu-name">Menu</span>';

  const veil = document.createElement("div");
  veil.className = "sheet-veil";
  veil.hidden = true;

  const drawer = document.createElement("nav");
  drawer.className = "sheet-drawer";
  drawer.id = "sheet-drawer";
  drawer.hidden = true;
  drawer.setAttribute("aria-label", "Sections");
  drawer.innerHTML = '<span class="sheet-grab" aria-hidden="true"></span>';
  for (const sheet of SHEETS) {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = sheet.name;
    item.dataset.sheet = sheet.id;
    item.addEventListener("click", () => { closePhoneMenu(); showSheet(sheet.id); });
    drawer.appendChild(item);
  }

  btn.addEventListener("click", () => (drawer.hidden ? openPhoneMenu() : closePhoneMenu()));
  veil.addEventListener("click", closePhoneMenu);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closePhoneMenu(); });
  document.body.append(veil, drawer, btn);
}

function openPhoneMenu() {
  const drawer = document.getElementById("sheet-drawer");
  if (!drawer) return;
  drawer.hidden = false;
  drawer.previousElementSibling.hidden = false;
  document.getElementById("sheet-menu-btn").setAttribute("aria-expanded", "true");
  const on = drawer.querySelector("button.on") || drawer.querySelector("button");
  if (on) on.focus();
}

function closePhoneMenu() {
  const drawer = document.getElementById("sheet-drawer");
  if (!drawer || drawer.hidden) return;
  drawer.hidden = true;
  drawer.previousElementSibling.hidden = true;
  document.getElementById("sheet-menu-btn").setAttribute("aria-expanded", "false");
}

function showSheet(id) {
  for (const sheet of SHEETS) {
    for (const part of partsOf(sheet)) {
      const block = document.getElementById("sheet-" + part);
      if (block) block.hidden = sheet.id !== id;
    }
  }

  for (const tab of document.querySelectorAll(".sheet-tab, .sheet-drawer button")) {
    const on = tab.dataset.sheet === id;
    tab.classList.toggle("on", on);
    tab.setAttribute("aria-current", on ? "true" : "false");
  }
  const named = document.getElementById("sheet-menu-name");
  const sheet = SHEETS.find((s) => s.id === id);
  if (named && sheet) named.textContent = sheet.name;

  /* The panels on this sheet load the first time it is opened, rather
     than all of them at once when the page opens. */
  if (typeof sheetOpened === "function") sheetOpened(id);

  try {
    localStorage.setItem(SHEET_MEMORY, id);
  } catch { /* it just will not be remembered */ }

  // a tall sheet followed by a short one otherwise leaves you halfway
  // down a page that is no longer there
  window.scrollTo({ top: 0 });
}
