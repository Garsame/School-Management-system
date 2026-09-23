# Deployment runbook — MadrasaHub on onepercenttech.com

**Server:** DIME VPS, `root@104.237.2.66`, hostname `onepercenttechteamserver`
**Domain:** `onepercenttech.com` (Namecheap)
**Written:** 23 September 2026

Follow this from top to bottom. Every command is meant to be copied as written. Where you
must choose or paste something of your own, the line says so.

This runbook replaces `PRODUCTION_DEPLOYMENT.md` for this server. That file describes an
older deployment on a different domain.

---

## 0. Read this first — four things about this app

These are not general advice. They are specific to how this app is built, and getting any of
them wrong means the site loads but nobody can sign in.

**1. One address serves everything.**
Node serves the React pages *and* the API from the same address. There is no separate
frontend server. Nginx sits in front and passes everything to Node on port 5112.

```
Browser ──HTTPS──> Nginx (443) ──HTTP──> Node (127.0.0.1:5112) ──> MongoDB (127.0.0.1:27017)
                                              │
                                              ├── serves frontend/dist  (the React pages)
                                              ├── serves /api           (the API)
                                              └── serves /uploads       (logos, avatars)
```

**2. HTTPS is not optional.**
In production the login cookie is named `__Host-access_token`. That name is a browser rule:
the cookie is refused unless it arrives over HTTPS. So **on plain HTTP nobody can log in at
all** — the page loads, you type your password, and you land back on the login screen with no
error. If you see that, the cause is almost always missing or broken HTTPS.

**3. `TRUST_PROXY` must be set.**
Node sits behind Nginx. Without `TRUST_PROXY=loopback` in the environment file, Node thinks
every request came from the server itself. Two things break: secure cookies, and the rate
limiter starts counting all visitors as one person and locks everyone out.

**4. The `uploads` folder holds real files.**
School logos and staff photos live in `backend/uploads`. They are **not** in git. If you
delete that folder during an update, every logo disappears. Section 12 keeps it safe.

---

## 1. Decisions to confirm before you start

**Which address?** This runbook uses:

```
https://school.onepercenttech.com
```

A subdomain is the right choice because `onepercenttech.com` is your company site, and this
server is a team server that may run other things. Keeping the school app on its own name
means you can move it later without touching your main site.

If you want the app on the bare `onepercenttech.com` instead, see section 15. Everything else
is the same; only the name changes.

**Other choices already made for you, with the reason:**

| Choice | Value | Why |
| --- | --- | --- |
| Node | 22 LTS | What the app is built and tested on |
| MongoDB | 8.0 | Mongoose 9 needs 6.0 or newer; 8.0 is current and supported |
| App folder | `/opt/madrasahub` | Standard place for self-installed software |
| Linux user | `madrasahub` | The app must never run as root |
| Node port | `127.0.0.1:5112` | Local only. Never open this port to the internet |
| Mongo port | `127.0.0.1:27017` | Local only. Never open this port to the internet |

---

## 2. Point the domain at the server

Do this first. The certificate in section 9 will not work until DNS has spread.

1. Sign in to Namecheap.
2. **Domain List** → find `onepercenttech.com` → **Manage**.
3. Open the **Advanced DNS** tab.
4. **Add New Record**:

   | Field | Value |
   | --- | --- |
   | Type | `A Record` |
   | Host | `school` |
   | Value | `104.237.2.66` |
   | TTL | `Automatic` |

5. Save.

Wait, then check it from your own machine:

```bash
nslookup school.onepercenttech.com
```

It must answer `104.237.2.66`. Namecheap is usually a few minutes; allow up to an hour. **Do
not continue until this is right.**

---

## 3. Make the server safe

Log in:

```bash
ssh root@104.237.2.66
```

### 3.1 Update the system

```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban git curl gnupg unattended-upgrades
```

### 3.2 Create the user that runs the app

```bash
adduser --system --group --home /opt/madrasahub --shell /usr/sbin/nologin madrasahub
```

`--system` and `nologin` mean nobody can log in as this user. It exists only to run the app.

