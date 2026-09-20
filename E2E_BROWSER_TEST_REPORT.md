# Browser End-to-End Test Report

> This earlier route-and-transaction report is superseded by [FULL_SYSTEM_E2E_REPORT.md](./FULL_SYSTEM_E2E_REPORT.md), which includes the complete admission-to-promotion lifecycle and the post-fix cashier reversal verification.

**Test date:** 2026-08-08  
**Browser:** Google Chrome 151, headless, controlled through Chrome DevTools Protocol  
**Application:** React/Vite frontend and Express/MongoDB backend  
**Database safety:** Tests used the isolated `school_management_e2e_20260808` database. The normal `school_management` database was not modified.

## Result Summary

| Area | Result |
| --- | --- |
| Role logins | 10/10 passed |
| Desktop protected routes | 67/67 rendered |
| Mobile Finance/Cashier routes | 17/17 rendered without global horizontal overflow |
| Transaction workflows | 7/7 passed |
| Confirmed application defects | 1 found, 1 fixed |
| Configuration/load observations | 1 |
| Test-data gaps | 1 found, 1 fixed |

Roles tested:

- Platform Owner
- School Super Admin
- Finance Director
- HR & Payroll Manager
- Branch Admin
- Registrar
- Cashier
- Teacher
- Parent
- Student

## Transaction Workflows

The following workflows passed through visible browser controls:

1. HR submitted a compensation change request.
2. Finance approved the compensation request.
3. HR reviewed a Central Campus payroll row.
4. Finance approved the same branch payroll row.
5. The Central Campus Cashier marked the approved payroll paid.
6. The Cashier searched an unpaid student invoice, recorded a payment, and reached the receipt page.
7. Branch transfer showed only `Grade 1` for a Grade 1 student in the destination branch.

## Confirmed Defect

### E2E-001: Student Schedule requests administrator academic-year endpoints

**Severity:** Medium  
**Status:** Fixed and browser-verified on 2026-08-08

**Steps:**

1. Sign in as a Student.
2. Open `/student/schedule`.
3. Observe browser network and console activity.

**Observed:**

The page requests these endpoints and receives `403 Forbidden`:

- `/api/tenant/academic-years`
- `/api/branch/academic-years/current`
- `/api/branch/shared/academic-years/current`

In the Vite development build, React development effects caused each failed request to occur twice, producing six failed responses and six console errors.

**Expected:**

The Student Schedule page should request the student-authorized `/api/student/academic-years` endpoint once and should not call tenant or branch administration endpoints.

**Likely cause:**

`frontend/src/pages/student/Schedule.jsx` imports `getAcademicYearsForTimetable` from `branchTimetable.api.js`. That helper intentionally tries tenant and branch routes. The student API already provides `apiGetStudentAcademicYears` in `frontend/src/services/api/student.api.js`.

**Impact:**

The schedule content can still render from the student timetable endpoints, but the academic-year selector is empty and the browser logs authorization failures.

**Resolution:**

`Student/Schedule.jsx` now uses `apiGetStudentAcademicYears`, selects the current academic year, loads the year list once, and waits for a valid year before requesting timetable data.

Focused production-browser verification passed with:

- Student login: passed
- Student protected pages: 6/6 passed
- `/student/schedule` `403` responses: 0
- Academic-year endpoint used: `/api/student/academic-years`

## Configuration Observation

### E2E-002: Broad hard-navigation sweep reached the global API rate limit

**Severity:** Low  
**Status:** Review configuration

After 47 protected-page hard navigations and repeated role logins, the default `600` requests per 15 minutes limit returned `429 Too Many Requests`. Normal in-app navigation makes fewer requests, so this did not reproduce during the focused transaction run.

Recommended review:

- Cache public branding/settings requests instead of fetching them repeatedly.
- Keep authentication rate limits strict, but consider whether the general authenticated API limit should be adjusted for administrator-heavy workflows.
- Add a documented higher limit for isolated automated E2E environments.

## Test-Data Gap

### E2E-003: Showcase seed does not create an HR account

**Severity:** Low  
**Status:** Fixed and API-verified on 2026-08-08

`resetAndSeedShowcase.js` creates Finance, Branch Admin, Registrar, Cashier, Teacher, Parent, and Student accounts, but it does not create an `hr_payroll_manager`. A temporary HR account had to be created in the isolated database to test the new HR portal.

Original recommendation: add one HR & Payroll Manager account per showcase school and include it in the printed demo-account list.

**Resolution:**

The showcase seed now creates one active, tenant-scoped HR & Payroll Manager per school with a recurring salary profile. The seed integrity check validates the role count, scope, branch isolation, and salary. In the isolated `school_management_seed_hr_e2e_20260808` database, the API verifier authenticated the Horizon HR account and passed all 56 checks, including 24 employees, 4 leave requests, 22 June payroll records, and the HR manager's positive basic salary.

## Visual Checks

- Desktop Finance, HR, Cashier, Parent, Branch, Registrar, Teacher, Student, Super Admin, and Platform dashboards rendered nonblank.
- Finance and Cashier mobile routes passed at `390x844` with no page-level horizontal overflow.
- Representative Finance, HR, and Cashier screenshots showed correct school branding, consistent navigation, readable text, and no visible element overlap.

## Limitations

- Email and SMS delivery were not tested against external providers.
- Browser tests did not create a new school, admit a new student, enter examination marks, promote a student, or submit the final transfer. Their protected pages and read workflows were tested, while the database-changing focus was Finance, HR, Cashier, payroll, and transfer-grade filtering.
- The transfer API grade mismatch rule remains covered by the backend automated tests; this browser run verified that the destination selector exposes only the matching grade.

## Test Harness

The dependency-free local browser harness is in:

- `backend/scripts/browserE2EAudit.js`
- `backend/scripts/startLocalE2EServer.js`

It accepts credentials and endpoints through environment variables and does not store passwords in source control.
