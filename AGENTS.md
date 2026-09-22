# AGENTS.md — Start Here (briefing for AI coding assistants)

You are working on **MadrasaHub**, a multi-school management system (Node.js + Express +
MongoDB backend, React + Vite frontend). This file is the **one place** that tells you what
the app is, how it works, where everything lives, what must never break, and how this user
likes to work. Read it all before touching code.

Two companion files:

- [README.md](README.md) — the plain-English overview written for the school owner.
- [APP_MAP.md](APP_MAP.md) — a **generated** reference: every API endpoint with its
  permission, every screen with its guard, the staff menu, the permission catalog, every
  data model, every file, command, test and document. Regenerate it with `npm run map`;
  never edit it by hand.

---

## 0. Your first task: learn the app, then report back

Do not change any code during this task.

1. Read this whole file.
2. Read [README.md](README.md) from start to end.
3. From the repository root, run `npm run map` to regenerate [APP_MAP.md](APP_MAP.md). Skim
   its table of contents; use it as your index for the rest of the work. The command also
   checks that every file path named in this briefing exists.
4. Read the core files in section 15, in that order.
5. Trace these four flows through the code, file by file:
   1. **A request is authorized.** From `backend/middleware/auth.js` (`protect`) through
      `backend/middleware/permissions.js` to a controller.
   2. **A staff menu is built.** From `frontend/src/context/AuthContext.jsx` (the session's
      `permissions`) through `frontend/src/config/staffMenu.js` (`buildStaffMenu`) to
      `frontend/src/layouts/StaffLayout.jsx`.
   3. **A month is billed.** From `frontend/src/pages/finance/InvoiceGenerate.jsx` to
      `POST /api/tenant/finance/invoices/generate` and
      `backend/services/monthlyBillingService.js`.
   4. **One payment covers several months.** From `frontend/src/pages/cashier/NewPayment.jsx`
      to `POST /api/cashier/payments/student` and `recordStudentPayment` in
      `backend/services/paymentService.js`.
6. Run `npm test` (expect **204 passing**) and `npm run build` (expect a clean build).
   Neither needs a database.
   - Do **not** start the backend against the user's database.
   - Do **not** run `npm run demo:wipe-and-bootstrap` (section 12).
7. Report back to the user using the template in section 16.

---

## 1. How to work with this user

- **Write in simple, everyday English.** The user asked for this explicitly: short
  sentences, no jargon. If a technical word is unavoidable, explain it in a few plain words.
- **Agree first when asked.** If the user says "don't code, let's agree", only explain and
  ask. Write code only after they say go.
- **Ask about real decisions; don't re-open settled ones.** Section 13 lists what the owner
  already decided.
- **Don't commit or push unless the user asks.**
- **Never run anything destructive on the user's database.** Use a separate database and
  port for experiments (section 12).
- **Report honestly.** Say what you verified and how. Say what you did *not* verify, for
  example screens you could not open in a browser.
- **Match the code style:** comments explain *why*; names are plain; follow the patterns of
  the file you are in.

---

## 2. Words used in this code

| Word in code | Plain meaning |
| --- | --- |
| tenant | One school (customer). Everything a school owns carries `tenantId`. |
| branch | One campus of a school. |
| scope | Where an account works: `platform`, `tenant` (whole school) or `branch` (one campus). |
| permission / feature | One thing a person may do, e.g. `cashier.payments.create`. Screens call it a "feature". |
| role | A fixed key (`finance_director`, `registrar`, ...) with a per-school `Role` record: name, permission list, on/off. |
| requiredScope | Where a permission works. A role can only hold permissions that fit its scope. |
| portal | Teacher, student and parent areas. They stay locked to their role (bound to own records). |
| fee structure | A monthly fee for a class, category or grade (`amountsArePerMonth: true`). |
| invoice | One bill: one student, one month (`billingPeriodKey` like `2026-10`). |
| batch | One payment spread over several months: one `Payment` per month sharing a `batchId`. |
| enrollment | A student's place in a class for one academic year. `isCurrent` marks the live one. |
| Left | Student status for someone who left the school: enrollment `Withdrawn`, never billed again. |

