# System Users, Responsibilities, and End-to-End Operating Scenario

## 1. Purpose of This Guide

This guide explains every authenticated user role currently implemented in the system, how each account is created, what work each role performs, what information each role can access, and how all roles work together from school registration through the end of an academic year.

It can be used for customer demonstrations, staff onboarding, access-control reviews, and workflow planning.

> **Updated 21 September 2026.** For a short overview, read [README.md](README.md) first. The
> main changes since the first version of this guide:
>
> - **Roles can be edited.** Each school's Super Admin can rename a role, tick or untick its
>   features, and turn it on or off, on **School management → Roles & Features**. What this
>   guide lists for each role is the **default**; a school can change it.
> - **Menus follow features.** A person's menu shows their own area first, then any page from
>   another area their role has the feature for.
> - **Fees are monthly.** Finance sets a monthly fee per class, opens or closes each fee
>   structure, sets the due day, and bills the whole school for a month in one click.
> - **One payment can cover several months.** It fills the oldest unpaid month first, with one receipt.
> - **Monthly Collection** shows who paid, who paid part and who owes for a month, with an Excel download.
> - **Payment record.** Every student has one, shared by Finance, the payments desk and the parent.
> - **Parents** see a late warning when a bill is past its due date.
> - **Left.** A student who leaves is marked "Left" and is never billed again.
> - **HR Manager is a real role** with its own pages. Payroll: HR prepares and reviews, then by
>   default Finance approves and the Super Admin pays. The demo school swaps those two.

## 2. Important Access-Control Terms

### Role

A role is the user's main position in the system. It gives the user their features (permissions) and decides which area they land in after sign-in.

The implemented authenticated roles are:

1. Platform Owner
2. School Super Admin
3. Finance Director
4. HR & Payroll Manager
5. Branch Admin
6. Registrar
7. Teacher
8. Cashier
9. Student
10. Parent

The list of roles is fixed. Each school can **rename** its roles (the demo school calls the
Registrar "Admissions Officer"), **change which features each role has**, and **turn a role
off** when nobody holds it. That is done on **School management → Roles & Features**.

### Scope

Scope controls which organization's data a user may access:

- Platform scope: the SaaS platform and customer schools' platform status.
- Tenant scope: one school organization and all its branches, subject to permissions.
- Branch scope: one assigned school branch, subject to permissions.
- Personal scope: the user's own records or specifically linked children's records.

### Permission

A permission (a "feature" on screen) controls a specific action, such as viewing students, recording a payment, or managing branches. Each role holds a list of features. The Super Admin edits that list for the whole role on **Roles & Features**, and can add exceptions for one person on **Staff Permissions**.

Limits that no setting can break:

- A branch role never gets whole-school features.
- A school never gets platform features, or features its plan does not include.
- Nobody can give themselves a feature they do not hold.
- The last role able to change roles keeps that ability.

### Menus

Each staff member's menu is built from their features, not from their job title. Their own
area comes first, then any page from another area they have the feature for. Example: the
Finance Director holds the "record a payment" feature by default, so Finance sees a
**Payments desk** group with **Record Payment**.

## 3. Complete User List and Account Ownership

| User | System Role | Scope | Account Created By | Main Portal |
| --- | --- | --- | --- | --- |
| Platform Owner | `platform_owner` | Entire platform | Secure platform-owner creation process | Platform Console |
| School Super Admin | `super_admin` | One school/tenant | Created during approved school registration | School Admin Console |
| Finance Director | `finance_director` | One school/tenant | School Super Admin | Finance Director Portal |
| HR & Payroll Manager | `hr_payroll_manager` | One school/tenant | School Super Admin | HR Portal |
| Branch Admin | `branch_admin` | One assigned branch | School Super Admin | Branch Admin Portal |
| Registrar | `registrar` | One assigned branch | Branch Admin or authorized School Super Admin | Registrar Portal |
| Teacher | `teacher` | Assigned branch and teaching assignments | Branch Admin or authorized School Super Admin | Teacher Portal |
| Cashier | `cashier` | One assigned branch | Branch Admin or authorized School Super Admin | Cashier Portal |
| Student | `student` | Own records | Registrar admission process or authorized school staff | Student Portal |
| Parent | `parent` | Linked children's records | School Super Admin | Parent Portal |

Staff accounts of every role are created on **School management → Staff Accounts**. The list
offers every staff role the school has switched on, under the school's own name for it.
Student and parent accounts come from admission and guardian linking, not from that screen.

## 4. Public School Applicant

A public school applicant is not yet an authenticated system role.

### Responsibilities

- Open the public school-registration page.
- Provide the school's identity, contact details, and initial administrator information.
- Submit the registration request for platform review.
- Wait for approval before trying to operate the school.

### What Happens After Submission

- A new school tenant is created in `Pending` status.
- The submitted administrator is prepared as the school's initial Super Admin.
- The school cannot begin normal operations while approval is pending.
- The Platform Owner reviews the request.
- When approved, the tenant becomes active and its Main Branch is created.
- The School Super Admin can then sign in and configure the school.

### Boundaries

- An applicant cannot access platform administration.
- An applicant cannot use a pending school as an active customer.
- Public registration does not create an automatically active school.

## 5. Platform Owner

### Position and Purpose

The Platform Owner operates the MadraasaHub SaaS platform. This role manages customer schools, platform plans, platform health, and global settings. It is not a school-management role.

### Account Creation

The Platform Owner account is created through the secure platform-owner creation process described in `HOW_TO_RUN_THE_SYSTEM.md`. It is not created from a school dashboard.

### Main Responsibilities

#### Platform Dashboard and Monitoring

- View global platform summary metrics.
- Review registered, active, inactive, and pending school tenants.
- Review branch and student totals exposed as platform-level summaries.
- Review platform subscription revenue summaries.
- Monitor platform activity and service health.
- Identify tenants requiring operational follow-up.

#### Tenant Registration and Approval

