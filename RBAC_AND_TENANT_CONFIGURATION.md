# Tenant-Configurable RBAC — Current State & Target Architecture

> **Status on 21 September 2026 — read this box first.**
>
> Most of this design is now built. In plain words:
>
> | Part of the design | State |
> | --- | --- |
> | Phase 0 — close gaps | **Done** (`12c5407`) |
> | Phase 1 — roles become data (`Role` model, `User.roleId`) | **Done** (`8e49c00`) |
> | Phase 2 — permissions limited by scope, not role (`requiredScope`, plan ceiling) | **Done** (`36fa0f5`) |
> | Phase 3 — blanket role gates removed from routes | **Done** (`ea51b6f`). Four locks stay on purpose: platform, teacher, student and parent portals |
> | Phase 5 (part) — one capability-driven shell | **Done, on the client.** One shared staff frame (`StaffLayout`) builds each menu from permissions (`frontend/src/config/staffMenu.js`). There is no `/api/me/navigation` and no `TenantNavigationConfig`; they are not needed for the decided scope |
> | Phase 6 (part) — the super admin screen | **Done as "Roles & Features"**: rename, tick/untick features grouped by area, turn a role on or off, duty-conflict warnings. No create/clone and no live preview (see decision below) |
> | Phase 4 — data scope engine, field masking | **Not started.** Not needed for the decided scope |
> | Phase 7 — hardening | **Partly**: 201 backend tests cover escalation, scope ceiling, plan ceiling, lock-out, tenant isolation; no full role × route matrix yet |
>
> **Decision (21 Sep 2026, school owner):** roles stay a **fixed list**. A school renames them,
> changes their features and turns them on or off; it does **not** invent new roles. So "Wall 3"
> (layouts keyed to role) is solved for fixed roles by building menus from permissions, and
> "Wall 4" (page composition) stays out of scope. See `README.md` for the plain-English overview.
>
> Everything below is the original design and analysis, kept for reference. Section 2 describes
> the system **as it was on 20 September**, before these phases.

**Status:** Design document — mostly implemented (see box above)
**Date:** 2026-09-20, status added 2026-09-21
**Scope:** Roles, permissions, data access, page composition, plan limits

---

## 1. The question this document answers

> Can a tenant decide how many users they have, how many roles exist, which roles they hand
> out, how much data each user can access, and what every page contains?

**Today: no.** The platform is multi-tenant, and it has a real per-user permission system,
but **roles, the role→permission map, the role→layout map, and page composition are all
compiled into source code.** A super admin can adjust permissions *within* a fixed role's
predefined box. They cannot invent a role, cannot move a permission across roles, and
cannot change what a page contains.

This document records exactly what exists, what is missing, and the sequence to close the gap.

---

## 2. What exists today

### 2.1 The permission catalog — the strong foundation

`backend/utils/permissions.js` defines **152 permissions** across 11 groups:

| Group | Prefix | Example |
| --- | --- | --- |
| Platform | `platform.*` | `platform.tenants.approve` |
| School Admin | `tenant.*` | `tenant.users.permissions.update` |
| Branch | `branch.*` | `branch.students.detail` |
| Finance | `finance.*` | `finance.invoices.generate` |
| Registrar | `registrar.*`, `students.*`, `enrollments.*` | `students.create` |
| Cashier | `cashier.*` | `cashier.payments.reverse` |
| Teacher | `teacher.*` | `teacher.results.enter` |
| HR / Payroll | `hr.*`, `payroll.*` | `payroll.approve` |
| Student | `student.*` | `student.results.view` |
| Parent | `parent.*` | `parent.grades.view` |

Each entry is `{ key, label, group, description, allowedRoles[] }`.

**Enforcement is thorough.** `backend/routes/` contains **217** `requirePermission` /
`requireAnyPermission` / `requireAllPermissions` calls against only **38** legacy
`authorize(role)` calls. The permission layer is the primary gate; role gates are a
secondary coarse filter.

