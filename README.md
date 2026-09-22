# MadrasaHub — School Management System

**Read this first.** It explains the whole app in plain words: what it does, who uses it, how
money and students move through it, what we changed, where the app is today, and where to
find more detail.

Last updated: **21 September 2026**

---

## 1. What this app is

One website that many schools use at the same time. Each school only ever sees its own data.

- The **platform owner** (us) runs the website, adds schools, and sells plans.
- Each **school** has its own staff, students, parents, classes, fees and money.
- A school can have one campus or several. The app calls a campus a **branch**.

It covers admissions, classes, attendance, exams and results, fees and payments, staff,
leave, and payroll, plus portals for parents and students.

---

## 2. Where the app is today

| Area | State |
| --- | --- |
| Schools, branches, academic years | Working |
| Roles and what each role can do | Working. The head of school edits roles on a screen |
| Menus | Built from what each person can do, not from their job title |
| Admissions, classes, attendance, results, promotion | Working |
| Fees: monthly fee per class, open/closed switch, due day | Working |
| Billing: one click bills the whole school for a month | Working |
| Payments: one amount fills the oldest unpaid month first | Working |
| Monthly collection view with Excel download | Working |
| Student payment record (finance, payments desk, parent) | Working |
| Late warnings for parents | Working |
| "Left" status for students who leave | Working |
| HR, leave, payroll (HR prepares; who approves and who pays is set per school) | Working |
| Automated tests | **204 of 204 pass** |
| Demo school built through the real system | Working (see section 11) |

**Stage:** the features are built and tested through the system's own API. It is ready for a
school to try on a **test server** (staging). It is not ready for real money yet. See section 13
for what still has to happen first.

---

## 3. The people who use it

Every account has one **role**. The role decides which features the person has. The list of
roles is fixed, but each school can **rename** a role, change **what it can do**, and turn it
**on or off**. The demo school, for example, calls the registrar role "Admissions Officer".

| Role (key in the code) | Normal job | Works at |
| --- | --- | --- |
| Platform owner (`platform_owner`) | Runs the website. Adds schools and plans. | The whole platform |
| Super Admin (`super_admin`) | Head of the school. Sets up the school, creates staff, decides what each role can do. | Whole school |
| HR Manager (`hr_payroll_manager`) | Employees, salaries, leave, prepares payroll. Nothing to do with students. | Whole school |
| Finance (`finance_director`) | Fees, bills, payments, receipts, reports, payroll approval. | Whole school |
| Admissions / Registrar (`registrar`) | Admits students, enrollments, student records, marks students who leave. | One branch |
| Branch Admin (`branch_admin`) | Runs one campus: classes, staff, timetable, exams. | One branch |
| Cashier (`cashier`) | Takes payments at one campus. | One branch |
| Teacher (`teacher`) | Attendance, marks, own schedule, own leave. | One branch |
| Parent (`parent`) | Sees their own children only: grades, attendance, fees. | Own children |
| Student (`student`) | Sees their own results, schedule, attendance. | Own record |

"Whole school" roles cannot use pages that need one branch, and the other way round. That is a
safety rule, not a setting.

---

## 4. How access works

Think of it in three layers.

1. **Features.** Everything a person can do is a feature ("record a payment", "review payroll",
   "view students"). There are 153 features; 131 of them belong to schools, the rest to the
   platform owner.
2. **Roles.** A role is a list of features. The head of school ticks and unticks them on
   **School management → Roles & Features**. Everyone with that role gets the change at once.
3. **The menu.** Each person's menu is built from their features. Their own area comes first,
   then any page from another area they have the feature for.

   *Example:* the Finance role has the "record a payment" feature, so Finance sees a
   **Payments desk** group with **Record Payment**, even though that page belongs to the
   cashier's area.

There is also a per-person page, **Staff Permissions**, for exceptions: "this one person may
not reverse payments". Use it rarely. Change the role instead when the change is for everyone.

**Safety rules that always hold:**