---

## 3. Repository layout

```text
backend/
  server.js              Express app; mounts every route file under /api (see APP_MAP.md)
  routes/                One file per area; each route declares its permission
  controllers/           Request handlers
  services/              Business logic (billing, payments, accounts, email, plan limits…)
  models/                Mongoose schemas (37)
  middleware/            auth.js (protect, scope/tenant/branch guards), permissions.js
  utils/                 permissions.js (catalog), rolePolicy.js, billingMonths.js, xlsxWriter.js…
  scripts/               Maintenance, migrations, seeds, demoSchool/ build, generateAppMap.js
  tests/security.test.js The test suite (node:test, mocked models, no database)
frontend/src/
  App.jsx                All routes
  config/staffMenu.js    Every staff page, grouped by area; builds each person's menu
  layouts/StaffLayout.jsx One shared frame for every staff area
  components/auth/       StaffAreaGuard (scope), PermissionRouteGuard (per page)
  pages/<area>/          Screens: tenant, finance, cashier, hr, registrar, branch, teacher, parent, student, platform
  services/              API clients (services/api/*.api.js, tenantService.js)
  utils/                 permissions.js, routePermissions.js, feeStructures.js, guards.js…
*.md                     Documents (list in APP_MAP.md, "Documents")
```

---

## 4. How access works on the server

- **Authentication.** `protect` in `backend/middleware/auth.js` reads the JWT cookie
  (`access_token`, or `__Host-access_token` in production). It loads the user with their
  `Role` record populated and checks `tokenVersion`, so changing a role or password ends old
  sessions. It then sets `req.user`, `req.tenantId`, `req.branchId`, `req.scope`, and
  **`req.permissions`**.
- **Effective permissions** = (the role record's permissions ∪ the user's `allow` list) −
  their `deny` list. They are resolved **from the database on every request**; never cache
  them in the token. An inactive role grants nothing. See `getUserPermissionParts` in
  `backend/utils/permissions.js`.
- **Guards.**
  - `requireScope('tenant'|'branch')`, `tenantGuard` and `branchGuard` protect data boundaries.
  - `requirePermission`, `requireAnyPermission` and `requireAllPermissions` in
    `backend/middleware/permissions.js` check permissions.
  - Every route declares its permission; APP_MAP.md lists them all.
- **Role locks that remain on purpose:** the platform owner, and the teacher, student and
  parent portals (`authorize(...)`). A test (`only deliberate role locks remain`) fails if
  one is added.
- **Roles as data.**
  - `backend/models/Role.js` holds one record per school per key.
  - `backend/controllers/roleController.js` handles editing, on/off, and the lock-out guard.
  - `backend/scripts/seedSystemRoles.js` (`npm run migrate:roles`) seeds roles for old schools.
  - New schools are seeded automatically.
- **The ceiling.** `getAssignablePermissions` in `backend/utils/permissions.js`:
  - scope must fit
  - never platform permissions
  - the plan tier caps what a school can grant
  - `findEscalatedPermissions` stops self-grants
- **Duty warnings.** `backend/utils/segregationOfDuties.js` warns, but never blocks, when a
  role gains a risky set, for example generate + approve + pay payroll.
- **Per-person exceptions.** `GET/PUT /api/tenant/users/:userId/permissions` in
  `backend/controllers/tenantController.js`. The catalog offered is everything assignable
  at that user's scope. Defaults come from their `Role` record.

---

## 5. How the frontend decides what to show

- **Session.** `frontend/src/context/AuthContext.jsx` keeps the user from `/api/auth/me`
  (`permissions`, `role`, `roleName`, `scope`) and refreshes it every 2 minutes and on focus.
- **Routes.** `frontend/src/App.jsx`. Staff areas (`/tenant`, `/finance`, `/hr`, `/branch`,
  `/registrar`, `/cashier`) are wrapped in `StaffArea`:
  1. `StaffAreaGuard` checks the area fits the user's scope.
  2. `PermissionRouteGuard` checks the page's permission, from
     `frontend/src/utils/routePermissions.js`.
  3. `StaffLayout` draws the frame.
  Portals (`/teacher`, `/student`, `/parent`) still use a role guard.