- Review newly submitted school-registration requests.
- Inspect submitted school and administrator details.
- Keep an application pending when more review is required.
- Approve and activate legitimate schools.
- Deactivate a school when its platform access must be suspended.
- Update a tenant's assigned subscription plan.
- Review tenant platform status and registration details.

When a pending school is approved, the platform workflow creates the school's Main Branch. The school can then continue its own configuration.

#### Subscription Plan Management

- View available platform subscription plans.
- Create new plans.
- Update plan names, prices, limits, and available features.
- Remove obsolete plans when deletion is allowed.
- Assign plans to tenants.

#### Audit and Operational Oversight

- View platform audit logs.
- Review who performed important platform-level actions.
- Monitor platform events and system health.
- Investigate activation, plan, and platform-setting changes.

#### Platform Settings

- View and update platform-wide settings.
- Configure settings that apply to the SaaS service rather than one school.
- Configure and test SMTP/email delivery settings where supported.

### Information the Platform Owner Creates or Changes

- tenant approval and activation state;
- platform subscription plans;
- tenant plan assignments;
- platform-level settings;
- platform monitoring and operational decisions.

### Handoffs to Other Users

- Hands an approved, active school to the School Super Admin.
- Provides platform plans and service availability used by all schools.
- Uses audit and monitoring information to support customers without becoming their school administrator.

### Access Boundaries

- Does not perform day-to-day school administration.
- Does not register students for a school.
- Does not enter attendance or results.
- Does not collect branch payments.
- Does not act as a school's Finance Director.
- Does not manage a school's classes, staff, or teaching assignments.

## 6. School Super Admin

### Position and Purpose

The School Super Admin is the highest operational administrator inside one school tenant. This role establishes the school's structure, creates senior and branch users, manages academic years, and oversees school-wide administration.

The School Super Admin and Finance Director are separate users. The School Super Admin does not receive Finance Director permissions or the Finance Director dashboard.

### Account Creation

The initial School Super Admin is created as part of the approved school-registration process.

### Main Responsibilities

#### School Setup and Branding

- View the school dashboard.
- Review school-wide operational summaries.
- View and update school branding.
- Maintain the school's display identity and supported school-level settings.

#### Branch Management

- View all branches belonging to the school.
- Create additional branches.
- Edit branch details, including the automatically created Main Branch.
- Activate or deactivate branches.
- Review each branch's status.
- Decide which administrator is responsible for each branch.

#### User and Permission Management

- View school users.
- Create tenant-level and branch-level users permitted by policy.
- Create a separate Finance Director account.
- Create Branch Admin accounts and assign each one to a branch.
- Create Parent accounts and link them to selected students.
- Update user details.
- Activate or deactivate users.
- Reset user passwords where authorized.
- Review and update user custom permissions.
- Deny permissions that a specific user should not have.

The Super Admin must not reuse their own account as the Finance Director. These positions have different dashboards, responsibilities, and access boundaries.

#### Roles & Features

- Open **School management → Roles & Features**.
- For each role: change its name and description, tick or untick its features, and turn it on or off.
- Features are grouped by area (School management, Finance, Payments desk, Admissions, People, Payroll, and so on) and can be searched.
- A change applies to everyone with that role at once, and their menu follows.
- After saving, the screen warns when a role now holds a risky mix of features, for example generating, approving **and** paying payroll, or creating bills **and** taking and reversing payments. The warning does not block the change: a small school may have nobody else to give it to.
- A role that people still hold cannot be turned off; move those people to another role first.
- The Super Admin role always keeps the ability to change roles, so the school is never locked out.

#### Academic-Year Management

- View academic years.
- Create the next academic year.
- Set the current academic year.
- Ensure enrollment, teaching assignments, exams, and promotion use the correct year.
- Keep previous years available for historical reporting.

#### School-Wide Reports

- Review tenant-level reports.
- Review operational information across the school's branches when permitted.
- Compare branches and academic years.
- Use reports to identify issues requiring branch follow-up.

#### Promotion and Transfer Oversight

- Run school-level student promotions.
- Map students from current classes into next-year classes.
- Review promotion outcomes.
- Run or oversee branch transfers.
- Ensure promotions create a new enrollment rather than replacing historical records.

#### High-Level Branch Operations

The Super Admin has broad school authority and can assist with many branch setup tasks when needed, including classes, students, staff, teaching assignments, exams, and reports. Routine branch operation should normally remain with the responsible Branch Admin.

### Information the School Super Admin Creates or Changes

- school branding and school-level configuration;
- branches and branch status;
- school users, account status, and custom permissions;
- academic years and current-year selection;
- school-level promotion and transfer decisions.

### Handoffs to Other Users

- Gives the Finance Director a separate account for school-wide finance work.
- Gives each Branch Admin an assigned branch to configure and operate.
- Gives Parents linked access after students exist.
- Sets academic years used by Registrars, Teachers, Branch Admins, and Finance staff.

### Access Boundaries

- Cannot administer the SaaS platform or other schools.
- Cannot approve its own tenant registration.
- Does not use the Finance Director portal by default.
- Does not receive `finance.*` permissions by default. The Super Admin can add them to their own role in **Roles & Features** if the school wants that, and the change is audited.
- Cannot be converted into a Finance Director account.
- Should not replace specialist users in daily work when duties can be separated.
- **Approves payroll** in the demo school's payroll chain (HR prepares, Super Admin approves, Finance pays). The Payroll page appears under **People management** when the role holds `payroll.view`.

## 7. Finance Director

### Position and Purpose

The Finance Director owns school-wide finance policy, fee setup, invoice oversight, financial reporting, and financial control. This is a dedicated tenant-level role separate from the School Super Admin and branch Cashiers.

### Account Creation

The School Super Admin creates the Finance Director from School Admin > Users > Create Finance Director. The Finance Director then signs in through the dedicated finance login and receives the Finance Director dashboard.

### Main Responsibilities

#### Finance Dashboard

- View school-wide finance summaries.
- Monitor billed amounts, collected amounts, outstanding balances, and payment activity.
- Review financial performance across branches.
- Identify branches or students requiring financial follow-up.

#### Finance Policy (Finance → Policies)

