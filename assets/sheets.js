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
   It opens a glass panel that rises from the bottom: every sheet as a
   tile with its own mark, in three groups, so it reads at a glance. */
const MENU_GROUPS = [
  { label: "Work", ids: ["clients", "calendar", "agenda", "files"] },
  { label: "Business", ids: ["money", "proposals", "people", "partners"] },
  { label: "Tools", ids: ["boxes", "links", "key"] }
];

// line marks, drawn on a 24 grid with the same stroke everywhere
const MENU_ICONS = {
  clients: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.2c2.2.1 3.9 1.5 4.7 4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  agenda: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  files: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  money: '<circle cx="12" cy="12" r="8.5"/><path d="M15 8.6a4 4 0 1 0 0 6.8M7.5 11h6M7.5 13.2h6"/>',
  proposals: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13.5 3.5V8H18M8.5 12.5h7M8.5 16h5"/>',
  people: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  partners: '<circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.8 10.9l6.4-3.2M8.8 13.1l6.4 3.2"/>',
  boxes: '<path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-.6c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z"/>',
  links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L19 4M16 7l2.5 2.5M14 9l2 2"/>'
};
const menuIcon = (id) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (MENU_ICONS[id] || MENU_ICONS.links) + "</svg>";

function buildPhoneMenu() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sheet-menu-btn";
  btn.id = "sheet-menu-btn";
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<span id="sheet-menu-icon">' + menuIcon("clients") + '</span><span id="sheet-menu-name">Menu</span>' +
    '<svg class="sheet-menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5"/></svg>';

  const veil = document.createElement("div");
  veil.className = "sheet-veil";
  veil.hidden = true;

  const drawer = document.createElement("nav");
  drawer.className = "sheet-drawer";
  drawer.id = "sheet-drawer";
  drawer.hidden = true;
  drawer.setAttribute("aria-label", "Sections");
  drawer.innerHTML = '<span class="sheet-grab" aria-hidden="true"></span>' +
    '<div class="sheet-drawer-top"><span class="sheet-drawer-mark">NOIR AU NOIR</span>' +
    '<button type="button" class="sheet-drawer-x" aria-label="Close">&times;</button></div>';
  drawer.querySelector(".sheet-drawer-x").addEventListener("click", closePhoneMenu);

  // every sheet lands in a group; one nobody placed goes with the tools
  const placed = new Set(MENU_GROUPS.flatMap((g) => g.ids));
  const groups = MENU_GROUPS.map((g) => ({ label: g.label, ids: g.ids.filter((id) => SHEETS.some((s) => s.id === id)) }));
  for (const s of SHEETS) if (!placed.has(s.id)) groups[groups.length - 1].ids.push(s.id);

  let n = 0;
  for (const g of groups) {
    if (!g.ids.length) continue;
    const label = document.createElement("p");
    label.className = "sheet-group";
    label.textContent = g.label;
    drawer.appendChild(label);
    const grid = document.createElement("div");
    grid.className = "sheet-tiles";
    for (const id of g.ids) {
      const sheet = SHEETS.find((s) => s.id === id);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sheet-tile";
      item.dataset.sheet = id;
      item.style.setProperty("--i", n++);
      item.innerHTML = menuIcon(id) + "<span>" + sheet.name + "</span>";
      item.addEventListener("click", () => { closePhoneMenu(); showSheet(id); });
      grid.appendChild(item);
    }
    drawer.appendChild(grid);
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
  const on = drawer.querySelector(".sheet-tile.on") || drawer.querySelector(".sheet-tile");
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

  for (const tab of document.querySelectorAll(".sheet-tab, .sheet-tile")) {
    const on = tab.dataset.sheet === id;
    tab.classList.toggle("on", on);
    tab.setAttribute("aria-current", on ? "true" : "false");
  }
  const named = document.getElementById("sheet-menu-name");
  const sheet = SHEETS.find((s) => s.id === id);
  if (named && sheet) named.textContent = sheet.name;
  const mark = document.getElementById("sheet-menu-icon");
  if (mark) mark.innerHTML = menuIcon(id);

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