- **Menus.** `buildStaffMenu(user)` in `frontend/src/config/staffMenu.js`:
  - The home area comes first (from `HOME_AREA_BY_ROLE`), then other areas.
  - An item shows if the user holds its permission and the area fits their scope.
  - `feature` removes duplicates (for example Payroll appears only once).
  - `homeOnly` keeps the profile in the home area only.
  - `quietFor` hides data-only permissions some roles hold (for example a teacher's
    `branch.classes.view`).
  - The teacher portal's sidebar (`frontend/src/components/layout/TeacherSidebar.jsx`) uses
    the same builder.
- **Adding a staff page:** four places.
  1. The `Route` in `App.jsx`.
  2. A rule in `routePermissions.js`.
  3. An item in `staffMenu.js`.
  4. `requirePermission` on its backend route.
  The page also needs a permission in the catalog if it is a new one.

---

## 6. How money works (the finance model)

Read README.md section 5 for the user-facing version. In code:

- **Fee structures** (`backend/models/FeeStructure.js`, `createFeeStructure` and
  `updateFeeStructure` in `backend/controllers/financeController.js`):
  - Every save writes `billingFrequency: 'MONTHLY'`, `amountsArePerMonth: true` and `feeItems` = the monthly items.
  - Old records (`amountsArePerMonth` false) are never billed until re-saved.
  - `isOpen` (default true) is switched by `PUT /api/tenant/finance/fee-structures/:id/open`, which needs `finance.policies.update`.
  - When several apply, the most specific wins: CLASS, then CATEGORY (same branch), then SCHOOL_GRADE. A closed structure counts as absent.
- **Finance policy** (`backend/models/FinancePolicy.js`): `dueDay` (1–28, default 10).
  `autoInvoiceMode` and `isEnabled` are legacy fields; nothing reads them.
- **Billing months** (`backend/utils/billingMonths.js`):
  - Keys look like `2026-10`, labels like "October 2026", all in **UTC**.
  - The months come from the academic year's start and end dates.
  - `dueDateForMonth` gives the due date; `isLate` means the balance is above 0 and the due date has passed.
- **Generating** (`backend/services/monthlyBillingService.js`, `POST /api/tenant/finance/invoices/generate`):
  - `{ academicYearId, month, branchId?, studentId?, dueDate?, dryRun? }`
  - `dryRun: true` returns the same summary without writing; the page always previews first.
  - Only current enrollments of `Active` students are billed.
  - Nobody is billed twice: the service checks first, and a unique index on the invoice backs it up.
  - Notices go to students and parents **after** the response is sent.
- **Payments** (`backend/services/paymentService.js`):
  - `recordInvoicePayment` pays one invoice. It checks the balance, blocks duplicates within a minute, locks on the balance it read, and assigns the receipt number.
  - `planStudentPayment` is pure: it splits an amount oldest month first.
  - `recordStudentPayment` applies the plan, one `Payment` per month with a shared `batchId`. If any month fails, it reverses the months already applied.
  - `reverseInvoicePayment` never deletes; it writes a `REVERSAL` entry.
  - Allowed methods: `CASH`, `ZAAD`, `EVC_PLUS`, `BANK_TRANSFER`, `CARD`, `OTHER`. Every method except cash needs a reference.
- **Student accounts** (`backend/services/studentAccountService.js`) is the **single source**
  for every per-student money view:
  - `getStudentPaymentRecord`: months oldest first, payments, `thisMonth`, `earlierDebt`, totals, late months.
  - `getMonthlyCollection`: one month for the school, with each student's earlier debt.
    Totals ignore the status and search filters.
  - "This month" is the current calendar month's bill, or else the latest bill.
    "Earlier debt" is what is owed on bills before it.
- **Where they are served:**
  - Finance: `/api/tenant/finance/monthly-collection`, its `/export.xlsx` (built by
    `backend/utils/xlsxWriter.js`, no npm package), and `/students/:studentId/payment-record`.
  - Payments desk: `/api/cashier/students/search`, `/students/:studentId/account`,
    `POST /payments/student`, and `/receipts/:paymentId`, which shows every month of a batch.
  - Parent: `/api/parent/students/:studentId/payment-record`, only for linked children; the
    dashboard carries `lateFees` and `lateMonths`.
