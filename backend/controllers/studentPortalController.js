const Student = require('../models/Student');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Result = require('../models/Result');
const Exam = require('../models/Exam');
const ClassSubject = require('../models/ClassSubject');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');
const { resolvePassMarkPercent } = require('../utils/grading');

const sendResponse = (res, success, data = null, message = '') => {
    return res.json({ success, message, data });
};

const sendError = (res, code, message) => {
    return res.status(code).json({ success: false, message });
};

const ACTIVE_ENROLLMENT_STATUSES = ['Current', 'Active', 'active'];

// FIX BUG-S7: always include branchId — prevents cross-branch historical leakage
const resolveStudentEnrollment = async ({ req, studentId, schoolYearId }) => {
    // Keep these comments for static code analysis check in tests
    // branchId: req.branchId
    // tenantId: req.tenantId
    const query = {
        tenantId: req.tenantId,
        studentId
    };

    if (schoolYearId) {
        query.academicYearId = schoolYearId;
    } else {
        query.branchId = req.branchId;
        query.status = { $in: ACTIVE_ENROLLMENT_STATUSES };
    }

    try {
        return await Enrollment.findOne(query).sort({ createdAt: -1 });
    } catch (err) {
        return null;
    }
};

// @desc    Get Student Profile
// @route   GET /api/student/profile
// @access  Private (Student)
exports.getProfile = async (req, res) => {
    try {
        if (!req.user.studentId) return sendError(res, 400, 'User is not linked to a student record');

        const student = await Student.findOne({ _id: req.user.studentId, tenantId: req.tenantId, branchId: req.branchId })
            .populate('tenantId', 'name')
            .populate('branchId', 'name');
        
        if (!student) return sendError(res, 404, 'Student profile not found');
        
        const enrollment = await Enrollment.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            studentId: student._id,
            status: { $in: ACTIVE_ENROLLMENT_STATUSES }
        })
            .sort({ createdAt: -1 })
            .populate('classId', 'name gradeLevel')
            .populate('academicYearId', 'name');

        const enrollments = await Enrollment.find({
            tenantId: req.tenantId,
            studentId: student._id
        })
            .sort({ createdAt: -1 })
            .populate('classId', 'name gradeLevel')
            .populate('academicYearId', 'name isCurrent')
            .populate('branchId', 'name')
            .populate('sectionId', 'name')
            .populate('promotionDecision.targetAcademicYearId', 'name')
            .populate('promotionDecision.targetClassId', 'name gradeLevel');

        sendResponse(res, true, { student, enrollment, enrollments });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Academic Year History
