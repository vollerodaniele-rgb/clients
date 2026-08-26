# Client portals

Every client portal lives in this one repo and is served from
`clients.noiraunoir.com/<client>/`.

- `clients.noiraunoir.com/sakas/` — the portal
- `clients.noiraunoir.com/sakas/schedule.html` — the posting plan
- `clients.noiraunoir.com/sakas/admin.html` — where you edit it (not linked anywhere)

The root and any unknown address show only the studio name, so the
domain gives nothing away on its own.

## Adding a client

There is no code to write. Three steps, all doable on github.com:

1. Copy `data/_example.json` to `data/<client>.json` and fill it in.
   The `name` field is what appears as the big title.
2. Copy the three files from `_template/` into a new folder named
   `<client>/`. They are identical for every client: the pages work out
   which client they belong to from the folder name in the URL.
3. Commit. The portal is live at `clients.noiraunoir.com/<client>/`.

Nothing else needs touching: no DNS record, no new repo, no Pages
setting, no change to the relay, and the same admin key works.

## How it fits together

- `assets/` holds the only copy of the styles and the three scripts.
  Fixing something there fixes it for every client at once.
- `data/<client>.json` holds everything that client sees.
- Requests from a portal become issues in this repo labeled `idea` and
  `client:<client>`. The second label is what keeps one client from ever
  seeing another's requests, and it is added automatically.
- Submissions ping Telegram, naming the client.

## The admin key

One fine-grained GitHub token covers every client: repository access
`clients`, with **Contents: read and write** (to publish the plan) and
**Issues: read and write** (to clear requests). Paste it once per
browser into the Access key box on any client's admin page.

## Style

House style: pitch black, plain white text, no colors, no shadows,
Playfair Display headings with Inter body text.