### 3.3 Close every port except the three you need

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
```

The list must show **only** 22, 80 and 443. If 5112 or 27017 appear, remove them:

```bash
ufw delete allow 5112
ufw delete allow 27017
```

### 3.4 Turn on automatic security updates

```bash
dpkg-reconfigure --priority=low unattended-upgrades
```

### 3.5 Protect SSH

`fail2ban` is already installed and bans repeated failed logins. Start it:

```bash
systemctl enable --now fail2ban
```

**Strongly recommended:** switch SSH to a key and turn off password login. From *your own*
machine, not the server:

```bash
ssh-copy-id root@104.237.2.66
```

Then on the server, edit `/etc/ssh/sshd_config`, set `PasswordAuthentication no`, and run
`systemctl restart ssh`. **Test a new SSH session in a second window before closing this
one** — if the key is wrong you will lock yourself out.

---

## 4. Install Node, MongoDB and Nginx

### 4.1 Node 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v          # must print v22.x
npm -v
```

### 4.2 MongoDB 8.0

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
  | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" \
  > /etc/apt/sources.list.d/mongodb-org-8.0.list

apt update
apt install -y mongodb-org
systemctl enable --now mongod
systemctl status mongod --no-pager
```

If your server is Debian rather than Ubuntu, replace `ubuntu` with `debian` in that URL and
`$(lsb_release -cs)` will still fill in the right release name.

### 4.3 Nginx and Certbot

```bash
apt install -y nginx certbot python3-certbot-nginx
systemctl enable --now nginx
```

Now open `http://104.237.2.66` in a browser. You should see the Nginx welcome page. That
proves the firewall and Nginx work.

---

## 5. Lock the database

MongoDB installs with **no password at all**. Anyone who reaches it gets everything. Fix that
now.

### 5.1 Create the two database users

Pick two long passwords and keep them somewhere safe. Generate them:

```bash
openssl rand -base64 36    # run twice, once for each password
```

Then:

```bash
export MONGO_ADMIN_PASSWORD='paste-the-first-password'
export MONGO_APP_PASSWORD='paste-the-second-password'

mongosh --quiet \
  --eval "process.env.MONGO_ADMIN_PASSWORD='$MONGO_ADMIN_PASSWORD'; process.env.MONGO_APP_PASSWORD='$MONGO_APP_PASSWORD'" \
  /opt/madrasahub/deployment/mongodb/create-users.js
```

That script comes with the app. It makes two users:

- `admin` — full control, for maintenance only.
- `school_app` — can only read and write the one school database. **This is what the app uses.**

> Run this **after** section 6 has put the code on the server. If you are following in order,
> skip ahead to section 6, then come back here.

### 5.2 Turn authentication on

Edit `/etc/mongod.conf` and make sure it contains:

```yaml
net:
  port: 27017
  bindIp: 127.0.0.1

security:
  authorization: enabled
```

`bindIp: 127.0.0.1` means the database only listens to the server itself, never the internet.

Restart and check:

```bash
systemctl restart mongod
mongosh --quiet --eval "db.adminCommand({listDatabases:1})"
```

That command must now **fail** with an authentication error. A failure here is the proof it
worked.

### 5.3 Clear the passwords from your shell history

```bash
unset MONGO_ADMIN_PASSWORD MONGO_APP_PASSWORD
history -c
```

---

## 6. Put the code on the server

```bash
mkdir -p /opt/madrasahub
git clone https://github.com/Garsame/School-Management-system.git /opt/madrasahub
cd /opt/madrasahub
```

The repository is private, so git will ask who you are. Use a **GitHub personal access token**
with read-only `repo` access as the password, not your account password.

Install the packages:

```bash
npm --prefix backend ci --omit=dev
npm --prefix frontend ci
```

`ci` installs exactly the versions in the lock file. `--omit=dev` skips the test tools the
server does not need.

---

## 7. Write the environment file

The settings live outside the code folder, so an update can never overwrite them.

