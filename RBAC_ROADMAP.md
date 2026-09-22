# RBAC Roadmap — From Fixed Roles to Super-Admin Configuration

**Companion to:** `RBAC_AND_TENANT_CONFIGURATION.md`
**Date:** 2026-09-20
**Revision:** 2 — corrected role model after clarification · status added 2026-09-21

> **Status on 21 September 2026.**
>
> - **Track 1 is finished.** Phases 0–3 are committed, and the demo school runs this exact org
>   (renamed roles, Branch Admin and Cashier turned off, Finance taking payments, and the
>   payroll chain HR → Super Admin → Finance). It was built through the real API.
> - **Track 2 was narrowed by decision.** The school owner decided roles stay a fixed list: a
>   school renames them, changes their features and turns them on or off, but does not invent
>   new ones. What was built from Track 2:
>   - **4.2 / 4.3 done:** one shared staff frame with menus built from permissions; the
>     role-name locks on staff routes are gone.
>   - **5.2 done:** the **Roles & Features** screen, with features grouped by area and
>     duty-conflict warnings.
>   - **Not built:** 4.1 server navigation, 4.4 navigation config, 5.1 create/clone, 5.3 live preview.
> - **Also built on 21 Sep:** monthly billing, the monthly collection view with Excel, student
>   payment records, due dates with parent late warnings, and the "Left" student status. See
>   `README.md`.
> - **Tests:** backend 201 of 201 passing.
>
> The rest of this document is the original plan, kept for reference.

---

## 0. The target org

Seven roles. HR owns **employees and everything wrapped around employees**. Student and
academic work belongs to Admission Manager, Branch Admin and Super Admin — **not** to HR.

| Role | Scope | Owns |
| --- | --- | --- |
| **Super Admin** | School-wide | Everything. School master, creates roles, creates users, grants access, removes users, **approves payroll**. |
| **HR** | School-wide | Employees · employment records · compensation · leaves · payroll **generate + review**. Nothing student-facing. |
| **Finance** | School-wide | Fees, invoices, payments, finance policy, **pays approved payroll**. |
| **Admission Manager** | **Branch** | Admissions · student registration · student status · classes · sections · subjects · student activity · promotions · transfers. One per branch. |
| **Branch Admin** | Branch | Branch operations, staff accounts, timetable, exams, branch reports. |
| **Teacher** | Branch | Schedule, attendance, results entry, own payroll, leave requests. |
| **Parent / Student** | Own records | Portal access only. |

### Payroll chain

```
HR generates ─▶ HR reviews ─▶ Super Admin approves ─▶ Finance pays
```

Three separate people on the money path. This is **stronger** segregation of duties than the
current default and needs no SoD warning.

The current hardcoded chain differs: `payroll.approve` belongs to `finance_director` and
`payroll.pay` to `super_admin` + `cashier`. Your chain is effectively a swap:

| Permission | Today | Target |
| --- | --- | --- |
| `payroll.approve` | `finance_director` | **+ super_admin** |
| `payroll.pay` | `super_admin`, `cashier` | **+ finance_director** |

**Verified safe.** `approvePayroll` runs through `transitionPayroll`, which queries
`{ _id, tenantId }` with **no branch coupling**. `payPayroll` queries the same way, and its only
branch check is explicitly gated on `req.user.role === 'cashier'` — a tenant-scoped Finance
Director skips it. **Zero controller changes required.**

---

## 1. Verdict per role

### Super Admin
| Need | Status |
| --- | --- |
| Everything else | Already has it |
| `payroll.approve` | **Gap** — boxed to `finance_director`. Phase 2. |

### HR — works almost entirely today
| Need | Permission | Status |
| --- | --- | --- |
| Leaves view + review | `hr.leaves.view` / `.review` | Already |
| Employee records | `hr.employees.view` / `.update` | Already |
| Payroll view, generate, review | `payroll.view` / `.generate` / `.review` | Already |

