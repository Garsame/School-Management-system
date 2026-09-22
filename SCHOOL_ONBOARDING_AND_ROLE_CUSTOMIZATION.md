# MadrasaHub School Onboarding & Role Customization Guide

## 1. Executive Overview

MadrasaHub is designed with a core philosophy: **The Platform Admin creates the school and provides the initial keys; from that moment on, the School Super Admin builds and runs their own organizational empire.**

Every school operates differently. A large institution may have separate departments for Finance, HR, Admissions, and Cashier Desks. A lean community school may have a single Business Manager handling admissions, invoicing, and fee payments, while the Principal directly oversees HR and payroll.

MadrasaHub accommodates all these models out of the box without requiring code modifications or custom development.

---

## 2. The Platform Admin's Role

As the **Platform Admin** (the SaaS owner), your operational responsibility for an individual school is minimal:

1. **Create the School Organization (Tenant):**
   - Log into the Platform Admin Portal.
   - Enter the school's basic details (School Name, Slug, Contact Info, Subscription Plan Tier).
2. **Create the Initial Super Admin User:**
   - Create the school's primary administrative account with the role `super_admin`.
   - Assign temporary credentials.
3. **Hand Over the Keys:**
   - Deliver the credentials to the school principal or business owner.
   - **Your job for that school's internal setup is done.** The school is now 100% self-governing.

---

## 3. What the School Super Admin Can Customize

Once logged in, the School Super Admin has total administrative authority over their school's structure:

### A. Role Customization (Settings → Roles & Features)
- **Rename Any Role:** Change standard keys to match real-world titles (e.g., rename `finance_director` to *"Chief Financial Officer"* or *"Business Administrator"*).
- **Turn Roles ON or OFF:** Toggle unused roles (like `cashier` or `hr_manager`) to `Inactive`. Inactive roles cannot be selected when creating new users.
- **Redistribute Features (Permissions):** Move any of the 131 school-level features to any active role with a single click.

### B. Dynamic Staff Menus
- **Automatic Menu Generation:** Staff menus in the sidebar are computed dynamically based on the exact features assigned to each role (`buildStaffMenu`).
- **Cross-Functional Menus:** If a Finance Director is granted Registrar features, the *Admissions & Students* menu automatically appears alongside their *Finance & Billing* menu.
- **No Clutter:** If a feature is revoked, the corresponding menu item and screen route disappear immediately.

### C. Individual User Exceptions (Staff → Users → [User] → Permissions)
- Grant extra features or restrict specific features for an individual employee without having to create a separate role.

---

## 4. Addressing Common Organizational Questions

### Q1: Can a school give Registrar tasks to the Finance Director?
**Yes.** In **Settings → Roles & Features**, the Super Admin ticks the desired Registrar features (e.g., `registrar.admissions.create`, `registrar.students.view`, `registrar.enrollments.manage`) on the Finance role. The Finance Director immediately sees student directories and enrollment tools in their navigation.

### Q2: Can the school give HR and Payroll duties to the Super Admin?
**Yes.** The Super Admin ticks `hr.employees.manage`, `payroll.generate`, `payroll.review`, and `payroll.approve` on the `super_admin` role. The Super Admin dashboard then includes the complete HR directory and monthly payroll approval pipeline.

### Q3: How does the system handle schools without a Cashier?
- The Super Admin sets the `cashier` role to `Inactive`.
- The Super Admin grants the payment feature (`cashier.payments.create`) to the Finance Director or front-desk administrator.
- All fee collection occurs from the Payment Desk interface accessible directly to the authorized staff member.

### Q4: How does the Super Admin see which features are "free" (unassigned)?
On the **Roles & Features** matrix (`/tenant/roles`), all 131 school features are listed alongside checkboxes for every active role.
- If a row has **no boxes checked**, that feature is unassigned ("free").
- This visual overview guarantees that no essential feature is accidentally left without an owner.

---

## 5. Disabling Users & Reassigning Responsibilities

When staff members leave or take extended leave:

1. **Instant Account Deactivation:**
   - In **Staff → Users**, the Super Admin sets the user's status to `Inactive`.
   - The user is immediately blocked from logging in, and all existing active sessions are invalidated via `tokenVersion`.
2. **Instant Role Reassignment:**
   - Because features belong to the **Role**, the Super Admin simply assigns that role to a replacement staff member or temporary substitute.
   - The replacement user instantly gains the exact menu layout, data access, and workflow permissions required.
