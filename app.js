// theblogbook — everything after the login screen.
//
// Pages (the part of the address after #):
//   #/wall                 the central Wall everyone can write on
//   #/profile/<id>         someone's profile (no id = yours)
//   #/profile/<id>/edit    edit a profile (your own, or anyone's if you're a site admin)
//   #/groups               your chat groups + make a new one
//   #/group/<id>           one chat group
//   #/notifications        what's new: added to a group, new messages, new Wall posts
//   #/admin                site admins only: every user and every group
//
// Posts and messages are written in raw HTML. Other people's HTML is always cleaned with
// DOMPurify before it's shown, so it can't run scripts on your page.

// The Wall also shows HTML files from the posts/ folder on GitHub. Works out the repo from
// the site's own address (user.github.io/repo), so renaming the repo doesn't break anything.
const REPO = (location.hostname.endsWith('.github.io') && location.pathname.split('/')[1])
  ? `${location.hostname.split('.')[0]}/${location.pathname.split('/')[1]}`
  : 'lana6478/Facebook-2';
const BRANCH = 'main';

const pb = window.SERVER_URL ? new PocketBase(window.SERVER_URL) : null;
const $ = (id) => document.getElementById(id);
const view = $('view');

const me = () => pb.authStore.record;
const isAdmin = () => !!me()?.is_admin;

// Profile questions, in the order they're shown.
const PROFILE_FIELDS = [
  ['full_name', 'Name', 60],
  ['school', 'School', 80],
  ['status', 'Status', 60],
  ['concentration', 'Concentration', 80],
  ['residence', 'Residence', 80],
  ['looking_for', 'Looking For', 120],
  ['relationship', 'Relationship Status', 60],
];

// ---------- Moving between pages ----------

let routeId = 0;      // goes up every time the page changes, so slow loads don't draw over a newer page
let cleanup = [];     // things to switch off when leaving a page (live updates)

async function route() {
  const rid = ++routeId;
  cleanup.forEach(stop => stop());
  cleanup = [];

  if (!pb) { $('no-server').hidden = false; return; }
  if (!pb.authStore.isValid) { stopNotifications(); return showLogin(); }
  showApp();
  startNotifications();

  const live = () => rid === routeId;
  const [page, id, extra] = location.hash.replace(/^#\/?/, '').split('/');
  view.innerHTML = '<p class="loading">Loading…</p>';
  try {
    switch (page) {
      case 'profile':
        if (extra === 'edit') await editProfilePage(id || me().id, live);
        else await profilePage(id || me().id, live);
        break;
      case 'groups': await groupsPage(live); break;
      case 'group': await groupPage(id, live); break;
      case 'admin': await adminPage(live); break;
      case 'help': helpPage(); break;
      case 'notifications': await notificationsPage(live); break;
      default: await wallPage(live);
    }
  } catch (err) {
    if (!live()) return;
    if (err?.status === 401) { pb.authStore.clear(); return; }
    view.innerHTML = `<div class="box"><div class="boxhead">Oops</div>
      <p class="error">${err?.status === 404 ? 'That page doesn\'t exist, or you don\'t have access to it.' : esc(errText(err))}</p></div>`;
  }
  window.scrollTo(0, 0);
}

function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

// Live updates from the server; switched off automatically when you leave the page.
function listen(collection, options, onChange, live) {
  let timer;
  const handler = () => { clearTimeout(timer); timer = setTimeout(() => live() && onChange(), 150); };
  pb.collection(collection).subscribe('*', handler, options)
    .then(stop => { if (live()) cleanup.push(stop); else stop(); })
    .catch(() => {});
}

// ---------- Login screen ----------

function showLogin() {
  $('login-screen').hidden = false;
  $('login-form').hidden = false;
  $('signup-form').hidden = true;
  $('login-head').textContent = 'Log In';
  view.hidden = true;
  view.innerHTML = '';
  $('nav').hidden = true;
}

function showApp() {
  $('login-screen').hidden = true;
  view.hidden = false;
  $('nav').hidden = false;
  $('nav-admin').hidden = !isAdmin();
}

function loginMessage(text, isError) {
  const m = $('login-msg');
  m.hidden = !text;
  m.textContent = text || '';
  m.className = 'msg' + (isError ? ' error' : '');
}

function setupLogin() {
  document.querySelectorAll('[data-show]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    $('login-form').hidden = a.dataset.show !== 'login-form';
    $('signup-form').hidden = a.dataset.show !== 'signup-form';
    $('login-head').textContent = a.dataset.show === 'signup-form' ? 'Register' : 'Log In';
    loginMessage('');
  }));

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await busy(f, async () => {
      try {
        await pb.collection('users').authWithPassword(f.username.value.trim(), f.password.value);
        f.reset(); loginMessage('');
      } catch (err) {
        loginMessage(err?.status === 429 ? 'Too many tries — wait a minute and try again.' : 'Wrong username or password.', true);
      }
    });
  });

  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const username = f.username.value.trim();
    await busy(f, async () => {
      try {
        await pb.collection('users').create({ name: username, password: f.password.value, passwordConfirm: f.password.value });
      } catch (err) {
        const d = err?.response?.data || {};
        loginMessage('Couldn\'t register. ' + (d.name ? 'That username is taken or not allowed.' : errText(err)), true);
        return;
      }
      try {
        await pb.collection('users').authWithPassword(username, f.password.value);
        f.reset(); loginMessage('');
        go('#/profile/' + me().id + '/edit');   // new people start by filling in their profile
      } catch {
        loginMessage('Account made! Now log in.', false);
      }
    });
  });

  $('logout').addEventListener('click', (e) => {
    e.preventDefault();
    pb.authStore.clear();
  });

  // Logging in or out (or the login expiring) redraws the page.
  let wasLoggedIn = pb.authStore.isValid;
  pb.authStore.onChange(() => {
    if (pb.authStore.isValid === wasLoggedIn) return;   // e.g. your own profile was just saved
    wasLoggedIn = pb.authStore.isValid;
    route();
  });
}