```bash
mkdir -p /etc/madrasahub
openssl rand -base64 48      # run twice: one for JWT_SECRET, one for COOKIE_SECRET
nano /etc/madrasahub/backend.env
```

Paste this, replacing the four marked lines:

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=5112

PUBLIC_APP_URL=https://school.onepercenttech.com
CORS_ORIGINS=https://school.onepercenttech.com
TRUST_PROXY=loopback

# Paste the school_app password from section 5.1.
# If it contains @ : / ? # [ ] write them URL-encoded, for example @ becomes %40
MONGO_URI=mongodb://school_app:PASTE_APP_PASSWORD_HERE@127.0.0.1:27017/school_management?authSource=school_management
MONGO_SERVER_SELECTION_TIMEOUT_MS=10000

# Two DIFFERENT values from: openssl rand -base64 48
JWT_SECRET=PASTE_FIRST_RANDOM_VALUE
COOKIE_SECRET=PASTE_SECOND_RANDOM_VALUE

JWT_EXPIRES_IN=8h
JWT_COOKIE_MAX_AGE_MS=28800000
COOKIE_SAMESITE=strict

API_RATE_LIMIT_MAX=600
JSON_BODY_LIMIT=1mb
FORM_BODY_LIMIT=1mb
REQUEST_TIMEOUT_MS=30000
HEADERS_TIMEOUT_MS=15000
KEEP_ALIVE_TIMEOUT_MS=5000
MAX_HEADERS_COUNT=100

SUBSCRIPTION_RECONCILE_ENABLED=true
SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES=360
```

Lock it down so only root and the app can read it:

```bash
chown root:madrasahub /etc/madrasahub/backend.env
chmod 640 /etc/madrasahub/backend.env
```

> **Do not reuse any secret from the example files or from your laptop.** The repository's
> `.env.example` ships a placeholder cookie secret. If that value ever reaches production,
> anyone who has read the repository can forge a login cookie.

---

## 8. Build the pages and set the app running

### 8.1 Build the React pages

```bash
cd /opt/madrasahub
printf 'VITE_API_URL=/api\n' > frontend/.env.production
npm run build
ls frontend/dist/index.html      # must exist
```

`VITE_API_URL=/api` tells the pages to call the API on the same address they were loaded
from. That is what makes the single-address setup work.

### 8.2 Make the folders the app writes to

```bash
mkdir -p /opt/madrasahub/backend/uploads/logos /opt/madrasahub/backend/uploads/avatars
chown -R madrasahub:madrasahub /opt/madrasahub/backend/uploads
chown -R root:madrasahub /opt/madrasahub
chmod -R o-rwx /opt/madrasahub
```

### 8.3 Install the service

```bash
cp /opt/madrasahub/deployment/systemd/school-management.service /etc/systemd/system/madrasahub.service
nano /etc/systemd/system/madrasahub.service
```

Change four lines to match this deployment:

```ini
User=madrasahub
Group=madrasahub
WorkingDirectory=/opt/madrasahub/backend
EnvironmentFile=/etc/madrasahub/backend.env
ReadWritePaths=/opt/madrasahub/backend/uploads
```

Then start it:

```bash
systemctl daemon-reload
systemctl enable --now madrasahub
systemctl status madrasahub --no-pager
```

Check it is really answering:

```bash
curl -s http://127.0.0.1:5112/api/public/plans
```

You should get JSON back. If not, read the log:

```bash
journalctl -u madrasahub -n 50 --no-pager
```

---

## 9. Nginx and the certificate

### 9.1 The site file

```bash
nano /etc/nginx/sites-available/school.onepercenttech.com
```

Paste:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name school.onepercenttech.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name school.onepercenttech.com;

    ssl_certificate     /etc/letsencrypt/live/school.onepercenttech.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/school.onepercenttech.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # School logos are capped at 5 MB by the app; 6 MB leaves room for the envelope.
    client_max_body_size 6m;
    server_tokens off;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location ~ /\. {
        deny all;
    }

    location / {
        proxy_pass http://127.0.0.1:5112;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }
}
```