**HR needs no changes at all.** `hr_payroll_manager` is tenant-scoped and already reaches every
branch's staff. HR manages records only — account creation stays with Branch Admin / Super Admin,
so the branch-scoped `branch.staff.*` permissions are not needed.

### Finance
| Need | Status |
| --- | --- |
| All finance permissions | Already has them |
| `payroll.pay` | **Gap** — boxed to `super_admin` + `cashier`. Phase 2. |

### Admission Manager — `registrar` plus seven branch permissions
| Need | Permission | Status |
| --- | --- | --- |
| Admission, registration, student status, updates | `students.*`, `enrollments.create` | Already |
| View classes, view branch students | `branch.classes.view`, `branch.students.view` | Already |
| Create / edit classes | `branch.classes.create` / `.update` | **Gap** |
| Sections, subjects | `branch.sections.manage`, `branch.subjects.manage` | **Gap** |
| Student activity | `branch.results.view`, `branch.timetable.view` | **Gap** |
| Promotions, transfers | `branch.promotions.run`, `branch.transfers.run` | **Gap** |

**Every gap is branch-scoped, and `registrar` is already branch-scoped.** No branch-context work.

### Teacher / Parent / Student
Unchanged. Work today.

---

## 2. The two things that actually block you

Everything above reduces to exactly two problems.

### Blocker A — the catalog boxes permissions by role

```js
createPermission('branch.classes.create', ..., ['super_admin', 'branch_admin'])
```

A branch-scoped Admission Manager cannot hold it, even though the scope is compatible.
**Fix: Phase 2.**

### Blocker B — blanket role gates on two route files

```js
// routes/branchAdminRoutes.js:27   and   routes/registrarRoutes.js:29
router.use(authorize('branch_admin'));
router.use(authorize('registrar'));
```

These reject by role **before** any permission check runs. But every route underneath already
carries a correct `requirePermission(...)`. **Removing the blanket gate is a deletion, not a
rewrite** — the permission layer already does the real work, so security is unchanged.
**Fix: Phase 3.**

---

## 3. What is NOT needed (correction to revision 1)

Revision 1 put a **277-site branch-context refactor** on the critical path. That was based on a
misreading in which HR did student admissions. **It is now off the critical path entirely.**

| Item | Rev 1 | Rev 2 |
| --- | --- | --- |
| Branch-context refactor (`req.scopedBranchId`, 277 sites) | **Phase 3, size L, blocking** | **Deferred — not needed** |
| Data scope engine | Phase 4 | Deferred |
| Field masking | Phase 4 | Deferred |

**Why it is no longer needed:** it is only required when a role is *school-wide* but reaches into
*branch* data. In your org, nothing does that. HR is school-wide but touches only tenant-scoped
employee and payroll records. Admission Manager touches branch data but **is** branch-scoped, one
per branch. The scopes line up.

**When it comes back:** if you later want one admission manager covering all branches, or a
school-wide role writing branch records. Design is preserved in
`RBAC_AND_TENANT_CONFIGURATION.md` §5.5 for that day.

---

## 4. Roadmap

### Track 1 — make your org work

Your seven roles map **1:1 onto existing role keys**. Admission Manager is `registrar` renamed and
extended; HR is `hr_payroll_manager` as-is. **No new role keys, so no new layouts or shells are
needed for this track.**

---

#### Phase 0 — Close existing gaps · **S** · no dependencies · **DONE** (`12c5407`, the table below is the mid-phase snapshot)

See `PHASE_0_REPORT.md` for detail. Backend 171/171 pass, frontend build clean.

