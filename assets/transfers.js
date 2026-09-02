/* Send files, from the dashboard
   ------------------------------------------------------------
   A transfer is a link with files behind it, not tied to any
   client. Everything lives in the bucket, so there is nothing to
   commit and nothing to publish: a link works the second it is
   made and stops the second it is killed.

   Loaded after dashboard.js, so it shares $, token and escHtml
   from there.
   ------------------------------------------------------------ */

const TRANSFER_RELAY = "https://kresha-idea-box.vollerodaniele.workers.dev";
const TRANSFER_SITE = location.origin + "/t/#";

onReady(() => {
  $("transfer-new").addEventListener("click", makeTransfer);
  loadTransfers();
});

async function loadTransfers() {
  const wrap = $("transfer-list");
  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to see your links.</p>';
    return;
  }

  try {
    const res = await fetch(`${TRANSFER_RELAY}/transfers`, {
      headers: { "X-Studio-Key": token() }, cache: "no-store"
    });
    if (!res.ok) throw new Error(String(res.status));
    const { transfers } = await res.json();

    if (!transfers.length) {
      wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">No links yet.</p>';
      return;
    }

    wrap.innerHTML = "";
    for (const t of transfers) wrap.appendChild(transferRow(t));
  } catch (err) {
    console.error("transfers load failed:", err);
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read your links (' +
      escHtml(err.message) + ").</p>";
  }
}

