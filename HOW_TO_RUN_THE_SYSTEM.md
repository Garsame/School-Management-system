# How To Run The System

This guide explains how to run the school management platform locally for development, testing, and customer demos.

For the hardened `https://school.elivateict.com` production setup, use [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).

New to the app? Read [README.md](README.md) first. It explains the roles, the menus, and how fees and payments work.

**Quick start from the repository root** (after section 3):

```powershell
npm run install:all
npm run dev:backend
npm run dev:frontend
```

Updated 21 September 2026 for roles you can edit, menus built from features, monthly billing, and the demo school.

## 1. System Requirements

- Node.js and npm
- MongoDB running locally or a MongoDB Atlas connection string
- Two terminal windows: one for the backend and one for the frontend
- A copied backend environment file at `backend/.env`
- A copied frontend environment file at `frontend/.env`

## 2. Project Structure

```text
school_management/
  backend/      Express API, MongoDB models, controllers, routes, and maintenance scripts
  frontend/     React/Vite web application
  README.md     Short project overview
```

## 3. Environment Setup

### Backend

Copy the backend example file:

```powershell
Copy-Item backend\.env.example backend\.env
```

The backend `.env` should contain values like:

```env
HOST=127.0.0.1
PORT=5112
MONGO_URI=mongodb://localhost:27017/school_management
JWT_SECRET=replace-with-a-long-random-secret
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
JWT_EXPIRES_IN=8h
JWT_COOKIE_MAX_AGE_MS=28800000
COOKIE_SAMESITE=lax
SUBSCRIPTION_RECONCILE_ENABLED=false
```

Important:

- Use a strong `JWT_SECRET`.
- In production, also set a strong `COOKIE_SECRET` with at least 32 characters.
- Do not commit `backend/.env`.
- `backend/.env` is intentionally ignored by `.gitignore`.

### Frontend

Copy the frontend example file:

```powershell
Copy-Item frontend\.env.example frontend\.env
```

The frontend `.env` should contain:

```env
VITE_API_ORIGIN=http://localhost:5112
VITE_API_URL=http://localhost:5112/api
```

## 4. Install Dependencies

Install backend dependencies:

```powershell
cd backend
npm install
```

Install frontend dependencies:

```powershell
cd ..\frontend
npm install
```

## 5. Start MongoDB

If you use local MongoDB, make sure the MongoDB service is running.

Typical local connection:

```text
mongodb://localhost:27017/school_management
```

If you use MongoDB Atlas, set `MONGO_URI` in `backend/.env` to the Atlas connection string.

## 6. Create A Platform Owner

The platform owner manages tenants, plans, settings, monitoring, and platform-level access.

From the backend folder:

PowerShell:

```powershell
cd backend
$env:PLATFORM_OWNER_EMAIL="your-private-admin-address@your-domain.com"
$env:PLATFORM_OWNER_PASSWORD="GENERATE-A-UNIQUE-PRIVATE-PASSWORD"
$env:PLATFORM_OWNER_NAME="Platform Owner"
node create-platform-owner.js
```

Command Prompt:

```cmd
cd backend
set "PLATFORM_OWNER_EMAIL=your-private-admin-address@your-domain.com"
set "PLATFORM_OWNER_PASSWORD=GENERATE-A-UNIQUE-PRIVATE-PASSWORD"
set "PLATFORM_OWNER_NAME=Platform Owner"
node create-platform-owner.js
```

Password requirement:

- At least 12 characters in development and 16 characters in production.
- Must contain uppercase, lowercase, numeric, and special characters.

The script does not print the password.

## 7. Start The Backend

Before starting an upgraded installation for the first time, back up the database and run the idempotent data/index maintenance commands from the backend folder:

```powershell
cd backend
node scripts/fixLegacyIndexes.js
node scripts/cleanupOrphanAdmissions.js --fix
```

Run these commands once for each database being upgraded. Review the cleanup output and confirm that a second cleanup run reports zero orphan or branch-mismatch records before opening the system to users.

To repair only the enrollment indexes required for promotion and branch-transfer history, run:

```powershell
cd backend
npm run fix:enrollment-indexes
```

From the backend folder:

```powershell
cd backend
npm run dev
```

The API should run on:

```text
http://localhost:5112
```

