import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const RegisterTenant = lazy(() => import('./pages/RegisterTenant'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const AccountProfile = lazy(() => import('./pages/account/Profile'));
const PlatformLogin = lazy(() => import('./pages/platform/Login'));
const PlatformDashboard = lazy(() => import('./pages/platform/Dashboard'));
const PlatformTenants = lazy(() => import('./pages/platform/Tenants'));
const PlatformNewTenant = lazy(() => import('./pages/platform/NewTenant'));
const PlatformTenantDetails = lazy(() => import('./pages/platform/TenantDetails'));
const PlatformPlans = lazy(() => import('./pages/platform/Plans'));
const PlatformBilling = lazy(() => import('./pages/platform/Billing'));
const PlatformAuditLogs = lazy(() => import('./pages/platform/AuditLogs'));
const PlatformMonitoring = lazy(() => import('./pages/platform/Monitoring'));
const PlatformSettings = lazy(() => import('./pages/platform/Settings'));
const TenantDashboard = lazy(() => import('./pages/tenant/Dashboard'));
const TenantBranding = lazy(() => import('./pages/tenant/Branding'));
const TenantBranches = lazy(() => import('./pages/tenant/Branches'));
const TenantUsers = lazy(() => import('./pages/tenant/Users'));
const TenantStaffPermissions = lazy(() => import('./pages/tenant/StaffPermissions'));
const TenantAcademicYears = lazy(() => import('./pages/tenant/AcademicYears'));
const TenantAcademicPolicy = lazy(() => import('./pages/tenant/AcademicPolicy'));
const TenantReports = lazy(() => import('./pages/tenant/Reports'));
const TenantStudents = lazy(() => import('./pages/tenant/Students'));
const TenantStudentDetails = lazy(() => import('./pages/tenant/StudentDetails'));
const TenantAuditLogs = lazy(() => import('./pages/tenant/AuditLogs'));
const TenantRoles = lazy(() => import('./pages/tenant/Roles'));
// One page, mounted in both shells: the head of school and the admissions officer see the
// same attendance, scoped by the backend to what each may reach.
const AttendanceOversight = lazy(() => import('./pages/attendance/AttendanceOversight'));
const DugsiStudents = lazy(() => import('./pages/dugsi/DugsiStudents'));
const DugsiAttendance = lazy(() => import('./pages/dugsi/DugsiAttendance'));
const DugsiProgress = lazy(() => import('./pages/dugsi/DugsiProgress'));
const DugsiOversight = lazy(() => import('./pages/branch/DugsiOversight'));
const FinanceDashboard = lazy(() => import('./pages/finance/FinanceDashboard'));
const FinancePolicies = lazy(() => import('./pages/finance/Policies'));
const FeeStructures = lazy(() => import('./pages/finance/FeeStructures'));
const Discounts = lazy(() => import('./pages/finance/Discounts'));
const Invoices = lazy(() => import('./pages/finance/Invoices'));
const InvoiceDetails = lazy(() => import('./pages/finance/InvoiceDetails'));
const InvoiceGenerate = lazy(() => import('./pages/finance/InvoiceGenerate'));
const Payments = lazy(() => import('./pages/finance/Payments'));
const Reports = lazy(() => import('./pages/finance/Reports'));
const Outstanding = lazy(() => import('./pages/finance/Outstanding'));
const CompensationApprovals = lazy(() => import('./pages/finance/CompensationApprovals'));
const MonthlyCollection = lazy(() => import('./pages/finance/MonthlyCollection'));
const StudentPaymentRecord = lazy(() => import('./pages/finance/StudentPaymentRecord'));
const BranchDashboard = lazy(() => import('./pages/branch/Dashboard'));
const BranchClasses = lazy(() => import('./pages/branch/Classes'));
const BranchStaff = lazy(() => import('./pages/branch/Staff'));
const BranchStaffCreate = lazy(() => import('./pages/branch/StaffCreate'));
const BranchStudents = lazy(() => import('./pages/branch/Students'));
const BranchStudentDetails = lazy(() => import('./pages/branch/StudentDetails'));
const BranchPromotions = lazy(() => import('./pages/branch/Promotions'));
const BranchTransfer = lazy(() => import('./pages/branch/Transfer'));
const BranchExams = lazy(() => import('./pages/branch/Exams'));
const BranchResults = lazy(() => import('./pages/branch/Results'));
const BranchStudentResults = lazy(() => import('./pages/branch/StudentResults'));
const BranchReports = lazy(() => import('./pages/branch/Reports'));
const BranchTeacherAssignments = lazy(() => import('./pages/branch/TeacherAssignments'));
const BranchTimetableBuilder = lazy(() => import('./pages/branch/TimetableBuilder'));
const RegistrarDashboard = lazy(() => import('./pages/registrar/Dashboard'));
const RegistrarAdmissions = lazy(() => import('./pages/registrar/Admissions'));
const RegistrarStudents = lazy(() => import('./pages/registrar/Students'));
const RegistrarStudentDetails = lazy(() => import('./pages/registrar/StudentDetails'));
const RegistrarNewEnrollment = lazy(() => import('./pages/registrar/NewEnrollment'));
const CashierDashboard = lazy(() => import('./pages/cashier/Dashboard'));
const CashierInvoices = lazy(() => import('./pages/cashier/Invoices'));
const CashierInvoiceDetails = lazy(() => import('./pages/cashier/InvoiceDetails'));
const CashierNewPayment = lazy(() => import('./pages/cashier/NewPayment'));
const CashierReceipt = lazy(() => import('./pages/cashier/Receipt'));
const CashierPayments = lazy(() => import('./pages/cashier/Payments'));
const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard'));
const TeacherExams = lazy(() => import('./pages/teacher/Exams'));
const TeacherExamDetails = lazy(() => import('./pages/teacher/ExamDetails'));
const TeacherResultEntry = lazy(() => import('./pages/teacher/ResultsEntry'));
const TeacherResults = lazy(() => import('./pages/teacher/Results'));
const TeacherTemplates = lazy(() => import('./pages/teacher/Templates'));
const TeacherCategories = lazy(() => import('./pages/teacher/Categories'));
const TeacherReports = lazy(() => import('./pages/teacher/Reports'));
const TeacherExports = lazy(() => import('./pages/teacher/Exports'));
const TeacherGradingPolicy = lazy(() => import('./pages/teacher/GradingPolicy'));
const TeacherSchedule = lazy(() => import('./pages/teacher/Schedule'));
const TeacherAttendanceSession = lazy(() => import('./pages/teacher/AttendanceSession'));
import TeacherLayout from './layouts/TeacherLayout';
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const StudentResults = lazy(() => import('./pages/student/Results'));
const StudentRank = lazy(() => import('./pages/student/Rank'));
const StudentAttendance = lazy(() => import('./pages/student/Attendance'));
const StudentSchedule = lazy(() => import('./pages/student/Schedule'));
const StudentChangePassword = lazy(() => import('./pages/student/ChangePassword'));
import StudentLayout from './layouts/StudentLayout';
import ParentLayout from './layouts/ParentLayout';
const ParentDashboard = lazy(() => import('./pages/parent/ParentDashboard'));
const ParentStudentGrades = lazy(() => import('./pages/parent/ParentStudentGrades'));
const ParentStudentAttendance = lazy(() => import('./pages/parent/ParentStudentAttendance'));
const ParentInvoices = lazy(() => import('./pages/parent/ParentInvoices'));
const LeavesRequest = lazy(() => import('./pages/hr/LeavesRequest'));
const StaffLeavesManager = lazy(() => import('./pages/hr/StaffLeavesManager'));
const PayrollDashboard = lazy(() => import('./pages/hr/PayrollDashboard'));
const HREmployees = lazy(() => import('./pages/hr/Employees'));
const HRDashboard = lazy(() => import('./pages/hr/Dashboard'));
const HRReports = lazy(() => import('./pages/hr/Reports'));

// Layouts & Guards
import PlatformLayout from './layouts/PlatformLayout';
import StaffLayout from './layouts/StaffLayout';
import { BrandingProvider } from './context/BrandingContext';
import { PlatformGuard, PublicGuard } from './utils/authGuard';
import { ProtectedRoute as RoleScopeGuard } from './utils/guards';
import PermissionRouteGuard from './components/auth/PermissionRouteGuard';
import StaffAreaGuard from './components/auth/StaffAreaGuard';
import NotificationCenter from './components/feedback/NotificationCenter';

// Every staff area renders in the same frame. The menu inside it is built from the
// signed-in person's permissions, and each page checks its own permission, so a role
// reaches another area's page by holding its feature rather than by its name.
const StaffArea = () => (
  <StaffAreaGuard>
    <PermissionRouteGuard>
      <StaffLayout />
    </PermissionRouteGuard>
  </StaffAreaGuard>
);

// Platform Scoped Layout Wrapper
const PlatformWrapper = () => (
  <PermissionRouteGuard>
    <PlatformLayout>
      <Outlet />
    </PlatformLayout>
  </PermissionRouteGuard>
);

const RouteLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
  </div>
);

const PasswordChangeGate = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (!loading && user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <BrandingProvider>
          <NotificationCenter />
          <Suspense fallback={<RouteLoader />}>
            <PasswordChangeGate>
            <Routes>
              {/* Main App Routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<RegisterTenant />} />
              <Route path="/tenant/register" element={<RegisterTenant />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route
                path="/dashboard/*"
                element={<Navigate to="/login" replace />}
              />

              {/* Shared Staff Area for all staff roles and permissions */}
              <Route element={<StaffArea />}>
                {/* Tenant Super Admin Routes */}
                <Route path="/tenant">
                  <Route index element={<TenantDashboard />} />
                  <Route path="branding" element={<TenantBranding />} />
                  <Route path="branches" element={<TenantBranches />} />
                  <Route path="users" element={<TenantUsers />} />
                  <Route path="roles" element={<TenantRoles />} />
                  <Route path="staff-permissions" element={<TenantStaffPermissions />} />
                  <Route path="academic-years" element={<TenantAcademicYears />} />
                  <Route path="academic-policy" element={<TenantAcademicPolicy />} />
                  <Route path="reports" element={<TenantReports />} />
                  <Route path="students" element={<TenantStudents />} />
                  <Route path="students/:studentId" element={<TenantStudentDetails />} />
                  <Route path="audit-logs" element={<TenantAuditLogs />} />
                  <Route path="attendance" element={<AttendanceOversight />} />
                  <Route path="dugsi" element={<DugsiOversight />} />
                  <Route path="profile" element={<AccountProfile />} />
                </Route>

                {/* Finance Director Routes */}
                <Route path="/finance">
                  <Route index element={<FinanceDashboard />} />
                  <Route path="policies" element={<FinancePolicies />} />
                  <Route path="fee-structures" element={<FeeStructures />} />
                  <Route path="discounts" element={<Discounts />} />
                  <Route path="invoices" element={<Invoices />} />
                  <Route path="invoices/:invoiceId" element={<InvoiceDetails />} />
                  <Route path="invoices/generate" element={<InvoiceGenerate />} />
                  <Route path="monthly" element={<MonthlyCollection />} />
                  <Route path="students/:studentId" element={<StudentPaymentRecord />} />
                  <Route path="payments" element={<Payments />} />
                  <Route path="salary-approvals" element={<CompensationApprovals />} />
                  <Route path="payroll-approvals" element={<PayrollDashboard />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="outstanding" element={<Outstanding />} />
                  <Route path="profile" element={<AccountProfile />} />
                </Route>

                {/* HR Routes */}
                <Route path="/hr">
                  <Route index element={<HRDashboard />} />
                  <Route path="employees" element={<HREmployees />} />
                  <Route path="leaves" element={<StaffLeavesManager />} />
                  <Route path="payroll" element={<PayrollDashboard />} />
                  <Route path="reports" element={<HRReports />} />
                  <Route path="profile" element={<AccountProfile />} />
                </Route>

                {/* Branch Admin Routes */}
                <Route path="/branch">
                  <Route index element={<BranchDashboard />} />
                  <Route path="account" element={<AccountProfile />} />
                  <Route path="classes" element={<BranchClasses />} />
                  <Route path="teachers" element={<BranchStaff mode="teachers" />} />
                  <Route path="teachers/new" element={<BranchStaffCreate mode="teachers" />} />
                  <Route path="staff" element={<BranchStaff mode="staff" />} />
                  <Route path="staff/new" element={<BranchStaffCreate mode="staff" />} />
                  <Route path="students" element={<BranchStudents />} />
                  <Route path="students/:studentId" element={<BranchStudentDetails />} />
                  <Route path="promotions" element={<BranchPromotions />} />
                  <Route path="transfers" element={<BranchTransfer />} />
                  <Route path="exams" element={<BranchExams />} />
                  <Route path="results" element={<BranchResults />} />
                  <Route path="results/student" element={<BranchStudentResults />} />
                  <Route path="assignments" element={<BranchTeacherAssignments />} />
                  <Route path="timetable" element={<BranchTimetableBuilder />} />
                  <Route path="timetable/class/:classId" element={<BranchTimetableBuilder />} />
                  <Route path="dugsi" element={<DugsiOversight />} />
                  <Route path="reports" element={<BranchReports />} />
                  <Route path="hr/leaves" element={<StaffLeavesManager />} />
                  <Route path="hr/payroll" element={<PayrollDashboard />} />
                </Route>

                {/* Registrar Routes */}
                <Route path="/registrar">
                  <Route index element={<RegistrarDashboard />} />
                  <Route path="admissions" element={<RegistrarAdmissions />} />
                  <Route path="students" element={<RegistrarStudents />} />
                  <Route path="students/:studentId" element={<RegistrarStudentDetails />} />
                  <Route path="enrollments/new" element={<RegistrarNewEnrollment />} />
                  <Route path="attendance" element={<AttendanceOversight />} />
                  <Route path="profile" element={<AccountProfile />} />
                </Route>

                {/* Cashier Routes */}
                <Route path="/cashier">
                  <Route index element={<CashierDashboard />} />
                  <Route path="invoices" element={<CashierInvoices />} />
                  <Route path="invoices/:id" element={<CashierInvoiceDetails />} />
                  <Route path="payments/new" element={<CashierNewPayment />} />
                  <Route path="payments" element={<CashierPayments />} />
                  <Route path="salary-payments" element={<PayrollDashboard />} />
                  <Route path="receipts/:paymentId" element={<CashierReceipt />} />
                  <Route path="profile" element={<AccountProfile />} />
                </Route>

                {/* Dugsi Quran Routes */}
                <Route path="/dugsi">
                  <Route index element={<Navigate to="/dugsi/students" replace />} />
                  <Route path="students" element={<DugsiStudents />} />
                  <Route path="attendance" element={<DugsiAttendance />} />
                  <Route path="progress" element={<DugsiProgress />} />
                  <Route path="profile" element={<AccountProfile />} />
                </Route>
              </Route>

            {/* Teacher Routes */}
            <Route path="/teacher/login" element={<Navigate to="/login" replace />} />
            <Route path="/teacher/register" element={<Navigate to="/login" replace />} />
            <Route
              path="/teacher"
              element={(
                <RoleScopeGuard role="TEACHER" scope="branch" redirectTo="/login">
                  <BrandingProvider><PermissionRouteGuard><TeacherLayout /></PermissionRouteGuard></BrandingProvider>
                </RoleScopeGuard>
              )}
            >
              <Route index element={<TeacherDashboard />} />
              <Route path="templates" element={<TeacherTemplates />} />
              <Route path="categories" element={<TeacherCategories />} />
              <Route path="exams" element={<TeacherExams />} />
              <Route path="exams/:examId" element={<TeacherExamDetails />} />
              <Route path="results-entry" element={<TeacherResultEntry />} />
              <Route path="results-entry/:examId" element={<TeacherResultEntry />} />
              <Route path="results" element={<TeacherResults />} />
              <Route path="reports" element={<TeacherReports />} />
              <Route path="exports" element={<TeacherExports />} />
              <Route path="grading-policy" element={<TeacherGradingPolicy />} />
              <Route path="schedule" element={<TeacherSchedule />} />
              <Route path="attendance" element={<TeacherSchedule focusAttendance />} />
              <Route path="attendance/:sessionId" element={<TeacherAttendanceSession />} />

              {/* Leaves Requests */}
              <Route path="leaves" element={<LeavesRequest />} />

              {/* Profile and Settings */}
              <Route path="profile" element={<AccountProfile />} />
            </Route>

            {/* Student Routes */}
            <Route path="/student/login" element={<Navigate to="/login" replace />} />
            <Route path="/student/register" element={<Navigate to="/login" replace />} />
            <Route
              path="/student"
              element={(
                <RoleScopeGuard role="STUDENT" scope="branch" redirectTo="/login">
                  <BrandingProvider><PermissionRouteGuard><StudentLayout /></PermissionRouteGuard></BrandingProvider>
                </RoleScopeGuard>
              )}
            >
              <Route index element={<StudentDashboard />} />
              <Route path="results" element={<StudentResults />} />
              <Route path="rank" element={<StudentRank />} />
              <Route path="attendance" element={<StudentAttendance />} />
              <Route path="schedule" element={<StudentSchedule />} />
              <Route path="profile" element={<AccountProfile />} />
              <Route path="change-password" element={<StudentChangePassword />} />
            </Route>

            {/* Parent Routes */}
            <Route
              path="/parent"
              element={(
                <RoleScopeGuard role="PARENT" scope="tenant" redirectTo="/login">
                  <BrandingProvider><PermissionRouteGuard><ParentLayout /></PermissionRouteGuard></BrandingProvider>
                </RoleScopeGuard>
              )}
            >
              <Route index element={<ParentDashboard />} />
              <Route path="grades" element={<ParentStudentGrades />} />
              <Route path="attendance" element={<ParentStudentAttendance />} />
              <Route path="invoices" element={<ParentInvoices />} />
              <Route path="profile" element={<AccountProfile />} />
            </Route>

            {/* Platform Owner Routes */}
            <Route path="/platform">
              {/* Public Platform Routes */}
              <Route element={<PublicGuard />}>
                <Route path="login" element={<PlatformLogin />} />
                <Route path="register" element={<Navigate to="/platform/login" replace />} />
              </Route>

              {/* Protected Platform Routes */}
              <Route element={<PlatformGuard />}>
                <Route element={<PlatformWrapper />}>
                  <Route index element={<PlatformDashboard />} />
                  <Route path="tenants" element={<PlatformTenants />} />
                  <Route path="tenants/new" element={<PlatformNewTenant />} />
                  <Route path="tenants/:tenantId" element={<PlatformTenantDetails />} />
                  <Route path="plans" element={<PlatformPlans />} />
                  <Route path="billing" element={<PlatformBilling />} />
                  <Route path="audit" element={<PlatformAuditLogs />} />
                  <Route path="monitoring" element={<PlatformMonitoring />} />
                  <Route path="settings" element={<PlatformSettings />} />
                  <Route path="profile" element={<AccountProfile />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </PasswordChangeGate>
        </Suspense>
        </BrandingProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