- **Due day.** Each month's bill is due on this day of that month (default: the 10th, any day from 1 to 28). After it, an unpaid bill is **late**: Finance sees it marked late, and the parent sees a warning.
- **Open / Closed fee structures.** Every fee structure has a switch. Only open ones are billed. Closing one stops new bills from it; bills already made stay as they are.
- Part payments are always accepted.
- There are no late fees, discounts or one-time fees in this version.

#### Fee Structures (Finance → Fee Structures)

- Every fee is a **monthly fee**: what one student pays each month.
- A fee can apply to one class, a group of classes (category) on one campus, or a whole grade on every campus. If more than one applies, the most specific open one is used (class, then category, then grade).
- Each fee has items, for example Tuition $40, Materials $6, Activities $4, making $50 a month.
- **Edit** a fee to change its monthly amount. Bills already made keep their old amount.
- Fee structures made before monthly billing held a yearly or term total. They show **"Needs a monthly amount"** and are not billed until they are edited.

#### Billing a Month (Finance → Invoices → Generate)

- Pick the academic year and the month. Months carry real names ("October 2026") and must fall inside the academic year.
- Choose **Whole school** (optionally one campus) or **One student** (for a late joiner; find them by name or admission number).
- **Before anything happens**, the page shows:
  - which classes will be billed, from which fee, and at what monthly amount
  - how many students will be billed, and the total
  - the due date, with a warning if that day has already passed
  - who is already billed for that month
  - which classes are skipped and why (no fee, fee closed, or no monthly amount)
- One click then creates one bill per active student.
- Nobody is ever billed twice for the same month. Students who left, or are inactive, are skipped.
- Parents and students get a notice for each new bill.
- Nothing is billed automatically: someone with the "generate invoices" feature does this once a month.

#### Monthly Collection (Finance → Monthly Collection)

- Pick a month (and optionally a campus, class, or student name).
- For every student billed that month you see:
  - billed, paid, and still owed for the month
  - status: **Paid**, **Part paid**, **Not paid**, **Late**
  - what they still owe **from earlier months**
  - their **total owed**
- The totals at the top cover the whole month: billed, collected, percent collected, still owed, earlier debt, total owed.
- Tabs (All, Paid, Part paid, Not paid, Late) and search narrow the list without changing those totals.
- **Download Excel** gives a real `.xlsx` file with a Summary sheet and a Students sheet.

#### Student Payment Record (click any student name)

- Every month billed, paid and still owed, with its due date, and which months are late.
- Three headline numbers: **this month**, **owed from earlier months**, and **total owed**.
- Every payment, with its date, method, reference and receipt number. Reversed payments stay listed.
- **Take a payment** jumps to the payments desk for this student.
- The payments desk and the parent see the same record.

#### Taking Payments (Payments desk → Record Payment)

The Finance Director holds the payments-desk features by default, so a school without a
separate cashier has Finance take the money. The steps are the same as for a Cashier
(section 11): one amount, oldest month first, one receipt.

#### Payment Oversight (Finance → Payments, Outstanding, Reports)

- View every payment and reversal, with filters and CSV export.
- Review payment summaries, outstanding balances and revenue reports.
- Investigate unexpected balances.

Reversals are made on the receipt by someone with `cashier.payments.reverse` (Finance holds it by
default). The permission catalog also reserves `finance.paymentReversals.approve`, but no separate
approval screen exists yet.

#### Financial Reporting and Receipts

- View revenue reports and outstanding balances.
- Compare collection performance.
- Review historical transactions by academic year where available.
- Check that printed receipts represent the school correctly. Receipts take their name, logo, address and footer from the **branch** that issued them. A separate receipt-branding screen for Finance is listed as a feature but is not built yet.

### Information the Finance Director Creates or Changes

- the due day and which fee structures are open;
- monthly fee structures;
- monthly bills (invoices);
- payments and receipts, when taking payments;
- payroll approvals (by default) or payroll payments (if the school gives Finance that feature);
- financial control decisions.

### Handoffs to Other Users

- Provides monthly bills that linked Parents can view in their payment record.
- Provides collectible bills to branch Cashiers, if the school uses them.
- Receives recorded payment transactions from Cashiers.
- By default approves payroll that HR prepared; the Super Admin or a Cashier then pays it. (The demo school swaps this: the Super Admin approves and Finance pays.)
- Provides financial reports and the monthly Excel file to school leadership.

### Access Boundaries (defaults — the Super Admin can change them in Roles & Features)

- Cannot open the School Super Admin dashboard.
- Cannot create or manage branches.
- Cannot manage classes, teacher assignments, exams, or results.
- Cannot act as the Platform Owner.
- Cannot change roles or anyone's features.
- Cannot be created by converting a School Super Admin account.

## 8. Branch Admin

### Position and Purpose

The Branch Admin operates one assigned school branch. This role prepares the branch for teaching, manages branch staff and academic structures, oversees exams and results, and monitors branch operations.

### Account Creation

The School Super Admin creates the Branch Admin and assigns the account to a specific branch.

### Main Responsibilities

#### Branch Dashboard

- View branch dashboard summaries.
- Review branch-level operational status.

#### Classes, Sections, and Subjects

- View classes available in the branch.
- Create and update classes.
- Manage class sections.
- Manage subjects.
- Ensure the branch's academic structure is ready before enrollment and teacher assignment.

#### Staff Management

- View branch staff.
- Create allowed branch staff accounts: Teachers, Cashiers, and Registrars.
- Update branch staff information.
- Activate or deactivate branch staff.
- Ensure staff accounts remain assigned to the correct branch.

#### Teacher Assignments and Timetable

- View and manage teacher assignments.
- Assign a Teacher to a class, subject, and academic year.
- Update assignments when responsibilities change.
- Create and update timetable entries.
- Connect classes, subjects, Teachers, and time periods.
- Resolve scheduling conflicts.
- Provide schedules used by Teachers and Students.

#### Student Oversight