| # | Task | Status |
| --- | --- | --- |
| 0.1 | `enforcePlanLimit('users')` on every user-creation route | **Done** — 2 gaps, not 1 |
| 0.2 | Wire `Can` into pages, or delete it | 13 of 21 pages gated; `Can.jsx` decision open |
| 0.3 | Audit pages for unusable action buttons | **Done** — 21 pages, list in report |
| 0.4 | Decide `Plan.features[]` | Recommendation in report |
| 0.5 | Land in-flight payroll work | Verified correct, uncommitted |
| 0.6 | **Seat counting counted students as staff seats** | **Done** — see below |
| 0.7 | **27 of 152 permissions were never enforced** | **Done** — 10 fixed, 17 exempted with reasons |
| 0.8 | **Payroll page hardcoded roles, breaking the target chain** | **Done** |

Three gaps were larger than this phase assumed:

- **0.6** `maxUsers` counted students and parents. Basic advertises 200 students but 20 users,
  so admission stopped at student 14. `maxUsers` is now a staff-seat limit. **This would have
  blocked the demo school on day one.**
- **0.7** 18% of the catalog was decorative — toggling it did nothing. Harmless today because
  `authorize(role)` still covered those routes, but **Phase 3 removes those role gates**.
- **0.8** `hr/PayrollDashboard.jsx` chose buttons by role string, so Super-Admin-approves /
  Finance-pays would have shown no buttons even after Phase 2.

---

#### Phase 1 — Role becomes data · **M** · after Phase 0 · **DONE**

Nothing visible changed. Verified: **204 of 204 users resolve to identical permissions**
through the role path. 176/176 tests pass.

| # | Task | Status |
| --- | --- | --- |
| 1.1 | `models/Role.js` | Done — plus `dataScope`, ready for Phase 4 |
| 1.2 | Migration seeding the built-in roles per tenant | Done — `npm run migrate:roles`, idempotent, `--dry-run` supported |
| 1.3 | `User.roleId`; backfill; keep `User.role` in sync | Done |
| 1.4 | Permissions resolve from `Role.permissions` | Done — still per-request from the DB |
| 1.5 | Role CRUD behind `tenant.roles.*` | Done — 5 permissions, 6 endpoints |
| 1.6 | Privilege-escalation guard | Done — **scope corrected, see below** |

**Correction to 1.6.** The planned rule was "a user may never grant a permission they do not
hold". That is wrong, and the test suite caught it: a super admin never holds
`cashier.payments.reverse`, so the rule would have stopped the school's own access-giver from
granting almost anything. Delegating a permission you administer is not escalation.

The shipped rule targets the actual vector: **a user cannot grant a permission to their own
account, or add one to their own role, unless they already hold it.** That closes the case of
an admin restoring access which was deliberately taken away. Granting to a second account they
control remains bounded by the catalog's `allowedRoles` whitelist — **Phase 2 must replace that
with a real administrative ceiling** once the boxing is removed.

Safety rails shipped with 1.5:
- A role held by active users cannot be deleted or deactivated until they are reassigned.
- The last role that can manage access cannot be removed — no locking the school out.
- Built-in roles can be deactivated but not deleted; `key` and `scope` are immutable.
- Assigning a role bumps `tokenVersion`, so live sessions re-resolve immediately.
- An inactive role grants nothing, rather than falling back to the defaults it was built from.


#### Phase 2 — Unbox the permission catalog · **M** · after Phase 1 · **DONE**

**Your target org is now expressible.** Verified: 204 of 204 users resolve to identical
permissions, so unboxing widened only what a school *may grant*, never what anyone already
has. 181/181 tests pass.

| # | Task | Status |
| --- | --- | --- |
| 2.1 | `allowedRoles[]` → `{ requiredScope, suggestedRoles, minPlanTier }` | Done — derived, not hand-edited |
| 2.2 | Scope-based assignability | Done — `getAssignablePermissions({ scope, planTier })` |
| 2.3 | Plan ceiling | Mechanism done; **no tiers set — your pricing decision** |
| 2.4 | Segregation-of-duties warnings | Done — 5 conflicts, warn only |

**How the migration was done.** The scope is *derived* from the roles that hold each
permission today, rather than 157 hand edits, so it is exact by construction. A test asserts
that every role still satisfies the scope of every permission it holds, which is what proves
nobody silently lost access.