`X-Forwarded-Proto` is the line that tells Node the visitor arrived over HTTPS. Without it,
and without `TRUST_PROXY`, the login cookie is never set.

### 9.2 Get the certificate

```bash
mkdir -p /var/www/certbot
ln -s /etc/nginx/sites-available/school.onepercenttech.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
certbot --nginx -d school.onepercenttech.com --agree-tos -m you@onepercenttech.com --redirect
nginx -t && systemctl reload nginx
```

Certbot writes the certificate and sets up automatic renewal. Prove renewal works:

```bash
certbot renew --dry-run
```

---

## 10. Set up the first account

### 10.1 Create the platform owner

This is the account that creates schools. There is no other way in.

```bash
cd /opt/madrasahub
set +o history
sudo -u madrasahub --preserve-env=PATH \
  env $(grep -v '^#' /etc/madrasahub/backend.env | xargs) \
  npm run create:platform-owner
set -o history
```

The script asks for a name, an email and a password. Use a real email and a long password
from a password manager. Write nothing down in chat or a text file.

### 10.2 Set up the roles

```bash
sudo -u madrasahub env $(grep -v '^#' /etc/madrasahub/backend.env | xargs) \
  npm run migrate:roles
```

This gives every existing school its set of roles. On a brand-new server it will report zero
schools, which is correct — new schools get their roles automatically when they are created.

### 10.3 Never run this on the server

```
npm run demo:wipe-and-bootstrap      # ERASES THE WHOLE DATABASE
```

That command exists for the demo database on a laptop. It deletes every school, every child
and every payment. It has no confirmation prompt. Do not type it here.

---

## 11. Check it is really live

Work down this list. Every line must pass.

| # | Check | How | Expected |
| --- | --- | --- | --- |
| 1 | DNS | `nslookup school.onepercenttech.com` | `104.237.2.66` |
| 2 | HTTP redirects | `curl -I http://school.onepercenttech.com` | `301` to https |
| 3 | HTTPS works | `curl -I https://school.onepercenttech.com` | `200` |
| 4 | Certificate valid | Open in a browser | Padlock, no warning |
| 5 | API answers | `curl -s https://school.onepercenttech.com/api/public/plans` | JSON list |
| 6 | Pages load | Open the address | The sign-in page |
| 7 | **Login works** | Sign in as the platform owner | You reach the dashboard |
| 8 | Node is private | `curl -m 5 http://104.237.2.66:5112` from your laptop | Refused or times out |
| 9 | Mongo is private | `curl -m 5 http://104.237.2.66:27017` from your laptop | Refused or times out |
| 10 | Survives reboot | `reboot`, wait, open the site | Site comes back on its own |

**Check 7 is the one that matters.** If the page loads but signing in bounces you back with no
message, go to section 16 — it is the cookie, and there are only three causes.

Then do a real run through: create a school, sign in as its head, add a class, admit one
child, bill a month, take one payment. That proves the whole chain, not just the front page.

---

## 12. Updating the app later

This is the routine you will use from now on. Save it as `/opt/madrasahub/deploy.sh`:

```bash
#!/usr/bin/env bash
# Update MadrasaHub to the latest main. Run as root.
set -euo pipefail

APP=/opt/madrasahub
STAMP=$(date +%Y%m%d-%H%M%S)

echo "==> Backing up the database first"
/usr/local/bin/madrasahub-backup

echo "==> Saving the current version so we can go back"
cd "$APP"
git rev-parse HEAD > "/var/backups/madrasahub/last-good-$STAMP.txt"

echo "==> Fetching the new code"
git fetch --all
git reset --hard origin/main

echo "==> Installing packages"
npm --prefix backend ci --omit=dev
npm --prefix frontend ci

echo "==> Building the pages"
npm run build

echo "==> Fixing ownership"
chown -R root:madrasahub "$APP"
chown -R madrasahub:madrasahub "$APP/backend/uploads"
chmod -R o-rwx "$APP"

echo "==> Restarting"
systemctl restart madrasahub
sleep 4

echo "==> Checking it came back"
curl -fsS http://127.0.0.1:5112/api/public/plans > /dev/null \
  && echo "OK — deployed $(git rev-parse --short HEAD)" \
  || { echo "FAILED — see: journalctl -u madrasahub -n 50"; exit 1; }
```

