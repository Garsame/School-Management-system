const express = require('express');
const router = express.Router();
const {
    getParentDashboard,
    getStudentGrades,
    getStudentAttendance,
    getStudentInvoices,
    getNotifications,
    markNotificationRead,
    getProfile,
    updateProfile,
    changePassword,
    getStudentAcademicYears,
    getStudentRank
} = require('../controllers/parentController');
const { protect, authorize, tenantGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

// Protect all routes under this namespace
router.use(protect);
router.use(authorize('parent'));
router.use(tenantGuard);

// Dashboard
router.get('/dashboard', requirePermission('parent.dashboard.view'), getParentDashboard);

// Parent profile & security
router.get('/profile', requirePermission('parent.profile.view'), getProfile);
router.put('/profile', requirePermission('parent.profile.view'), updateProfile);
router.put('/change-password', requirePermission('parent.password.change'), changePassword);

// Child specifics
router.get('/students/:studentId/grades', requirePermission('parent.grades.view'), getStudentGrades);
router.get('/students/:studentId/attendance', requirePermission('parent.attendance.view'), getStudentAttendance);
router.get('/students/:studentId/invoices', requirePermission('parent.invoices.view'), getStudentInvoices);
router.get('/students/:studentId/academic-years', requirePermission('parent.students.view'), getStudentAcademicYears);
router.get('/students/:studentId/rank', requirePermission('parent.grades.view'), getStudentRank);

// Notifications
router.get('/notifications', requirePermission('parent.notifications.view'), getNotifications);
router.put('/notifications/:id/read', requirePermission('parent.notifications.markRead'), markNotificationRead);

module.exports = router;