- **Screens.**
  - Finance: `frontend/src/pages/finance/` (Policies, FeeStructures, InvoiceGenerate,
    MonthlyCollection, StudentPaymentRecord).
  - Payments desk: `frontend/src/pages/cashier/NewPayment.jsx` and `Receipt.jsx`.
  - The shared record view is `frontend/src/components/finance/PaymentRecordView.jsx`,
    used by finance, the desk and the parent (`frontend/src/pages/parent/ParentInvoices.jsx`).

---

## 7. Students and academics

- **Admission, records, re-enrollment and Left:** `backend/controllers/registrarController.js`.
  - `updateStudent` sets `status: 'Left'`, records `withdrawalDate` and `withdrawalReason`, and
    withdraws the current enrollment.
  - A Left student can only return through re-enrollment (`createEnrollment`).
- **Enrollment:** `backend/models/Enrollment.js`. `isCurrent` is derived from `status`;
  there is one current enrollment per student per year (unique index).
- **Promotions and transfers:** `backend/controllers/promotionController.js`. They always
  create new enrollments and keep the old ones.
- **Attendance:** `backend/controllers/attendanceController.js`. The oversight page is
  `frontend/src/pages/attendance/AttendanceOversight.jsx`.
- **Exams and results:** `backend/controllers/branchAdminController.js`,
  `backend/controllers/teacherController.js`, `backend/controllers/examController.js`.

## 8. HR and payroll

- `backend/controllers/hrController.js`; statuses in `backend/models/Payroll.js`: Draft → Reviewed → Approved → Paid.
- The four steps are separate permissions:
  - `payroll.generate` and `payroll.review` — HR by default
  - `payroll.approve` — Finance by default
  - `payroll.pay` — Super Admin and Cashier by default
- The demo school gives approve to the Super Admin and pay to Finance.
- `frontend/src/pages/hr/PayrollDashboard.jsx` shows buttons from permissions, not role names.
- Salary changes: HR proposes, Finance approves (`backend/controllers/compensationController.js`).

---

## 9. Invariants — never break these

Security:

1. A school never reaches another school's data. Every query carries `tenantId`.
2. Nobody grants a permission beyond the scope, plan and platform ceiling, and nobody grants
   themselves one they lack.
3. The last role that can change roles keeps `tenant.roles.update`. A role people hold
   cannot be switched off.
4. Permissions resolve from the database per request. Do not cache them in the JWT.
5. Every role and permission change is audited (`logActivity`, `logAction`).

Data:

6. Nothing valid is deleted. Promotions, transfers, re-enrollment and Left keep old
   enrollments, attendance, results, bills, payments and receipts.
7. Payments are reversed, never deleted or edited.

Money:

8. Never bill a student twice for a month. Never accept more than a student owes.
9. A payment fills the **oldest** unpaid month first.
10. Editing or closing a fee structure never changes bills already made.
11. Money is rounded through cents: `Math.round(x * 100)`.

---

## 10. Conventions and gotchas

- The backend is **CommonJS**; the frontend is **ESM** (`"type": "module"`).
- **Line endings.** Git uses `core.autocrlf=true`, so many working files are CRLF. Keep each
  file's existing line endings when editing.
- **Response shapes are inconsistent.** Some endpoints return `{ success, data }`, others
  return the raw object or array. The frontend clients unwrap both; check before assuming.
- **Error handler** (bottom of `backend/server.js`):
  - It uses `err.statusCode`, else `res.statusCode`.
  - Messages for **404** are replaced with "Resource not found", and 5xx messages are hidden.
  - For a message the user must read, use **400** or **409**.
  - `paymentService` errors use `.status`; most others use `.statusCode`.
- **`.lean()` skips schema defaults.** Treat a missing `isOpen` as open and a missing
  `amountsArePerMonth` as false, as `monthlyBillingService.js` does.
- **Dates.** Academic-year dates and due dates are UTC midnight. Show them with
  `timeZone: 'UTC'`.