If you want to run without nodemon:

```powershell
npm start
```

## 8. Start The Frontend

Open another terminal:

```powershell
cd frontend
npm run dev
```

The frontend should run on:

```text
http://localhost:5173
```

Open that URL in the browser.

## 9. Normal Login Flow

### Platform owner

1. Go to `/platform/login`.
2. Log in with the platform owner email and password.
3. Manage tenants, plans, settings, audit logs, and monitoring.

### Tenant users

1. Go to `/login`.
2. Log in with a tenant, branch, teacher, cashier, registrar, student, or parent account.
3. The system opens the person's own area (Finance goes to `/finance`, HR to `/hr`, and so on).
4. The menu on the left is built from what the person's role can do. Their own area comes
   first, then any page from another area they have the feature for. For example, Finance
   also sees **Payments desk → Record Payment**.
5. To change what a role can do, sign in as the school's Super Admin and open
   **School management → Roles & Features**. Changes apply to everyone with that role at once.

## 10. Optional Showcase Demo Data

The current showcase seed script is `backend/scripts/resetAndSeedShowcase.js`.

Important:

- Use showcase scripts only on a local/demo database.
- Do not run showcase scripts on production data.
- The showcase reset clears demo school data and keeps the platform owner account.

Example:

```powershell
cd backend
$env:SHOWCASE_PASSWORD="MadrasaHub@2026!"
node scripts/resetAndSeedShowcase.js --reset-showcase
node scripts/verifyShowcaseApi.js
```

All seeded demo accounts use the value in `SHOWCASE_PASSWORD`. Use a strong local/demo password and do not reuse a production password.

Each showcase school includes Super Admin, Finance Director, HR & Payroll Manager, branch staff, teachers, parents, and students. The seed command prints the exact usernames and email addresses, including `hr@horizonacademy.edu.so` and `hr@barwaaqoscholars.edu.so`.

The showcase fees are monthly fees, like everywhere else in the app. Each student has one June 2026 bill, some paid, some part paid and some not paid, so every finance page has data.

### The demo school: Nuur Al-Ilm Academy

This is the better demo. It is built **through the real system**, as the person who owns each
step, so it proves the roles really have the features they need. It has one campus, six
grades, 120 students, 15 staff and seven roles. Branch Admin and Cashier are turned off, and
Finance takes payments.

1. Point `MONGO_URI` in `backend/.env` at a **separate** database, for example
   `mongodb://localhost:27017/school_management_demo`.
2. Wipe that database and add the platform owner:

   ```powershell
   npm run demo:wipe-and-bootstrap
   ```

   > ⚠️ This deletes **every collection** in the database `MONGO_URI` points to. Never run it on real data.

3. Start (or restart) the backend so it uses the fresh database:

   ```powershell
   npm run dev:backend
   ```

4. In another terminal, build the school:

   ```powershell
   npm run demo:build
   ```

The build prints each step: roles configured, staff created, classes, 120 admissions,
attendance, monthly fees for September and October billed in one click each, payments, and
the payroll chain. The accounts are `admin@`, `hr@`, `finance@` and
`admissions@nuur-al-ilm.school`, plus twelve teachers. Their password is the value of
`DEMO_PASSWORD` (the default is in `backend/scripts/demoSchool/lib.js`).

## 11. Recommended Customer Demo Setup

Before showing the system to customers, prepare this sample data:

- One platform owner
- One approved tenant or school
- One or two branches
- Current and previous academic years
- Class categories and classes
- Subjects and class-subject assignments
- Staff users: super admin, branch admin, registrar, teacher, finance director, cashier
- Several students
- At least one parent account linked to a student
- Attendance sessions and records
- Exams and entered results
- Fee structures, invoices, payments, and outstanding balances

Recommended demo flow:

