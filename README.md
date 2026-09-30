# Noir au Noir: client portals and studio pages

Everything in this repo is served from `noiraunoir.com`.

- `noiraunoir.com/` forwards to `/call/`, the studio's official page
- `noiraunoir.com/<client>/` is a client's portal, `/<client>/admin.html`
  its editor (not linked anywhere)
- `noiraunoir.com/admin/` is the dashboard for everything else

## Clients

Created and removed from the dashboard. Create copies the two files in
`_template/` into a `<client>/` folder and writes `data/<client>.json`,
all in one commit, so a client is never half made. Remove deletes both
in one commit; the history keeps them.

A client's plan is `data/<client>.json`. The portal reads the studio
platform's copy of it first and this file if the platform does not
answer. Money is never in these files, because they are public: it lives
in the private repo `studio-private`.

The names the site itself uses (`admin`, `assets`, `data`, `call`,
`reels`, `p`, `i` and the rest) cannot be client names; the list is
`RESERVED` in `assets/dashboard.js`.

## Proposals and idea boxes

- `proposals/<slug>.json` holds a proposal, `p/<slug>/` its page (a copy
  of `_proposal/`). The address is random because a proposal carries
  prices meant for one client.
- `boxes/<slug>.json` holds an idea box's wording, `i/<slug>/` its page
  and moderation page (copies of `_box/`).

Requests, ideas and accepted proposals become issues in this repo, with
a label naming whose they are, so nobody ever sees another's.

## The admin key

One fine-grained GitHub token, pasted once per browser: Contents and
Issues, read and write, on this repo, and Contents, read and write, on
`studio-private`.

## How it fits together

- `assets/` holds the only copy of the styles and scripts, so a fix
  there reaches every page at once.
- Everything the pages cannot do on their own (bookings, mail, files,
  notifications) goes through the studio's relay, a Cloudflare Worker
  kept in its own repo.
- House style: glass on black, Satoshi, no colour.