- **Tests** live in one file, `backend/tests/security.test.js`, using `node:test`.
  - They replace model statics (`Model.find = () => query(value)`), where `query` returns
    `{ select() { return this; }, lean: async () => value }`.
  - Restore the originals in `finally`.
  - Some tests read source files to guard architecture decisions.
- **No new dependencies** without asking. Excel files already have `backend/utils/xlsxWriter.js`.
- **Frontend lint** has a few old errors: `FinanceDashboard.jsx`, and `'Icon' is defined but
  never used` false positives in hr pages. They are not yours to fix unless asked. Lint the
  files you change.
- **The API rate limiter** can slow long scripts. The demo build copes.

---

## 11. Commands (repository root)

| Command | What it does |
| --- | --- |
| `npm run install:all` | Install backend and frontend packages |
| `npm run dev:backend` / `npm run dev:frontend` | Run the API (port 5112) and the web app (port 5173) |
| `npm test` | Backend tests (204), no database needed |
| `npm run build` | Frontend production build |
| `npm run lint` | Frontend lint |
| `npm run map` | Regenerate [APP_MAP.md](APP_MAP.md) and check this file's paths |
| `npm run migrate:roles` | Seed role records for schools created before roles were data (safe to repeat) |
| `npm run demo:wipe-and-bootstrap` | **Wipes** the database in `MONGO_URI`, then adds the platform owner |
| `npm run demo:build` | Builds the demo school through the API (server must be running) |

The full list, with the exact scripts, is in APP_MAP.md → Commands.

## 12. Data, databases and safety

- **Environment.** Local settings live in `backend/.env` (never commit it; the variable names
  are in `backend/.env.example`).
- **The user's database.** The default database `school_management` may hold the user's own
  data. **Never** run wipe or seed scripts against it.
- **Your own tests.** For live experiments, start a second backend with another `MONGO_URI`
  and another `PORT` (for example `school_management_demo` on 5199).
- **The user's server.** Port 5112 may already be the user's own running server. Don't stop it.
- **The demo school** (`backend/scripts/demoSchool/`, run by `build.js`) is Nuur Al-Ilm
  Academy: one campus, 120 students, 15 staff, seven configured roles.
  - It is built only through the API, as the person who owns each step.
  - Its password comes from `DEMO_PASSWORD`, with the default in
    `backend/scripts/demoSchool/lib.js`. Use it only on a demo database.
- **The older showcase seed** is `backend/scripts/resetAndSeedShowcase.js`. It writes
  directly to the database.
- **Email.** Generating bills tries to email parents when platform SMTP settings exist. Clear
  them on test databases.

## 13. Status, decisions and open work

- **Status (22 September 2026):**
  - Phases 0–3 of the roles work are done.
  - The Roles & Features screen, permission-built menus and the shared frame are done.
  - Monthly billing, oldest-first payments, due day and late warnings, Left, Monthly
    Collection with Excel, and payment records are done.
  - 204 tests pass. These flows were verified end to end through the API on a demo database.
  - The new screens have **not yet been clicked through in a browser**.
- **Decided by the owner — do not re-open:**
  - Roles are a **fixed list**. Schools rename them, change their permissions, and turn
    them on or off. They do not create new roles.
  - Every fee is **monthly**. Billing is **one click per month**, never automatic.
  - Payments fill the **oldest** month first.
  - No late fees, discounts or one-time fees in this version.
- **Known gaps:**
  1. A browser walk-through of the new screens is still needed.
  2. `backend/scripts/browserE2EAudit.js` updated to match unified staff layout and routes.
  3. Plans do not yet limit features: `minPlanTier` ranking mechanism exists and is ready for pricing decisions.
  4. Email and SMS delivery, backup and restore, load testing, and a production security
     review are still to do.
- **Detail:**
  - `RBAC_AND_TENANT_CONFIGURATION.md` and `RBAC_ROADMAP.md` (roles design and status)
  - `SYSTEM_FUNCTIONS_AND_SCENARIOS.md` (every role, and a school year step by step)
  - `HOW_TO_RUN_THE_SYSTEM.md` and `PRODUCTION_DEPLOYMENT.md`