- A school can never give itself platform-owner features.
- A branch role can never get whole-school features.
- A school cannot use features its plan does not include.
- Nobody can give *themselves* a feature they do not have.
- The last role that can change roles cannot lose that feature, so the school is never locked out.
- A role that people still hold cannot be switched off. Move those people first.
- Every change to a role or a person's features is written to the audit log.
- Access is checked on every request, so taking a feature away works immediately.

**Portal accounts** (teacher, parent and student pages) stay tied to their role. A teacher's
pages work only for teachers, because they are bound to that teacher's own classes.

---

## 5. How money works

This is the full path from "how much do we charge" to "who still owes".

### 5.1 Set the monthly fee (Finance → Fee Structures)

- Finance enters what **one student pays each month**, for a class, a group of classes, or a
  whole grade. Example: Grade 3 pays Tuition $40 + Materials $6 + Activities $4 = **$50 a month**.
- If a class has its own fee and its grade also has one, the class's own fee wins.
- Fee structures made before this change held a yearly or term total. They show
  **"Needs a monthly amount"** and are not billed until Finance edits them and enters the
  monthly fee.

### 5.2 The finance policy (Finance → Policies)

- **Due day.** Each month's bill is due on this day of that month (default: the 10th). After
  that day an unpaid bill is **late**.
- **Open / Closed.** Every fee structure has a switch. Only **open** ones are billed. Closing one
  never changes bills already made.

### 5.3 Bill a month (Finance → Invoices → Generate)

- Pick the month (for example **October 2026**).
- The page shows exactly what will happen **before** you click: which classes are billed from
  which fee, how many students, the total, the due date, who is already billed, and who is
  skipped and why.
- One click bills **every active student in the whole school**.
- Nobody is ever billed twice for the same month.
- Students who left, or are inactive, are skipped.
- Use **One student** for a late joiner.
- Nothing is billed automatically. A person with the "generate invoices" feature clicks once a month.

### 5.4 Take a payment (Payments desk → Record Payment)

- Find the student by name or admission number. The page lists their unpaid months, **oldest first**.
- Type the amount the parent brings. The page shows how it will be split, **before** you confirm:
  *"September $45 (paid), October $10 of $45 ($35 left)"*.
- Part payments are always accepted.
- The amount cannot be more than the student owes.
- Cash needs no reference. EVC Plus, Zaad, bank and card need the transaction number.
- One receipt lists every month the payment covered.
- A wrong payment is **reversed**, never deleted. The month's balance comes back and the
  reversal stays in the history.

### 5.5 See who paid (Finance → Monthly Collection)

- Pick a month. You see every student billed for it: billed, paid, still owed, status
  (**Paid / Part paid / Not paid / Late**), what they still owe **from earlier months**, and
  their total owed.
- The totals at the top always cover the whole month: billed, collected, % collected, still
  owed, earlier debt, total owed.
- Tabs and search narrow the list.
- **Download Excel** gives a real `.xlsx` file with a summary sheet and a students sheet.

### 5.6 One student's record (click any student name in Finance)

- Every month billed, paid and still owed, the due dates, which months are late, and every
  payment with its receipt number.
- The top shows three numbers: **this month**, **owed from earlier months**, and **total owed**.
- The payments desk and the **parent** see this same record, so everyone always agrees.

### 5.7 What the parent sees

- **Fees & Payments:** the same record for each child.
- **Dashboard:** a red warning when a child's bill is past its due date and not fully paid:
  *"Amina's school fees are late: $45. September 2026 was due and not fully paid."*

### 5.8 A student who leaves (Admissions → student → Status: Left the school)

- Enter the leaving date and a reason.
- The student leaves their class, drops off registers, and **is never billed again**.
- What they already owe **stays** on their record.
- To bring them back, use **Re-Enrollment** and choose a class. A plain status change cannot undo "Left".

---

## 6. How students move through the school

1. **Admission** creates the student, their login, and their enrollment in a class for the current year.
2. Teachers take **attendance** and enter **marks**. Parents and students see their own.
3. **Monthly bills** come from the class's fee (section 5).
4. At year end, **promotion** creates a new enrollment for next year. The old year's records all stay.
5. A **transfer** moves a student to another campus. Their history stays.
6. A student who **leaves** is marked "Left" (section 5.8).
7. **Re-Enrollment** brings a student back or into a new year.

