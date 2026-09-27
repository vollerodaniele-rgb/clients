/* Map
   ------------------------------------------------------------
   The places on noiraunoir.com/world/. Click the map where you filmed
   (or find it by name), say what you made, add the films or photos,
   save. The places are data/world.json in this repo, so saving is a
   commit like a client's plan, and the page shows it once Pages has
   published and its ten minute cache has passed.

   The map on this sheet is the real page, opened as ?pick in a frame:
   a click on the map says where, a click on a pin opens that place
   here. Films and photos go to the relay's storage under world/map/
   and are served through /file, the same way a delivery is.

   Loaded after dashboard.js, so it shares $, token, escHtml,
   dangerButton, whenSheet, commitFiles, OWNER, REPO and RELAY.
   ------------------------------------------------------------ */

const WORLD_FILE = "data/world.json";
// only these play or show in every browser; a HEIC photo, for one, does not
const WORLD_TYPES = /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm))$/;

let worldPlaces = [];
let worldDraft = null;     // the place on the form: a copy, or a new one
let worldEditing = null;   // the id of the place being changed, null for a new one
let worldFrameReady = false;
let worldAutoNamed = true; // place and country were filled in for him, so a new spot may refill them
let worldBusy = 0;         // uploads still running

onReady(() => {
  if (!$("map-frame")) return;
  whenSheet("map", drawWorldSheet);
  addEventListener("message", heardFromMap);

  $("map-find-go").addEventListener("click", findPlace);
  $("map-find").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); findPlace(); }
  });
  $("map-files").addEventListener("change", (e) => { addWorldFiles([...e.target.files]); e.target.value = ""; });
  $("map-link-add").addEventListener("click", addWorldLink);
  $("map-save").addEventListener("click", saveWorldPlace);
  $("map-cancel").addEventListener("click", stopEditing);
  for (const id of ["map-place", "map-country"]) {
    $(id).addEventListener("input", () => { worldAutoNamed = false; });
  }
});

// A place from before places had ids is known by where it is
const placeId = (p) => p.id || [p.place, p.lat, p.lon].join("|");

