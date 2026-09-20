const Student = require('../models/Student');
const User = require('../models/User');
const Result = require('../models/Result');
const AttendanceRecord = require('../models/AttendanceRecord');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Enrollment = require('../models/Enrollment');
const ClassSubject = require('../models/ClassSubject');
const Exam = require('../models/Exam');
const AttendanceSession = require('../models/AttendanceSession');
const { resolvePassMarkPercent } = require('../utils/grading');

const sendResponse = (res, success, data = null, message = '') => {
    return res.json({ success, message, data });
};

const sendError = (res, code, message) => {
    return res.status(code).json({ success: false, message });
};

// Security check: Verify that this student is indeed linked to the parent
const verifyParentAccess = (req, studentId) => {
    const parentStudents = req.user.students || [];
    return parentStudents.map(id => id.toString()).includes(studentId.toString());
};

// @desc    Get Parent Dashboard details (list children with overview status)
// @route   GET /api/parent/dashboard
// @access  Private (Parent)
const getParentDashboard = async (req, res) => {
    try {
        const studentIds = req.user.students || [];
        if (studentIds.length === 0) {
            return sendResponse(res, true, [], 'No linked students found');
        }

        const childrenData = [];

        for (const studentId of studentIds) {
            const student = await Student.findOne({ _id: studentId, tenantId: req.tenantId });
            if (!student) continue;

            // Get enrollment
            const enrollment = await Enrollment.findOne({
                studentId,
                tenantId: req.tenantId,
                status: { $in: ['Current', 'Active', 'active'] }
            })
            .populate('classId', 'name gradeLevel')
            .populate('academicYearId', 'name');

            // Get financial summary
            const invoices = await Invoice.find({ studentId, tenantId: req.tenantId });
            const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
            const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
            const outstanding = totalInvoiced - totalPaid;

            // Get attendance summary
            const totalRecords = await AttendanceRecord.countDocuments({ studentId, tenantId: req.tenantId });
            const attendedRecords = await AttendanceRecord.countDocuments({ studentId, tenantId: req.tenantId, status: { $in: ['PRESENT', 'LATE'] } });
            const attendanceRate = totalRecords > 0 ? ((attendedRecords / totalRecords) * 100).toFixed(1) + '%' : 'N/A';

            childrenData.push({
                student: {
                    _id: student._id,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    studentCode: student.studentCode,
                    admissionNumber: student.admissionNumber
                },
                className: enrollment?.classId?.name || 'Unassigned',
                academicYear: enrollment?.academicYearId?.name || 'N/A',
                outstandingFees: outstanding,
                attendanceRate,
                attendedPeriods: attendedRecords,
                missedPeriods: await AttendanceRecord.countDocuments({ studentId, tenantId: req.tenantId, status: 'ABSENT' }),
                totalPeriods: totalRecords
            });
        }

        sendResponse(res, true, childrenData);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Grades
// @route   GET /api/parent/students/:studentId/grades
// @access  Private (Parent)
const getStudentGrades = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { schoolYearId, academicYearId, examId } = req.query || {};
        const yearId = schoolYearId || academicYearId;

        if (!verifyParentAccess(req, studentId)) {
            return sendError(res, 403, 'Unauthorized access to student record');
        }

        const query = {
            studentId,
            tenantId: req.tenantId
        };

        if (yearId || examId) {
            const exams = await Exam.find({ ...(yearId ? { academicYearId: yearId } : {}), ...(examId ? { _id: examId } : {}), tenantId: req.tenantId }).select('_id');
            query.examId = { $in: exams.map(e => e._id) };
        }

        const results = await Result.find(query)
        .populate({
            path: 'examId',
            populate: [
                { path: 'subjectId', select: 'name code' },
                { path: 'examCategoryId', select: 'name' },
                { path: 'classId', select: 'name' }
            ]
        })
        .sort({ createdAt: -1 });

        sendResponse(res, true, results);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Attendance
// @route   GET /api/parent/students/:studentId/attendance
// @access  Private (Parent)
const getStudentAttendance = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { schoolYearId, academicYearId } = req.query || {};
        const yearId = schoolYearId || academicYearId;

        if (!verifyParentAccess(req, studentId)) {
            return sendError(res, 403, 'Unauthorized access to student record');
        }

        const query = {
            studentId,
            tenantId: req.tenantId
        };

        if (yearId) {
            const sessions = await AttendanceSession.find({
                tenantId: req.tenantId,
                academicYearId: yearId
            }).select('_id');
            query.sessionId = { $in: sessions.map(s => s._id) };
        }

        const records = await AttendanceRecord.find(query)
        .populate({
            path: 'sessionId',
            select: 'date period teacherUserId',
            populate: { path: 'teacherUserId', select: 'name' }
        })
        .sort({ createdAt: -1 });

        sendResponse(res, true, records);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Invoices
// @route   GET /api/parent/students/:studentId/invoices
// @access  Private (Parent)
const getStudentInvoices = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { schoolYearId, academicYearId } = req.query || {};
        const yearId = schoolYearId || academicYearId;

        if (!verifyParentAccess(req, studentId)) {
            return sendError(res, 403, 'Unauthorized access to student record');
        }

        const invoiceQuery = {
            studentId,
            tenantId: req.tenantId
        };

        if (yearId) {
            invoiceQuery.academicYearId = yearId;
        }

        const invoices = await Invoice.find(invoiceQuery).sort({ createdAt: -1 });

        const payments = await Payment.find({
            invoiceId: { $in: invoices.map(i => i._id) },
            tenantId: req.tenantId
        }).sort({ createdAt: -1 });

        sendResponse(res, true, { invoices, payments });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Notifications for Parent
// @route   GET /api/parent/notifications
// @access  Private (Parent)
const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            recipientId: req.user._id,
            tenantId: req.tenantId
        }).sort({ createdAt: -1 });

        sendResponse(res, true, notifications);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Mark Notification as Read