Nothing valid is ever deleted: old attendance, results, bills, payments and receipts stay.

---

## 7. Staff, leave and payroll

- Staff request **leave**; a manager with the "review leave" feature approves or rejects it.
- **Payroll by default:** HR generates → HR reviews → Finance approves → the Super Admin (or a Cashier) pays.
- **Payroll in the demo school:** HR generates → HR reviews → head of school approves → Finance pays.
  The school swapped two features between roles on **Roles & Features**. Either way, three
  different people touch the money.
- HR can propose salary changes; Finance approves them (**Salary Approvals**).

---

## 8. What we changed, in order

| When (2026) | What |
| --- | --- |
| Aug | Full browser test of all ten roles; defects fixed (see `FULL_SYSTEM_E2E_REPORT.md`) |
| 20 Sep | **Phase 0** — every feature is now actually enforced; staff seats no longer count students |
| 20 Sep | **Phase 1** — roles became data each school owns (not code) |
| 20 Sep | **Phase 2** — a feature is limited by *where* it works (whole school or branch), not by *which role* |
| 20 Sep | **Phase 3** — old "only this job title" locks removed from the server |
| 20 Sep | Finance can also be the cashier; head of school can run promotions |
| 20 Sep | Attendance oversight for the head of school and admissions |
| 20 Sep | Demo school built entirely through the real system; three gaps found and fixed |
| 21 Sep | **A** — Roles & Features page; menus built from features; one shared page frame for all staff |
| 21 Sep | **B** — Open/Closed switch for each fee structure |
| 21 Sep | **C** — monthly fees and one-click monthly billing for the whole school |
| 21 Sep | **D** — due day and parent late warnings; one payment fills the oldest month first; "Left" status |
| 21 Sep | **E** — Monthly Collection view with Excel download |
| 21 Sep | **F** — one student payment record shared by finance, the payments desk and parents |
| 21 Sep | Fixes found on the way: payment methods on the payment screen now match what the server accepts; the per-person permissions page shows the role's real features; the Staff Accounts page can create every role the school uses; the old "auto-invoice" and "module status" switches, which did nothing, were removed |

**Decisions the school owner made (21 Sep):**

- Roles stay a fixed list. A school renames them, changes their features, and turns them on or off.
- Every fee is a monthly fee. Billing is one click per month, never automatic.
- Payments fill the oldest unpaid month first.
- Late fees, discounts and one-time fees are **not** part of this version.

---

## 9. How it is built

```text
backend/    Node.js + Express + MongoDB (Mongoose). The API and all the rules.
frontend/   React + Vite + Tailwind. The screens.
```

The main pieces behind the new work:

| What | Where |
| --- | --- |
| Feature catalog and permission rules | `backend/utils/permissions.js` |
| Roles (edit, turn on/off, lock-out guard) | `backend/controllers/roleController.js` |
| Monthly billing | `backend/services/monthlyBillingService.js`, `backend/utils/billingMonths.js` |
| Student accounts, monthly collection, payment record | `backend/services/studentAccountService.js` |
| Payments, oldest-first splitting | `backend/services/paymentService.js` |
| Excel files (no extra package needed) | `backend/utils/xlsxWriter.js` |
| Staff menu, built from features | `frontend/src/config/staffMenu.js` |
| Shared page frame for all staff | `frontend/src/layouts/StaffLayout.jsx` |
| Roles & Features page | `frontend/src/pages/tenant/Roles.jsx` |
| Billing, monthly collection, payment record pages | `frontend/src/pages/finance/` |
| Payment record view (finance, desk, parent) | `frontend/src/components/finance/PaymentRecordView.jsx` |
| Tests | `backend/tests/security.test.js` |

---

## 10. How to run it

Full steps are in [HOW_TO_RUN_THE_SYSTEM.md](HOW_TO_RUN_THE_SYSTEM.md). In short:

```bash
npm run install:all
npm run dev:backend
npm run dev:frontend
```

Then open `http://localhost:5173`. Everyone signs in at `/login`; the platform owner signs in at
`/platform/login`.

---

## 11. The demo school

**Nuur Al-Ilm Academy**: one campus, six grades, 120 students, 15 staff, seven roles.