3. **Safety Guards Built In:**
   - **No Lockouts:** The system prohibits unticking `tenant.roles.update` from the last remaining role that possesses it. The Super Admin can never accidentally lock the school out of role management.
   - **Role Protection:** A role cannot be deactivated while active users are currently assigned to it. The system requires reassigning those users first.

---

## 6. End-to-End Operational Scenario: "Al-Hikmah Academy"

### Context & Requirements
**Al-Hikmah Academy** is a growing private school with a compact administrative team:
1. **Sheikh Omar (Principal & Super Admin):** Manages school governance, teacher assignments, and directly handles **HR and Payroll**.
2. **Sister Maryam (School Business Administrator):** Single-handedly manages **Student Admissions, Fee Structures, Monthly Invoicing, and Fee Collection**.
3. **No Separate Cashier or HR Officer:** The school operates without standalone cashier desks or dedicated HR personnel.

---

### Step-by-Step Implementation

```
+-------------------------------------------------------------------------------+
| 1. Platform Admin Setup                                                       |
|    - Creates Tenant: "Al-Hikmah Academy"                                      |
|    - Creates Super Admin User: sheikh.omar@alhikmah.edu                       |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| 2. Sheikh Omar Customizes Roles (Settings -> Roles & Features)                |
|    - Deactivates: 'cashier' and 'hr_manager' roles                            |
|    - Renames 'finance_director' -> "School Business Administrator"            |
|    - Assigns to Business Admin: Finance + Registrar + Cashier features        |
|    - Assigns to Super Admin: HR Directory + Payroll Processing features       |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| 3. Staff Account Creation (Staff -> Users)                                    |
|    - Creates User: maryam@alhikmah.edu                                        |
|    - Assigns Role: "School Business Administrator"                            |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| 4. Operational Day-to-Day Experience                                          |
|    - Maryam logs in: Unified Admissions + Invoices + Payments Desk menu       |
|    - Sheikh Omar logs in: School Oversight + Staff Directory + Payroll menu   |
+-------------------------------------------------------------------------------+
```

#### Detailed Feature Mapping for Al-Hikmah Academy:

| Role Name in System | Assigned Features | Visible Sidebar Navigation |
| :--- | :--- | :--- |
| **Super Admin** *(Sheikh Omar)* | • School Settings & Roles<br>• Academic Years & Branches<br>• HR Employee Directory<br>• Payroll Review & Approval<br>• Attendance Oversight | • Dashboard<br>• School Settings<br>• Staff & HR<br>• Payroll<br>• Academic Oversight |
| **School Business Admin** *(Sister Maryam)* | • Fee Structures & Policy<br>• Monthly Invoice Generation<br>• Monthly Collection Sheet<br>• Student Admissions & Profiles<br>• Class Enrollments & Transfers<br>• Collect Payments (Oldest-First)<br>• Receipt Printing & Reversals | • Dashboard<br>• Student Admissions<br>• Student Directory<br>• Invoices & Fees<br>• Monthly Collection<br>• Payments Desk |
| **Cashier** | *Disabled (`isActive: false`)* | *None (Hidden)* |
| **HR Manager** | *Disabled (`isActive: false`)* | *None (Hidden)* |

---

## 7. Operational Roadmap for Platform Admins & School Leaders

```
[Phase 1: Platform Provisioning]
  1. Platform Admin logs into Platform Portal.
  2. Creates new School Tenant record.
  3. Generates primary Super Admin user credentials.
  4. Delivers URL and login credentials to School Owner.

[Phase 2: School Role Architecture]
  1. School Super Admin signs in.
  2. Opens Settings → Roles & Features.
  3. Turns OFF unused roles.
  4. Renames roles to match official institutional titles.
  5. Reviews the Feature Matrix and assigns features to active roles.

[Phase 3: Staff Onboarding]
  1. Opens Staff → Users.
  2. Adds employee accounts with their designated custom roles.
  3. (Optional) Applies per-user feature exceptions if needed.

[Phase 4: Academic & Financial Launch]
  1. Configure Academic Year and Branches.
  2. Define Classes and Monthly Fee Structures.
  3. Admit/Enroll Students.
  4. Run Monthly Billing (1-Click Invoice Generation).
  5. Begin Oldest-First Payment Collection at the Payments Desk.
```