// @route   PUT /api/parent/notifications/:id/read
// @access  Private (Parent)
const markNotificationRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientId: req.user._id, tenantId: req.tenantId },
            { $set: { isRead: true } },
            { returnDocument: 'after' }
        );

        if (!notification) return sendError(res, 404, 'Notification not found');
        sendResponse(res, true, notification, 'Notification marked as read');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Parent Profile
// @route   GET /api/parent/profile
// @access  Private (Parent)
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-passwordHash');
        if (!user) return sendError(res, 404, 'User not found');
        sendResponse(res, true, user);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Update Parent Profile
// @route   PUT /api/parent/profile
// @access  Private (Parent)
const updateProfile = async (req, res) => {
    try {
        const { name, phone, address } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return sendError(res, 404, 'User not found');

        if (name !== undefined) user.name = name;
        if (phone !== undefined) user.phone = phone;
        if (address !== undefined) user.address = address;

        await user.save();

        const updatedUser = await User.findById(req.user._id).select('-passwordHash');
        sendResponse(res, true, updatedUser, 'Profile updated successfully');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Change Parent Password
// @route   PUT /api/parent/change-password
// @access  Private (Parent)
const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return sendError(res, 400, 'Current password and new password are required');
        }

        if (String(newPassword).length < 8) {
            return sendError(res, 400, 'New password must be at least 8 characters long');
        }

        const user = await User.findById(req.user._id);
        if (!user) return sendError(res, 404, 'User not found');

        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) return sendError(res, 400, 'Invalid current password');

        user.passwordHash = newPassword;
        user.mustChangePassword = false;
        await user.save();

        sendResponse(res, true, null, 'Password changed successfully');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Academic Years History