- View students in the assigned branch.
- Open student details when needed for branch administration.
- Review branch enrollment and promotion status.
- Coordinate with the Registrar when student data or enrollment requires correction.

#### Exams, Results, and Reports

- View, create, update, and delete exams when authorized.
- Prepare exam structures Teachers use for result entry.
- View and export results when allowed.
- Review result completeness and branch-level academic performance.
- View branch reports and rankings.
- Follow up on incomplete or unusual attendance records.

#### Promotion

- Run branch-level promotion workflows.
- Map current classes to next-year classes.
- Review students before promotion.
- Ensure promotion preserves the previous enrollment and creates a new current enrollment.

#### Leave and Payroll Functions

- View and review staff leave requests where permitted.
- Approve or reject branch leave requests according to school policy.
- Access payroll functions only when explicitly granted required permissions.

Payroll management is not a default Branch Admin permission. It should be granted only to the appropriate person.

### Information the Branch Admin Creates or Changes

- classes, sections, and subjects;
- branch staff accounts;
- teacher assignments;
- timetable entries;
- branch exams;
- branch promotion outcomes;
- leave review decisions;
- payroll records only when explicitly authorized.

### Handoffs to Other Users

- Gives Registrars configured classes for student enrollment.
- Gives Teachers assignments, schedules, and exams.
- Gives Cashiers active branch access for payment collection.
- Sends branch reports and issues to the School Super Admin.

### Access Boundaries

- Operates only the assigned branch.
- Cannot view or modify another branch unless authorized through a tenant-level role.
- Cannot approve school tenant registration.
- Cannot manage platform plans.
- Cannot create Platform Owners, School Super Admins, or Finance Directors.
- Cannot access payroll merely because the user is a Branch Admin.

## 9. Registrar

### Position and Purpose

The Registrar manages student admission, student records, enrollment, re-enrollment, and transfer initiation for one assigned branch.

### Account Creation

The Branch Admin or an authorized School Super Admin creates the Registrar and assigns the account to a branch.

### Main Responsibilities

#### Registrar Dashboard and Student Directory

- View registration and enrollment information for the assigned branch.
- Monitor admission or enrollment follow-up.
- Search students by name, admission number, or supported criteria.
- View students in the assigned branch.
- Open student details.
- Update permitted student information.
- Reset a student's password when authorized.
- Correct data errors without deleting valid historical records.
- Download a CSV student-import template.
- Preview CSV student imports, review validation issues, and import only valid rows.
- Export the branch student directory to CSV.
- Print or download official admission summaries for student records.

#### New Admission

- Register a new student.
- Enter identity, contact, guardian, and admission information.
- Create the initial enrollment in the correct class and academic year.
- Confirm admission information is complete before finishing.

#### Re-Enrollment

- Find an existing student.
- Select an available class for the new/current academic year.
- Create a new enrollment for that year.
- Keep the student's previous academic-year enrollment and records intact.
- Avoid duplicate current enrollments.

The class dropdown depends on configured active classes and the relevant academic-year context. The Branch Admin must create classes before the Registrar can enroll students into them.

#### Transfers

- Initiate a branch transfer.
- Select the student and destination branch or class as supported.
- Record the transfer without deleting the student's historical branch records.
- Coordinate approval or completion with authorized administrators.

#### A Student Who Leaves the School

- Open the student, choose **Edit**, and set **Status → Left the school**.
- Enter the leaving date and, optionally, a reason (for example "family moved").
- On save, the student's place in their class ends: they drop off class lists and registers, and **monthly billing never reaches them again**.
- Everything they already owe stays on their payment record until it is paid.
- A student marked Left cannot be switched back with the status box. To bring them back, use **Re-Enrollment** and choose a class for them.
- "Inactive" is different: it is a pause, and the student keeps their class.

### Information the Registrar Creates or Changes

- student identity and admission records;
- student account information;
- enrollments and re-enrollments;
- transfer requests or transfer records;
- permitted student corrections.

### Handoffs to Other Users

- Gives Teachers enrolled students in their assigned classes.
- Gives the Finance Director enrollment data needed for correct invoicing.
- Gives Parents a student record that can be linked by the School Super Admin.
- Gives Branch Admins updated student and enrollment information.

### Access Boundaries

- Operates only the assigned branch.
- Cannot configure school-wide finance.
- Cannot record payments as a Cashier (by default).
- Cannot create exams or enter Teacher results.
- Cannot manage platform, school, or branch administrators.
- Re-enrollment must not overwrite or delete previous attendance, results, invoices, or payments.

## 10. Teacher

### Position and Purpose

The Teacher performs teaching-related work for assigned classes and subjects. Access is limited by branch, class, subject, and academic-year assignments.

### Account Creation

The Branch Admin or an authorized School Super Admin creates the Teacher. The Branch Admin then creates the Teacher's class and subject assignments.

### Main Responsibilities

#### Dashboard and Schedule

- View teaching summaries.
- Review assigned classes, subjects, upcoming work, and relevant status information.
- View the personal teaching schedule.
- See assigned classes, subjects, and timetable periods.
- Use the timetable created by the Branch Admin.

#### Attendance

- Open attendance for an assigned class.
- View students enrolled in the class.
- Mark attendance for the correct date and class context.
- Submit attendance.
- Review previously submitted attendance where allowed.
- Correct attendance only within supported permission and workflow.

#### Exams and Results

- View exams assigned or relevant to the Teacher.
- View exam templates and categories needed for result entry.
- Enter results for assigned classes and subjects.
- Update results where permitted.
- View submitted results.
- Use the grading policy when interpreting marks and grades.

Management of exam templates, categories, and grading policy is not a default Teacher responsibility. Those functions require additional management permissions.

#### Student Academic View and Leave

- View students relevant to assigned teaching work.
- Review academic information needed for teaching.
- Create personal leave requests.
- View the status of personal leave requests.

### Information the Teacher Creates or Changes

- class attendance;
- student marks and results for assigned teaching contexts;
- personal leave requests.

### Handoffs to Other Users

