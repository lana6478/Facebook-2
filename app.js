// The Wall shows two kinds of post, newest first:
//  1. HTML files you put in the posts/ folder on GitHub (found automatically).
//     Optional first line:  <!-- date: 2004-02-10 18:00 | author: You -->
//  2. Posts people write on the page itself, stored on your PocketBase server.
//     These only appear when SERVER_URL is set in config.js.

// Works out the repo from the site's own address (user.github.io/repo), so renaming
// the repo on GitHub doesn't break anything. Falls back to this when viewed elsewhere.
const REPO = (location.hostname.endsWith('.github.io') && location.pathname.split('/')[1])
  ? `${location.hostname.split('.')[0]}/${location.pathname.split('/')[1]}`
  : 'lana6478/theblogbook';
const BRANCH = 'main';

const pb = window.SERVER_URL ? new PocketBase(window.SERVER_URL) : null;
const $ = (id) => document.getElementById(id);

// ---------- Loading posts ----------

async function loadFilePosts() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/posts?ref=${BRANCH}`);
  if (!res.ok) throw new Error('GitHub API ' + res.status);
  const files = (await res.json()).filter(f => f.type === 'file' && f.name.endsWith('.html'));
  return Promise.all(files.map(async (f) => {
    const r = await fetch(f.download_url, { cache: 'no-store' });
    const html = r.ok ? await r.text() : '<p><i>Couldn\'t load ' + f.name + '</i></p>';
    const meta = readMeta(html);
    return { source: 'file', name: f.name, html, author: meta.author || 'You', date: meta.date };
  }));
}

async function loadServerPosts() {
  if (!pb) return [];
  const records = await pb.collection('posts').getFullList({ sort: '-created', expand: 'author' });
  return records.map(r => ({
    source: 'server',
    id: r.id,
    authorId: r.author,
    author: r.expand?.author?.name || 'Someone',
    date: r.created.replace(' ', 'T').replace(/\.\d+Z$/, 'Z'),
    // Other people's HTML is cleaned so it can't run scripts on your page.
    html: DOMPurify.sanitize(r.body),
  }));
}

async function loadWall() {
  const wall = $('wall');
  const [files, server] = await Promise.allSettled([loadFilePosts(), loadServerPosts()]);
  const posts = [
    ...(files.status === 'fulfilled' ? files.value : []),
    ...(server.status === 'fulfilled' ? server.value : []),
  ];

  posts.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    if (a.date || b.date) return a.date ? 1 : -1;      // undated file posts go first
    return (b.name || '').localeCompare(a.name || '');
  });

  const problems = [];
  if (files.status === 'rejected') problems.push('Couldn\'t load the posts folder right now. Try refreshing in a minute.');
  if (server.status === 'rejected') problems.push('Couldn\'t reach the server, so posts written on the page aren\'t showing.');

  const me = pb?.authStore.isValid ? pb.authStore.record?.id : null;
  wall.innerHTML =
    problems.map(p => `<p class="error">${p}</p>`).join('') +
    (posts.map(p => `
      <div class="post">
        <div class="post-meta"><b>${escapeHtml(p.author)}</b> wrote${p.date ? ' at ' + formatDate(p.date) : ''}
          ${p.source === 'server' && p.authorId === me ? `[ <a href="#" data-delete="${p.id}">delete</a> ]` : ''}</div>
        <div class="post-body">${p.html}</div>
      </div>`).join('') || (problems.length ? '' : '<p class="loading">No posts yet.</p>'));

  $('post-count').textContent = `(${posts.length})`;
  const dated = posts.filter(p => p.date).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (dated) $('p-updated').textContent = formatDate(dated.date);
}

// ---------- Accounts (only when a server is set) ----------

function showAccount() {
  if (!pb) return;
  $('account').hidden = false;
  const loggedIn = pb.authStore.isValid;
  $('login-form').hidden = loggedIn;
  $('signup-form').hidden = true;
  $('logged-in').hidden = !loggedIn;
  $('composer').hidden = !loggedIn;
  $('account-head').textContent = loggedIn ? 'My Account' : 'Log In';
  if (loggedIn) $('me-name').textContent = pb.authStore.record?.name;
}

function message(text, isError) {
  const m = $('account-msg');
  m.hidden = !text;
  m.textContent = text || '';
  m.className = 'msg' + (isError ? ' error' : '');
}

function setupAccount() {
  if (!pb) return;

  document.querySelectorAll('[data-show]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    $('login-form').hidden = a.dataset.show !== 'login-form';
    $('signup-form').hidden = a.dataset.show !== 'signup-form';
    $('account-head').textContent = a.dataset.show === 'signup-form' ? 'Register' : 'Log In';
    message('');
  }));

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await pb.collection('users').authWithPassword(f.username.value.trim(), f.password.value);
      f.reset(); message(''); showAccount(); loadWall();
    } catch {
      message('Wrong username or password.', true);
    }
  });

  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await pb.collection('users').create({
        name: f.username.value.trim(),
        password: f.password.value, passwordConfirm: f.password.value,
      });
      await pb.collection('users').authWithPassword(f.username.value.trim(), f.password.value);
      f.reset(); message('Welcome! You can write on the Wall now.'); showAccount(); loadWall();
    } catch (err) {
      const d = err?.response?.data || {};
      const detail = Object.entries(d).map(([k, v]) => `${k}: ${v.message}`).join(' ');
      message('Couldn\'t register. ' + (d.name ? 'That username is taken or not allowed.' : (detail || 'Try a different username.')), true);
    }
  });

  $('logout').addEventListener('click', (e) => {
    e.preventDefault();
    pb.authStore.clear(); message(''); showAccount(); loadWall();
  });

  $('composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const button = f.querySelector('button');
    button.disabled = true;
    try {
      await pb.collection('posts').create({ body: f.body.value, author: pb.authStore.record.id });
      f.reset(); loadWall();
    } catch {
      alert('Couldn\'t post. You may need to log in again.');
    } finally {
      button.disabled = false;
    }
  });

  $('wall').addEventListener('click', async (e) => {
    const id = e.target.dataset?.delete;
    if (!id) return;
    e.preventDefault();
    if (!confirm('Delete this post?')) return;
    try { await pb.collection('posts').delete(id); loadWall(); }
    catch { alert('Couldn\'t delete that post.'); }
  });

  // If the saved login has expired on the server, drop it quietly.
  if (pb.authStore.isValid) {
    pb.collection('users').authRefresh().catch(() => { pb.authStore.clear(); showAccount(); loadWall(); });
  }
  showAccount();
}

// ---------- Helpers ----------

function readMeta(html) {
  const m = html.match(/<!--([\s\S]*?)-->/);
  if (!m) return {};
  const meta = {};
  m[1].split('|').forEach(part => {
    const [k, ...v] = part.split(':');
    if (k && v.length) meta[k.trim().toLowerCase()] = v.join(':').trim();
  });
  return { date: meta.date && meta.date.replace(' ', 'T'), author: meta.author };
}

function formatDate(d) {
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

setupAccount();
loadWall();
