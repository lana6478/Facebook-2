# Blogbook

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
`https://<your-username>.github.io/blogbook/`.

The Wall reads the posts folder from GitHub, so new posts show up once they're committed to `main`.
