# Phase 0 — Progress Report

**Date:** 2026-09-20
**Branch:** `fix/head-office-payroll-payable`
**Verification:** backend 171/171 tests pass · frontend build clean

---

## Summary

Phase 0 was scoped as "close existing gaps". Three of the gaps turned out to be bigger than
the roadmap assumed, and one of them would have blocked the demo school immediately.

| Task | Status |
| --- | --- |
| 0.1 Plan limit on tenant user creation | **Done** — plus two further gaps found |
| 0.2 Wire `Can` into pages | **13 of 21 pages gated.** `Can.jsx` decision still open |
| 0.3 Audit ungated pages | **Done** — real list below |
| 0.4 `Plan.features[]` decision | **Investigated, recommendation below** |
| 0.5 Land in-flight payroll work | **Verified correct, not committed** |

---

## 1. Seat counting was broken — this would have blocked the demo school

**The bug.** `countUsage('users')` counted *every* User row, and student admission creates a
User so students can sign in to their portal. Every plan advertises far more students than users:

| Plan | maxStudents | maxUsers |
| --- | --- | --- |
| Basic | 200 | 20 |
| Pro | 2000 | 100 |
| Free | 100 | 10 |

On Basic, after ~6 staff accounts, admission stopped at **student 14**. The advertised
200-student capacity was unreachable on every plan.

**The fix.** `maxUsers` is now a **staff seat** limit. Students and parents are portal
identities capped by `maxStudents` instead.

- `planLimitService.js` — added `SEAT_EXEMPT_ROLES` and `staffSeatFilter()`, one definition
  used by both enforcement and reporting so they can never disagree.
- `platformController.js` — the platform dashboard aggregate and the tenant detail counter
  both use the same filter.
- `registrarRoutes.js` — removed the now-redundant `enforcePlanLimit('users')` from student
  admission. Admitting a student must not fail because *staff* seats are full.

## 2. Two more routes could exceed the plan cap

- `POST /api/tenant/users` — the original 0.1 target.
- `POST /api/users/staff` — same class of bug, found by auditing every `User.create` call site.

Both now carry `enforcePlanLimit('users')`. All four user-creation routes are covered, and a
test asserts it.

## 3. 27 of 152 permissions were never enforced

18% of the catalog was decorative: a super admin could toggle it in the permission editor and
**nothing happened**. The routes were still covered by `authorize(role)`, so nothing was open
to the world — but revoking those permissions silently did nothing, and **Phase 3 retires
those role gates**, which would have left the routes with no protection at all.

**10 now enforced** (all in `tenantRoutes.js`): branding update, all four branch mutations,
academic-year create/update/delete/set-current, reports, audit logs.

**17 remain, each deliberately** — captured in a test with a written reason per entry:

| Category | Count | Examples |
| --- | --- | --- |
| Shared lookups every tenant user needs | 2 | `tenant.branding.view` (theming), `tenant.branches.view` (dropdowns) |
| Aliases covered by a broader `.update` | 4 | `tenant.users.activate`, `branch.staff.deactivate` |
| Frontend route gates only | 3 | `finance.dashboard.view`, `hr.dashboard.view` |
| Client-side action | 1 | `cashier.receipts.print` |
| **Catalog entries for features that do not exist** | **7** | `finance.paymentReversals.approve`, `teacher.examTemplates.manage`, `platform.tenants.update` |

That last group is worth a decision in Phase 2: they appear in the permission editor and do
nothing. Either build the feature or remove the entry.

## 4. The payroll page hardcoded roles — your chain would not have worked

`hr/PayrollDashboard.jsx` decided which button to show from the **role string**:

```js
if (user?.role === 'finance_director' && row.status === 'Reviewed') return { label: 'Approve', ... };
if (user?.role === 'cashier'          && row.status === 'Approved') return { label: 'Mark paid', ... };
```

Your chain is **Super Admin approves, Finance pays**. Even after Phase 2 grants those
permissions, this page would still have hidden both buttons — the role strings never match.

Now gated on `payroll.review` / `payroll.approve` / `payroll.pay`, so the page follows whatever
chain the school configures.

---

## 5. Page audit — the real list

**21 pages** have an action whose permission differs from the page's view permission.
13 gated this session, 3 were already gated, 5 remain.

**Gated this session:** `hr/PayrollDashboard`, `hr/Employees`, `finance/CompensationApprovals`,
`finance/Policies`, `finance/FeeStructures`, `tenant/Users`, `tenant/Branches`,
`tenant/AcademicYears`, `tenant/Branding`, `branch/Classes`, `branch/Exams`,
`branch/TeacherAssignments`, `branch/TimetableBuilder`

**Already gated:** `branch/Staff`, `cashier/Payments`, `cashier/Receipt`

**Remaining:** `tenant/AcademicPolicy`, `registrar/Students`, `registrar/StudentDetails`,
`platform/Plans`, `platform/Settings`, `platform/Tenants`, `platform/TenantDetails`,
`platform/Billing`

The platform pages are lower priority — they serve the platform owner, a single fixed role
outside the tenant RBAC model.

### Note on `tenant/Users.jsx`

The table's map variable is also named `user`, which shadows the authenticated user. Guards
there use `currentUser` explicitly; a naive `hasPermission(user, …)` would have checked the
*row's* permissions and hidden every button.

---

## 6. Open decisions

**`Can.jsx`** — still imported by zero files. This session used `hasPermission` directly,
matching the three pages that already did it. `Can` is now redundant: delete it, or adopt it
and convert the 16 gated pages. Recommend deleting — one pattern is better than two.

**`Plan.features[]`** — traced end to end: written by platform plan CRUD, **displayed
nowhere**, enforced nowhere. The Landing page's feature list is a separate hardcoded array.
Recommend keeping the field and making it the seed for Phase 2's `minPlanTier` ceiling, rather
than renaming it to marketing copy — a plan tier that means nothing is the root of the problem.

**In-flight payroll work** — `hrController.js` (cashiers paying head-office branchless payroll)
was reviewed and is correct; it supports the tenant-scoped HR/Finance model. Left uncommitted,
as committing was not requested.

---

## 7. Files changed

**Backend**
```
services/planLimitService.js      seat rule: SEAT_EXEMPT_ROLES + staffSeatFilter()
controllers/platformController.js usage aggregate + tenant detail use the seat rule
routes/tenantRoutes.js            10 permissions enforced; plan limit on user creation
routes/userRoutes.js              plan limit on staff creation
routes/registrarRoutes.js         removed redundant user-seat check on admission
tests/security.test.js            +4 tests (167 → 171)
```

**Frontend** — 13 pages gated on permission; `PayrollDashboard` converted from role to permission.

## 8. Tests added

1. Staff seat counting excludes students and parents; enforcement and reporting share one rule.
2. Every user-creation route enforces the seat limit; admission is capped by `maxStudents` only.
3. Platform usage reporting counts staff seats, not portal identities.
4. **Every catalog permission is enforced somewhere or explicitly exempted** — the exemption
   list carries a written reason per entry, and the test also fails if an exempted permission
   later gains a real check and is not removed from the list.
