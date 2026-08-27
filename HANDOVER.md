# HANDOVER — Noir au Noir studio system

Read this top to bottom before touching anything. It is written so a new
session can continue without re-discovering any of it. Last updated
2026-08-27.

---

## 1. Who this is for

Daniele (GitHub `vollerodaniele-rgb`, email `vollerodaniele@gmail.com`,
business email `info@noiraunoir.com`). Runs **Noir au Noir**, a one-person
video/content studio near Gent, Belgium. Main site `noiraunoir.com` is on
Webflow and is NOT ours. Everything below is what we built alongside it.

Clients today: **Sakas** (restaurant, Gent, paying), **Fema Laser & Skin
Clinic** (proposal out, not signed), **MC Kresha** (artist passion project).

### Two standing rules

1. **No em dashes.** Not in replies, not in UI strings, not in comments.
2. **House style is FIXED**, declared by him: pitch black `#000`, plain
   white `#fff`, greys `#9a9a9a` / `#333` / `#222`, **no colours, no
   shadows**, Playfair Display for headings, Inter for body, 1px borders,
   12px radius, uppercase letter-spaced small labels. Reference:
   `clients/assets/styles.css`. Do not introduce accent colours.
   The Fema proposal was originally orange (his own file) but has since
   been rebuilt monochrome.

He is not a developer. He works through web UIs. Never ask him to edit
JSON or run commands if a button can do it.

---

## 2. What is live right now

| What | Address | Repo | Local |
|---|---|---|---|
| **Control room** | clients.noiraunoir.com/admin/ | `clients` | `C:\Users\erbli\claude\clients` |
| Sakas portal (new) | clients.noiraunoir.com/sakas/ | `clients` | same |
| Fema proposal | clients.noiraunoir.com/p/Tr1_ZkuT9dA_/ | `clients` | same |
| Kresha idea box | kresha.noiraunoir.com | `mc-kresha-hub` | `C:\Users\erbli\claude\mc-kresha-hub` |
| Sakas idea box | sakasidea.noiraunoir.com | `sakas-idea` | `C:\Users\erbli\claude\sakas-idea` |
| Sakas portal (OLD, duplicate) | sakas.noiraunoir.com | `sakas-portal` | `C:\Users\erbli\claude\sakas-portal` |
| Proposal domain (forwarder only) | proposal.noiraunoir.com | `proposal` | `C:\Users\erbli\claude\proposal` |
| Money data (PRIVATE) | none | `studio-private` | not cloned |
| The relay (Cloudflare Worker) | kresha-idea-box.vollerodaniele.workers.dev | source in `mc-kresha-hub/cloudflare-worker/` | same |
| Backlog checklist (artifact) | https://claude.ai/code/artifact/5cfd93c2-8059-4b99-af2f-815413db80d7 | — | scratchpad `backlog.html` |

All repos are **public** except `studio-private`. Public is required for
free GitHub Pages. One custom domain per repo, which is why separate
domains needed separate repos.

---

## 3. The `clients` repo (the important one)

Everything new goes here. Structure:

```
clients/
  .nojekyll              REQUIRED. Without it Pages hides _folders
  CNAME                  clients.noiraunoir.com
  index.html / 404.html  just the studio name, gives nothing away
  robots.txt             disallow all
  admin/
    index.html           THE DASHBOARD (money, clients, proposals, boxes)
    proposal.html        proposal editor, slug comes from the URL hash
  assets/                the ONLY copy of every script and style
    styles.css           house style + portal + schedule + idea box CSS
    portal.js            client portal page
    schedule.js          posting plan page
    admin.js             client portal admin
    dashboard.js         dashboard core: key, money, clients, commitFiles
    proposals.js         proposals panel (loaded after dashboard.js)
    proposal-editor.js   the editor page (self-contained helpers)
    proposal-page.js     the public proposal page
    proposal.css         proposal-only styles
    boxes.js             idea box panel (loaded after dashboard.js)
    box.js               public idea box page
    box-admin.js         idea box moderation
  data/<client>.json     one client portal's entire content
  data/_example.json     starting point for a new client
  _template/             index.html schedule.html admin.html (portal)
  _box/                  index.html admin.html (idea box)
  _proposal/             index.html (proposal page)
  <client>/              3 files copied verbatim from _template
  i/<slug>/              2 files copied verbatim from _box
  p/<slug>/              1 file copied verbatim from _proposal
  proposals/<slug>.json  one proposal's content
  boxes/<slug>.json      one idea box's wording
```

Branch `uploads` (orphan) in this repo holds pictures and voice notes, so
an upload never rebuilds the site.

**Reserved folder names** (cannot be a client/box slug):
`admin, assets, data, _template, p, proposals, _proposal, i, boxes, _box, uploads`

### How a page knows which client/box/proposal it is

- Portals and admin: **FIRST path segment**, skipping a leading `clients`
  segment (`currentClient()` in portal.js / schedule.js / admin.js).
- Idea boxes: the segment after `i`.
- Proposal pages: the segment after `p`.
- Proposal EDITOR: the **URL hash** (`proposal.html#slug`), NOT a query
  string. Some servers redirect and drop the query.

