# System Users, Responsibilities, and End-to-End Operating Scenario

## 1. Purpose of This Guide

This guide explains every authenticated user role currently implemented in the system, how each account is created, what work each role performs, what information each role can access, and how all roles work together from school registration through the end of an academic year.

It can be used for customer demonstrations, staff onboarding, access-control reviews, and workflow planning.

## 2. Important Access-Control Terms

### Role

A role is the user's main position in the system. It provides default permissions and determines the user's main dashboard.

The implemented authenticated roles are:

1. Platform Owner
2. School Super Admin
3. Finance Director
4. Branch Admin
5. Registrar
6. Teacher
7. Cashier
8. Student
9. Parent

### Scope

Scope controls which organization's data a user may access:

- Platform scope: the SaaS platform and customer schools' platform status.
- Tenant scope: one school organization and all its branches, subject to permissions.
- Branch scope: one assigned school branch, subject to permissions.
- Personal scope: the user's own records or specifically linked children's records.

### Permission

A permission controls a specific action, such as viewing students, recording a payment, or managing branches. Each role receives default permissions. Authorized administrators can grant or deny selected custom permissions, but custom permissions cannot be used to escape the user's allowed role and data scope.

## 3. Complete User List and Account Ownership

| User | System Role | Scope | Account Created By | Main Portal |
| --- | --- | --- | --- | --- |
| Platform Owner | `platform_owner` | Entire platform | Secure platform-owner creation process | Platform Console |
| School Super Admin | `super_admin` | One school/tenant | Created during approved school registration | School Admin Console |
| Finance Director | `finance_director` | One school/tenant | School Super Admin | Finance Director Portal |
| Branch Admin | `branch_admin` | One assigned branch | School Super Admin | Branch Admin Portal |
| Registrar | `registrar` | One assigned branch | Branch Admin or authorized School Super Admin | Registrar Portal |
| Teacher | `teacher` | Assigned branch and teaching assignments | Branch Admin or authorized School Super Admin | Teacher Portal |
| Cashier | `cashier` | One assigned branch | Branch Admin or authorized School Super Admin | Cashier Portal |
| Student | `student` | Own records | Registrar admission process or authorized school staff | Student Portal |
| Parent | `parent` | Linked children's records | School Super Admin | Parent Portal |

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
- Does not use the Finance Director portal.
- Does not receive `finance.*` permissions by default.
- Cannot be converted into a Finance Director account.
- Should not replace specialist users in daily work when duties can be separated.

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

#### Finance Policy Management

- View finance policies.
- Update school-wide finance policies.
- Define the operating rules used for school billing and collections.
- Ensure policies are consistent across branches.

#### Fee Structure Management

- View fee structures.
- Create fee structures for the correct academic year, class, branch, or applicable group.
- Update fee structures when authorized.
- Remove incorrect or obsolete fee structures when deletion is allowed.
- Check that fee structures are ready before invoice generation.

#### Invoice Management

- View invoices across the school.
- Generate invoices from approved fee structures.
- Inspect invoice details.
- Track invoice status and balances.
- Confirm invoices are connected to the correct student, enrollment, branch, and academic year.

#### Payment Oversight

- View payment transactions recorded by Cashiers.
- Review payment summaries.
- Investigate unexpected balances or transactions.
- Review payment corrections and reversals recorded through the supported Cashier workflow.
- Keep payment-reversal access separate from routine Cashier collection when possible.

The permission catalog reserves `finance.paymentReversals.approve` for the Finance Director, but a Finance Director approval screen and endpoint are not currently implemented. Until that workflow is added, reversals are performed only through the Cashier reversal endpoint by a Cashier who has been explicitly granted `cashier.payments.reverse`.

#### Financial Reporting and Receipt Branding

- View revenue reports and outstanding balances.
- Compare collection performance.
- Review historical transactions by academic year where available.
- View and update receipt branding.
- Ensure printed receipts represent the school correctly.

### Information the Finance Director Creates or Changes

- finance policies;
- fee structures;
- generated invoices;
- financial control decisions;
- receipt branding.

### Handoffs to Other Users

- Provides invoices that linked Parents can view.
- Provides collectible invoices to branch Cashiers.
- Receives recorded payment transactions from Cashiers.
- Provides financial reports to school leadership.

### Access Boundaries

- Cannot open the School Super Admin dashboard.
- Cannot create or manage branches.
- Cannot manage classes, teacher assignments, exams, or results.
- Cannot act as the Platform Owner.
- Does not collect every routine payment; that is the Cashier's responsibility.
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
- Cannot record payments as a Cashier.
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

- Record a payment against the correct invoice.
- Enter payment amount, payment method, and supported reference information.
- Confirm the transaction before completing it.
- Avoid recording the same payment twice.

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
- View a linked child's invoices, balances, and payment status.
- Use invoice information when paying through the school's collection process.
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