async function makeTransfer() {
  const msg = $("transfer-msg");
  if (!token()) { msg.textContent = "Save your access key first."; return; }

  const btn = $("transfer-new");
  btn.disabled = true;
  msg.textContent = "Making a link...";

  try {
    const res = await fetch(`${TRANSFER_RELAY}/transfer/new`, {
      method: "POST", headers: { "X-Studio-Key": token() }
    });
    if (!res.ok) throw new Error(String(res.status));
    const { id } = await res.json();
    msg.textContent = "Made. Add files to it below.";
    await loadTransfers();
    // open the new one straight away, since making a link is only ever
    // the first half of the job
    const fresh = document.getElementById("transfer-" + id);
    if (fresh) fresh.querySelector(".transfer-open").click();
  } catch (err) {
    msg.textContent = "Could not make one: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

function transferRow(t) {
  const row = document.createElement("div");
  row.className = "item";
  row.id = "transfer-" + t.id;

  const title = t.title || "Untitled";
  const made = t.created ? new Date(t.created).toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" }) : "";

  row.innerHTML = `
    <p style="font-size:0.95rem;padding-right:6rem"><b>${escHtml(title)}</b></p>
    <p class="muted" style="font-size:0.78rem;margin-top:0.3rem">
      ${t.files} file${t.files === 1 ? "" : "s"} &middot; ${escHtml(readableTotal(t.size))}
      ${made ? " &middot; made " + escHtml(made) : ""}
      ${t.expires ? " &middot; until " + escHtml(t.expires) : ""}
      ${t.expired ? " &middot; EXPIRED" : ""}
    </p>
  `;

  const open = document.createElement("button");
  open.className = "btn-mini transfer-open";
  open.textContent = "Open";
  open.style.cssText = "position:absolute;top:0.7rem;right:0.8rem";

  const body = document.createElement("div");
  body.hidden = true;
  body.style.marginTop = "0.8rem";

  let built = false;
  open.addEventListener("click", () => {
    body.hidden = !body.hidden;
    open.textContent = body.hidden ? "Open" : "Close";
    if (!built) { built = true; buildTransferBody(t, body); }
  });

  row.append(open, body);
  return row;
}

function buildTransferBody(t, body) {
  const link = TRANSFER_SITE + t.id;

  const linkRow = document.createElement("div");
  linkRow.className = "row";
  linkRow.innerHTML = `
    <label class="field" style="flex:1;min-width:14rem"><span>The link</span>
      <input type="text" readonly value="${escHtml(link)}">
    </label>
  `;

  const copy = document.createElement("button");
  copy.className = "btn-mini";
  copy.style.alignSelf = "flex-end";
  copy.textContent = "Copy";
  copy.addEventListener("click", async () => {
    const done = await copyText(link);
    copy.textContent = done ? "Copied" : "Select it";
    setTimeout(() => { copy.textContent = "Copy"; }, 1800);
  });
  linkRow.appendChild(copy);

  const open = document.createElement("a");
  open.className = "btn-mini";
  open.style.alignSelf = "flex-end";
  open.href = link;
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = "View";
  linkRow.appendChild(open);

  const details = document.createElement("div");
  details.className = "row";
  details.innerHTML = `
    <label class="field" style="flex:1;min-width:11rem"><span>Title they see</span>
      <input id="tt-${t.id}" type="text" maxlength="80" value="${escHtml(t.title || "")}">
    </label>
    <label class="field" style="min-width:10rem"><span>Dies on (optional)</span>
      <input id="te-${t.id}" type="date" value="${escHtml(t.expires || "")}">
    </label>
  `;

  const note = document.createElement("label");
  note.className = "field";
  note.innerHTML = `<span>A line for them (optional)</span><textarea id="tn-${t.id}" maxlength="500"></textarea>`;

  const save = document.createElement("button");
  save.className = "btn-mini";
  save.textContent = "Save the wording";
  const msg = document.createElement("p");
  msg.className = "form-msg";
  msg.style.cssText = "font-size:0.85rem;margin-top:0.4rem";

  save.addEventListener("click", async () => {
    save.disabled = true;
    msg.textContent = "Saving...";
    try {
      const res = await fetch(`${TRANSFER_RELAY}/transfer/meta?id=${encodeURIComponent(t.id)}`, {
        method: "POST",
        headers: { "X-Studio-Key": token(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: $("tt-" + t.id).value,
          note: $("tn-" + t.id).value,
          expires: $("te-" + t.id).value
        })
      });
      msg.textContent = res.ok ? "Saved." : "Did not save.";
      if (res.ok) loadTransfers();
    } catch (err) {
      msg.textContent = "Did not save: " + err.message;
    } finally {
      save.disabled = false;
    }
  });

  const files = document.createElement("div");
  files.style.cssText = "font-size:0.9rem;margin:0.8rem 0";

  const pick = document.createElement("input");
  pick.type = "file";
  pick.multiple = true;
  pick.style.fontSize = "0.85rem";

  const drawFiles = async () => {
    files.textContent = "Reading...";
    try {
      const res = await fetch(`${TRANSFER_RELAY}/transfer?id=${encodeURIComponent(t.id)}`, { cache: "no-store" });
      if (!res.ok) { files.textContent = "This link is gone."; return; }
      const data = await res.json();
      $("tn-" + t.id).value = data.note || "";
      files.innerHTML = data.files.length
        ? data.files.map((f) => `<div>${escHtml(f.name)} <span class="muted">${escHtml(readableTotal(f.size))}</span></div>`).join("")
        : '<span class="muted">No files behind it yet.</span>';
    } catch {
      files.textContent = "Could not read it.";
    }
  };

  pick.addEventListener("change", async () => {
    const chosen = [...pick.files];
    pick.value = "";
    for (let i = 0; i < chosen.length; i++) {
      const file = chosen[i];
      try {
        await sendTransferFile(t.id, file, (pct) => {
          msg.textContent = `Sending ${file.name} (${i + 1} of ${chosen.length}) ${pct}%`;
        });
      } catch (err) {
        msg.textContent = `${file.name} did not send: ${err.message}`;
        break;
      }
    }
    msg.textContent = "Files added.";
    drawFiles();
    loadTransfers();
  });

  const kill = document.createElement("button");
  kill.className = "btn-mini danger";
  kill.style.marginTop = "0.8rem";
  kill.textContent = "Kill this link";
  let armed = false;
  kill.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      kill.textContent = "Delete the files?";
      setTimeout(() => { if (armed) { armed = false; kill.textContent = "Kill this link"; } }, 5000);
      return;
    }
    armed = false;
    kill.disabled = true;
    msg.textContent = "Killing it...";
    try {
      const res = await fetch(`${TRANSFER_RELAY}/transfer/kill?id=${encodeURIComponent(t.id)}`, {
        method: "POST", headers: { "X-Studio-Key": token() }
      });
      msg.textContent = res.ok ? "Gone. The link is dead and the files are deleted." : "Could not kill it.";
      loadTransfers();
    } catch (err) {
      msg.textContent = "Could not kill it: " + err.message;
      kill.disabled = false;
    }
  });

  body.append(linkRow, details, note, save, files, pick, kill, msg);
  drawFiles();
}

function sendTransferFile(id, file, onProgress) {
  return new Promise((resolve, reject) => {
    const url = `${TRANSFER_RELAY}/transfer/upload?id=${encodeURIComponent(id)}` +
      `&name=${encodeURIComponent(file.name)}`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-Studio-Key", token());
    xhr.setRequestHeader("X-File-Type", file.type || "application/octet-stream");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 201) return resolve();
      let why = "error " + xhr.status;
      try { why = JSON.parse(xhr.responseText).error || why; } catch { /* keep the code */ }
      reject(new Error(why));
    });

    xhr.addEventListener("error", () => reject(new Error("the connection dropped")));
    xhr.send(file);
  });
}

function readableTotal(bytes) {
  const mb = (bytes || 0) / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + " MB" : Math.max(0, Math.round((bytes || 0) / 1024)) + " KB";
}