// ---------- The Wall ----------

async function wallPage(live) {
  view.innerHTML = `
    <div class="box">
      <div class="boxhead">The Wall <span id="post-count"></span></div>
      <form id="composer" class="composer">
        <textarea name="body" rows="3" maxlength="5000" required placeholder="Write something on the Wall… (HTML required)"></textarea>
        <div class="form-row"><button type="submit">Post</button> <a href="#/help" class="help-link">How do I format my post?</a></div>
      </form>
      <div id="wall"><p class="loading">Loading posts…</p></div>
    </div>`;

  $('composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await busy(f, async () => {
      try {
        await pb.collection('posts').create({ body: f.body.value, author: me().id });
        f.reset(); loadWall(live);
      } catch (err) { alert('Couldn\'t post. ' + errText(err)); }
    });
  });

  $('wall').addEventListener('click', async (e) => {
    const id = e.target.dataset?.delete;
    if (!id) return;
    e.preventDefault();
    if (!confirm('Delete this post?')) return;
    try { await pb.collection('posts').delete(id); loadWall(live); }
    catch (err) { alert('Couldn\'t delete that post. ' + errText(err)); }
  });

  await loadWall(live);
  listen('posts', {}, () => loadWall(live), live);
}

async function loadFilePosts() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/posts?ref=${BRANCH}`);
  if (!res.ok) throw new Error('GitHub API ' + res.status);
  const files = (await res.json()).filter(f => f.type === 'file' && f.name.endsWith('.html'));
  return Promise.all(files.map(async (f) => {
    const r = await fetch(f.download_url, { cache: 'no-store' });
    const html = r.ok ? await r.text() : '<p><i>Couldn\'t load ' + f.name + '</i></p>';
    const meta = readMeta(html);
    return { name: f.name, html, authorName: meta.author || 'You', date: meta.date };
  }));
}

async function loadServerPosts() {
  const records = await pb.collection('posts').getFullList({ sort: '-created', expand: 'author' });
  return records.map(r => ({
    id: r.id,
    author: r.expand?.author,
    authorName: r.expand?.author?.name || 'Someone',
    created: r.created,
    date: pbDate(r.created),
    html: clean(r.body),
  }));
}

let wallFiles = null;   // the posts/ folder only changes when you push, so it's loaded once per visit

async function loadWall(live) {
  const [files, server] = await Promise.allSettled([wallFiles || loadFilePosts(), loadServerPosts()]);
  if (!live() || !$('wall')) return;
  if (files.status === 'fulfilled') wallFiles = files.value;
  if (server.status === 'fulfilled') markSeen('wall', server.value[0]?.created);   // newest first

  const posts = [
    ...(files.status === 'fulfilled' ? files.value : []),
    ...(server.status === 'fulfilled' ? server.value : []),
  ];
  posts.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    if (a.date || b.date) return a.date ? 1 : -1;
    return (b.name || '').localeCompare(a.name || '');
  });

  const problems = [];
  if (files.status === 'rejected') problems.push('Couldn\'t load the posts folder right now. Try refreshing in a minute.');
  if (server.status === 'rejected') problems.push('Couldn\'t reach the server, so posts written on the page aren\'t showing.');

  $('wall').innerHTML =
    problems.map(p => `<p class="error">${p}</p>`).join('') +
    (posts.map(p => {
      const canDelete = p.id && (p.author?.id === me().id || isAdmin());
      return `
      <div class="post">
        ${p.author ? `<a href="#/profile/${p.author.id}">${avatarImg(p.author, 'small')}</a>` : '<span class="avatar small blank"></span>'}
        <div class="post-main">
          <div class="post-meta">${p.author ? userLink(p.author) : `<b>${esc(p.authorName)}</b>`} wrote${p.date ? ' at ' + formatDate(p.date) : ''}
            ${canDelete ? `[ <a href="#" data-delete="${p.id}">delete</a> ]` : ''}</div>
          <div class="post-body">${p.html}</div>
        </div>
      </div>`;
    }).join('') || (problems.length ? '' : '<p class="loading">No posts yet. Be the first!</p>'));

  $('post-count').textContent = `(${posts.length})`;
}

// ---------- Profiles ----------

async function profilePage(id, live) {
  const [u, posts] = await Promise.all([
    pb.collection('users').getOne(id),
    pb.collection('posts').getList(1, 10, { filter: pb.filter('author = {:id}', { id }), sort: '-created' }),
  ]);
  if (!live()) return;
  const mine = u.id === me().id;

  const rows = PROFILE_FIELDS
    .filter(([key]) => u[key])
    .map(([key, label]) => `<tr><th>${label}:</th><td>${esc(u[key])}</td></tr>`).join('');

  view.innerHTML = `
    <div class="box">
      <div class="boxhead">${esc(u.full_name || u.name)}'s Profile ${u.is_admin ? '<span class="badge">site admin</span>' : ''}</div>
      <div class="profile">
        <div class="photo">${avatarImg(u, 'big')}
          ${mine || isAdmin() ? `<div class="under-photo"><a href="#/profile/${u.id}/edit">${mine ? 'Edit My Profile' : 'Edit this profile'}</a></div>` : ''}
        </div>
        <table class="info">
          <tr><th>Username:</th><td>${esc(u.name)}</td></tr>
          <tr><th>Member Since:</th><td>${formatDate(pbDate(u.created), true)}</td></tr>
          ${rows}
        </table>
      </div>
      ${u.about ? `<div class="subhead">About Me</div><div class="about">${esc(u.about)}</div>` : ''}
      ${mine && !rows && !u.about && !u.avatar ? `<p class="hint pad">Your profile is empty. <a href="#/profile/${u.id}/edit">Fill it in</a> so people know who you are.</p>` : ''}
    </div>

    <div class="box">
      <div class="boxhead">Recent Wall posts by ${esc(u.name)}</div>
      ${posts.items.map(p => `
        <div class="post"><div class="post-main">
          <div class="post-meta">${formatDate(pbDate(p.created))}</div>
          <div class="post-body">${clean(p.body)}</div>
        </div></div>`).join('') || '<p class="loading">Nothing yet.</p>'}
    </div>`;
}

async function editProfilePage(id, live) {
  if (id !== me().id && !isAdmin()) return go('#/profile/' + id);
  const u = await pb.collection('users').getOne(id);
  if (!live()) return;
  const mine = u.id === me().id;

  view.innerHTML = `
    <div class="box">
      <div class="boxhead">${mine ? 'Edit My Profile' : 'Edit ' + esc(u.name) + '\'s Profile'}</div>
      <form id="profile-form" class="form">
        <div class="photo-edit">
          ${avatarImg(u, 'big')}
          <div>
            <label>Picture: <input type="file" name="avatar" accept="image/jpeg,image/png,image/gif,image/webp"></label>
            <p class="hint">JPG, PNG, GIF or WEBP, up to 5 MB.</p>
            ${u.avatar ? '<label class="check"><input type="checkbox" name="remove_avatar"> Remove my picture</label>' : ''}
          </div>
        </div>
        ${PROFILE_FIELDS.map(([key, label, max]) => `
          <label>${label}: <input type="text" name="${key}" maxlength="${max}" value="${esc(u[key] || '')}"></label>`).join('')}
        <label>About Me: <textarea name="about" rows="5" maxlength="2000">${esc(u.about || '')}</textarea></label>
        <div class="form-row">
          <button type="submit">Save Changes</button>
          or <a href="#/profile/${u.id}">cancel</a>
        </div>
        <p id="profile-msg" class="msg" hidden></p>
      </form>
    </div>

    <div class="box">
      <div class="boxhead">${mine ? 'Change My Password' : 'Set a New Password for ' + esc(u.name)}</div>
      <form id="password-form" class="form">
        ${mine ? '<label>Current password: <input type="password" name="old" required autocomplete="current-password"></label>' : ''}
        <label>New password: <input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
        <div class="form-row"><button type="submit">Change Password</button></div>
        <p id="password-msg" class="msg" hidden></p>
      </form>
    </div>`;

  $('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const data = new FormData();
    PROFILE_FIELDS.forEach(([key]) => data.append(key, f[key].value.trim()));
    data.append('about', f.about.value.trim());
    if (f.avatar.files[0]) data.append('avatar', f.avatar.files[0]);
    else if (f.remove_avatar?.checked) data.append('avatar', '');
    await busy(f, async () => {
      try {
        await pb.collection('users').update(u.id, data);
        go('#/profile/' + u.id);
      } catch (err) { note('profile-msg', 'Couldn\'t save. ' + errText(err), true); }
    });
  });

  $('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { password: f.password.value, passwordConfirm: f.password.value };
    if (mine) body.oldPassword = f.old.value;
    await busy(f, async () => {
      try {
        await pb.collection('users').update(u.id, body);
        f.reset();
        // Changing your own password logs you out everywhere, so log straight back in.
        if (mine) await pb.collection('users').authWithPassword(u.name, body.password);
        note('password-msg', 'Password changed.');
      } catch (err) {
        note('password-msg', err?.response?.data?.oldPassword ? 'Your current password is wrong.' : 'Couldn\'t change it. ' + errText(err), true);
      }
    });
  });
}

// ---------- Help: how to format posts ----------

// Each example shows the HTML to type, then what it looks like (run through the same
// cleaning as real posts, so what you see here is exactly what a post would show).
const HELP_SECTIONS = [
  ['Starting a new line', 'HTML ignores the Enter key, so use <code>&lt;br&gt;</code> for a new line.',
   'First line<br>\nSecond line<br>\nThird line'],
  ['Paragraphs', 'Put each paragraph inside <code>&lt;p&gt;</code> … <code>&lt;/p&gt;</code> to get a gap between them.',
   '<p>This is the first paragraph.</p>\n<p>This is the second one.</p>'],
  ['Bold, italic, underline, crossed out', '',
   '<b>bold</b> <i>italic</i> <u>underlined</u> <del>crossed out</del>'],
  ['Headings', '',
   '<h2>Party this Friday!</h2>\n<h3>Room 33, 9pm</h3>'],
  ['Lists', '<code>&lt;ul&gt;</code> for bullet points, <code>&lt;ol&gt;</code> for a numbered list.',
   '<ul>\n  <li>Bring snacks</li>\n  <li>Bring music</li>\n</ul>\n<ol>\n  <li>Numbered one</li>\n  <li>Numbered two</li>\n</ol>'],
  ['Links', '',
   '<a href="https://www.wikipedia.org">Click here</a>'],
  ['Pictures', 'Use the address of a picture that\'s already online. <code>width</code> sets its size.',
   '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png" width="150">'],
  ['Colours and sizes', '',
   '<span style="color: red;">Red text</span>\n<span style="font-size: 20px;">Big text</span>\n<span style="background: yellow;">Highlighted</span>\n<mark>Also highlighted</mark>'],
  ['A dividing line', '',
   'Before<hr>After'],
  ['A quote', '',
   '<blockquote>"I\'m not a bad guy." — someone, probably</blockquote>'],
  ['A hidden spoiler', 'Opens when someone clicks it.',
   '<details>\n  <summary>Click to see the answer</summary>\n  It was the roommate all along.\n</details>'],
  ['A small table', '',
   '<table border="1" cellpadding="4">\n  <tr><th>Name</th><th>Dorm</th></tr>\n  <tr><td>Sam</td><td>Kirkland</td></tr>\n  <tr><td>Alex</td><td>Eliot</td></tr>\n</table>'],
  ['Putting it all together', '',
   '<h3>Weekend plans</h3>\n<p>Hey everyone, <b>don\'t forget</b>:</p>\n<ul>\n  <li>Friday – <span style="color: blue;">movie night</span></li>\n  <li>Saturday – study group <i>(ugh)</i></li>\n</ul>\n<p>See you there!<br>— Sam</p>'],
];

function helpPage() {
  view.innerHTML = `
    <div class="box">
      <div class="boxhead">How to Format Your Posts</div>
      <p class="pad">Wall posts and group messages are written in <b>HTML</b>. Plain text works for a
        one-line message, but for new lines, bold, links, pictures and more you use the tags below.
        Copy an example, paste it into the box, and change the words.</p>
      <p class="pad hint">Scripts, forms and anything that covers the page are removed automatically,
        so nobody can break the site for everyone else.</p>
    </div>
    ${HELP_SECTIONS.map(([title, note, code], i) => `
      <div class="box">
        <div class="boxhead">${esc(title)}</div>
        ${note ? `<p class="pad">${note}</p>` : ''}
        <div class="help-example">
          <div class="help-label">Type this: <a href="#" data-copy="${i}">copy</a></div>
          <pre class="help-code">${esc(code)}</pre>
          <div class="help-label">It looks like this:</div>
          <div class="post-body help-result">${clean(code)}</div>
        </div>
      </div>`).join('')}
    <p class="pad"><a href="#/wall">« Back to the Wall</a></p>`;

  view.querySelectorAll('[data-copy]').forEach(a => a.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await navigator.clipboard.writeText(HELP_SECTIONS[a.dataset.copy][2]); a.textContent = 'copied!'; }
    catch { a.textContent = 'select the text to copy'; }
    setTimeout(() => { a.textContent = 'copy'; }, 1500);
  }));
}

// ---------- Chat groups ----------

async function groupsPage(live) {
  const mine = await pb.collection('members').getFullList({
    filter: pb.filter('user = {:me}', { me: me().id }), expand: 'group,group.owner',
  });
  if (!live()) return;
  const groups = mine.map(m => m.expand?.group).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

  view.innerHTML = `
    <div class="box">
      <div class="boxhead">My Groups (${groups.length})</div>
      ${groups.map(g => `
        <div class="row">
          <a href="#/group/${g.id}"><b>${esc(g.name)}</b></a><span class="badge" data-unread-group="${g.id}" hidden></span>
          <span class="dim">${g.owner === me().id ? 'you run this group' : 'run by ' + esc(g.expand?.owner?.name || '?')}</span>
        </div>`).join('') || '<p class="loading">You\'re not in any groups yet. Make one below, or ask someone to invite you.</p>'}
    </div>

    <div class="box">
      <div class="boxhead">Create a Group</div>
      <form id="new-group" class="form">
        <label>Group name: <input type="text" name="name" required maxlength="60"></label>
        <p class="hint">Groups are private: only people you invite can see them. You'll be the group's admin.</p>
        <div class="form-row"><button type="submit">Create Group</button></div>
        <p id="group-msg" class="msg" hidden></p>
      </form>
    </div>`;

  $('new-group').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await busy(f, async () => {
      try {
        const g = await pb.collection('groups').create({ name: f.name.value.trim(), owner: me().id });
        await pb.collection('members').create({ group: g.id, user: me().id });
        go('#/group/' + g.id);
      } catch (err) { note('group-msg', 'Couldn\'t create it. ' + errText(err), true); }
    });
  });

  showBadges();
  // Someone adds you to a group (or removes you) → redraw the list.
  listen('members', { filter: pb.filter('user = {:me}', { me: me().id }) }, route, live);
}

async function groupPage(id, live) {
  const group = await pb.collection('groups').getOne(id, { expand: 'owner' });
  if (!live()) return;
  const runsIt = group.owner === me().id;

  view.innerHTML = `
    <div class="group-layout">
      <div class="box group-chat">
        <div class="boxhead">${esc(group.name)}</div>
        <div id="messages"><p class="loading">Loading messages…</p></div>
        <form id="say" class="composer" hidden>
          <textarea name="body" rows="2" maxlength="5000" required placeholder="Write a message… (HTML required, Ctrl+Enter sends)"></textarea>
          <div class="form-row"><button type="submit">Send</button> <a href="#/help" class="help-link">Formatting help</a></div>
        </form>
        <p id="not-member" class="hint pad" hidden>You're looking at this group as a site admin. You're not a member, so you can't write here.</p>
      </div>

      <div class="group-side">
        <div class="box">
          <div class="boxhead">Members</div>
          <div id="member-list"></div>
          ${runsIt || isAdmin() ? `
          <form id="invite" class="form">
            <label>Invite someone (username): <input type="text" name="username" required autocapitalize="off"></label>
            <div class="form-row"><button type="submit">Invite</button></div>
            <p id="invite-msg" class="msg" hidden></p>
          </form>` : ''}
        </div>

        <div class="box">
          <div class="boxhead">Group Options</div>
          <div class="form">
            <p>Group admin: ${userLink(group.expand?.owner)}</p>
            ${runsIt || isAdmin() ? `
              <p><a href="#" id="rename">Rename group</a></p>
              <p><a href="#" id="delete-group">Delete group</a></p>` : ''}
            ${!runsIt ? '<p><a href="#" id="leave" hidden>Leave group</a></p>' : ''}
          </div>
        </div>
      </div>
    </div>`;

  let myMembership = null;
  let newestMessage = null;
  let memberList = [];
  const readAt = {};   // site admins only: user id → when they last read this group

  // Never lets a problem here stop the group from opening (e.g. the server hasn't
  // been updated with the read-receipts file yet) — the "Seen by" lines just don't show.
  let readsWork = false;
  async function loadReads() {
    if (!isAdmin()) return;
    try {
      const rows = await pb.collection('seen').getFullList({ filter: pb.filter('key = {:id}', { id }) });
      for (const k in readAt) delete readAt[k];
      rows.forEach(r => { readAt[r.user] = r.at; });
      readsWork = true;
    } catch { readsWork = false; }
  }

  // "Seen by …" under a message, for site admins.
  function seenLine(m) {
    if (!isAdmin() || !readsWork) return '';
    const others = memberList.filter(x => x.user !== m.author && x.expand?.user);
    if (!others.length) return '';
    const readers = others.filter(x => readAt[x.user] >= m.created).map(x => x.expand.user.name);
    const text = !readers.length ? 'Not seen by anyone yet'
      : readers.length === others.length ? 'Seen by everyone'
      : 'Seen by ' + readers.join(', ');
    return `<div class="seen-by" title="Only site admins can see this">${esc(text)}</div>`;
  }

  async function loadMembers() {
    const list = await pb.collection('members').getFullList({
      filter: pb.filter('group = {:id}', { id }), expand: 'user', sort: 'created',
    });
    if (!live()) return;
    myMembership = list.find(m => m.user === me().id) || null;
    memberList = list;
    if (!myMembership && !isAdmin()) return go('#/groups');   // you were removed
    $('say').hidden = !myMembership;
    $('not-member').hidden = !!myMembership;
    if ($('leave')) $('leave').hidden = !myMembership;
    $('member-list').innerHTML = list.map(m => `
      <div class="row member">
        ${avatarImg(m.expand?.user, 'small')} ${userLink(m.expand?.user)}
        ${m.user === group.owner ? '<span class="dim">(admin)</span>' : ''}
        ${(runsIt || isAdmin()) && m.user !== group.owner ? `[ <a href="#" data-remove="${m.id}">remove</a> ]` : ''}
      </div>`).join('');
  }

  async function loadMessages() {
    const box = $('messages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const res = await pb.collection('messages').getList(1, 200, {
      filter: pb.filter('group = {:id}', { id }), sort: '-created', expand: 'author',
    });
    if (!live()) return;
    box.innerHTML = res.items.reverse().map(m => `
      <div class="post">
        <a href="#/profile/${m.author}">${avatarImg(m.expand?.author, 'small')}</a>
        <div class="post-main">
          <div class="post-meta">${userLink(m.expand?.author)} at ${formatDate(pbDate(m.created))}
            ${m.author === me().id || isAdmin() ? `[ <a href="#" data-delete="${m.id}">delete</a> ]` : ''}</div>
          <div class="post-body">${clean(m.body)}</div>
          ${seenLine(m)}
        </div>
      </div>`).join('') || '<p class="loading">No messages yet. Say hello!</p>';
    if (nearBottom || !loadMessages.done) box.scrollTop = box.scrollHeight;
    loadMessages.done = true;
    newestMessage = res.items[res.items.length - 1]?.created;   // (list was reversed above)
    if (myMembership) markSeen(id, latest(newestMessage, myMembership.created));
  }

  await Promise.all([loadMembers(), loadReads()]);
  await loadMessages();
  if (myMembership) markSeen(id, latest(newestMessage, myMembership.created));
  listen('messages', { filter: pb.filter('group = {:id}', { id }) }, loadMessages, live);
  listen('members', { filter: pb.filter('group = {:id}', { id }) },
    async () => { await loadMembers(); if (isAdmin()) loadMessages(); }, live);
  if (isAdmin()) {
    listen('seen', { filter: pb.filter('key = {:id}', { id }) },
      async () => { await loadReads(); loadMessages(); }, live);
  }

  const say = $('say');
  say.addEventListener('submit', async (e) => {
    e.preventDefault();
    await busy(say, async () => {
      try {
        await pb.collection('messages').create({ group: id, author: me().id, body: say.body.value });
        say.reset(); await loadMessages(); $('messages').scrollTop = $('messages').scrollHeight;
        say.body.focus();
      } catch (err) { alert('Couldn\'t send. ' + errText(err)); }
    });
  });
  say.body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); say.requestSubmit(); }
  });

  $('messages').addEventListener('click', async (e) => {
    const mid = e.target.dataset?.delete;
    if (!mid) return;
    e.preventDefault();
    if (!confirm('Delete this message?')) return;
    try { await pb.collection('messages').delete(mid); loadMessages(); }
    catch (err) { alert('Couldn\'t delete it. ' + errText(err)); }
  });

  $('member-list').addEventListener('click', async (e) => {
    const mid = e.target.dataset?.remove;
    if (!mid) return;
    e.preventDefault();
    if (!confirm('Remove this person from the group?')) return;
    try { await pb.collection('members').delete(mid); loadMembers(); }
    catch (err) { alert('Couldn\'t remove them. ' + errText(err)); }
  });

  $('invite')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const wanted = f.username.value.trim().toLowerCase();
    await busy(f, async () => {
      try {
        const found = await pb.collection('users').getList(1, 50, { filter: pb.filter('name ~ {:n}', { n: wanted }) });
        const user = found.items.find(u => u.name.toLowerCase() === wanted);
        if (!user) return note('invite-msg', 'There\'s nobody called "' + f.username.value.trim() + '".', true);
        await pb.collection('members').create({ group: id, user: user.id });
        f.reset(); note('invite-msg', user.name + ' is now in the group.'); loadMembers();
      } catch (err) {
        note('invite-msg', err?.response?.data?.user || err?.response?.data?.group ? 'They\'re already in the group.' : 'Couldn\'t invite them. ' + errText(err), true);
      }
    });
  });

  $('rename')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const name = prompt('New name for the group:', group.name);
    if (!name || !name.trim()) return;
    try { await pb.collection('groups').update(id, { name: name.trim() }); route(); }
    catch (err) { alert('Couldn\'t rename it. ' + errText(err)); }
  });

  $('delete-group')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm('Delete "' + group.name + '" and all its messages for everyone? This can\'t be undone.')) return;
    try { await pb.collection('groups').delete(id); go('#/groups'); }
    catch (err) { alert('Couldn\'t delete it. ' + errText(err)); }
  });

  $('leave')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!myMembership || !confirm('Leave this group? You\'ll need to be invited again to come back.')) return;
    try { await pb.collection('members').delete(myMembership.id); go('#/groups'); }
    catch (err) { alert('Couldn\'t leave. ' + errText(err)); }
  });
}

// ---------- Notifications ----------
//
// Nothing is sent anywhere: the site counts what's new since you last looked.
// "Last looked" times live in the private "seen" collection: one row per thing
// ("wall", "notifs", or a group's id). Times come from the server's own records,
// so a phone with the wrong clock can't mess them up.

const seen = {};             // key → seen record
let seenLoaded = false;
let notif = { wall: 0, groups: {}, groupNames: {}, added: [], total: 0 };
let notifStops = [];         // live updates for the counters (separate from page ones)
let notifStarting = false;
let notifTimer = null;
let onNotifChange = null;    // the notifications page redraws itself through this

function latest(...dates) {
  return dates.filter(Boolean).sort().pop();
}

function startNotifications() {
  if (notifStops.length || notifStarting) return;
  notifStarting = true;
  const meId = me().id;
  Promise.all([
    pb.collection('posts').subscribe('*', refreshNotifications),
    pb.collection('messages').subscribe('*', refreshNotifications),
    pb.collection('members').subscribe('*', refreshNotifications, { filter: pb.filter('user = {:me}', { me: meId }) }),
  ]).then(stops => {
    if (pb.authStore.isValid) notifStops = stops; else stops.forEach(stop => stop());
  }).catch(() => {}).finally(() => { notifStarting = false; });
  refreshNotifications();
}

function stopNotifications() {
  notifStops.forEach(stop => stop());
  notifStops = [];
  clearTimeout(notifTimer);
  for (const k in seen) delete seen[k];
  seenLoaded = false;
  notif = { wall: 0, groups: {}, groupNames: {}, added: [], total: 0 };
  showBadges();
}

async function loadSeen() {
  const rows = await pb.collection('seen').getFullList({ filter: pb.filter('user = {:me}', { me: me().id }) });
  for (const k in seen) delete seen[k];
  rows.forEach(r => { seen[r.key] = r; });
  seenLoaded = true;
}

// Remember that you've seen everything up to "at" (a server timestamp).
async function markSeen(key, at) {
  if (!at || !pb.authStore.isValid) return;
  try {
    if (!seenLoaded) await loadSeen();
    const row = seen[key];
    if (row && row.at >= at) return;
    seen[key] = row
      ? await pb.collection('seen').update(row.id, { at })
      : await pb.collection('seen').create({ user: me().id, key, at });
  } catch {
    await loadSeen().catch(() => {});   // e.g. another tab saved it first
  }
  refreshNotifications();
}

function refreshNotifications() {
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => countNotifications().catch(() => {}), 300);
}

async function countNotifications() {
  if (!pb.authStore.isValid) return;
  const meId = me().id;
  if (!seenLoaded) await loadSeen();

  const mine = await pb.collection('members').getFullList({
    filter: pb.filter('user = {:me}', { me: meId }), expand: 'group,group.owner',
  });
  const myGroups = mine.filter(m => m.expand?.group);

  // New Wall posts by other people.
  const wallSince = seen.wall?.at || me().created;
  const wall = await pb.collection('posts').getList(1, 1, {
    filter: pb.filter('created > {:t} && author != {:me}', { t: wallSince, me: meId }), fields: 'id',
  });

  // New messages by other people, per group, since you last opened that group.
  const groups = {};
  if (myGroups.length) {
    const since = myGroups.map(m => pb.filter('(group = {:g} && created > {:t})', {
      g: m.group, t: seen[m.group]?.at || m.created,
    }));
    const unread = await pb.collection('messages').getList(1, 500, {
      filter: `(${since.join(' || ')}) && ` + pb.filter('author != {:me}', { me: meId }),
      fields: 'group', skipTotal: true,
    });
    unread.items.forEach(m => { groups[m.group] = (groups[m.group] || 0) + 1; });
  }

  // Groups someone else added you to, that you haven't looked at yet.
  const notifsSince = seen.notifs?.at || me().created;
  const added = myGroups.filter(m =>
    m.expand.group.owner !== meId && m.created > notifsSince && !(seen[m.group]?.at >= m.created));

  if (!pb.authStore.isValid || me().id !== meId) return;   // logged out while counting
  const groupTotal = Object.values(groups).reduce((a, b) => a + b, 0);
  notif = {
    wall: wall.totalItems, groups, added,
    groupNames: Object.fromEntries(myGroups.map(m => [m.group, m.expand.group.name])),
    total: wall.totalItems + groupTotal + added.length,
  };
  showBadges();
  onNotifChange?.();
}

function badge(el, n) {
  if (!el) return;
  el.hidden = !n;
  el.textContent = n > 99 ? '99+' : String(n || '');
}

function showBadges() {
  const groupTotal = Object.values(notif.groups).reduce((a, b) => a + b, 0);
  badge($('badge-wall'), notif.wall);
  badge($('badge-groups'), groupTotal + notif.added.length);
  badge($('badge-notifs'), notif.total);
  document.querySelectorAll('[data-unread-group]').forEach(el =>
    badge(el, (notif.groups[el.dataset.unreadGroup] || 0) +
              (notif.added.some(m => m.group === el.dataset.unreadGroup) ? 1 : 0)));
  document.title = (notif.total ? `(${notif.total}) ` : '') + '[ theblogbook ]';
}

async function notificationsPage(live) {
  try { await countNotifications(); }
  catch {
    if (!live()) return;
    view.innerHTML = `<div class="box"><div class="boxhead">Notifications</div>
      <p class="loading">Notifications aren't switched on on the server yet.</p></div>`;
    return;
  }
  if (!live()) return;

  // "You were added to…" notices stay listed while you're on this page (so you can
  // still click them), even though opening the page marks them as seen.
  const addedHere = new Map(notif.added.map(m => [m.id, m]));

  const draw = () => {
    if (!live() || !$('notif-list')) return;
    notif.added.forEach(m => addedHere.set(m.id, m));
    const items = [
      ...[...addedHere.values()].sort((a, b) => b.created.localeCompare(a.created)).map(m => `
        <div class="row notif">
          ${avatarImg(m.expand.group.expand?.owner, 'small')}
          <span>You were added to <a href="#/group/${m.group}"><b>${esc(m.expand.group.name)}</b></a>
            <span class="dim">(run by ${esc(m.expand.group.expand?.owner?.name || '?')}) · ${formatDate(pbDate(m.created))}</span></span>
        </div>`),
      ...Object.entries(notif.groups).map(([g, n]) => `
        <div class="row notif">
          <span class="notif-count">${n > 99 ? '99+' : n}</span>
          <span>new message${n === 1 ? '' : 's'} in <a href="#/group/${g}"><b>${esc(notif.groupNames[g] || 'a group')}</b></a></span>
        </div>`),
      ...(notif.wall ? [`
        <div class="row notif">
          <span class="notif-count">${notif.wall > 99 ? '99+' : notif.wall}</span>
          <span>new post${notif.wall === 1 ? '' : 's'} on <a href="#/wall"><b>the Wall</b></a></span>
        </div>`] : []),
    ];
    $('notif-list').innerHTML = items.join('') ||
      '<p class="loading">Nothing new. You\'re all caught up!</p>';
  };

  view.innerHTML = `
    <div class="box">
      <div class="boxhead">Notifications</div>
      <div id="notif-list"></div>
      <p class="hint pad">Message and Wall counts clear when you open the group or the Wall.</p>
    </div>`;
  draw();
  onNotifChange = draw;
  cleanup.push(() => { if (onNotifChange === draw) onNotifChange = null; });

  markSeen('notifs', latest(...notif.added.map(m => m.created)));
}