async function drawWorldSheet() {
  const frame = $("map-frame");
  if (!frame.getAttribute("src")) frame.src = "../world/?pick&t=" + Date.now();

  const list = $("map-list");
  if (!token()) {
    list.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to change the map.</p>';
    return;
  }
  list.innerHTML = '<p class="muted" style="font-size:0.9rem">Reading the map...</p>';
  try {
    worldPlaces = await readWorld();
  } catch (err) {
    list.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read the map (' + escHtml(err.message) + ").</p>";
    return;
  }
  drawWorldList();
  tellMap({ type: "places", places: worldPlaces });
}

async function readWorld() {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${WORLD_FILE}?t=${Date.now()}`,
    { headers: { Authorization: "Bearer " + token(), Accept: "application/vnd.github.raw+json" }, cache: "no-store" }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("GitHub " + res.status);
  const data = await res.json();
  return Array.isArray(data.places) ? data.places : [];
}

/* ============ TALKING TO THE MAP ============ */
function tellMap(msg) {
  const frame = $("map-frame");
  if (!worldFrameReady || !frame.contentWindow) return;
  frame.contentWindow.postMessage(Object.assign({ to: "world-map" }, msg), location.origin);
}

function heardFromMap(e) {
  if (e.origin !== location.origin || !e.data || e.data.from !== "world-map") return;
  const d = e.data;

  if (d.type === "ready") {
    worldFrameReady = true;
    tellMap({ type: "places", places: worldPlaces });
    if (worldDraft) tellMap({ type: "mark", lat: worldDraft.lat, lon: worldDraft.lon });
  }

  if (d.type === "picked") {
    if (!worldDraft) startPlace(null);
    worldDraft.lat = d.lat;
    worldDraft.lon = d.lon;
    drawSpot();
    if (worldAutoNamed) nameTheSpot(d.lat, d.lon);
  }

  if (d.type === "pin") {
    const p = worldPlaces[d.index];
    if (p) startPlace(placeId(p));
  }
}

/* ============ THE FORM ============ */
function startPlace(id) {
  const had = id ? worldPlaces.find((p) => placeId(p) === id) : null;
  worldEditing = had ? id : null;
  worldDraft = had
    ? JSON.parse(JSON.stringify(had))
    : { place: "", country: "", lat: null, lon: null, title: "", what: "", pieces: [] };
  worldAutoNamed = !had;

  $("map-place").value = worldDraft.place || "";
  $("map-country").value = worldDraft.country || "";
  $("map-title").value = worldDraft.title || "";
  $("map-what").value = worldDraft.what || "";
  $("map-msg").textContent = "";
  $("map-form-head").textContent = had ? "Change " + (had.title || had.place) : "A new place";
  $("map-form").hidden = false;
  $("map-empty").hidden = true;
  drawSpot();
  drawWorldPieces();

  if (had) {
    tellMap({ type: "mark", lat: had.lat, lon: had.lon });
    tellMap({ type: "goto", lat: had.lat, lon: had.lon, k: 30 });
    $("map-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function stopEditing() {
  worldDraft = null;
  worldEditing = null;
  $("map-form").hidden = true;
  $("map-empty").hidden = false;
  tellMap({ type: "mark", lat: null, lon: null });
}

function drawSpot() {
  const at = $("map-at");
  if (!worldDraft || worldDraft.lat == null) {
    at.textContent = "Click the map where it was.";
    return;
  }
  at.textContent = worldDraft.lat.toFixed(5) + ", " + worldDraft.lon.toFixed(5) + ". Click the map again to move it.";
}

/* The spot's name, looked up on OpenStreetMap, so he rarely types it.
   Only fills in what he has not typed himself. */
async function nameTheSpot(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=en&lat=${lat}&lon=${lon}`
    );
    if (!res.ok) return;
    const a = (await res.json()).address || {};
    if (!worldDraft || !worldAutoNamed) return;
    const town = a.city || a.town || a.village || a.municipality || a.county || "";
    $("map-place").value = worldDraft.place = town;
    $("map-country").value = worldDraft.country = a.country || "";
  } catch { /* he types it */ }
}

