// Loads every post listed in posts/posts.json and puts it on the wall, newest first.
// Each post is a plain HTML file you write yourself in the posts/ folder.

async function loadWall() {
  const wall = document.getElementById('wall');
  try {
    const res = await fetch('posts/posts.json', { cache: 'no-store' });
    const posts = await res.json();
    posts.sort((a, b) => (a.date < b.date ? 1 : -1));

    const html = await Promise.all(posts.map(async (p) => {
      const r = await fetch('posts/' + p.file, { cache: 'no-store' });
      const body = r.ok ? await r.text() : '<p><i>Missing file: ' + p.file + '</i></p>';
      return `
        <div class="post">
          <div class="post-meta"><b>${p.author || 'You'}</b> wrote at ${formatDate(p.date)}</div>
          <div class="post-body">${body}</div>
        </div>`;
    }));

    wall.innerHTML = html.join('') || '<p class="loading">No posts yet.</p>';
    document.getElementById('post-count').textContent = `(${posts.length})`;
    if (posts[0]) document.getElementById('p-updated').textContent = formatDate(posts[0].date);
  } catch (e) {
    wall.innerHTML = '<p class="error">Couldn\'t load posts. If you opened index.html straight from your computer, ' +
      'view it through GitHub Pages or a local server instead (browsers block fetch on file://).</p>';
  }
}

function formatDate(d) {
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

loadWall();