HR and Payroll are system functions, not separate implemented user roles.

### Leave Workflow

- Teachers, Cashiers, Registrars, and other eligible staff can create their own leave requests when permitted.
- Branch Admins or School Super Admins can review leave requests when permitted.
- Reviewers approve or reject requests according to school policy.
- Staff can view the resulting request status.

### Payroll Workflow

- Eligible staff can view their own payroll information when permitted.
- Payroll administrators can view, generate, or mark payroll as paid only when explicitly granted required permissions.
- Branch Admins do not receive payroll-management permissions by default.
- A school should grant payroll permissions only to the person responsible for payroll.

### Recommended Separation of Duties

- Staff request their own leave.
- A manager reviews leave.
- A specifically authorized payroll administrator manages payroll.
- Payment collection by a Cashier remains separate from staff payroll management.

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

#### Step 16: Finance Director Configures Finance Policy

- Actor: Finance Director
- Module: Finance Portal > Policies
- Action: Sets the school's billing and collection policy.
- System result: Finance operations use the approved school policy.
- Next handoff: Fee structures and invoices can be prepared consistently.

#### Step 17: Finance Director Creates a Fee Structure

- Actor: Finance Director
- Module: Finance Portal > Fee Structures
- Action: Creates the Grade 1 fee structure for `2026-2027`.
- System result: The system has approved charges for eligible Grade 1 enrollments.
- Next handoff: Invoices can be generated.

#### Step 18: Finance Director Generates Invoices

- Actor: Finance Director
- Module: Finance Portal > Invoices
- Action: Generates invoices from the current fee structure.
- System result: Amina receives an invoice linked to her enrollment, branch, and academic year.
- Next handoff: The Parent can view the invoice and the Cashier can collect it.

#### Step 19: Parent Reviews the Invoice

- Actor: Parent
- Module: Parent Portal > Fees and Invoices
- Action: Opens Amina's invoice and confirms the outstanding balance.
- System result: The Parent understands the amount due without finance-management access.
- Next handoff: The Parent presents payment information to the school Cashier.

#### Step 20: Cashier Records the Payment

- Actor: Cashier
- Module: Cashier Portal > Invoice Lookup and Record Payment
- Action: Searches for Amina's invoice, verifies it, records payment, and prints the receipt.
- System result: A transaction is created, invoice balance is updated, and a receipt is available.
- Next handoff: The Parent receives the receipt and Finance Director sees the updated collection.

#### Step 21: Finance Director Reviews Collection Status

- Actor: Finance Director
- Module: Finance Portal > Dashboard, Payments, Reports, and Outstanding
- Action: Reviews the payment, revenue summary, and outstanding balances.
- System result: School-wide finance reports reflect the Cashier's transaction.
- Next handoff: Finance leadership can follow up on unpaid invoices.

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
5. The Finance Director turns enrollments and fee structures into invoices.
6. The Cashier records payments against those invoices.
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

### Financial Corrections

Payment corrections should use the supported reversal or correction workflow. A valid historical transaction should not silently disappear.

### User Deactivation

Deactivating a staff account should prevent future access without deleting historical records created by that user.

## 18. Customer Demonstration Sequence

1. Show public school registration and explain pending approval.
2. Sign in as Platform Owner, approve the school, and show Main Branch creation.
3. Sign in as School Super Admin, configure branding, edit Main Branch, create an academic year, create a separate Finance Director, and create a Branch Admin.
4. Sign in as Branch Admin, create classes, subjects, staff, teacher assignments, timetable, and an exam.
5. Sign in as Registrar, admit and enroll a student.
6. Return to School Super Admin and create a Parent linked to the student.
7. Sign in as Finance Director, configure fees and generate an invoice.
8. Sign in as Parent and show the linked child's invoice.
9. Sign in as Cashier, record a payment, and print a receipt.
10. Sign in as Teacher, show schedule, submit attendance, and enter results.
11. Sign in as Student and Parent to show restricted academic visibility.
12. Sign in as Branch Admin to review results and reports.
13. Create the next academic year and promote the student.
14. Show that previous attendance, results, invoice, and payment history remain available.

## 19. Access-Control Demonstration Checks

- A pending school cannot use active-school dashboards.
- The Platform Owner can manage tenants but does not operate school records.
- The School Super Admin and Finance Director have separate dashboards.
- The School Super Admin does not see finance navigation.
- The Finance Director cannot open school administration pages.
- A Branch Admin operates only the assigned branch.
- A Registrar cannot enter results or record payments.
- A Teacher cannot enter results for an unassigned class or subject.
- A Cashier cannot create fee structures or reverse payments by default.
- A Student sees only personal records.
- A Parent sees only linked children.
- Promotion and re-enrollment preserve previous academic-year records.
