# Client portals

Every client portal lives in this one repo and is served from
`clients.noiraunoir.com/<client>/`.

- `clients.noiraunoir.com/sakas/` — the portal
- `clients.noiraunoir.com/sakas/schedule.html` — the posting plan
- `clients.noiraunoir.com/sakas/admin.html` — where you edit it (not linked anywhere)

The root and any unknown address show only the studio name, so the
domain gives nothing away on its own.

## The dashboard

`clients.noiraunoir.com/admin/` lists every client and links to each
portal, plan and admin. It finds clients by reading the data folder, so
it needs no list of its own. It also holds the access key: paste it
there once and every client admin on this site can use it.

The names `admin`, `assets`, `data` and `_template` belong to the site
itself, so they cannot be used as client names.

## Adding a client

Use the Create button on the dashboard: type the name, check the
address it suggests, press Create. It copies the three template files
into a new folder, writes the data file and commits all four at once,
so a client is never half created. It is live about a minute later.

By hand is still possible: copy `data/_example.json` to
`data/<client>.json`, copy the three files from `_template/` into a
`<client>/` folder, commit.

Either way there is no new repo, DNS record, Pages setting or relay
change, and the same key opens it.


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