It renames roles, turns off Branch Admin and Cashier, and lets Finance take payments. It is built
entirely through the real system as the person who owns each step. So if a role is missing a
feature, the build fails instead of hiding the problem.

```bash
npm run demo:wipe-and-bootstrap   # WIPES the database named in MONGO_URI, then adds the platform owner
npm run dev:backend               # start (or restart) the server on that database
npm run demo:build                # builds the school through the API
```

> ⚠️ `demo:wipe-and-bootstrap` deletes every collection in the database `MONGO_URI` points to.
> Point `MONGO_URI` at a separate database (for example `school_management_demo`) first.

The demo accounts are `admin@`, `hr@`, `finance@` and `admissions@nuur-al-ilm.school`, plus
twelve teachers. Their password is `DEMO_PASSWORD` (the default is in
`backend/scripts/demoSchool/lib.js`). Use it only on a demo database.

---

## 12. How it was tested

- **204 automated backend tests**, all passing. They cover permissions, roles, billing, the
  oldest-first split, due dates, monthly collection, the Excel file and the Left status.
- The **demo school** was built through the API, then every new flow was run end to end as
  the real users, on a separate test database:
  - roles: tick and untick, rename, the lock-out guard, turning roles on and off
  - fees: open and closed, and how the preview reacts
  - billing: one click for the whole school, one student, no double billing, months outside the year refused
  - due day
  - payments: oldest-first splitting, the combined receipt, refusing more than is owed
  - monthly collection totals, tabs and Excel (opened and checked with a spreadsheet library)
  - Left students
  - parents see their own children only
- The frontend **builds** and the changed files pass the **lint** checks.
- **Not done yet:** the new screens have not been clicked through in a browser by a person.
  They are built, and the data behind every one of them was checked through the API. A
  walk-through in the browser is the next step.

---

## 13. Known gaps and next steps

Before real money:

1. Click through the new screens in a browser for every role, on a test server.
2. Finance checks a month of real numbers against their own records.
3. Test email and SMS notices with a real provider. Bill notices try to email parents when an
   email server is set up.
4. Test backup and restore.
5. Do a security review of the production server (HTTPS, secrets, cookies, database users).
6. Load-test busy moments: many payments or bills at the same time.

Smaller items:

- Existing schools must give their old term or yearly fee structures a monthly amount.
- **Plans do not limit features yet.** The mechanism exists (`minPlanTier` ranking), and can be
  attached to any feature in `backend/utils/permissions.js` whenever feature pricing tiers are decided. Plans currently limit branches, staff seats and students.
- The finance dashboard page has two old code-style warnings (not new).
- `backend/scripts/browserE2EAudit.js` was updated to match the unified staff layout and routes.

---

## 14. Other documents

| Document | What it is for |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Briefing for AI coding assistants: how everything works, where it lives, rules they must follow |
| [APP_MAP.md](APP_MAP.md) | Generated map of every endpoint, screen, menu, permission, model, file and test. Refresh with `npm run map` |
| [HOW_TO_RUN_THE_SYSTEM.md](HOW_TO_RUN_THE_SYSTEM.md) | Setting up and running the app on your computer |
| [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) | Putting it on a real server, and upgrading an existing one |
| [SYSTEM_FUNCTIONS_AND_SCENARIOS.md](SYSTEM_FUNCTIONS_AND_SCENARIOS.md) | Every role in detail, and a full school year walked through step by step |
| [RBAC_AND_TENANT_CONFIGURATION.md](RBAC_AND_TENANT_CONFIGURATION.md) | The design behind roles and features (technical) |
| [RBAC_ROADMAP.md](RBAC_ROADMAP.md) | The plan that took roles from fixed to configurable, with status |
| [PHASE_0_REPORT.md](PHASE_0_REPORT.md) | Report on the first clean-up phase (history) |
| [FULL_SYSTEM_E2E_REPORT.md](FULL_SYSTEM_E2E_REPORT.md) | The August full browser test (history, with an update) |
| [E2E_BROWSER_TEST_REPORT.md](E2E_BROWSER_TEST_REPORT.md) | The earlier August browser test (history) |
