# Production Deployment

This deployment serves the React application and API from one public origin:

```text
https://school.elivateict.com
```

Nginx owns ports 80 and 443. Node listens only on `127.0.0.1:5112`, and MongoDB listens only on `127.0.0.1:27017`. Do not expose ports 5112 or 27017 through the firewall.

## 1. Security Preparation

1. Point the DNS `A` record for `school.elivateict.com` to the server's public IPv4 address. Add an `AAAA` record only when IPv6 is configured and protected.
2. Create a non-root Linux service account named `schoolapp`.
3. Allow inbound traffic only for SSH, HTTP, and HTTPS. Restrict SSH by source IP when possible.
4. Rotate any database or platform-owner password that has appeared in chat, source code, documentation, shell history, or screenshots.
5. Install a supported Node.js LTS release, MongoDB, Nginx, and Certbot.

No deployment can guarantee that a system will never be compromised. Keep the operating system, Node.js, MongoDB, Nginx, and npm dependencies patched, monitor logs, and test database backups regularly.

## 2. MongoDB Accounts

Use the administrative account only for MongoDB maintenance. The application must use the restricted `school_app` account.

Before enabling MongoDB authorization on a new local MongoDB installation:

```bash
cd /opt/school-management-system
read -rsp "New MongoDB admin password: " MONGO_ADMIN_PASSWORD; echo
read -rsp "New MongoDB application password: " MONGO_APP_PASSWORD; echo
export MONGO_ADMIN_PASSWORD MONGO_APP_PASSWORD
mongosh "mongodb://127.0.0.1:27017/admin" deployment/mongodb/create-users.js
unset MONGO_ADMIN_PASSWORD MONGO_APP_PASSWORD
```

Configure `/etc/mongod.conf` so MongoDB is private and authenticated:

```yaml
net:
  bindIp: 127.0.0.1
  port: 27017
security:
  authorization: enabled
```

Restart MongoDB and confirm that unauthenticated access is rejected. The deployment script creates:

- `admin` in the `admin` database with the `root` role.
- `school_app` in `school_management` with only the `readWrite` role.

Use `school_app` in `MONGO_URI`. URL-encode reserved password characters: for example, `@` becomes `%40`.

## 3. Install And Build

Place the project at `/opt/school-management-system`, owned by `schoolapp`, then install exact locked dependencies:

```bash
cd /opt/school-management-system/backend
npm ci
cd ../frontend
npm ci
cp ../deployment/frontend.env.production.example .env.production
npm run build
```

The production frontend env uses `VITE_API_URL=/api` so API calls stay same-origin through Nginx. `VITE_API_ORIGIN` is omitted so uploaded assets resolve from `window.location.origin` at runtime.

## 4. Backend Environment

Create the protected environment file:

```bash
sudo install -d -m 750 -o root -g schoolapp /etc/school-management-system
sudo install -m 640 -o root -g schoolapp deployment/backend.env.example /etc/school-management-system/backend.env
sudo nano /etc/school-management-system/backend.env
```

Set the `school_app` MongoDB password in URL-encoded form. Generate different cookie and JWT secrets:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

The production environment must retain these boundaries:

```env
HOST=127.0.0.1
PORT=5112
PUBLIC_APP_URL=https://school.elivateict.com
CORS_ORIGINS=https://school.elivateict.com
TRUST_PROXY=loopback
COOKIE_SAMESITE=strict
```

The server refuses to start in production when required origins, authenticated MongoDB, proxy trust, or strong distinct secrets are missing.

## 5. Database Maintenance

Back up MongoDB before migration. Load the protected environment and run the idempotent maintenance commands as `schoolapp`:

```bash
cd /opt/school-management-system/backend
set -a
. /etc/school-management-system/backend.env
set +a
npm run fix:indexes
npm run cleanup:orphans -- --fix
```

Review the cleanup output. Run the cleanup report again and confirm that no orphan or branch-mismatch records remain.

## 6. Platform Owner

Use a private administrator email and a unique password of at least 16 characters containing uppercase, lowercase, numeric, and special characters. Do not reuse the MongoDB password.

```bash
cd /opt/school-management-system/backend
set -a
. /etc/school-management-system/backend.env
set +a
read -rp "Platform owner email: " PLATFORM_OWNER_EMAIL
read -rsp "Platform owner temporary password: " PLATFORM_OWNER_PASSWORD; echo
export PLATFORM_OWNER_EMAIL PLATFORM_OWNER_PASSWORD
export PLATFORM_OWNER_NAME="Platform Owner"
npm run create:platform-owner
unset PLATFORM_OWNER_EMAIL PLATFORM_OWNER_PASSWORD PLATFORM_OWNER_NAME
```

The command does not print the password and marks the account for a password change after first login.

## 7. Node Service

Install and start the hardened systemd unit:

```bash
sudo cp deployment/systemd/school-management.service /etc/systemd/system/
sudo chown -R schoolapp:schoolapp /opt/school-management-system/backend/uploads
sudo systemctl daemon-reload
sudo systemctl enable --now school-management
sudo systemctl status school-management
curl --fail http://127.0.0.1:5112/api/health
```

## 8. HTTPS Reverse Proxy

Obtain the certificate before enabling the final Nginx file:

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d school.elivateict.com
sudo systemctl start nginx
sudo cp deployment/nginx/school.elivateict.com.conf /etc/nginx/sites-available/school.elivateict.com
sudo ln -s /etc/nginx/sites-available/school.elivateict.com /etc/nginx/sites-enabled/school.elivateict.com
sudo nginx -t
sudo systemctl reload nginx
```

Enable automatic certificate renewal and test it:

```bash
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

## 9. Verification

```bash
curl --fail https://school.elivateict.com/api/health
curl -I https://school.elivateict.com
sudo ss -lntp
```

Confirm all of the following:

- HTTP redirects to HTTPS.
- The browser shows a valid certificate for `school.elivateict.com`.
- Ports 5112 and 27017 listen only on `127.0.0.1`.
- Login creates a Secure, HttpOnly, SameSite=Strict `__Host-access_token` cookie.
- Requests from unapproved browser origins are rejected.
- `/api/health` returns only `{ "ok": true }` in production.
- The frontend contains no localhost API URL.
- Platform, tenant, branch, registrar, teacher, parent, student, and finance permissions are smoke-tested.

## 10. Ongoing Operations

- Back up MongoDB and `backend/uploads` off-server using encrypted storage.
- Test restore procedures, not only backup creation.
- Run `npm audit --omit=dev` before every release.
- Apply OS and MongoDB security updates promptly.
- Review authentication, audit, Nginx, and systemd logs.
- Never commit `.env`, database dumps, private keys, or generated credentials.