- Provides attendance visible to Students, Parents, and authorized administrators.
- Provides results reviewed by Branch Admins and viewed by Students and Parents.
- Uses assignments, timetables, exams, and enrolled student lists prepared by other staff.

### Access Boundaries

- Can work only within the assigned branch.
- Can enter results only for assigned classes, subjects, and academic years.
- Cannot manage school branches, users, or platform plans.
- Cannot create fee structures, invoices, or payment transactions.
- Cannot access another Teacher's assignments merely because both work in the same branch.
- Cannot manage grading policy, templates, or categories unless explicitly granted those permissions.

## 11. Cashier

### Position and Purpose

The Cashier collects and records payments for one assigned branch. The Cashier uses invoices and finance rules prepared by the Finance Director.

### Account Creation

The Branch Admin or an authorized School Super Admin creates the Cashier and assigns the account to a branch.

### Main Responsibilities

#### Dashboard and Invoice Lookup

- View branch payment-collection summaries.
- Monitor recent transactions and collection work.
- Search for an invoice by supported student or invoice information.
- View invoice details.
- Confirm the student, amount due, branch, and invoice status before collection.

#### Record Payment

- Find the **student** by name or admission number. The results show what each student owes.
- The student's unpaid months are listed **oldest first**, with due dates and late marks.
- Enter the amount the payer brings. Quick buttons fill "the oldest month" or "everything owed".
- Before confirming, the page shows exactly how the money will be split: the oldest month is filled first, then the next. Example: $55 against September $45 and October $45 gives *September $45 (paid), October $10 ($35 left)*.
- Part payments are accepted. The amount cannot be more than the student owes.
- Choose the method: Cash, EVC Plus, Zaad, Bank transfer, Card, or Other. Every method except Cash needs the transaction reference.
- One click records it. Each month gets its own payment line, and **one receipt** shows the whole amount and every month it paid.
- If one month cannot be applied (for example someone else paid it a second earlier), the months already applied are reversed automatically, so a payment is never left half-recorded.
- The same payment cannot be recorded twice by accident.

Finance holds these payments-desk features by default, so a school with no cashier has Finance take payments on this same page.

#### Payment History and Receipts

- View branch payment history.
- Open transaction details.
- View and print receipts.
- Provide the receipt to the payer.

#### Payment Reversal

- Request or perform a payment reversal only when explicitly granted the special reversal permission and when the supported approval workflow is followed.
- Record the reason for correction.

Payment reversal is not a default Cashier permission.

### Information the Cashier Creates or Changes

- payment transactions;
- payment references and methods;
- receipts generated from recorded payments;
- reversals only when specially authorized.

### Handoffs to Other Users

- Updates invoice balances visible to the Finance Director.
- Produces receipts for Parents or other payers.
- Provides transaction history used by finance reports.

### Access Boundaries

- Operates only the assigned branch.
- Cannot define finance policies.
- Cannot create or change fee structures.
- Cannot generate school-wide invoices.
- Cannot reverse payments by default.
- Cannot access student academic results or Teacher administration.

## 12. Student

### Position and Purpose

The Student uses the system to view personal academic information and schedule details. Student access is personal and primarily read-only.

### Account Creation

The Student account is created through the admission process or by authorized school staff. The account is connected to the student's own school record and branch.

### Main Responsibilities

- View personal academic summaries from the Student dashboard.
- View personal results and rank where available.
- Review results from the appropriate academic year and exam context.
- Print or download a branded report card when results are available.
- View the personal class schedule.
- View personal attendance submitted by Teachers.
- View personal profile information.
- Change the personal account password.
- Report incorrect identity or enrollment information to the Registrar.

### Information the Student Creates or Changes

- personal password.

Most Student academic information is read-only and is created by school staff.

### Access Boundaries

- Can view only the Student's own records.
- Cannot view another student's results, rank, attendance, or invoices.
- Cannot edit marks, attendance, enrollment, or invoices.
- Cannot access staff, finance-management, branch-admin, or platform features.

## 13. Parent

### Position and Purpose

The Parent monitors academic and financial information of specifically linked children. Parent access is read-only except for supported notification actions.

### Account Creation

The School Super Admin creates the Parent account and links it to selected student records. A Parent can see only linked children.

### Main Responsibilities

- View a family-level dashboard summary for linked children.
- Select a linked child where needed.
- View a linked child's results and rank where available.
- Print or download a branded report card for a linked child.
- View a linked child's attendance.
- Open **Fees & Payments** for a linked child. It is the same payment record the school sees:
  - three headline numbers: **this month**, **owed from earlier months**, and **total owed**
  - every month billed, paid and still owed, with its due date
  - every payment with its receipt number
- See a **red warning** on the dashboard and on Fees & Payments when a bill is past its due date and not fully paid, for example: *"Amina's school fees are late: $45. September 2026 was due and not fully paid. Please pay at the school office."*
- Use this information when paying through the school's collection process.
- View notifications and mark them as read.
- Raise student-record concerns with the Registrar.
- Raise academic concerns with the appropriate Teacher or branch staff.

### Information the Parent Creates or Changes

- notification read status and other limited personal actions supported by the portal.

### Access Boundaries

- Can view only specifically linked children.
- Cannot view unrelated students.
- Cannot edit attendance, results, invoices, or payments.
- Cannot create or manage staff accounts.
- Cannot access school, branch, finance-management, or platform dashboards.

## 14. HR, Leave, and Payroll Responsibilities

The **HR & Payroll Manager** (`hr_payroll_manager`) is a whole-school role with its own HR
portal: HR Dashboard, Employees, Leave Management, Payroll, and Payroll Reports. HR owns
employees and everything around them. It has nothing to do with students.

### Leave Workflow

- Teachers, Cashiers, Registrars, and other eligible staff create their own leave requests.
- HR, a Branch Admin, or the Super Admin reviews them, if their role has the "review leave" feature.
- Reviewers approve or reject requests according to school policy.
- Staff can view the resulting request status.

### Payroll Workflow

Payroll moves through four steps, each a separate feature:

| Step | Feature | Default holder | Demo school |
| --- | --- | --- | --- |
| Generate the month's payroll | `payroll.generate` | HR | HR |
| Review it | `payroll.review` | HR | HR |
| Approve it | `payroll.approve` | Finance | Super Admin |
| Pay it | `payroll.pay` | Super Admin, Cashier | Finance |

- Staff can view their own payroll when their role allows it.
- HR proposes salary changes; Finance approves them on **Salary Approvals**.
- Whoever holds `payroll.view` finds the Payroll page in their menu; the buttons they see depend on which of the steps above their role holds.

### Recommended Separation of Duties

- Staff request their own leave.
- A manager reviews leave.
- The person who prepares payroll is not the person who approves it, and the approver is not the payer. Roles & Features warns when one role would hold all three (generate, approve and pay).
- Taking student fees and paying staff salaries are separate features, even when one person holds both.

## 15. Complete End-to-End Scenario

### Scenario

Al-Nuur School registers for MadraasaHub, completes setup, operates one academic year, collects fees, records attendance and results, promotes students, and keeps the previous year's records available.

Each step identifies the actor, action, system result, and next handoff.

### Phase A: Platform Preparation and School Registration

#### Step 1: Platform Owner Prepares the SaaS Platform

- Actor: Platform Owner
- Module: Platform Console > Plans, Monitoring, and Settings
- Action: Creates or confirms subscription plans, verifies platform settings, and tests email delivery.
- System result: Plans and platform services are ready for school customers.
- Next handoff: A public applicant can register for service.

#### Step 2: School Applicant Submits Registration

- Actor: Public school applicant
- Module: Public School Registration
- Action: Enters Al-Nuur School information and initial School Super Admin details.
- System result: The tenant and initial administrator application are created in `Pending` state.
- Next handoff: The Platform Owner receives a tenant requiring review.

#### Step 3: Pending Access Is Enforced

- Actor: System
- Module: Authentication and tenant-status checks
- Action: Prevents the pending school from operating as an active tenant.
- System result: The school cannot use normal dashboards before approval.
- Next handoff: The Platform Owner must approve or reject the application.

#### Step 4: Platform Owner Reviews and Activates the School

- Actor: Platform Owner
- Module: Platform Console > Tenants
- Action: Reviews registration, confirms a plan, and activates Al-Nuur School.
- System result: The tenant becomes active and a Main Branch is created.
- Next handoff: The initial School Super Admin can sign in.

### Phase B: School and Branch Setup

#### Step 5: School Super Admin Configures Branding

- Actor: School Super Admin
- Module: School Admin Console > Branding
- Action: Adds school branding and checks tenant information.
- System result: The school's identity is displayed consistently in its portals.
- Next handoff: All school users see the configured identity.

#### Step 6: School Super Admin Reviews the Main Branch

- Actor: School Super Admin
- Module: School Admin Console > Branches
- Action: Opens and edits the automatically created Main Branch.
- System result: Main Branch information is complete and usable.
- Next handoff: The branch can receive an administrator and operational setup.

#### Step 7: School Super Admin Creates the Academic Year

- Actor: School Super Admin
- Module: School Admin Console > Academic Years
- Action: Creates `2026-2027` and sets it as the current academic year.
- System result: Enrollment, assignments, exams, and reporting can use the correct year.
- Next handoff: Branch setup and student enrollment can target the current year.

#### Step 8: School Super Admin Creates a Separate Finance Director

- Actor: School Super Admin
- Module: School Admin Console > Users > Create Finance Director
- Action: Creates a dedicated Finance Director account.
- System result: The Finance Director receives tenant-wide finance access and a separate dashboard.
- Next handoff: Finance setup can begin without giving finance control to the Super Admin account.

#### Step 9: School Super Admin Creates a Branch Admin

- Actor: School Super Admin
- Module: School Admin Console > Users
- Action: Creates a Branch Admin and assigns the user to Main Branch.
- System result: Main Branch has a responsible administrator.
- Next handoff: The Branch Admin can configure branch operations.

#### Step 10: Branch Admin Creates Academic Structures

- Actor: Branch Admin
- Module: Branch Portal > Classes, Sections, and Subjects
- Action: Creates Grade 1, its sections, and its subjects.
- System result: The branch has valid classes and subjects for enrollment and teaching.
- Next handoff: The Registrar can enroll students and Teachers can be assigned.

#### Step 11: Branch Admin Creates Branch Staff

- Actor: Branch Admin
- Module: Branch Portal > Staff Management
- Action: Creates one Registrar, one Cashier, and required Teachers.
- System result: Each staff member receives a branch-scoped account and correct role.
- Next handoff: Staff can perform specialized duties after remaining setup.

#### Step 12: Branch Admin Assigns Teachers

- Actor: Branch Admin
- Module: Branch Portal > Teacher Assignments
- Action: Assigns a Teacher to Grade 1 Mathematics for `2026-2027`.
- System result: The Teacher is authorized for that class, subject, and year.
- Next handoff: The Teacher can later enter attendance and results for the assignment.

#### Step 13: Branch Admin Creates the Timetable

- Actor: Branch Admin
- Module: Branch Portal > Timetable
- Action: Schedules Grade 1 Mathematics with the assigned Teacher.
- System result: The lesson appears in the Teacher's and enrolled Students' schedules.
- Next handoff: Teaching can follow the published schedule.

### Phase C: Admission, Enrollment, Parent Access, and Billing

#### Step 14: Registrar Admits a Student

- Actor: Registrar
- Module: Registrar Portal > New Admission
- Action: Registers student Amina and enrolls her in Grade 1 for `2026-2027`.
- System result: Amina has a student record, account, and current-year enrollment.
- Next handoff: Amina appears in the class roster and becomes available for billing and parent linking.

#### Step 15: School Super Admin Creates and Links a Parent

- Actor: School Super Admin
- Module: School Admin Console > Users
- Action: Creates Amina's Parent account and links it to Amina's student record.
- System result: The Parent can see only Amina's allowed information.
- Next handoff: The Parent can monitor attendance, results, and invoices after records exist.