```bash
chmod +x /opt/madrasahub/deploy.sh
```

**`git reset --hard` throws away any edit made on the server.** That is deliberate: the server
should hold exactly what is in git and nothing else. Your `uploads` folder and
`/etc/madrasahub/backend.env` are untouched because neither is tracked by git.

There is a moment of downtime while the service restarts, usually two or three seconds. For a
school app that is fine. Deploy outside school hours anyway.

---

## 13. Backups

A backup you have never restored is not a backup. Set this up on day one.

### 13.1 The backup script

```bash
nano /usr/local/bin/madrasahub-backup
```

```bash
#!/usr/bin/env bash
# Database and uploaded files. Keeps 14 days.
set -euo pipefail

DEST=/var/backups/madrasahub
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST"

# shellcheck disable=SC1091
MONGO_URI=$(grep '^MONGO_URI=' /etc/madrasahub/backend.env | cut -d= -f2-)

mongodump --uri="$MONGO_URI" --gzip --archive="$DEST/db-$STAMP.gz"
tar -czf "$DEST/uploads-$STAMP.tar.gz" -C /opt/madrasahub/backend uploads

find "$DEST" -name 'db-*.gz'         -mtime +14 -delete
find "$DEST" -name 'uploads-*.tar.gz' -mtime +14 -delete

echo "Backup done: $STAMP"
```

```bash
chmod 700 /usr/local/bin/madrasahub-backup
mkdir -p /var/backups/madrasahub
chmod 700 /var/backups/madrasahub
/usr/local/bin/madrasahub-backup      # run it once now
```

### 13.2 Run it every night

```bash
crontab -e
```

Add:

```cron
15 2 * * * /usr/local/bin/madrasahub-backup >> /var/log/madrasahub-backup.log 2>&1
```

### 13.3 Copy them off the server

A backup on the same machine does not survive the machine. Once a week, from your own
computer:

```bash
scp -r root@104.237.2.66:/var/backups/madrasahub ./server-backups/
```

### 13.4 Practise a restore

Do this once, now, while nothing is at stake:

```bash
mongorestore --uri="$MONGO_URI" --gzip --archive=/var/backups/madrasahub/db-STAMP.gz \
  --nsFrom='school_management.*' --nsTo='restore_test.*'
mongosh --quiet --eval "db.getSiblingDB('restore_test').users.countDocuments()"
mongosh --quiet --eval "db.getSiblingDB('restore_test').dropDatabase()"
```

If the count looks right, your backups work.

---

## 14. Watching the app

```bash
systemctl status madrasahub            # is it running
journalctl -u madrasahub -f            # live log
journalctl -u madrasahub --since today # today's log
tail -f /var/log/nginx/access.log      # who is visiting
tail -f /var/log/nginx/error.log       # nginx problems
df -h                                  # disk space
free -m                                # memory
```

Once signed in as the platform owner, the **Monitoring** page shows the same health from
inside the app.

**Watch disk space.** Logs, backups and uploaded files all grow. If the disk fills, MongoDB
stops writing and the app starts failing in confusing ways.

---

## 15. Using the bare domain instead

If you want `https://onepercenttech.com` rather than a subdomain:

1. In Namecheap add **two** records, not one:
   - `A` record, Host `@`, Value `104.237.2.66`
   - `A` record, Host `www`, Value `104.237.2.66`
2. Everywhere in this runbook, replace `school.onepercenttech.com` with `onepercenttech.com`.
3. In the Nginx file use `server_name onepercenttech.com www.onepercenttech.com;`
4. Ask Certbot for both names:
   ```bash
   certbot --nginx -d onepercenttech.com -d www.onepercenttech.com --agree-tos -m you@onepercenttech.com --redirect
   ```
5. Set both `PUBLIC_APP_URL` and `CORS_ORIGINS` to `https://onepercenttech.com`.