### 2.2 Effective permission resolution

```
effective = (role defaults ∪ user.permissions.allow) − user.permissions.deny
```

Implemented in `getUserPermissionParts()`. Three properties worth preserving:

- **Deny always wins** over both defaults and explicit allow.
- **Both allow and deny are re-sanitized on read**, not just on write. If the catalog changes
  under a stored permission, the stale key is dropped rather than honoured.
- **Resolution happens per request, from the database.** `middleware/auth.js` sets
  `req.permissions = getEffectivePermissions(req.user)` after a fresh `User.findById`.
  Revoking a permission takes effect on the user's **very next request** — no token refresh,
  no stale-JWT window. This is a genuine strength and must survive any refactor.

### 2.3 Existing safety rails

`updateUserPermissions()` in `controllers/tenantController.js` already enforces:

- Unknown or cross-role permission keys are **rejected with 400**, not silently dropped.
- A key cannot appear in both `allow` and `deny`.
- A user cannot deny **themselves** `tenant.users.permissions.update` (self-lockout).
- The **last active super admin** cannot lose permission-management access.
- Every change is written to the audit log with full before/after permission sets.

### 2.4 Tenant isolation

Every model carries `tenantId`. `middleware/auth.js` resolves tenant context from the token,
verifies tenant status is `active`, and `tenantGuard` rejects any request whose body
`tenantId` contradicts the token. `branchGuard` does the same for branch scope.

### 2.5 Frontend gating

- `PermissionRouteGuard` + `ROUTE_PERMISSION_RULES` — **88 regex rules** mapping URL → required
  permission. Renders `AccessDenied` on failure.
- `filterMenuByPermission(user, items)` — hides sidebar entries the user can't reach.
- `Can` component — declarative element-level gate.

---

## 3. What is missing — the four walls

### Wall 1 — The role list is an enum, not data

`models/User.js`:

```js
role: {
    enum: ['super_admin', 'finance_director', 'hr_payroll_manager', 'branch_admin',
           'teacher', 'cashier', 'registrar', 'platform_owner', 'student', 'parent'],
}
```

Reinforced by `utils/rolePolicy.js`, which hardcodes:

- `ROLE_SCOPE` — a fixed role → `tenant` | `branch` | `platform` mapping.
- `TENANT_ADMIN_CREATABLE_ROLES` — a super admin may create exactly **three** roles:
  `finance_director`, `hr_payroll_manager`, `branch_admin`.
- `BRANCH_ADMIN_CREATABLE_ROLES` — `teacher`, `cashier`, `registrar`.

**Consequence:** no "Deputy Principal", no "Exams Officer", no "Head of Department", no
"Librarian". No renaming. No cloning an existing role as a starting point.

### Wall 2 — Permissions are boxed by role

Every catalog entry hardcodes which roles may ever hold it:

```js
createPermission('finance.invoices.view', 'View invoices', 'Finance', '...', ['finance_director'])
```

`sanitizeAssignablePermissionsForRole()` then filters any grant against that whitelist, and
`updateUserPermissions` rejects violations with 400.

**Consequence — this is the single biggest blocker.** The super admin's permission editor can
only shuffle permissions *inside* a role's predefined box. You cannot build a "Branch Admin who
also approves invoices" or a "Registrar who can view payroll". The mental model the business
wants — *pick a name, pick capabilities, hand it out* — is structurally unavailable.

### Wall 3 — Layout and landing page are keyed to role, not capability

`utils/guards.js` gates on an exact role string match:

```js
export const hasRole = (user, expectedRole) =>
    normalizeRole(user.role) === normalizeRole(expectedRole);
```

There are **10 hardcoded layouts** in `frontend/src/layouts/`, one per role, each with its own
sidebar component and its own hardcoded menu array.

**Consequence:** a custom role has **no shell and nowhere to land after login.** Even if
Walls 1 and 2 fell tomorrow, a custom-role user would hit a redirect loop.