#### Step 16: Finance Director Sets the Finance Policy

- Actor: Finance Director
- Module: Finance Portal > Policies
- Action: Sets the due day to the 10th.
- System result: Every monthly bill will be due on the 10th of its month; unpaid bills after that day show as late.
- Next handoff: Fee structures can be prepared.

#### Step 17: Finance Director Creates the Monthly Fee

- Actor: Finance Director
- Module: Finance Portal > Fee Structures
- Action: Creates the Grade 1 monthly fee for `2026-2027`: Tuition $40, Materials $6, Activities $4, so $50 a month.
- System result: The fee is open for billing. It appears on Policies with its Open/Closed switch.
- Next handoff: Months can be billed.

#### Step 18: Finance Director Bills September for the Whole School

- Actor: Finance Director
- Module: Finance Portal > Invoices > Generate
- Action: Chooses **September 2026** and **Whole school**, reads the preview (which classes, which fee, how many students, the total, the due date, anyone skipped and why), and clicks once.
- System result: Every active student, Amina included, gets one September bill of their class's monthly fee, due 10 September. Nobody is billed twice. Parents and students get a notice.
- Next handoff: The Parent can see the bill and the payments desk can collect it.

#### Step 19: Parent Checks the Fees

- Actor: Parent
- Module: Parent Portal > Fees & Payments
- Action: Opens Amina's payment record: this month, earlier debt, total owed, each month and each payment.
- System result: The Parent sees exactly what the school sees, without any finance-management access. If the due date passes unpaid, a red late warning also appears on the Parent dashboard.
- Next handoff: The Parent pays at the school office.

#### Step 20: The Payments Desk Takes the Money

- Actor: Cashier, or the Finance Director in a school without a cashier
- Module: Payments desk > Record Payment
- Action: Finds Amina, sees her unpaid months oldest first, enters the amount the Parent brings (say, September and part of October), checks the split shown on screen, and confirms.
- System result: The oldest month is filled first. Each month's balance updates, and **one receipt** shows the whole amount and every month it paid. The receipt can be printed.
- Next handoff: The Parent receives the receipt, and Finance sees the updated collection.

#### Step 21: Finance Director Reviews the Month

- Actor: Finance Director
- Module: Finance Portal > Monthly Collection (and Payments, Outstanding, Reports)
- Action: Picks September 2026. Reviews who paid, who paid part, who has not paid and who is late, with each student's earlier debt and total owed. Downloads the Excel file for the school's records.
- System result: The month's totals (billed, collected, percent collected, still owed, earlier debt) match every payment taken.
- Next handoff: Finance follows up on late students. Clicking a student's name opens their full payment record.

#### Step 21a: A Student Leaves

- Actor: Registrar
- Module: Registrar Portal > Students > student > Edit > Status: Left the school
- Action: Records that another student, Yusuf, left on 20 October because the family moved.
- System result: Yusuf leaves his class and is not billed for November or any later month. The November preview counts one fewer student. What Yusuf already owed stays on his payment record.
- Next handoff: Finance can still collect Yusuf's old debt. If he returns, the Registrar re-enrolls him.

### Phase D: Daily Teaching, Attendance, and Results

#### Step 22: Teacher Opens the Assigned Schedule

- Actor: Teacher
- Module: Teacher Portal > My Schedule
- Action: Opens the Grade 1 Mathematics lesson.
- System result: The Teacher sees only the relevant assigned teaching context.
- Next handoff: Attendance can be recorded.

#### Step 23: Teacher Submits Attendance

- Actor: Teacher
- Module: Teacher Portal > Open Attendance
- Action: Marks and submits Amina's attendance for the correct date.
- System result: A dated attendance record is stored for Amina's current enrollment.
- Next handoff: Student, Parent, and authorized staff can view attendance.

#### Step 24: Student and Parent Review Attendance

- Actor: Student and Parent
- Module: Student Portal > Attendance; Parent Portal > Attendance
- Action: Each user opens the permitted attendance view.
- System result: Amina sees only her attendance, and the Parent sees only linked-child attendance.
- Next handoff: Any concern is reported to school staff; neither user edits the record.

#### Step 25: Branch Admin Creates the Exam

- Actor: Branch Admin
- Module: Branch Portal > Exams
- Action: Creates the term Mathematics exam for the current academic year.
- System result: An exam exists for authorized result entry.
- Next handoff: The assigned Mathematics Teacher can enter marks.

#### Step 26: Teacher Enters Results

- Actor: Teacher
- Module: Teacher Portal > Enter Results
- Action: Selects the assigned exam, class, and subject, then enters Amina's mark.
- System result: A result is stored for the correct student, exam, subject, and academic year.
- Next handoff: Branch Admin can review results and Student and Parent can view permitted information.

#### Step 27: Branch Admin Reviews Results and Reports

- Actor: Branch Admin
- Module: Branch Portal > Results and Reports
- Action: Checks result completeness and reviews academic performance.
- System result: Missing or incorrect academic work can be identified before final reporting.
- Next handoff: Approved results are available to Student and Parent.

#### Step 28: Student and Parent Review Results

- Actor: Student and Parent
- Module: Student Portal > My Results and My Rank; Parent Portal > Grades and Ranks
- Action: Student and Parent review Amina's permitted academic results.
- System result: Both receive appropriate read-only visibility without seeing other students.
- Next handoff: Academic questions are directed to the school.

### Phase E: Staff Leave Example

#### Step 29: Teacher Requests Leave

- Actor: Teacher
- Module: Teacher Portal > Leave Request
- Action: Creates a personal leave request.
- System result: The request is stored with pending review status.
- Next handoff: An authorized Branch Admin or School Super Admin reviews it.

#### Step 30: Branch Admin Reviews Leave

- Actor: Branch Admin
- Module: Branch Portal > Leaves Manager
- Action: Reviews and approves or rejects the request according to school policy.
- System result: The leave request receives a final review status.
- Next handoff: The Teacher can view the decision and the branch can adjust operations.

### Phase F: Year-End Promotion and Historical Preservation