Be aware this takes over your whole domain. Anything else you wanted to host at
`onepercenttech.com` will need its own subdomain afterwards.

---

## 16. When something goes wrong

| What you see | Almost always | What to do |
| --- | --- | --- |
| **Login bounces back, no error** | The cookie is being refused | Three causes, in order: HTTPS is not working; `TRUST_PROXY=loopback` is missing; Nginx is not sending `X-Forwarded-Proto` |
| 502 Bad Gateway | Node is not running | `systemctl status madrasahub`, then `journalctl -u madrasahub -n 50` |
| Site loads, API calls fail | `CORS_ORIGINS` does not match the address in the browser | Fix it in `/etc/madrasahub/backend.env`, restart |
| "Not authorized, no token" on every call | `COOKIE_SECRET` changed | Everyone must sign in again. Expected after rotating secrets |
| Node will not start, Mongo error | Wrong password, or special characters not encoded | Check `MONGO_URI`. `@` must be `%40` |
| Logos show as broken images | `uploads` lost or wrong owner | `chown -R madrasahub:madrasahub /opt/madrasahub/backend/uploads` |
| Everyone suddenly rate limited | `TRUST_PROXY` missing, so all visitors look like one | Set it and restart |
| Certificate expired | Renewal failed | `certbot renew --dry-run` and read the error |
| Pages are the old version | Build did not run | `npm run build`, then `systemctl restart madrasahub` |
| Blank white page | Build is missing or broken | Check `frontend/dist/index.html` exists; look in the browser console |

### Going back to the previous version

```bash
cd /opt/madrasahub
cat /var/backups/madrasahub/last-good-*.txt | tail -1   # the commit you were on
git reset --hard PASTE_THAT_COMMIT
npm --prefix backend ci --omit=dev
npm --prefix frontend ci
npm run build
systemctl restart madrasahub
```

If the data itself is wrong, restore the database from section 13. **Stop the app first**, or
it will write on top of what you are restoring:

```bash
systemctl stop madrasahub
mongorestore --uri="$MONGO_URI" --gzip --archive=/var/backups/madrasahub/db-STAMP.gz --drop
systemctl start madrasahub
```

---

## 17. Before you let a real school use it

Honest list. Some of these are not done yet.

- [ ] Every check in section 11 passes, including a real school created end to end
- [ ] Backups run nightly and you have restored one successfully
- [ ] SSH uses a key; password login is off
- [ ] Both secrets are freshly generated on the server and exist nowhere else
- [ ] The MongoDB `admin` password is in a password manager, not a file
- [ ] `certbot renew --dry-run` passes
- [ ] The platform owner password is strong and stored in a password manager
- [ ] You know how to read `journalctl -u madrasahub`
- [ ] **Email is not set up yet.** Password resets and notices will not be delivered until
      SMTP is filled in on the platform Settings page
- [ ] **The screens have not been clicked through in a browser** end to end. This is a known
      gap recorded in `AGENTS.md`. Do the walk-through on the live site before real parents use it
- [ ] Someone other than you can reach the server if you are unavailable

---

## 18. Quick reference

```bash
# Service
systemctl status madrasahub
systemctl restart madrasahub
journalctl -u madrasahub -f

# Update to latest
/opt/madrasahub/deploy.sh

# Backup now
/usr/local/bin/madrasahub-backup

# Nginx
nginx -t && systemctl reload nginx

# Certificate
certbot certificates
certbot renew --dry-run

# Is it alive
curl -s https://school.onepercenttech.com/api/public/plans
```

| Thing | Where |
| --- | --- |
| Code | `/opt/madrasahub` |
| Settings | `/etc/madrasahub/backend.env` |
| Uploaded files | `/opt/madrasahub/backend/uploads` |
| Backups | `/var/backups/madrasahub` |
| Service | `/etc/systemd/system/madrasahub.service` |
| Nginx site | `/etc/nginx/sites-available/school.onepercenttech.com` |
| Certificate | `/etc/letsencrypt/live/school.onepercenttech.com/` |