Because of this, every file inside a client/box/proposal folder is
**byte-identical** across all of them. That is what makes creating one a
file copy.

### Data files

`data/<client>.json` keys: `name, tagline, dealNotes, deal[], nextShoot{date,time,location,focus,checklist[]}, filmPlan{month,items[]}, months[], documents[], invoices[], posts[], contact{line,email}`

`posts[]` = `{date, time, platform, title, caption, status}` where status is
`planned` or `posted`. This drives the posting plan page.

`proposals/<slug>.json` keys: `studio, client, subtitle, kicker, footer, intro{lead,text}, packages[], notes[], process{}, terms[]`

`boxes/<slug>.json` keys: `kicker, title, intro, placeholder, wall, footer`

---

## 4. The relay (Cloudflare Worker)

Source: `mc-kresha-hub/cloudflare-worker/worker.js`. Deploy with
`cd mc-kresha-hub/cloudflare-worker && npx -y wrangler deploy`.
Wrangler is already authenticated on this machine via OAuth.

It does five things:

1. **POST /** — accepts a submission `{site, client, idea, name, website, image?, audio?}`
   and files it as a GitHub issue. `website` is a honeypot: if filled it
   fakes success and creates nothing.
2. **GET /ideas?site=X&client=Y** — reads the wall. Public pages read
   through this, never GitHub directly (see gotcha 6.3).
3. **GET /audio?repo=..&f=..** — serves voice notes with a real audio
   content type (see gotcha 6.1).
4. **GET /telegram-setup** — one-time helper, disables itself once
   `TELEGRAM_CHAT_ID` exists.
5. **Telegram ping** on every submission, fired via `ctx.waitUntil` so a
   slow notification never delays the sender.

### SITES map

| key | repo | labels applied |
|---|---|---|
| `kresha` | mc-kresha-hub | `idea` |
| `sakas` | sakas-portal | `idea` |
| `sakasidea` | sakas-idea | `idea` |
| `clients` | clients | `idea` + `client:<slug>` |
| `box` | clients | `idea` + `box:<slug>` |
| `proposal` | clients | `accepted` + `proposal:<slug>` |

The second label is what keeps one client/box/proposal from ever seeing
another's. Adding a new client or box needs **no relay change**.

### Secrets on the worker

- `GITHUB_TOKEN` — the `idea-box-relay` fine-grained PAT
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID` = `8653924468`

**A new or changed secret needs a `wrangler deploy` to take effect.**

### Allowed origins

Listed in `ALLOWED_ORIGINS`. Currently all five live domains plus
localhost 4173/4174/4175/4176/4177. **A new domain must be added here or
its forms silently fail CORS.**

---

## 5. Tokens (he holds these, never handle the values)

| Name | Reaches | Permissions | Used by |
|---|---|---|---|
| `idea-box-relay` | mc-kresha-hub, sakas-portal, sakas-idea, clients | Issues RW + Contents RW | the Worker secret |
| `kresha-admin` | mc-kresha-hub, sakas-idea | Issues RW | Kresha + Sakas box admin pages |
| the clients admin key | clients, studio-private | Contents RW + Issues RW | dashboard + all client admins |

Browser storage keys (localStorage, per origin):
`clients-admin-token`, `kresha-admin-token`, `sakasidea-admin-token`,
`sakas-admin-token`, and `nan-backlog-v1` for the checklist artifact.

**NEVER accept a token pasted into chat.** He did once; it was treated as
burned and regenerated. Tell him to paste only into Cloudflare or the
admin page.

---

## 6. Hard-won gotchas. Do not rediscover these.

1. **raw.githubusercontent serves audio as `text/plain` with `nosniff`,**
   so browsers refuse to play a direct link. Voice notes MUST play through
   the worker's `/audio` endpoint. Images are fine directly.
2. **iOS microphone:** `getUserMedia` must request `echoCancellation`,
   `noiseSuppression` AND `autoGainControl` all `false`. If ANY is true,
   iOS uses a narrowband phone-call path capped around 4 kHz and it sounds
   muffled no matter the bitrate. Diagnosed by FFT on real uploads: 99.8%
   of energy under 4 kHz at 51 kbps. Bitrates: AAC (iPhone) 128 kbps,
   Opus 64 kbps. 32 kbps was tried and was far too low for AAC.
3. **Anonymous GitHub API is 60 requests/hour per IP.** Heavy testing or a
   shared network exhausts it and pages show "could not reach". All public
   walls therefore read through the relay, which uses the token (5000/hr)
   and caches 30s at the edge. A cache-buster in the page URL does NOT
   bypass that cache, because the cache key is the GitHub subrequest.
4. **GitHub Pages hides `_underscore` folders** unless `.nojekyll` exists
   at the repo root. This broke the create buttons until fixed.
5. **Regenerating `idea-box-relay` instead of editing it takes every site
   down silently** with 401s: pages still render, submissions all fail.
   Fix = paste the new value into the Cloudflare secret and redeploy.
   Tell him to EDIT the token's repository list, never regenerate.
6. **An explicit `display:` rule overrides the `hidden` attribute.** Both
   stylesheets now carry `[hidden] { display: none !important; }`. Without
   it, hidden forms flash on load.
7. **Admin pages fall back to an anonymous read** if the saved key is
   rejected, and say so, rather than showing an empty list. Keep that
   behaviour.
8. **Money amounts must NEVER go in `data/<client>.json`.** Those pages are
   public and one client could read another's price. Amounts live in the
   private repo `studio-private` as `money.json`.
9. **PowerShell mangles backticks, quotes and `&` in heredocs.** It has
   silently eaten markdown backticks and corrupted an emoji into mojibake.
   Prefer the Write/Edit tools or `node -e` scripts for anything with
   punctuation. Multi-line commit messages: use `git commit -F -` with a
   bash heredoc.
10. **Pages deploys take 1 to 3 minutes.** Use the Monitor tool with an
    until-loop rather than telling him it is live immediately. His browser
    also caches; suggest a hard refresh.
11. **One custom domain per repo.** This is why proposals could not stay
    on their own domain once consolidated.
12. **Clipboard API fails without focus.** Copy buttons try
    `navigator.clipboard`, then `execCommand`, then show a selected field.

---

## 7. How to work here

- **Local preview:** `.claude/launch.json` has entries. Ports:
  4173 mc-kresha-hub, 4174 sakas-portal, 4175 sakas-idea,
  4176 proposal, 4177 clients. Use `preview_start` with the name.
  Note `serve` strips `.html` and can drop query strings, which is a
  local-only artifact but is what exposed gotcha 6 and the hash decision.
- **Verify before claiming.** Use the browser tool and read real values
  out of the page, not screenshots alone. Screenshots often fail when the
  pane is not displayed.
- **Deploy = git push**, then Monitor for the deploy, then verify live.
- Commit messages: plain, explain the why, end with
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- He often edits things himself between turns (via the admin pages or on
  github.com). **Always `git pull --rebase` before pushing.**

---

## 8. What the dashboard can already do

`clients.noiraunoir.com/admin/` — one key covers everything.

- **Money**: add a payment (date, client, what for, amount, paid/open),
  totals for paid this year / this month / outstanding, flags anything
  past the 30 day term, mark paid, remove. Stored privately.
- **Clients**: card each showing next shoot with countdown, posting plan
  progress, waiting requests. Edit / Portal / Plan / Remove. **Create** a
  client from a name: copies `_template` into a new folder and writes the
  data file in one commit.
- **Proposals**: list with status (waiting, or which package was chosen
  and when). Open / Edit / Copy link / Remove. **Create** from brand plus
  up to three prices, generating an unguessable address.
- **Idea boxes**: list with idea counts. Open / Moderate / Copy link /
  Remove. **Create** from address, kicker, title and opening line.

Client portal admin (`/<client>/admin.html`) additionally has: the whole
plan, the posting schedule, an **Import a plan** panel that parses pasted
text (tolerates bullets, numbering, bold, chatty wrappers, `03/10/2026`
dates and `19h00` times; a new post starts at every line beginning with a
date), and an **Ideas & requests** panel with two-step Remove and restore.

---

## 9. Open items

**The backlog artifact is the master list** (87 items, link in section 2).
He ticks items there. The ones flagged "start here":

- A health check that watches itself (silent failures + token expiry)
- Fold in the leftovers (see below)
- A start-a-new-month button
- Give requests a status / promote a request into the plan
- A shot list you tick off on your phone
- Track renewal and notice dates
- A Monday morning Telegram message
- Know when a proposal is being read
- The posting plan as a calendar subscription

### The duplicate that must be closed

`sakas.noiraunoir.com` still serves the OLD standalone portal from the
`sakas-portal` repo, with its own separate request pool. It has already
confused him once ("1 request waiting but there is none" — he was looking
at the old one). **Recommended fix:** turn `sakas-portal` into a forwarder
to `clients.noiraunoir.com/sakas/`, exactly as was done for the `proposal`
repo. He has been told twice and has not yet said go.

Kresha and the Sakas idea box could also fold into `clients` as `/i/<slug>/`
with redirects, but they work fine and are lower priority.

### Test entries to clean whenever

- `clients` repo: one open issue "Key restored check on the shared portal"
  (label `idea, client:sakas`)
- `sakas-portal` repo: "Telegram test"
- `proposal` repo: a "setup check" acceptance issue
- Proposal acceptances still say "via the idea box" in the footer, a
  leftover from shared plumbing

### Decision he still owes

Client portals sit at guessable addresses (`/sakas/`), unlike proposals
which are random. Anyone guessing a client name sees that client's terms
and invoice status. He has been asked whether to randomise portal
addresses or add a code, and has not answered.

---

## 10. Tone that works with him

Short, direct, no hedging. Build first, explain briefly after. Verify and
show the evidence. When something fails, diagnose it properly rather than
guessing twice: he noticed and valued that. Flag privacy and security
consequences plainly without lecturing. He types fast and informally and
often sends two-word instructions; act on the obvious reading rather than
asking, unless money, privacy or destruction is involved.