#### Step 31: School Super Admin Creates the Next Academic Year

- Actor: School Super Admin
- Module: School Admin Console > Academic Years
- Action: Creates `2027-2028` and prepares it for the next cycle.
- System result: The next year is available for promotion and future setup.
- Next handoff: Classes and promotion mappings can target the new year.

#### Step 32: Authorized Admin Prepares Promotion

- Actor: School Super Admin or Branch Admin
- Module: Promotion
- Action: Selects completed year, target year, eligible students, and class mapping from Grade 1 to Grade 2.
- System result: The system validates the promotion plan before applying it.
- Next handoff: The authorized administrator confirms promotion.

#### Step 33: System Promotes Amina

- Actor: System, initiated by authorized admin
- Module: Promotion workflow
- Action: Marks Amina's old enrollment as promoted/completed and creates a new Grade 2 enrollment for `2027-2028`.
- System result: Amina has a new current enrollment while the previous enrollment remains historical.
- Next handoff: New-year operations use the Grade 2 enrollment.

#### Step 34: Historical Records Remain Available

- Actor: Authorized school users
- Module: Student details, results, attendance, finance, and reports
- Action: Select the previous academic year or open historical records.
- System result: Previous attendance, results, invoices, payment transactions, and enrollment remain available.
- Next handoff: The school can answer historical questions and produce prior-year reports.

#### Step 35: Platform Owner Continues Platform Oversight

- Actor: Platform Owner
- Module: Platform Console > Monitoring and Audit Logs
- Action: Monitors platform health, tenant status, and platform audit activity.
- System result: The SaaS remains supervised without Platform Owner performing Al-Nuur School's daily work.
- Next handoff: The school continues operating under its own authorized users.

## 16. How the Features Work Together

The workflow depends on clear handoffs:

1. The Platform Owner activates the school.
2. The School Super Admin creates school structure, academic year, senior finance user, and Branch Admins.
3. The Branch Admin creates academic structures, staff, assignments, exams, and timetables.
4. The Registrar creates students and enrollments.
5. The Finance Director sets a monthly fee per class and bills the whole school once a month.
6. The payments desk (a Cashier, or Finance) takes one amount per student, filling the oldest unpaid month first.
6a. Finance follows each month on Monthly Collection; parents see the same payment record and a late warning.
6b. The Super Admin decides which role does which of these jobs on Roles & Features.
7. The Teacher uses assignments and enrollment rosters to submit attendance and results.
8. The Student and Parent receive restricted read-only access to relevant information.
9. Authorized administrators promote students into a new enrollment without deleting the previous academic year.

No single user should perform every task. One role's output becomes another role's authorized input.

## 17. Data Preservation Rules

### Promotion and Re-Enrollment

Promotion and re-enrollment must create a new enrollment for the new academic year. They must not replace the old enrollment.

The previous academic year must retain:

- enrollment and class;
- attendance records;
- exam results and marks;
- invoices;
- payment transactions;
- receipts;
- relevant reports and audit history.

### Transfers

A branch transfer must preserve the student's prior branch and enrollment history. The transfer changes the student's current operational context without deleting valid past records.

### Students Who Leave

Marking a student Left ends their current enrollment (it becomes "Withdrawn") so they stop
receiving bills and drop off class lists. Their bills, payments, receipts, attendance and
results all stay. Re-enrollment creates a new enrollment; it does not revive the old one.

### Financial Corrections

Payment corrections should use the supported reversal or correction workflow. A valid historical transaction should not silently disappear.

A payment that covered several months is stored as one payment per month, sharing one receipt.
Each month's part can be reversed on its own. Editing a fee structure changes only future
bills; bills already made keep their amount.

### User Deactivation

Deactivating a staff account should prevent future access without deleting historical records created by that user.

## 18. Customer Demonstration Sequence

1. Show public school registration and explain pending approval.
2. Sign in as Platform Owner, approve the school, and show Main Branch creation.
3. Sign in as School Super Admin, configure branding, edit Main Branch, create an academic year, create a separate Finance Director, and create a Branch Admin.
4. Sign in as Branch Admin, create classes, subjects, staff, teacher assignments, timetable, and an exam.
5. Sign in as Registrar, admit and enroll a student.
6. Return to School Super Admin and create a Parent linked to the student.
7. Sign in as Finance Director: set the due day, create a monthly fee, and bill a month for the whole school from the preview.
8. Sign in as Parent and show the linked child's Fees & Payments record.
9. On the payments desk (Cashier, or Finance), take one amount covering two months, show the oldest-first split, and print the one receipt.
9a. As Finance, open Monthly Collection, filter to "Not paid", and download the Excel file.
9b. As Super Admin, open Roles & Features, tick a feature for a role, and show it appear in that person's menu.
10. Sign in as Teacher, show schedule, submit attendance, and enter results.
11. Sign in as Student and Parent to show restricted academic visibility.
12. Sign in as Branch Admin to review results and reports.
13. Create the next academic year and promote the student.
14. Show that previous attendance, results, invoice, and payment history remain available.

## 19. Access-Control Demonstration Checks

- A pending school cannot use active-school dashboards.
- The Platform Owner can manage tenants but does not operate school records.
- The School Super Admin and Finance Director have separate dashboards.
- By default the School Super Admin does not see finance navigation, and the Finance Director cannot open school administration pages.
- A menu shows only the pages that person's features allow; ticking a feature on Roles & Features adds the page, unticking removes it.
- A branch role cannot be given a whole-school feature, and a school cannot give itself platform features.
- The Super Admin cannot untick "change roles" from the only role that has it.
- A Branch Admin operates only the assigned branch.
- A Registrar cannot enter results or record payments.
- A Teacher cannot enter results for an unassigned class or subject.
- A Cashier cannot create fee structures or reverse payments by default.
- A payment can never be more than the student owes, and no student is billed twice for a month.
- A student marked Left is never billed again.
- A Student sees only personal records.
- A Parent sees only linked children; opening another family's payment record is refused.
- Promotion and re-enrollment preserve previous academic-year records.