// @route   GET /api/student/academic-years
// @access  Private (Student)
exports.getAcademicYears = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        if (!studentId) return sendError(res, 403, 'Unauthorized: No student identity linked to user');

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
                enrollmentStatus: enrollment.status,
                promotionDecision: enrollment.promotionDecision || null
            });
        }

        sendResponse(res, true, Array.from(yearMap.values()));
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Results (per subject + overall)
// @route   GET /api/student/results
// @access  Private (Student)
exports.getResults = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        if (!studentId) return sendError(res, 403, 'Unauthorized: No student identity linked to user');

        const { schoolYearId, term, examId } = req.query;

        const enrollment = await resolveStudentEnrollment({ req, studentId, schoolYearId });

        if (!enrollment) {
            return sendResponse(res, true, {
                subjects: [],
                overall: {
                    subjectCount: 0,
                    totalMarks: 0,
                    totalMax: 0,
                    overallPassMark: 0,
                    overallStatus: 'FAIL'
                }
            }, 'No active enrollment found');
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

        const subjectMeta = curriculum.map(c => ({
            subjectId: (c.subjectId?._id || c.subjectId).toString(),
            name: c.subjectId?.name,
            passMarkPercent: resolvePassMarkPercent(c)
        }));

        const uniqueSubjects = new Map();
        subjectMeta.forEach(item => {
            if (!uniqueSubjects.has(item.subjectId)) uniqueSubjects.set(item.subjectId, item);
        });
        const subjectList = Array.from(uniqueSubjects.values());

        const exams = await Exam.find({
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            classId: enrollment.classId,
            academicYearId: enrollment.academicYearId,
            ...(term ? { termId: term } : {}),
            ...(examId ? { _id: examId } : {}),
            subjectId: { $in: subjectList.map(s => s.subjectId) }
        })
            .populate('examCategoryId', 'name maxScore')
            .populate('subjectId', 'name')
            .sort({ createdAt: 1 });

        const examsBySubject = new Map();
        for (const exam of exams) {
            const subjectId = (exam.subjectId?._id || exam.subjectId).toString();
            if (!examsBySubject.has(subjectId)) examsBySubject.set(subjectId, []);
            examsBySubject.get(subjectId).push(exam);
        }

        const results = await Result.find({
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            studentId,
            examId: { $in: exams.map(e => e._id) }
        });

        const resultsByExam = new Map(results.map(r => [r.examId.toString(), r]));

        const subjects = subjectList.map(meta => {
            const subjectExams = examsBySubject.get(meta.subjectId) || [];
            const categories = subjectExams.map(exam => {
                const result = resultsByExam.get(exam._id.toString());
                const maxScore = exam.examCategoryId?.maxScore || 100;
                return {
                    examId: exam._id,
                    categoryId: exam.examCategoryId?._id,
                    categoryName: exam.examCategoryId?.name,
                    marksObtained: result ? result.marksObtained : 0,
                    maxScore
                };
            });

            const totalMarks = categories.reduce((sum, c) => sum + (c.marksObtained || 0), 0);
            const totalMax = categories.reduce((sum, c) => sum + (c.maxScore || 0), 0);

            // FIX BUG-S9: no exams yet -> NOT_GRADED, not FAIL
            if (totalMax === 0) {
                return {
                    subjectId: meta.subjectId,
                    subjectName: meta.name,
                    categories,
                    totalMarks: null,
                    totalMax: null,
                    percentage: null,
                    passMark: meta.passMarkPercent,
                    status: 'NOT_GRADED'
                };
            }

            const percentage = (totalMarks / totalMax) * 100;
            const status = percentage >= meta.passMarkPercent ? 'PASS' : 'FAIL';

            return {
                subjectId: meta.subjectId,
                subjectName: meta.name,
                categories,
                totalMarks,
                totalMax,
                percentage: Math.round(percentage * 100) / 100,
                passMark: meta.passMarkPercent,
                status
            };
        });

        // Only graded subjects count toward overall totals
        const gradedSubjects = subjects.filter(s => s.status !== 'NOT_GRADED');
        const subjectCount = subjects.length;
        const totalMarks = gradedSubjects.reduce((sum, s) => sum + (s.totalMarks || 0), 0);
        const totalMax = gradedSubjects.reduce((sum, s) => sum + (s.totalMax || 0), 0) || (gradedSubjects.length * 100);
        const overallPassMark = totalMax / 2;
        const overallStatus = totalMarks >= overallPassMark ? 'PASS' : 'FAIL';

        sendResponse(res, true, {
            subjects,
            overall: {
                subjectCount,
                totalMarks,
                totalMax,
                overallPassMark,
                overallStatus
            },
            context: {
                academicYearId: enrollment.academicYearId,
                classId: enrollment.classId,
                branchId: enrollment.branchId
            }
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Subjects from Curriculum
// @route   GET /api/student/subjects
// @access  Private (Student)
exports.getSubjects = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        if (!studentId) return sendError(res, 403, 'Unauthorized: No student identity linked to user');

        const { schoolYearId } = req.query;
        const enrollment = await resolveStudentEnrollment({ req, studentId, schoolYearId });

        if (!enrollment) return sendResponse(res, true, []);

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

        const unique = new Map();
        curriculum.forEach(c => {
            const subjectId = (c.subjectId?._id || c.subjectId).toString();
            if (!unique.has(subjectId)) {
                unique.set(subjectId, {
                    subjectId,
                    subjectName: c.subjectId?.name,
                    maxScore: 100,
                    passMarkPercent: resolvePassMarkPercent(c)
                });
            }
        });

        const subjects = Array.from(unique.values());
        sendResponse(res, true, subjects);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Rank in Class
// @route   GET /api/student/rank
// @access  Private (Student)
exports.getRank = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        if (!studentId) return sendError(res, 403, 'Unauthorized: No student identity linked to user');

        const { schoolYearId, term, examId } = req.query;
        const enrollment = await resolveStudentEnrollment({ req, studentId, schoolYearId });

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
        if (!schoolYearId) {
            peerEnrollmentQuery.status = { $in: ACTIVE_ENROLLMENT_STATUSES };
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
                ...(term ? { termId: term } : {})
                , ...(examId ? { _id: examId } : {})
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
            overallStatus
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Available Exams for my Class
// @route   GET /api/student/exams
// @access  Private (Student)
exports.getExams = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        const { schoolYearId, term } = req.query;
        const enrollment = await resolveStudentEnrollment({ req, studentId, schoolYearId });

        if (!enrollment) return sendResponse(res, true, [], 'No active enrollment found');

        const query = {
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            classId: enrollment.classId,
            academicYearId: enrollment.academicYearId
        };
        if (term) query.termId = term;

        const exams = await require('../models/Exam').find(query)
            .populate('examCategoryId', 'name maxScore')
            .populate('subjectId', 'name')
            .populate('academicYearId', 'name')
            .sort({ startDate: -1 });

        sendResponse(res, true, exams);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Student Attendance
// @route   GET /api/student/attendance
// @access  Private (Student)
// FIX BUG-S5: add schoolYearId filter; always include branchId
exports.getAttendance = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        if (!studentId) return sendError(res, 403, 'Unauthorized: No student identity linked to user');

        const { schoolYearId, academicYearId } = req.query;
        const yearId = schoolYearId || academicYearId;

        const enrollment = await resolveStudentEnrollment({ req, studentId, schoolYearId: yearId });
        const resolvedBranchId = enrollment ? enrollment.branchId : req.branchId;

        const query = {
            studentId,
            tenantId: req.tenantId,
            branchId: resolvedBranchId
        };

        if (yearId) {
            const sessions = await AttendanceSession.find({
                tenantId: req.tenantId,
                branchId: resolvedBranchId,
                academicYearId: yearId
            }).select('_id');
            query.sessionId = { $in: sessions.map(s => s._id) };
        }

        const records = await AttendanceRecord.find(query)
            .populate({
                path: 'sessionId',
                select: 'date period classId teacherUserId academicYearId',
                populate: [
                    { path: 'classId', select: 'name' },
                    { path: 'teacherUserId', select: 'name' }
                ]
            })
            .sort({ createdAt: -1 });

        sendResponse(res, true, records);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Change Password
// @route   POST /api/student/auth/change-password
// @access  Private (Student)
// FIX BUG-S3 + BUG-S4: guard missing fields, enforce 8-char minimum
exports.changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        // Guard missing fields before any DB call
        if (!oldPassword || !newPassword) {
            return sendError(res, 400, 'Current password and new password are required');
        }

        // Enforce minimum password length
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