### Wall 4 — Page composition is compiled in

- Which pages exist → `App.jsx` route tree (97 page components).
- Which menu items exist, their labels, icons, order → hardcoded arrays inside each sidebar.
- Which widgets a page shows → JSX.

A tenant cannot add, remove, rename, or reorder anything.

**Additionally, element-level gating is effectively unimplemented.** `components/auth/Can.jsx`
is **imported by zero files** — it is dead code. Direct `hasPermission` calls appear in only
**5 of 97 pages**. On the remaining ~92 pages, users see buttons for actions they cannot
perform. The backend correctly rejects those actions (that is what the 217 checks are for),
so this is **not a security hole** — but it is precisely the "what every page is meant to
have" problem, and it is not solved.

### 3.5 Data access — what each layer can and cannot do

| Layer | Status | Detail |
| --- | --- | --- |
| **Action** (what you may do) | Working | 152 permissions, 217 enforcement points, per-user allow/deny — but boxed by role (Wall 2). |
| **Row** (which records) | Partial | `tenant` / `branch` / `platform` scope only. `authorizedBranchIds` (multi-branch) is **teacher-only** and force-cleared for every other role in `User.pre('validate')`. Teachers additionally get per-class/subject filtering via `teacherAssignmentGuard`. No configurable row rules for anyone else. |
| **Field** (which columns) | Missing | Only ad-hoc: `accountNumber` and `mobileMoneyNumber` are `select: false`. No way to express "this role sees salary but not bank details". |

---

## 4. Plan limits — what the platform owner controls

`Plan` → copied into `tenant.subscriptionLimits` → enforced by `enforcePlanLimit(resource)`.

| Limit | Enforced? | Notes |
| --- | --- | --- |
| `maxBranches` | Yes | `POST /api/tenant/branches` |
| `maxStudents` | Yes | Registrar admission + `POST /api/students` |
| `maxUsers` | **Partial — gap** | Enforced on branch user creation and student admission. **Not** enforced on `POST /api/tenant/users`. A super admin can create unlimited tenant-scoped users past the plan cap. |
| `storageLimit` | **No** | Stored and displayed, never checked. |
| `features[]` | **No** | Free-text strings rendered on the pricing page. No plan→feature gate exists, so nothing stops a basic-plan tenant using enterprise capabilities. |

---

## 5. Target architecture

The goal: **a super admin opens "Roles & Access", creates a role, names it, ticks
capabilities, sets data scope, assigns it to users — and the whole app reshapes itself.**

### 5.1 New model — `Role`

```js
{
  tenantId,                        // null = system template, seeded for all tenants
  key,                             // 'deputy_principal' — stable, immutable after create
  name, description,               // tenant-facing, editable
  scope: 'tenant' | 'branch',      // determines branch requirement on the user
  permissions: [String],           // catalog keys — the role's capability set
  dataScope: {
    branches: 'all' | 'assigned' | 'own',
    records:  'all' | 'assigned' | 'own',
    fieldMasks: [String]           // e.g. ['employmentInfo.basicSalary']
  },
  isSystem: Boolean,               // seeded roles — cannot be deleted
  isActive: Boolean,
  createdBy, updatedBy
}
```

`User.role` stays as a **denormalized key string** (keeps 38 `authorize()` sites and all
existing queries working) and gains `User.roleId → Role`. Migration seeds the 10 current
roles as `isSystem` roles per tenant, so **nothing breaks on day one**.

### 5.2 Permission catalog — replace `allowedRoles` with `requiredScope`

The real constraint on a permission was never *which role* — it was *which scope*.
`branch.students.view` is meaningless to a tenant-scoped user with no branch. But there is no
reason a custom branch-scoped role shouldn't hold it.

```js
// Before
createPermission('finance.invoices.view', ..., ['finance_director'])

// After
createPermission('finance.invoices.view', ..., {
  requiredScope: 'tenant',        // hard constraint — structural
  suggestedRoles: ['finance_director'],  // soft — UI grouping hint only
  minPlanTier: 'pro'              // plan ceiling
})
```