async function findPlace() {
  const q = $("map-find").value.trim();
  const msg = $("map-find-msg");
  if (!q) return;
  msg.textContent = "Looking...";
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=en&q=${encodeURIComponent(q)}`
    );
    const hits = res.ok ? await res.json() : [];
    if (!hits.length) { msg.textContent = "Nothing found for that. Try the town and the country."; return; }
    const hit = hits[0];
    const lat = +(+hit.lat).toFixed(5), lon = +(+hit.lon).toFixed(5);
    msg.textContent = hit.display_name;

    if (!worldDraft) startPlace(null);
    worldDraft.lat = lat;
    worldDraft.lon = lon;
    drawSpot();
    if (worldAutoNamed) {
      const a = hit.address || {};
      $("map-place").value = worldDraft.place = a.city || a.town || a.village || a.municipality || hit.name || "";
      $("map-country").value = worldDraft.country = a.country || "";
    }
    tellMap({ type: "mark", lat, lon });
    tellMap({ type: "goto", lat, lon, k: 40 });
  } catch {
    msg.textContent = "Could not look that up just now. Click the map instead.";
  }
}

/* ============ FILMS AND PHOTOS ============ */
const kindOf = (src, type) =>
  /^image\//.test(type || "") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(src) ? "photo" : "film";

// upright or not, read off the file itself so the pin opens the right shape
function measureShape(src, kind) {
  return new Promise((resolve) => {
    const done = (w, h) => resolve(h > w * 1.05);
    if (kind === "photo") {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => resolve(false);
      img.src = src;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => resolve(false);
      v.src = src;
    }
    setTimeout(() => resolve(false), 8000);
  });
}

function pieceMedia(piece) {
  if (piece.kind === "photo") {
    const img = document.createElement("img");
    img.src = piece.src;
    img.alt = "";
    return img;
  }
  const v = document.createElement("video");
  v.src = piece.src;
  v.muted = true;
  v.preload = "metadata";
  v.playsInline = true;
  return v;
}

function drawWorldPieces() {
  const wrap = $("map-pieces");
  wrap.innerHTML = "";
  const pieces = worldDraft ? worldDraft.pieces : [];
  if (!pieces.length && !worldBusy) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.85rem">Nothing yet. The first one is the picture on the pin.</p>';
    return;
  }
  pieces.forEach((piece, i) => {
    const box = document.createElement("div");
    box.className = "map-piece";
    const pv = document.createElement("div");
    pv.className = "pv" + (piece.tall ? " tall" : "");
    pv.appendChild(pieceMedia(piece));
    box.appendChild(pv);

    const btns = document.createElement("div");
    btns.className = "pv-btns";
    if (i > 0) {
      const first = document.createElement("button");
      first.type = "button";
      first.className = "btn-mini";
      first.textContent = "First";
      first.title = "Make this the picture on the pin";
      first.addEventListener("click", () => {
        pieces.unshift(pieces.splice(i, 1)[0]);
        drawWorldPieces();
      });
      btns.appendChild(first);
    } else {
      const tag = document.createElement("span");
      tag.className = "muted";
      tag.style.fontSize = "0.72rem";
      tag.textContent = "On the pin";
      btns.appendChild(tag);
    }
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "btn-mini";
    drop.textContent = "Remove";
    drop.addEventListener("click", () => { pieces.splice(i, 1); drawWorldPieces(); });
    btns.appendChild(drop);
    box.appendChild(btns);
    wrap.appendChild(box);
  });
}

// the stored name: unique, and only the characters the relay accepts
function storedName(file) {
  const clean = file.name.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "").replace(/^[^A-Za-z0-9]+/, "") || "file";
  return (Date.now().toString(36) + "-" + clean).slice(0, 110);
}

function uploadWorldFile(file, name, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${RELAY}/deliver?client=world&month=map&name=${encodeURIComponent(name)}`);
    xhr.setRequestHeader("X-Studio-Key", token());
    xhr.setRequestHeader("X-File-Type", file.type || "application/octet-stream");
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let why = String(xhr.status);
        try { why = JSON.parse(xhr.responseText).error || why; } catch { /* keep the number */ }
        reject(new Error(why));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("the connection dropped")));
    xhr.send(file);
  });
}

async function addWorldFiles(files) {
  if (!worldDraft) return;
  const msg = $("map-msg");
  for (const file of files) {
    if (!WORLD_TYPES.test(file.type)) {
      msg.textContent = file.name + " cannot be shown on a web page. Use JPG, PNG, WEBP, MP4 or MOV.";
      continue;
    }
    const kind = kindOf(file.name, file.type);
    const local = URL.createObjectURL(file);
    const tall = await measureShape(local, kind);
    URL.revokeObjectURL(local);

    const name = storedName(file);
    const draft = worldDraft;
    worldBusy++;
    try {
      await uploadWorldFile(file, name, (pct) => { msg.textContent = "Uploading " + file.name + ": " + pct + "%"; });
      draft.pieces.push({
        kind,
        src: `${RELAY}/file?client=world&month=map&name=${encodeURIComponent(name)}`,
        ...(tall ? { tall: true } : {})
      });
      msg.textContent = file.name + " added.";
    } catch (err) {
      msg.textContent = "Could not upload " + file.name + ": " + err.message;
    } finally {
      worldBusy--;
      if (draft === worldDraft) drawWorldPieces();
    }
  }
}

async function addWorldLink() {
  if (!worldDraft) return;
  const input = $("map-link");
  let src = input.value.trim();
  if (!src) return;
  // a link to this site works from anywhere on it
  src = src.replace(/^https?:\/\/(www\.)?noiraunoir\.com(?=\/)/i, "");
  if (!/^(https:\/\/|\/)/.test(src)) {
    $("map-msg").textContent = "That needs to be a full https link, or a path on this site like /reels/examples/1.mp4.";
    return;
  }
  const kind = kindOf(src);
  const tall = await measureShape(src, kind);
  worldDraft.pieces.push({ kind, src, ...(tall ? { tall: true } : {}) });
  input.value = "";
  drawWorldPieces();
}

/* ============ SAVING ============ */
/* The file is read again just before writing, and the one change is
   made to that, so a save from another tab a moment ago is not undone. */