**35 of 157 permissions are `requiredScope: 'any'`** — already held by both tenant- and
branch-scoped roles. A single required scope would have been wrong for them.

**What is now grantable:** 99 permissions at tenant scope, 71 at branch scope, and **zero**
platform permissions at either. The ceiling has three limits: scope must match, platform is
sealed off from schools entirely, and the plan tier caps what can be reached.

**Plan tiers are not populated.** `minPlanTier` is implemented and enforced, but no permission
sets it — which tier unlocks what is a pricing decision, not a default the platform should
invent. A test asserts this is empty so it cannot drift unnoticed.

**Segregation of duties warns, never blocks.** Refusing would put the platform's judgement
above the school's, and a one-teacher school genuinely has nobody to delegate to. Warnings
ride along in the response and the audit log. Five conflicts ship: full payroll cycle,
invoice-to-payment, identity takeover, unobserved admin, and role self-service. **Your chain
triggers none of them** — HR generates and reviews, Super Admin approves, Finance pays.

**The Phase 1 gap is closed.** Phase 1 noted that removing the `allowedRoles` boxing would
leave granting-to-another-account unbounded. `getAssignablePermissions` is that bound.


#### Phase 3 — Retire the blanket role gates · **S** · after Phase 2 · **DONE**

**Track 1 complete: the target org runs end to end.** A test asserts all four roles reach
their routes — 183/183 tests pass, frontend build clean.

**38 role gates reduced to 5.** Every removal was verified safe first: a gate came out only
once every route beneath it carried its own `requirePermission`.

| # | Task | Status |
| --- | --- | --- |
| 3.1 | `branchAdminRoutes` blanket gate | Removed |
| 3.2 | `registrarRoutes` blanket gate | Removed |
| 3.3 | Remaining redundant `authorize()` | 26 removed across 6 files, plus 3 more blanket gates |
| 3.4 | In-controller `req.role ===` checks | Payroll ones converted to scope/permission |
| 3.5 | Keep `authorize('platform_owner')` | Kept, with 4 others — all documented |

**Four ungated routes were closed first.** Three academic-year lookups and one shared-class
lookup had no permission check; they were only protected by the role gate about to be
removed. Each now requires a permission its legitimate callers already hold.

**A regression was caught and fixed.** Removing `authorize('cashier','super_admin')` from
`payPayroll` exposed that its branch check read `req.user.role === 'cashier'` — so any other
role skipped it entirely and could pay another branch's payroll. It now keys on `req.scope`,
which covers cashiers and any custom branch role alike. `getPayrollHistory` had the mirror
problem in the safe direction: its role list returned 403 to anyone outside it, so a school
granting `payroll.view` to its own role got denied despite holding it. Both are now
permission- and scope-driven.

**The 5 retained locks, each with a structural reason recorded at the call site:**

| File | Why it stays |
| --- | --- |
| `platformRoutes` | Platform scope is a hard boundary, never school-configurable |
| `teacherRoutes` | `teacherAssignmentGuard` **skips** its class/subject check for any non-teacher role, so removing the lock would give a custom role unrestricted access. Generalising the guard is Phase 4 |
| `studentPortalRoutes` | Portal identity bound to `User.studentId` |
| `parentRoutes` | Portal identity bound to linked students |
| `cashierRoutes` | All routes gated, but cash handling deserves its own review — Phase 6 |

A test asserts exactly these five remain and that each file explains itself, so a lock cannot
be added or removed silently.


### Track 2 — let a super admin invent arbitrary roles

> **21 Sep 2026:** narrowed by decision. Roles stay a fixed list. 4.2, 4.3 and 5.2 were built;
> the rest is not planned. See the status box at the top.

Track 1 delivers *your* org. Track 2 delivers the general capability you asked for: any super
admin inventing roles you have not thought of. Those roles need role keys that no layout knows
about, which is why the shell work lives here.