// ---------- Site admin ----------

async function adminPage(live) {
  if (!isAdmin()) return go('#/wall');
  const [users, groups] = await Promise.all([
    pb.collection('users').getFullList({ sort: 'name' }),
    pb.collection('groups').getFullList({ sort: 'name', expand: 'owner' }),
  ]);
  if (!live()) return;

  view.innerHTML = `<div id="admin">
    <div class="box">
      <div class="boxhead">Site Admin — Everyone (${users.length})</div>
      <p class="hint pad">You can see and change everything here. Open a profile to edit it or set a new password.</p>
      <table class="admin-table">
        <tr><th></th><th>Username</th><th>Joined</th><th>Site admin</th><th></th></tr>
        ${users.map(u => `
          <tr>
            <td>${avatarImg(u, 'small')}</td>
            <td>${userLink(u)}${u.full_name ? `<br><span class="dim">${esc(u.full_name)}</span>` : ''}</td>
            <td>${formatDate(pbDate(u.created), true)}</td>
            <td><input type="checkbox" data-admin="${u.id}" ${u.is_admin ? 'checked' : ''} ${u.id === me().id ? 'disabled title="You can\'t remove your own admin"' : ''}></td>
            <td class="actions">
              <a href="#/profile/${u.id}/edit">edit</a>
              ${u.id === me().id ? '' : `· <a href="#" data-delete-user="${u.id}" data-name="${esc(u.name)}">delete</a>`}
            </td>
          </tr>`).join('')}
      </table>
    </div>

    <div class="box">
      <div class="boxhead">Site Admin — Every Group (${groups.length})</div>
      ${groups.map(g => `
        <div class="row">
          <a href="#/group/${g.id}"><b>${esc(g.name)}</b></a>
          <span class="dim">run by ${esc(g.expand?.owner?.name || '?')}, made ${formatDate(pbDate(g.created), true)}</span>
          [ <a href="#" data-delete-group="${g.id}" data-name="${esc(g.name)}">delete</a> ]
        </div>`).join('') || '<p class="loading">No groups yet.</p>'}
    </div></div>`;

  $('admin').addEventListener('change', async (e) => {
    const id = e.target.dataset?.admin;
    if (!id) return;
    try { await pb.collection('users').update(id, { is_admin: e.target.checked }); }
    catch (err) { e.target.checked = !e.target.checked; alert('Couldn\'t change that. ' + errText(err)); }
  });

  $('admin').addEventListener('click', async (e) => {
    const { deleteUser, deleteGroup, name } = e.target.dataset || {};
    if (!deleteUser && !deleteGroup) return;
    e.preventDefault();
    const what = deleteUser
      ? `Delete the account "${name}"? Their posts, messages and groups are deleted too. This can't be undone.`
      : `Delete the group "${name}" and all its messages? This can't be undone.`;
    if (!confirm(what)) return;
    try {
      if (deleteUser) await pb.collection('users').delete(deleteUser);
      else await pb.collection('groups').delete(deleteGroup);
      route();
    } catch (err) { alert('Couldn\'t delete it. ' + errText(err)); }
  });
}

