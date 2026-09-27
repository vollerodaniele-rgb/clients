/* Usage
   ------------------------------------------------------------
   How close the studio is to the end of its free allowances: Workers
   requests today (they stop at 100,000 a day and never bill), and R2
   this month (free up to 10 GB, a million writes, ten million reads,
   billed past that). The relay reads Cloudflare's analytics with a
   read only key and hands the numbers here. On the Key sheet, because
   it is looked at as rarely as the key is.

   Loaded after dashboard.js, so it shares $, token, escHtml, RELAY
   and whenSheet.
   ------------------------------------------------------------ */

onReady(() => {
  if (!$("usage-list")) return;
  whenSheet("key", drawUsage);
  const again = $("usage-refresh");
  if (again) again.addEventListener("click", drawUsage);
});

async function drawUsage() {
  const wrap = $("usage-list");
  if (!token()) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Save your access key to see usage.</p>';
    return;
  }
  wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Reading usage...</p>';

  let u;
  try {
    const res = await fetch(`${RELAY}/usage`, { headers: { "X-Studio-Key": token() }, cache: "no-store" });
    u = await res.json();
    if (!res.ok) throw new Error(u.error || String(res.status));
  } catch (err) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Could not read usage (' + escHtml(err.message) + ").</p>";
    return;
  }

  if (u.missing) {
    wrap.innerHTML = `
      <p class="muted" style="font-size:0.9rem;line-height:1.6">
        Switched off until the relay has a read only Cloudflare analytics key.
        Make one at <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener" style="color:var(--text)">Cloudflare, API tokens</a>:
        a custom token with Account, Account Analytics, Read. Then add it to the worker
        kresha-idea-box under Settings, Variables and Secrets, as a secret named
        <b>CF_ANALYTICS_TOKEN</b>.
      </p>`;
    return;
  }
  if (u.error) {
    wrap.innerHTML = '<p class="muted" style="font-size:0.9rem">Cloudflare would not give the numbers: ' + escHtml(u.error) + "</p>";
    return;
  }

  const free = u.free || {};
  const gb = (b) => (b / 1e9).toFixed(b < 1e9 ? 2 : 1) + " GB";
  const n = (v) => Number(v || 0).toLocaleString("en-GB");
  const rows = [
    { label: "Requests today", used: u.requests, of: free.requests, text: n(u.requests) + " of " + n(free.requests),
      note: "Stops at the limit, never bills. Resets at midnight UTC." },
    { label: "Storage", used: u.bytes, of: free.storageBytes, text: gb(u.bytes) + " of " + gb(free.storageBytes),
      note: n(u.objects) + " files. Past 10 GB it bills $0.015 per GB a month." },
    { label: "Writes this month", used: u.classA, of: free.classA, text: n(u.classA) + " of " + n(free.classA),
      note: "Uploads and listings. Past the allowance, $4.50 per million." },
    { label: "Reads this month", used: u.classB, of: free.classB, text: n(u.classB) + " of " + n(free.classB),
      note: "Every film or photo opened. Past the allowance, $0.36 per million." }
  ];

  wrap.innerHTML = "";
  for (const r of rows) {
    const share = r.of ? Math.min(1, (r.used || 0) / r.of) : 0;
    const row = document.createElement("div");
    row.style.cssText = "padding:0.7rem 0;border-top:1px solid var(--line-soft)";
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:1rem;font-size:0.9rem">
        <b style="font-weight:500">${escHtml(r.label)}</b>
        <span style="font-variant-numeric:tabular-nums">${escHtml(r.text)}</span>
      </div>
      <div style="height:4px;border-radius:2px;background:var(--line-soft);margin:0.45rem 0 0.35rem;overflow:hidden">
        <div style="height:100%;width:${(share * 100).toFixed(1)}%;min-width:2px;background:var(--text);opacity:${share >= 0.7 ? 1 : 0.55}"></div>
      </div>
      <p class="muted" style="font-size:0.76rem">${escHtml(r.note)}</p>`;
    wrap.appendChild(row);
  }

  const scripts = Object.entries(u.scripts || {}).sort((a, b) => b[1] - a[1]);
  if (scripts.length) {
    const who = document.createElement("p");
    who.className = "muted";
    who.style.cssText = "font-size:0.76rem;margin-top:0.6rem";
    who.textContent = "Today by worker: " + scripts.map(([name, c]) => name + " " + n(c)).join(", ") + ".";
    wrap.appendChild(who);
  }
}