#### Phase 4 — Navigation from the server · **M**
| # | Task |
| --- | --- |
| 4.1 | `GET /api/me/navigation` → `{ home, sections[] }` computed from effective permissions |
| 4.2 | Collapse 10 role-keyed layouts into one capability-driven shell |
| 4.3 | Replace `RoleScopeGuard`'s exact `hasRole` match with a capability check |
| 4.4 | `TenantNavigationConfig` — rename / reorder / hide / group pages |

#### Phase 5 — Role Studio · **M**
| # | Task |
| --- | --- |
| 5.1 | Create / clone / rename / archive roles |
| 5.2 | Capability picker grouped by module, SoD warnings inline |
| 5.3 | **Live preview** — "show me the app as this role sees it" before saving |
| 5.4 | Bulk user reassignment; role usage view |

#### Phase 6 — Hardening · **M**
| # | Task |
| --- | --- |
| 6.1 | Authorization test matrix: every role × every route |
| 6.2 | Privilege-escalation suite |
| 6.3 | Tenant isolation + IDOR pass |
| 6.4 | Confirm instant revocation end to end |
| 6.5 | Audit-log completeness for all role and permission mutations |

---

## 5. Critical path

```
TRACK 1 — your org works
Phase 0 ──▶ Phase 1 ──▶ Phase 2 ──▶ Phase 3          ◀── target org fully running
   S          M           M           S

TRACK 2 — any org works
                              Phase 4 ──▶ Phase 5 ──▶ Phase 6
                                 M           M           M

DEFERRED — only if a school-wide role ever needs branch data
   Branch-context refactor (L) · data scope engine (M) · field masking (M)
```

**Track 1 is S + M + M + S.** That is the whole distance between today and your seven roles
running in production.

**The demo school runs alongside Track 1.** It exercises the current roles and will surface
ordinary bugs that Phase 6 would otherwise catch late. The two streams only collide at Phase 4,
when layouts change — so build the school now.

---

## 6. Answers to your questions

**"Super admin decides how many users?"** — Within the plan cap the platform owner sets. Phase 0
closes the gap that lets tenant-scoped creation exceed it.

**"He creates the administrators?"** — Yes today, but only 3 role types. Any role after Phase 2.
After Phase 1.6 he can only grant what he himself holds.

**"He decides which and what role he wants?"** — For the seven roles in §0: Phase 3. For inventing
arbitrary new roles: Phase 5.

**"He has a whole configuration?"** — Phase 5. Roles, capabilities, data scope and page
visibility in one console with live preview.

**"He can add some features and views for the user he wants?"** — Views: Phase 4 + 5. *New pages*
is deliberately out of scope — renaming, reordering, grouping and hiding is in (Phase 4.4).

**"Remove some users?"** — Already works. `updateUserStatus` deactivates, bumps `tokenVersion` to
kill live sessions, records reason and timestamp, and refuses on the last super admin. It is a
**soft delete** by design, since payroll, student and audit records reference users. Hard deletion
for data-protection requests is separate work.

---

## 7. Security invariants — tested every phase

1. **No privilege escalation.** Never grant what you do not hold. **Missing today — Phase 1.6.**
2. **No self-lockout.** Enforced; preserve.
3. **Last super admin protected.** Enforced; extend to any role holding `tenant.roles.*`.
4. **Plan ceiling.** No grant above tier, including via custom roles.
5. **Scope integrity.** A branch-scoped role never holds a tenant-scoped permission.
6. **System roles immutable** in `key` and `scope`; name and description editable.
7. **Tenant isolation.** A role from tenant A is never assignable in tenant B.
8. **Instant revocation.** Resolve per-request from the DB. **Never cache effective permissions
   into the JWT** — it silently breaks revocation and is the most likely well-meant regression here.
9. **Full audit.** Every role and permission mutation logged with before/after.
