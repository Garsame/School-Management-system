# How To Run The System

This guide explains how to run the school management platform locally for development, testing, and customer demos.

For the hardened `https://school.elivateict.com` production setup, use [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).

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
3. The system redirects users based on role and scope.

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
3. Tenant admin configures branches, users, academic years, and branding
4. Registrar admits a student
5. Branch admin manages classes, staff, exams, and assignments
6. Teacher enters results and attendance
7. Finance generates invoices and checks reports
8. Cashier records a payment and prints receipt
9. Student views attendance, schedule, rank, and results
10. Parent views child grades, attendance, and invoices
11. Platform owner reviews monitoring and audit logs

## 12. Verification Commands

Run backend tests:

```powershell
cd backend
npm test
```

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
2. Open `School Admin > Users`.
3. Select `Create Finance Director`.
4. Enter the finance director's name, email, and temporary password.
5. The finance director signs in at:

```text
http://localhost:5173/login
```

Do not reuse or convert the school super-admin account. The school super admin cannot open finance routes, and the finance director cannot open the school-admin dashboard.
