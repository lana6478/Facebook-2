# Facebook 2

A retro recreation of a 2004-era college social network: blue header bar, Tahoma 11px, profile box and a wall of posts.

## Adding a post

1. Create a new file in `posts/`, e.g. `posts/003-my-post.html`, and type any HTML you like.
2. Add a line for it in `posts/posts.json`:

```json
{ "file": "003-my-post.html", "date": "2004-02-10T18:00", "author": "You" }
```

Posts show newest first. Your profile details are in `index.html`; swap `img/profile.svg` for your own photo.

## Viewing it

Turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). The site will be at
`https://<your-username>.github.io/Facebook-2/`.

Opening `index.html` straight from your computer won't load posts (browsers block that); use GitHub Pages
or run `python3 -m http.server` in this folder and visit http://localhost:8000.