1. Landing page and school registration
2. Platform owner approves/manages tenant
3. Tenant admin configures branches, staff accounts, academic years, and branding
4. Tenant admin opens **Roles & Features**: rename a role, tick a feature, and show it appear in that person's menu
5. Registrar admits a student
6. Branch admin manages classes, staff, exams, and assignments
7. Teacher enters results and attendance
8. Finance sets a **monthly fee** per class, the **due day**, and which fees are **open**
9. Finance opens **Generate invoices**, picks the month, reviews the preview, and bills the whole school in one click
10. Finance (or a Cashier) opens **Record Payment**, takes one amount for a student, and shows it filling the oldest month first, with one receipt
11. Finance opens **Monthly Collection**: who paid, who paid part, who owes, earlier debt, and the Excel download
12. Finance clicks a student to show their **payment record**
13. Registrar marks a student as **Left**; the next month's preview no longer bills them
14. Student views attendance, schedule, rank, and results
15. Parent views child grades, attendance, and **Fees & Payments**, with the late warning when a bill is overdue
16. Platform owner reviews monitoring and audit logs

## 12. Verification Commands

Run backend tests (201 tests, all expected to pass):

```powershell
npm test
```

This works from the repository root. `cd backend` then `npm test` does the same.

Run frontend lint:

```powershell
cd frontend
npm run lint
```

Run frontend production build:

```powershell
cd frontend
npm run build
```

Optional backend syntax check:

```powershell
cd backend
$failed = @()
Get-ChildItem -Path . -Recurse -Filter *.js |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
  ForEach-Object {
    node --check $_.FullName 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $failed += $_.FullName }
  }
if ($failed.Count -gt 0) { $failed; exit 1 } else { "All backend JavaScript syntax checks passed." }
```

## 13. Common Problems

### Frontend cannot reach backend

Check:

- Backend is running on `http://localhost:5112`
- Frontend `.env` has `VITE_API_URL=http://localhost:5112/api`
- Backend `.env` has `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`

### Login fails

Check:

- User exists
- Password is correct
- Tenant is approved and active
- User role and scope are valid
- Branch-scoped user belongs to an active branch

### Platform owner creation fails

Check:

- `PLATFORM_OWNER_EMAIL` is set
- `PLATFORM_OWNER_PASSWORD` is set and at least 12 characters
- MongoDB is running
- `MONGO_URI` is correct

### A page is missing from someone's menu

Menus follow features. Sign in as the Super Admin, open **Roles & Features**, open that
person's role, and tick the feature for the page. Also check **Staff Permissions**: a feature
denied for that one person hides the page for them even if the role has it. Branch pages
never appear for whole-school roles, and the other way round.

### "Generate invoices" skips a class

The preview gives the reason for each class it skips:

- **No fee structure for this class** — create one in **Fee Structures**.
- **Fee structure is closed** — open it in **Policies**.
- **Fee structure has no monthly amount yet** — an old term or yearly fee; edit it and enter the monthly amount.

### A student who left still shows money owed

That is correct. Leaving stops **new** bills; what the student already owed stays on their
record until it is paid.

### Promotion does not show old results

Use old academic-year filters in reports/results pages. The system keeps historical enrollments and records. Promotion creates a new enrollment for the new year and marks the old enrollment as `Promoted`.

## 14. Production Checklist

Before real production use:

- Use HTTPS.
- Use a strong `JWT_SECRET`.
- Use a strong `COOKIE_SECRET`.
- Use production MongoDB with backups, preferably a replica set or Atlas cluster.
- Back up the database, run `node scripts/fixLegacyIndexes.js`, then run `node scripts/cleanupOrphanAdmissions.js --fix` and confirm a clean second pass.
- Set `SUBSCRIPTION_RECONCILE_ENABLED=true` or schedule `node scripts/reconcileSubscriptionBilling.js`.
- Configure email/SMS/WhatsApp providers if needed.
- Configure payment gateway if needed.
- Configure server monitoring and log rotation.
- Create database backup and restore procedures.
- Run end-to-end tests for admission, promotion, results, attendance, invoices, and payment reversal.
- Confirm mobile/tablet layout for all important roles.

## 15. Finance Director Account

The finance director is a separate account from the school super admin.

1. Sign in as the school super admin.
2. Open **School management → Staff Accounts**.
3. Select **Add staff account** and choose the Finance role. The list shows every staff role the
   school has switched on, under the school's own name for it, so the same screen creates
   teachers, admissions staff and HR.
4. Enter the person's name, email, and temporary password.
5. The finance director signs in at:

```text
http://localhost:5173/login
```

Do not reuse or convert the school super-admin account. **By default** the school super admin
has no finance features and the finance director has no school-admin features. The super
admin can change that in **Roles & Features** if the school wants it.