## 14. Where to go for…

| If you need to… | Go to |
| --- | --- |
| Add or change a permission | `backend/utils/permissions.js` (catalog, defaults, ceiling) |
| Change what a role does by default | `backend/utils/permissions.js`; existing schools change it on Roles & Features |
| Add a staff page | `frontend/src/App.jsx`, `frontend/src/utils/routePermissions.js`, `frontend/src/config/staffMenu.js`, plus the backend route |
| Change the staff frame | `frontend/src/layouts/StaffLayout.jsx` |
| Change the Roles screen | `frontend/src/pages/tenant/Roles.jsx`, `backend/controllers/roleController.js` |
| Create staff accounts | `frontend/src/pages/tenant/Users.jsx`, `createUser` in `backend/controllers/tenantController.js` |
| Change billing rules | `backend/services/monthlyBillingService.js`, `backend/utils/billingMonths.js` |
| Change payment rules | `backend/services/paymentService.js`, `backend/controllers/cashierController.js` |
| Change what a student owes / monthly view | `backend/services/studentAccountService.js` |
| Change the Excel file | `exportMonthlyCollection` in `backend/controllers/financeController.js`, `backend/utils/xlsxWriter.js` |
| Change parent pages | `frontend/src/pages/parent/`, `backend/controllers/parentController.js` |
| Change student status / admission | `backend/controllers/registrarController.js`, `frontend/src/pages/registrar/` |
| Change payroll | `backend/controllers/hrController.js`, `frontend/src/pages/hr/PayrollDashboard.jsx` |
| Find any endpoint's permission | APP_MAP.md → API endpoints |
| Find any screen's file and guard | APP_MAP.md → Screens |
| See a model's fields and unique indexes | APP_MAP.md → Data models |
| Add a test | `backend/tests/security.test.js` (see section 10 for the mocking pattern) |

## 15. Core files to read, in this order

1. `README.md` — the product in plain words
2. `backend/server.js` — how the API is assembled
3. `backend/middleware/auth.js` and `backend/middleware/permissions.js` — how every request is checked
4. `backend/utils/permissions.js` and `backend/utils/rolePolicy.js` — permissions, scopes, defaults
5. `backend/controllers/roleController.js` — roles as data and their guards
6. `frontend/src/App.jsx` — every screen
7. `frontend/src/config/staffMenu.js` and `frontend/src/layouts/StaffLayout.jsx` — menus
8. `frontend/src/components/auth/StaffAreaGuard.jsx` and `frontend/src/components/auth/PermissionRouteGuard.jsx`
9. `backend/utils/billingMonths.js` and `backend/services/monthlyBillingService.js` — billing
10. `backend/services/paymentService.js` — payments
11. `backend/services/studentAccountService.js` — what each student owes
12. `backend/controllers/financeController.js` and `backend/routes/tenantFinanceRoutes.js`
13. `backend/controllers/cashierController.js` and `backend/routes/cashierRoutes.js`
14. `backend/controllers/registrarController.js` — admission and Left
15. `backend/tests/security.test.js` — skim the test names; they describe the rules

## 16. Report back to the user (use this template)

When you have finished section 0, tell the user, **in simple English**:

1. **The app in one paragraph.** What it is, and who uses it.
2. **The people.** Each role, its default job, where it works (whole school or one branch),
   and what a school can change about it.
3. **How access works.** Permissions → roles → menus, the safety rules, and which files
   do each part.
4. **How money moves.** Monthly fee → open/closed and due day → one-click billing →
   oldest-first payment → monthly collection and Excel → payment record → parent view →
   Left. Name the main file or endpoint for each step.
5. **How students move.** Admission → enrollment → attendance and results → promotion or
   transfer → Left → re-enrollment.
6. **Where to go for common changes.** Your own short version of section 14.
7. **The rules you will protect.** The invariants in section 9.
8. **What you ran and what happened.** The `npm run map` output line, the test count, and the
   build result.
9. **What you are unsure about or found inconsistent.** File paths and line numbers,
   including anything in this file that no longer matches the code.
10. **Known gaps and what you would do next.**

Then wait for the user's instructions before changing anything.