// @route   GET /api/parent/students/:studentId/academic-years
// @access  Private (Parent)
const getStudentAcademicYears = async (req, res) => {
    try {
        const { studentId } = req.params;
        if (!verifyParentAccess(req, studentId)) {
            return sendError(res, 403, 'Unauthorized access to student record');
        }

        const enrollments = await Enrollment.find({
            tenantId: req.tenantId,
            studentId
        })
        .sort({ createdAt: -1 })
        .populate('academicYearId', 'name isCurrent')
        .populate('classId', 'name')
        .populate('branchId', 'name');

        const yearMap = new Map();
        for (const enrollment of enrollments) {
            const year = enrollment.academicYearId;
            if (!year?._id) continue;
            const key = String(year._id);
            if (yearMap.has(key)) continue;

            yearMap.set(key, {
                _id: year._id,
                name: year.name,
                isCurrent: !!year.isCurrent,
                classId: enrollment.classId?._id || null,
                className: enrollment.classId?.name || '',
                branchId: enrollment.branchId?._id || null,
                branchName: enrollment.branchId?.name || '',
                enrollmentStatus: enrollment.status
            });
        }

        sendResponse(res, true, Array.from(yearMap.values()));
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Rank details
// @route   GET /api/parent/students/:studentId/rank
// @access  Private (Parent)
const getStudentRank = async (req, res) => {
    try {
        const { studentId } = req.params;
        if (!verifyParentAccess(req, studentId)) {
            return sendError(res, 403, 'Unauthorized access to student record');
        }

        const { schoolYearId, academicYearId, term, examId } = req.query || {};
        const yearId = schoolYearId || academicYearId;

        const enrollmentQuery = {
            tenantId: req.tenantId,
            studentId
        };
        if (yearId) {
            enrollmentQuery.academicYearId = yearId;
        } else {
            enrollmentQuery.status = { $in: ['Current', 'Active', 'active'] };
        }

        const enrollment = await Enrollment.findOne(enrollmentQuery)
            .sort({ createdAt: -1 })
            .populate('academicYearId', 'name')
            .populate('classId', 'name');

        if (!enrollment) {
            return sendResponse(res, true, { rank: null, classSize: 0, totalMarks: 0, overallStatus: 'FAIL' }, 'No active enrollment found');
        }

        const curriculum = await ClassSubject.find({
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            classId: enrollment.classId,
            isActive: true,
            $or: [
                { academicYearId: enrollment.academicYearId },
                { academicYearId: { $exists: false } },
                { academicYearId: null }
            ]
        }).populate('subjectId', 'name');

        const subjectMetaMap = new Map();
        curriculum.forEach(c => {
            const subjectId = (c.subjectId?._id || c.subjectId).toString();
            if (!subjectMetaMap.has(subjectId)) {
                subjectMetaMap.set(subjectId, {
                    subjectId,
                    passMarkPercent: resolvePassMarkPercent(c)
                });
            }
        });
        const subjectMeta = Array.from(subjectMetaMap.values());

        const exams = await Exam.find({
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            classId: enrollment.classId,
            academicYearId: enrollment.academicYearId,
            ...(term ? { termId: term } : {}),
            ...(examId ? { _id: examId } : {}),
            subjectId: { $in: subjectMeta.map(s => s.subjectId) }
        }).populate('examCategoryId', 'maxScore').select('subjectId examCategoryId');

        const subjectMaxMap = new Map();
        exams.forEach(exam => {
            const subjectId = (exam.subjectId?._id || exam.subjectId).toString();
            const maxScore = exam.examCategoryId?.maxScore || 100;
            subjectMaxMap.set(subjectId, (subjectMaxMap.get(subjectId) || 0) + maxScore);
        });

        const totalMax = subjectMeta.reduce((sum, meta) => sum + (subjectMaxMap.get(meta.subjectId) || 0), 0) || (subjectMeta.length * 100);
        const overallPassMark = totalMax / 2;

        const peerEnrollmentQuery = {
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            classId: enrollment.classId,
            academicYearId: enrollment.academicYearId
        };
        if (!yearId) {
            peerEnrollmentQuery.status = { $in: ['Current', 'Active', 'active'] };
        }

        const enrollments = await Enrollment.find(peerEnrollmentQuery).select('studentId');
        const studentIds = enrollments.map(e => e.studentId);

        const students = await Student.find({
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            _id: { $in: studentIds }
        }).select('admissionNumber');
        const admissionMap = new Map(students.map(s => [s._id.toString(), s.admissionNumber || '']));

        const results = await Result.find({
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            studentId: { $in: studentIds }
        }).populate({
            path: 'examId',
            match: {
                classId: enrollment.classId,
                academicYearId: enrollment.academicYearId,
                ...(term ? { termId: term } : {}),
                ...(examId ? { _id: examId } : {})
            },
            select: 'subjectId startDate createdAt',
            populate: { path: 'subjectId', select: '_id' }
        });

        const filtered = results.filter(r => r.examId && r.examId.subjectId);
        const totalsMap = new Map();

        for (const r of filtered) {
            const sId = r.studentId.toString();
            const subjectId = (r.examId.subjectId?._id || r.examId.subjectId).toString();
            if (!totalsMap.has(sId)) totalsMap.set(sId, new Map());
            const subjectMap = totalsMap.get(sId);
            subjectMap.set(subjectId, (subjectMap.get(subjectId) || 0) + (r.marksObtained || 0));
        }

        const stats = studentIds.map(id => {
            const sid = id.toString();
            const subjectMap = totalsMap.get(sid) || new Map();
            let totalMarks = 0;
            let failedSubjects = 0;
            for (const meta of subjectMeta) {
                const entry = subjectMap.get(meta.subjectId);
                const marks = entry || 0;
                totalMarks += marks;
                const subjectMax = subjectMaxMap.get(meta.subjectId) || 0;
                const percentage = subjectMax > 0 ? (marks / subjectMax) * 100 : 0;
                if (percentage < meta.passMarkPercent) failedSubjects += 1;
            }
            return {
                studentId: sid,
                totalMarks,
                failedSubjects,
                admissionNumber: admissionMap.get(sid) || ''
            };
        });

        stats.sort((a, b) => {
            if (b.totalMarks !== a.totalMarks) return b.totalMarks - a.totalMarks;
            if (a.failedSubjects !== b.failedSubjects) return a.failedSubjects - b.failedSubjects;
            return a.admissionNumber.localeCompare(b.admissionNumber, undefined, { numeric: true, sensitivity: 'base' });
        });

        const index = stats.findIndex(s => s.studentId === studentId.toString());
        const rank = index >= 0 ? index + 1 : null;
        const myStats = index >= 0 ? stats[index] : { totalMarks: 0 };
        const overallStatus = myStats.totalMarks >= overallPassMark ? 'PASS' : 'FAIL';

        sendResponse(res, true, {
            rank,
            classSize: stats.length,
            totalMarks: myStats.totalMarks,
            overallStatus,
            className: enrollment.classId?.name || 'N/A',
            academicYearName: enrollment.academicYearId?.name || 'N/A'
        });
      } catch (error) {
          sendError(res, 500, error.message);
      }
};

module.exports = {
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
};