// ---------- Helpers ----------

function avatarImg(u, size) {
  const src = u?.avatar ? pb.files.getURL(u, u.avatar, { thumb: size === 'big' ? '140x170' : '50x50' }) : 'img/profile.svg';
  return `<img class="avatar ${size}" src="${src}" alt="">`;
}

function userLink(u) {
  return u ? `<a href="#/profile/${u.id}"><b>${esc(u.name)}</b></a>` : '<b>Someone</b>';
}

// Disables a form's buttons while something is being sent.
async function busy(form, fn) {
  const buttons = form.querySelectorAll('button');
  buttons.forEach(b => b.disabled = true);
  try { await fn(); } finally { buttons.forEach(b => b.disabled = false); }
}

function note(id, text, isError) {
  const m = $(id);
  if (!m) return;
  m.hidden = !text;
  m.textContent = text;
  m.className = 'msg' + (isError ? ' error' : '');
}

function errText(err) {
  const d = err?.response?.data;
  if (d && Object.keys(d).length) return Object.values(d).map(v => v.message).join(' ');
  if (err?.status === 403) return 'You\'re not allowed to do that.';
  if (err?.status === 0) return 'Couldn\'t reach the server.';
  return err?.response?.message || err?.message || '';
}

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

// PocketBase dates look like "2026-11-05 23:50:11.239Z".
function pbDate(s) {
  return s ? s.replace(' ', 'T') : '';
}

function formatDate(d, dayOnly) {
  const dt = new Date(d);
  if (isNaN(dt)) return esc(d || '');
  return dt.toLocaleString('en-US', dayOnly
    ? { month: 'long', day: 'numeric', year: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Cleans someone's HTML before it's shown. Formatting, links and pictures work; scripts,
// <style> and anything form-like (fake "log in again" boxes) are removed.
function clean(html) {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['formaction', 'form'],
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Start ----------

window.addEventListener('hashchange', route);

(async () => {
  if (!pb) return route();
  setupLogin();
  if (pb.authStore.isValid) {
    // Picks up profile/admin changes and drops a login that has expired on the server.
    try { await pb.collection('users').authRefresh(); }
    catch (err) { if (err?.status === 401 || err?.status === 403 || err?.status === 404) pb.authStore.clear(); }
  }
  route();
})();
