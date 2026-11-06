# theblogbook

A retro recreation of a 2004-era college social network: blue header bar, Tahoma 11px, profile box and a wall of posts.

## Adding a post

Create a new `.html` file in `posts/` (e.g. `posts/004-my-post.html`) and type any HTML you like.
It appears on the Wall automatically — there's no list to update.

Each post gets a date line added automatically (the time you committed it) a few seconds after you add it.
You can also write the line yourself to choose the date or author:

```html
<!-- date: 2004-02-10 18:00 | author: You -->
<p>My post goes here.</p>
```

Posts are shown newest date first; posts without a date are ordered by filename, highest number first.
Your profile details are in `index.html`; swap `img/profile.svg` for your own photo.

## Viewing it

Turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). The site will be at
`https://<your-username>.github.io/theblogbook/`.

The Wall reads the posts folder from GitHub, so new posts show up once they're committed to `main`.

## Accounts, groups and profiles

The site needs a PocketBase server you run yourself (set `SERVER_URL` in `config.js`;
setup steps are in [`server/SETUP.md`](server/SETUP.md)). With it:

- **Login screen first** — nothing is visible until you log in or register (username + password, no email).
- **The Wall** — one central wall everyone can write on (raw HTML, cleaned before it's shown),
  plus the post files from `posts/`.
- **Profiles** — everyone fills in and edits their own profile and uploads a picture.
- **Chat groups** — anyone can create a group and becomes its admin; only people the group admin
  invites can see it. Members can leave; the group admin can invite and remove people, rename
  or delete the group — but can't delete other people's messages (only the site admin can). Messages appear live.
- **Site admins** — accounts with *is_admin* ticked (in the PocketBase dashboard, or by another
  site admin on the Admin page) can see and change everything: every profile, group and message,
  set new passwords and delete accounts.

Note: the `posts/` folder is part of a public GitHub repo, so those post files can be read by
anyone on GitHub even though the site asks for a login.

## After changing app.js, style.css or config.js

Bump the `?v=` number on their lines in `index.html` (e.g. `20261106a` → `20261106b`),
otherwise phones may keep using the old copy for a while.