Assignability then becomes:

```
assignable(role) = catalog
  .filter(p => p.requiredScope === role.scope || p.requiredScope === 'any')
  .filter(p => planAllows(tenant.plan, p.minPlanTier))
```

### 5.3 Capability-driven shell

Replace 10 role-keyed layouts with **one shell** driven by a server-provided navigation tree.

```
GET /api/me/navigation
→ { home: '/branch', sections: [
      { label: 'Academics', items: [
          { label: 'Classes', path: '/branch/classes', icon: 'BookOpen', permission: 'branch.classes.view' }
      ]}
  ]}
```

The tree is computed server-side from the user's effective permissions, then intersected with
the tenant's navigation config (Wall 4). The frontend stops deciding who sees what.

`home` resolves the landing-page problem: derived from the user's highest-priority dashboard
permission rather than from a role string.

### 5.4 New model — `TenantNavigationConfig`

Lets a tenant rename, reorder, hide, and group pages without a deploy.

```js
{
  tenantId,
  overrides: [{ path, label, icon, section, order, hidden }],
  sections:  [{ key, label, order }]
}
```

Page *existence* stays code-defined (routes are real React components). What a tenant controls
is **labelling, grouping, ordering, and visibility** — which covers the realistic need without
turning the app into a page builder.

### 5.5 Data scope engine

A single helper every controller calls instead of hand-rolling filters:

```js
const filter = buildScopeFilter(req, 'Student');
// → { tenantId, branchId: { $in: [...] } }  per the role's dataScope
```

This also generalizes `authorizedBranchIds` to **all** roles, not just teachers — removing the
force-clear in `User.pre('validate')`.

---

## 6. Delivery sequence

Phases are ordered so that **each one ships independently and nothing is broken in between.**

### Phase 0 — Close current gaps (small, do first)

- Add `enforcePlanLimit('users')` to `POST /api/tenant/users`.
- Wire `Can` into pages, or delete it. Audit the ~92 ungated pages for action buttons.
- Decide whether `Plan.features[]` becomes enforced or is renamed to `marketingFeatures[]`.

### Phase 1 — Role becomes data

- Add `Role` model + migration seeding the 10 system roles per tenant.
- Add `User.roleId`, backfill, keep `User.role` string in sync.
- Role CRUD endpoints, guarded by a new `tenant.roles.*` permission group.
- **Nothing visible changes yet.** This is the load-bearing step.

### Phase 2 — Unbox permissions

- Migrate catalog from `allowedRoles[]` to `{ requiredScope, suggestedRoles, minPlanTier }`.
- Rewrite `sanitizeAssignablePermissionsForRole` → `sanitizeAssignablePermissionsForScope`.
- **This is the phase that answers the original question.** After it, a super admin can build
  any role from any compatible capability.

### Phase 3 — Retire role gates

- Replace the 38 `authorize(role)` calls with permission equivalents.
- Replace the 16 in-controller `req.role ===` checks with capability or scope checks.
- Exception: keep `authorize('platform_owner')` — platform scope is a genuine hard boundary,
  not a tenant-configurable one.

### Phase 4 — Data scope engine

- `buildScopeFilter()` helper; adopt controller by controller.
- Generalize `authorizedBranchIds` to all roles.
- Field masking layer driven by `Role.dataScope.fieldMasks`.

### Phase 5 — Navigation from the server

- `GET /api/me/navigation`; collapse 10 layouts into one capability-driven shell.
- `TenantNavigationConfig` model + tenant editor UI.

### Phase 6 — Role Studio (the super admin UI)

- Create / clone / rename roles, capability picker grouped by module.
- Data scope configuration.
- **Live preview**: "show me the app as this role sees it" before saving.
- Bulk reassignment of users between roles.

### Phase 7 — Hardening

