// Finds every .html file in the posts/ folder automatically (via GitHub's public API)
// and puts it on the wall, newest first. No list to keep up to date.
//
// Optional first line of a post, to set its date and author:
//   <!-- date: 2004-02-10 18:00 | author: You -->

// Works out the repo from the site's own address (user.github.io/repo), so renaming
// the repo on GitHub doesn't break anything. Falls back to this when viewed elsewhere.
const REPO = (location.hostname.endsWith('.github.io') && location.pathname.split('/')[1])
  ? `${location.hostname.split('.')[0]}/${location.pathname.split('/')[1]}`
  : 'lana6478/blogbook';
const BRANCH = 'main';

async function loadWall() {
  const wall = document.getElementById('wall');
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/posts?ref=${BRANCH}`);
    if (!res.ok) throw new Error('GitHub API ' + res.status);
    const files = (await res.json()).filter(f => f.type === 'file' && f.name.endsWith('.html'));

    const posts = await Promise.all(files.map(async (f) => {
      const r = await fetch(f.download_url, { cache: 'no-store' });
      const html = r.ok ? await r.text() : '<p><i>Couldn\'t load ' + f.name + '</i></p>';
      return { name: f.name, html, ...readMeta(html) };
    }));

    // Newest first: by date when both posts have one, otherwise by filename (higher number = newer).
    posts.sort((a, b) => (a.date && b.date) ? b.date.localeCompare(a.date) : b.name.localeCompare(a.name));

    wall.innerHTML = posts.map(p => `
      <div class="post">
        <div class="post-meta"><b>${escapeHtml(p.author || 'You')}</b> wrote${p.date ? ' at ' + formatDate(p.date) : ''}</div>
        <div class="post-body">${p.html}</div>
      </div>`).join('') || '<p class="loading">No posts yet.</p>';

    document.getElementById('post-count').textContent = `(${posts.length})`;
    const dated = posts.find(p => p.date);
    if (dated) document.getElementById('p-updated').textContent = formatDate(dated.date);
  } catch (e) {
    wall.innerHTML = '<p class="error">Couldn\'t load posts right now. Try refreshing in a minute.</p>';
  }
}

function readMeta(html) {
  const m = html.match(/<!--([\s\S]*?)-->/);
  if (!m) return {};
  const meta = {};
  m[1].split('|').forEach(part => {
    const [k, ...v] = part.split(':');
    if (k && v.length) meta[k.trim().toLowerCase()] = v.join(':').trim();
  });
  return { date: meta.date, author: meta.author };
}

function formatDate(d) {
  const dt = new Date(d.replace(' ', 'T'));
  return isNaN(dt) ? d : dt.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

loadWall();
