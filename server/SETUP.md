# Setting up the server on the mini PC

This runs the database that stores accounts and Wall posts. You need the mini PC,
about 30–45 minutes, and (for a permanent address) a domain name added to a free
Cloudflare account. Tested with PocketBase 0.31.

## 1. Put PocketBase on the mini PC

1. Make a folder, e.g. `C:\theblogbook` (Windows) or `~/theblogbook` (Linux).
2. Download PocketBase from https://github.com/pocketbase/pocketbase/releases
   — pick `windows_amd64.zip` or `linux_amd64.zip` (`linux_arm64` for ARM boards) — and unzip
   `pocketbase` / `pocketbase.exe` into that folder.
3. Copy this repo's `server/pb_migrations` folder into the same folder, so you have:
   ```
   theblogbook/
     pocketbase(.exe)
     pb_migrations/1700000000_create_posts.js
     pb_migrations/1700000001_username_login.js
     pb_migrations/1700000002_profiles_groups.js
   ```

## 2. First run

In a terminal in that folder:

```bash
./pocketbase superuser upsert you@example.com 'a-long-admin-password'
./pocketbase serve --origins=https://lana6478.github.io
```

(On Windows use `.\pocketbase.exe` instead of `./pocketbase`.)

- The first `serve` creates the `posts` table and permission rules automatically.
- People sign up with just a username and password — no email is collected or stored.
- `--origins` means only your GitHub Pages site can use the server from a browser.
- The admin dashboard is at http://127.0.0.1:8090/_/ — log in with the superuser above.
  From there you can delete posts or ban users.

In the dashboard, worth doing once:
- **Settings → Rate limits**: turn on (stops someone spamming sign-ups or posts).
- **Settings → Backups**: turn on scheduled backups (e.g. daily) — this is everyone's accounts and posts.

## 3. Give it an HTTPS address (Cloudflare Tunnel)

The site is HTTPS, so the server must be too. A Cloudflare Tunnel does this without
opening any ports on your router or revealing your home IP.

**Quick test (no domain needed, address changes every restart):**
```bash
cloudflared tunnel --url http://127.0.0.1:8090
```
It prints a `https://something.trycloudflare.com` address — use that in step 5 to try things out.

**Permanent (needs a domain on Cloudflare):**
```bash
cloudflared tunnel login
cloudflared tunnel create theblogbook
cloudflared tunnel route dns theblogbook wall.yourdomain.com
```
Then create `config.yml` in cloudflared's folder (`~/.cloudflared/` or `C:\Users\<you>\.cloudflared\`):
```yaml
tunnel: theblogbook
credentials-file: <the .json file the create command printed>
ingress:
  - hostname: wall.yourdomain.com
    service: http://127.0.0.1:8090
  - service: http_status:404
```
and install it as a background service: `cloudflared service install`.

Install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

## 4. Keep PocketBase running after restarts

**Linux** — create `/etc/systemd/system/theblogbook.service`:
```ini
[Unit]
Description=theblogbook PocketBase
After=network.target

[Service]
WorkingDirectory=/home/<you>/theblogbook
ExecStart=/home/<you>/theblogbook/pocketbase serve --http=127.0.0.1:8090 --origins=https://lana6478.github.io
Restart=always
User=<you>

[Install]
WantedBy=multi-user.target
```
then `sudo systemctl enable --now theblogbook`.

**Windows** — Task Scheduler → Create Task → trigger "At startup", action
`C:\theblogbook\pocketbase.exe` with arguments
`serve --http=127.0.0.1:8090 --origins=https://lana6478.github.io`, start in `C:\theblogbook`,
and tick "Run whether user is logged on or not".

## 5. Switch the site on

1. In the repo, set the address in `config.js`:
   ```js
   window.SERVER_URL = "https://wall.yourdomain.com";
   ```
2. Merge the `pocketbase` branch into `main`. The Log In box and "Write something…" appear on the site.

If the mini PC is off, the site still works — it just shows the posts from the `posts/` folder
and a note that the server can't be reached.