- Full authorization test matrix: every role × every route.
- Privilege-escalation tests (see §7).
- Penetration pass on tenant isolation and IDOR.

---

## 7. Security invariants — must hold at every phase

These are non-negotiable and each needs a regression test:

1. **No privilege escalation.** A user may never grant a permission they do not themselves
   hold. *Not currently enforced* — a super admin with a denied permission can still grant it
   to someone else. Add this in Phase 1.
2. **No self-lockout.** Already enforced; preserve it.
3. **Last super admin is protected.** Already enforced; extend it to cover *any* role holding
   `tenant.roles.*` once custom roles exist.
4. **Plan ceiling.** A tenant may never grant a permission above their plan tier — including
   via a custom role. New in Phase 2.
5. **Scope integrity.** A branch-scoped role can never hold a tenant-scoped permission.
6. **System roles are immutable in key and scope.** Name and description stay editable.
7. **Tenant isolation.** A role from tenant A is never assignable in tenant B.
8. **Instant revocation.** Permissions must continue to resolve per-request from the database.
   **Do not** cache effective permissions into the JWT as an optimization — it would silently
   break revocation.
9. **Full audit.** Every role and permission change is logged with before/after state.

---

## 8. Open decisions

**Answered 21 Sep 2026:** 1 — not needed, roles are a fixed list. 2 — renaming a role and
choosing its features is enough; no custom pages. 3 — not needed yet. 4 — not needed yet.
5 — fixed: student and parent stay portal roles (their features can be edited, but their pages
stay bound to the student's own record).

The original questions:

1. **Role ceiling per tenant** — unlimited custom roles, or capped by plan? (Recommend:
   capped, as a natural upsell lever.)
2. **Page existence vs. page composition** — is renaming/reordering/hiding enough, or does the
   business genuinely need tenants adding custom pages? (Recommend: start with the former;
   the latter is a different product.)
3. **Cross-branch roles** — should a custom role span specific branches for non-teachers?
   (Recommend: yes, via generalized `authorizedBranchIds` in Phase 4.)
4. **Field masking granularity** — per-field, or per named group like "financial data"?
   (Recommend: named groups; per-field is unmanageable in a UI.)
5. **Student and parent roles** — do they stay fixed system roles, or become customizable?
   (Recommend: fixed. They are portal identities, not staff roles.)

---

## 9. Reference — key files

| Concern | File |
| --- | --- |
| Permission catalog & resolution | `backend/utils/permissions.js` |
| Role → scope map, creatable roles | `backend/utils/rolePolicy.js` |
| Permission middleware | `backend/middleware/permissions.js` |
| Auth, tenant & branch guards | `backend/middleware/auth.js` |
| User schema (role enum) | `backend/models/User.js` |
| Permission management endpoints | `backend/controllers/tenantController.js` |
| Plan limit enforcement | `backend/services/planLimitService.js` |
| Role model and role editing | `backend/models/Role.js`, `backend/controllers/roleController.js` |
| Seeding roles for existing schools | `backend/scripts/seedSystemRoles.js` (`npm run migrate:roles`) |
| Duty-conflict warnings | `backend/utils/segregationOfDuties.js` |
| Route → permission map | `frontend/src/utils/routePermissions.js` |
| Route guard (per page) | `frontend/src/components/auth/PermissionRouteGuard.jsx` |
| Area guard (staff areas, by scope) | `frontend/src/components/auth/StaffAreaGuard.jsx` |
| Staff menu built from permissions | `frontend/src/config/staffMenu.js` |
| Shared staff frame | `frontend/src/layouts/StaffLayout.jsx` |
| Roles & Features screen | `frontend/src/pages/tenant/Roles.jsx` |
| Role-keyed guard (portals only now) | `frontend/src/utils/guards.js` |

`Can.jsx` was deleted in Phase 0. The six role-keyed staff layouts were replaced by `StaffLayout`
on 21 September 2026.