async function writeWorld(change, message) {
  const fresh = await readWorld();
  const next = change(fresh);
  await commitFiles({ [WORLD_FILE]: JSON.stringify({ places: next }, null, 2) + "\n" }, message);
  worldPlaces = next;
  drawWorldList();
  tellMap({ type: "places", places: worldPlaces });
}

async function saveWorldPlace() {
  const msg = $("map-msg");
  const d = worldDraft;
  if (!d) return;
  d.place = $("map-place").value.trim();
  d.country = $("map-country").value.trim();
  d.title = $("map-title").value.trim();
  d.what = $("map-what").value.trim();

  if (d.lat == null) { msg.textContent = "Click the map where it was first."; return; }
  if (!d.place) { msg.textContent = "Which town or city?"; return; }
  if (!d.title) { msg.textContent = "Give it a title: who or what it was."; return; }
  if (worldBusy) { msg.textContent = "Wait for the uploads to finish."; return; }
  if (!d.pieces.length) { msg.textContent = "Add at least one film or photo. The first one is the picture on the pin."; return; }

  const place = {
    id: d.id || Math.random().toString(36).slice(2, 10),
    place: d.place, country: d.country, lat: d.lat, lon: d.lon,
    title: d.title, what: d.what,
    ...(d.example ? { example: true } : {}),
    pieces: d.pieces
  };
  const was = worldEditing;

  const btn = $("map-save");
  btn.disabled = true;
  msg.textContent = "Saving...";
  try {
    await writeWorld((list) => {
      const i = was ? list.findIndex((p) => placeId(p) === was) : -1;
      if (i >= 0) list[i] = place;
      else list.push(place);
      return list;
    }, (was ? "Map: change " : "Map: add ") + place.place + ", " + place.title);
    stopEditing();
    $("map-empty").textContent = "Saved. It shows on the live map within about ten minutes.";
  } catch (err) {
    msg.textContent = "Could not save: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

/* ============ THE LIST ============ */
function drawWorldList() {
  const list = $("map-list");
  const count = $("map-count");

  const byCountry = {};
  for (const p of worldPlaces) byCountry[p.country || "Somewhere"] = (byCountry[p.country || "Somewhere"] || 0) + 1;
  count.textContent = worldPlaces.length
    ? worldPlaces.length + " place" + (worldPlaces.length === 1 ? "" : "s") + ": " +
      Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + " " + n).join(", ")
    : "";

  if (!worldPlaces.length) {
    list.innerHTML = '<p class="muted" style="font-size:0.9rem">No places yet. Click the map to put the first one.</p>';
    return;
  }

  list.innerHTML = "";
  const sorted = [...worldPlaces].sort((a, b) =>
    String(a.country).localeCompare(String(b.country)) || String(a.place).localeCompare(String(b.place)));
  for (const p of sorted) {
    const row = document.createElement("div");
    row.className = "link-row";

    const pv = document.createElement("div");
    pv.className = "pv small";
    if (p.pieces && p.pieces[0]) pv.appendChild(pieceMedia(p.pieces[0]));
    row.appendChild(pv);

    const what = document.createElement("div");
    what.className = "link-what";
    const n = (p.pieces || []).length;
    what.innerHTML =
      `<b>${escHtml(p.title || "Untitled")}${p.example ? ' <span class="muted" style="font-size:0.72rem;letter-spacing:0.1em">EXAMPLE</span>' : ""}</b>` +
      `<span class="muted">${escHtml([p.place, p.country].filter(Boolean).join(", "))} &middot; ${n} ${n === 1 ? "piece" : "pieces"}</span>`;
    row.appendChild(what);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn-mini";
    edit.textContent = "Change";
    edit.addEventListener("click", () => startPlace(placeId(p)));
    row.appendChild(edit);

    row.appendChild(dangerButton("Remove", async () => {
      const id = placeId(p);
      await writeWorld((fresh) => fresh.filter((x) => placeId(x) !== id), "Map: remove " + p.place + ", " + p.title);
      if (worldEditing === id) stopEditing();
    }));

    list.appendChild(row);
  }
}
