const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const DugsiClassAllocation = require('../models/DugsiClassAllocation');
const DugsiEnrollment = require('../models/DugsiEnrollment');
const QuranProgress = require('../models/QuranProgress');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const Class = require('../models/Class');
const AcademicYear = require('../models/AcademicYear');
const User = require('../models/User');
const { logActivity } = require('../utils/logger');
const { SURAHS, JUZ_LIST, LEARNING_STAGES } = require('../utils/quranData');

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

const sendResponse = (res, data, message) => res.json({ success: true, data, message });
const sendError = (res, status, message) => res.status(status).json({ success: false, message });

const branchScope = (req) => (req.scope === 'branch' ? { branchId: req.branchId } : {});

const resolveCurrentAcademicYear = async (tenantId) => {
    const year = await AcademicYear.findOne({ tenantId, isCurrent: true }).select('_id name');
    if (!year) {
        // Fall back to most recently created academic year
        return await AcademicYear.findOne({ tenantId }).sort({ createdAt: -1 }).select('_id name');
    }
    return year;
};

// ==========================================
// 1. Quran Reference Data
// ==========================================
exports.getQuranReference = async (req, res) => {
    sendResponse(res, {
        surahs: SURAHS,
        juzList: JUZ_LIST,
        learningStages: LEARNING_STAGES
    });
};

// ==========================================
// 2. Teacher Class Allocations
// ==========================================

// @desc    Get classes assigned to the logged-in Dugsi teacher
// @route   GET /api/dugsi/my-classes
exports.getMyAllocatedClasses = async (req, res) => {
    try {
        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendResponse(res, []);

        const allocations = await DugsiClassAllocation.find({
            tenantId: req.tenantId,
            teacherUserId: req.user._id,
            academicYearId: academicYear._id
        }).populate('classId', 'name gradeLevel branchId').lean();

        sendResponse(res, allocations.map((a) => a.classId).filter(Boolean));
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// ==========================================
// 3. Student Candidates & Enrollment
// ==========================================

// @desc    Get candidate students from allocated classes with Dugsi enrollment status
// @route   GET /api/dugsi/candidates
exports.getCandidateStudents = async (req, res) => {
    try {
        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendResponse(res, []);

        // Find classes allocated to this teacher
        const allocations = await DugsiClassAllocation.find({
            tenantId: req.tenantId,
            teacherUserId: req.user._id,
            academicYearId: academicYear._id
        }).select('classId').lean();

        const classIds = allocations.map((a) => a.classId);
        if (!classIds.length) return sendResponse(res, []);

        // Active enrollments in these classes
        const enrollments = await Enrollment.find({
            tenantId: req.tenantId,
            classId: { $in: classIds },
            academicYearId: academicYear._id,
            status: { $in: ['Current', 'Active', 'active'] }
        }).populate('studentId', 'firstName lastName admissionNumber gender').populate('classId', 'name gradeLevel').lean();

        const studentIds = enrollments.map((e) => e.studentId?._id).filter(Boolean);

        // Check which students are already in any Dugsi
        const dugsiEnrollments = await DugsiEnrollment.find({
            tenantId: req.tenantId,
            academicYearId: academicYear._id,
            studentId: { $in: studentIds },
            status: 'ACTIVE'
        }).populate('teacherUserId', 'name').lean();

        const dugsiByStudent = new Map(
            dugsiEnrollments.map((d) => [String(d.studentId), d])
        );

        const candidates = enrollments.map((e) => {
            const s = e.studentId;
            if (!s) return null;
            const existingDugsi = dugsiByStudent.get(String(s._id));
            const isMine = existingDugsi && String(existingDugsi.teacherUserId?._id || existingDugsi.teacherUserId) === String(req.user._id);

            return {
                studentId: s._id,
                name: `${s.firstName} ${s.lastName}`.trim(),
                admissionNumber: s.admissionNumber,
                gender: s.gender,
                classId: e.classId?._id,
                className: e.classId?.name,
                isEnrolledInDugsi: Boolean(existingDugsi),
                isEnrolledWithMe: isMine,
                learningStage: existingDugsi?.learningStage || 'READING',
                enrolledTeacherName: existingDugsi && !isMine ? existingDugsi.teacherUserId?.name || 'Another Teacher' : null
            };
        }).filter(Boolean);

        sendResponse(res, candidates);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Enroll students into Dugsi circle
// @route   POST /api/dugsi/students/enroll
exports.enrollStudents = async (req, res) => {
    try {
        const { studentIds, learningStage } = req.body || {};
        if (!Array.isArray(studentIds) || !studentIds.length) {
            return sendError(res, 400, 'Please select at least one student to enroll');
        }

        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendError(res, 400, 'No active academic year found');

        // Check allocated classes
        const allocations = await DugsiClassAllocation.find({
            tenantId: req.tenantId,
            teacherUserId: req.user._id,
            academicYearId: academicYear._id
        }).select('classId branchId').lean();

        const allowedClassIds = new Set(allocations.map((a) => String(a.classId)));
        const branchId = req.branchId || allocations[0]?.branchId;

        // Verify that students are enrolled in the teacher's allocated classes
        const validEnrollments = await Enrollment.find({
            tenantId: req.tenantId,
            studentId: { $in: studentIds },
            academicYearId: academicYear._id,
            status: { $in: ['Current', 'Active', 'active'] }
        }).lean();

        const enrolledMap = new Map(validEnrollments.map((e) => [String(e.studentId), e]));
        const unauthorized = studentIds.filter((id) => {
            const enr = enrolledMap.get(String(id));
            return !enr || !allowedClassIds.has(String(enr.classId));
        });

        if (unauthorized.length) {
            return sendError(res, 403, 'Some students are not enrolled in your allocated classes');
        }

        // Check if any student is already enrolled in an active Dugsi
        const existingActive = await DugsiEnrollment.find({
            tenantId: req.tenantId,
            academicYearId: academicYear._id,
            studentId: { $in: studentIds },
            status: 'ACTIVE'
        }).populate('teacherUserId', 'name').lean();

        if (existingActive.length) {
            const conflictNames = existingActive.map((e) => `Student is already in ${e.teacherUserId?.name || 'another'}'s Dugsi`);
            return sendError(res, 409, conflictNames[0]);
        }

        const operations = studentIds.map((studentId) => ({
            updateOne: {
                filter: {
                    tenantId: req.tenantId,
                    branchId,
                    academicYearId: academicYear._id,
                    teacherUserId: req.user._id,
                    studentId
                },
                update: {
                    $set: {
                        tenantId: req.tenantId,
                        branchId,
                        academicYearId: academicYear._id,
                        teacherUserId: req.user._id,
                        studentId,
                        learningStage: learningStage || 'READING',
                        status: 'ACTIVE',
                        joinedDate: new Date()
                    }
                },
                upsert: true
            }
        }));

        await DugsiEnrollment.bulkWrite(operations);

        await logActivity({
            req,
            action: 'DUGSI_STUDENTS_ENROLLED',
            entityType: 'DugsiEnrollment',
            entityId: req.user._id.toString(),
            after: { enrolledCount: studentIds.length, academicYearId: academicYear._id }
        });

        sendResponse(res, { enrolled: studentIds.length }, `Successfully added ${studentIds.length} student(s) to your Dugsi.`);
    } catch (error) {
        if (error.code === 11000) {
            return sendError(res, 409, 'One or more students are already active in a Quran Dugsi circle');
        }
        sendError(res, 500, error.message);
    }
};

// @desc    Withdraw/remove student from Dugsi circle
// @route   DELETE /api/dugsi/students/:studentId
exports.withdrawStudent = async (req, res) => {
    try {
        const { studentId } = req.params;
        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendError(res, 400, 'No active academic year found');

        const enrollment = await DugsiEnrollment.findOne({
            tenantId: req.tenantId,
            studentId,
            academicYearId: academicYear._id,
            status: 'ACTIVE'
        });

        if (!enrollment) return sendError(res, 404, 'Student is not actively enrolled in your Dugsi');

        enrollment.status = 'WITHDRAWN';
        enrollment.withdrawnDate = new Date();
        enrollment.withdrawnReason = req.body?.reason || 'Removed by teacher';
        await enrollment.save();

        await logActivity({
            req,
            action: 'DUGSI_STUDENT_WITHDRAWN',
            entityType: 'DugsiEnrollment',
            entityId: enrollment._id.toString(),
            after: { studentId, status: 'WITHDRAWN' }
        });

        sendResponse(res, enrollment, 'Student removed from your Dugsi circle');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get active students in my Dugsi
// @route   GET /api/dugsi/students
exports.getMyDugsiStudents = async (req, res) => {
    try {
        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendResponse(res, []);

        const targetTeacherId = req.query.teacherUserId || req.user._id;

        const enrollments = await DugsiEnrollment.find({
            tenantId: req.tenantId,
            teacherUserId: targetTeacherId,
            academicYearId: academicYear._id,
            status: 'ACTIVE'
        }).populate('studentId', 'firstName lastName admissionNumber gender').lean();

        const studentIds = enrollments.map((e) => e.studentId?._id).filter(Boolean);

        // Get class names from school enrollments
        const schoolEnrollments = await Enrollment.find({
            tenantId: req.tenantId,
            studentId: { $in: studentIds },
            academicYearId: academicYear._id,
            status: { $in: ['Current', 'Active', 'active'] }
        }).populate('classId', 'name gradeLevel').lean();

        const classMap = new Map(schoolEnrollments.map((e) => [String(e.studentId), e.classId?.name || '']));

        // Get latest Quran progress per student
        const latestProgress = await QuranProgress.find({
            tenantId: req.tenantId,
            studentId: { $in: studentIds }
        }).sort({ date: -1, createdAt: -1 }).lean();

        const progressMap = new Map();
        for (const p of latestProgress) {
            const key = String(p.studentId);
            if (!progressMap.has(key)) progressMap.set(key, p);
        }

        const students = enrollments.map((e) => {
            const s = e.studentId;
            if (!s) return null;
            const progress = progressMap.get(String(s._id));

            return {
                _id: s._id,
                dugsiEnrollmentId: e._id,
                name: `${s.firstName} ${s.lastName}`.trim(),
                admissionNumber: s.admissionNumber,
                gender: s.gender,
                className: classMap.get(String(s._id)) || 'N/A',
                learningStage: e.learningStage,
                joinedDate: e.joinedDate,
                latestProgress: progress ? {
                    juz: progress.juz,
                    surahNumber: progress.surahNumber,
                    surahName: progress.surahName,
                    startAyah: progress.startAyah,
                    endAyah: progress.endAyah,
                    date: progress.date,
                    notes: progress.notes
                } : null
            };
        }).filter(Boolean);

        sendResponse(res, students);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Update a student's learning stage (READING or MEMORIZING)
// @route   PATCH /api/dugsi/students/:studentId/stage
exports.updateLearningStage = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { learningStage } = req.body;
        if (!['READING', 'MEMORIZING'].includes(learningStage)) {
            return sendError(res, 400, 'learningStage must be either READING or MEMORIZING');
        }

        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        const enrollment = await DugsiEnrollment.findOne({
            tenantId: req.tenantId,
            studentId,
            academicYearId: academicYear._id,
            status: 'ACTIVE'
        });

        if (!enrollment) return sendError(res, 404, 'Active Dugsi student enrollment not found');

        enrollment.learningStage = learningStage;
        await enrollment.save();

        sendResponse(res, enrollment, 'Learning stage updated');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// ==========================================
// 4. Dugsi Attendance Register
// ==========================================

// @desc    Get today's Dugsi register
// @route   GET /api/dugsi/attendance/today
exports.getTodayRegister = async (req, res) => {
    try {
        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendError(res, 400, 'No active academic year found');

        const targetTeacherId = req.query.teacherUserId || req.user._id;
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const period = req.query.period || 'DUGSI';

        const branchId = req.branchId || (await User.findById(targetTeacherId).select('branchId'))?.branchId;

        // Find active Dugsi students for this teacher
        const enrollments = await DugsiEnrollment.find({
            tenantId: req.tenantId,
            teacherUserId: targetTeacherId,
            academicYearId: academicYear._id,
            status: 'ACTIVE'
        }).populate('studentId', 'firstName lastName admissionNumber').lean();

        const studentIds = enrollments.map((e) => e.studentId?._id).filter(Boolean);

        // Find or check session
        const session = await AttendanceSession.findOne({
            tenantId: req.tenantId,
            branchId,
            teacherUserId: targetTeacherId,
            academicYearId: academicYear._id,
            sessionType: 'DUGSI',
            date,
            period
        }).lean();

        let records = [];
        if (session) {
            records = await AttendanceRecord.find({ sessionId: session._id }).lean();
        }

        const recordMap = new Map(records.map((r) => [String(r.studentId), r.status]));

        const register = enrollments.map((e) => {
            const s = e.studentId;
            if (!s) return null;
            return {
                studentId: s._id,
                name: `${s.firstName} ${s.lastName}`.trim(),
                admissionNumber: s.admissionNumber,
                learningStage: e.learningStage,
                status: recordMap.get(String(s._id)) || null
            };
        }).filter(Boolean);

        sendResponse(res, {
            session: session || null,
            date,
            period,
            register
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Submit / Record Dugsi Attendance
// @route   POST /api/dugsi/attendance
exports.submitAttendance = async (req, res) => {
    try {
        const { date, period = 'DUGSI', records, teacherUserId } = req.body || {};
        if (!date || !Array.isArray(records) || !records.length) {
            return sendError(res, 400, 'date and records are required');
        }

        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendError(res, 400, 'No active academic year found');

        const targetTeacherId = teacherUserId || req.user._id;
        const branchId = req.branchId || (await User.findById(targetTeacherId).select('branchId'))?.branchId;

        // Upsert the session
        let session = await AttendanceSession.findOne({
            tenantId: req.tenantId,
            branchId,
            teacherUserId: targetTeacherId,
            academicYearId: academicYear._id,
            sessionType: 'DUGSI',
            date,
            period
        });

        if (!session) {
            session = await AttendanceSession.create({
                tenantId: req.tenantId,
                branchId,
                teacherUserId: targetTeacherId,
                academicYearId: academicYear._id,
                sessionType: 'DUGSI',
                date,
                period,
                status: 'OPEN'
            });
        }

        // Validate records
        const normalized = records.map((r) => ({
            studentId: r.studentId,
            status: String(r.status || 'PRESENT').trim().toUpperCase()
        }));

        if (normalized.some((r) => !r.studentId || !ATTENDANCE_STATUSES.includes(r.status))) {
            return sendError(res, 400, `Each record requires studentId and status in: ${ATTENDANCE_STATUSES.join(', ')}`);
        }

        await AttendanceRecord.bulkWrite(normalized.map((record) => ({
            updateOne: {
                filter: { sessionId: session._id, studentId: record.studentId },
                update: {
                    $set: {
                        tenantId: req.tenantId,
                        branchId,
                        sessionId: session._id,
                        studentId: record.studentId,
                        status: record.status
                    }
                },
                upsert: true
            }
        })));

        await logActivity({
            req,
            action: 'DUGSI_ATTENDANCE_RECORDED',
            entityType: 'AttendanceSession',
            entityId: session._id.toString(),
            after: { date, markedCount: normalized.length }
        });

        sendResponse(res, { sessionId: session._id, marked: normalized.length }, 'Dugsi attendance saved successfully');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// ==========================================
// 5. Quran Progress Logs
// ==========================================

// @desc    Get Quran progress history for a student
// @route   GET /api/dugsi/progress/:studentId
exports.getStudentProgress = async (req, res) => {
    try {
        const { studentId } = req.params;

        const student = await Student.findOne({ _id: studentId, tenantId: req.tenantId }).select('firstName lastName admissionNumber').lean();
        if (!student) return sendError(res, 404, 'Student not found');

        const logs = await QuranProgress.find({
            tenantId: req.tenantId,
            studentId
        }).sort({ date: -1, createdAt: -1 }).lean();

        sendResponse(res, {
            student: {
                _id: student._id,
                name: `${student.firstName} ${student.lastName}`.trim(),
                admissionNumber: student.admissionNumber
            },
            history: logs
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Record a Quran progress entry
// @route   POST /api/dugsi/progress/:studentId
exports.recordProgress = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { date, learningStage, juz, surahNumber, surahName, startAyah, endAyah, notes } = req.body || {};

        if (!date) return sendError(res, 400, 'Date is required');

        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendError(res, 400, 'No active academic year found');

        const branchId = req.branchId || (await Student.findById(studentId).select('branchId'))?.branchId;

        const surah = surahNumber ? SURAHS.find((s) => s.number === Number(surahNumber)) : null;
        const resolvedSurahName = surah ? surah.name : surahName || '';

        const progress = await QuranProgress.create({
            tenantId: req.tenantId,
            branchId,
            academicYearId: academicYear._id,
            teacherUserId: req.user._id,
            studentId,
            date,
            learningStage: learningStage || 'READING',
            juz: juz ? Number(juz) : undefined,
            surahNumber: surahNumber ? Number(surahNumber) : undefined,
            surahName: resolvedSurahName,
            startAyah: startAyah ? Number(startAyah) : undefined,
            endAyah: endAyah ? Number(endAyah) : undefined,
            notes: notes ? String(notes).trim() : ''
        });

        // Update currentJuz and currentSurah on the enrollment
        await DugsiEnrollment.updateOne(
            { tenantId: req.tenantId, studentId, status: 'ACTIVE' },
            {
                $set: {
                    currentJuz: juz ? Number(juz) : 1,
                    currentSurah: surahNumber ? Number(surahNumber) : 1,
                    ...(learningStage ? { learningStage } : {})
                }
            }
        );

        sendResponse(res, progress, 'Quran progress entry recorded');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// ==========================================
// 6. Admin Oversight & Class Allocations
// ==========================================

// @desc    Get all Dugsi teachers and class allocations (Admin)
// @route   GET /api/dugsi/admin/allocations
exports.getAdminAllocations = async (req, res) => {
    try {
        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendResponse(res, { teachers: [], allocations: [] });

        const [teachers, allocations, classes] = await Promise.all([
            User.find({
                tenantId: req.tenantId,
                role: { $in: ['dugsi_teacher', 'teacher'] },
                isActive: true,
                ...branchScope(req)
            }).select('_id name email role branchId').lean(),
            DugsiClassAllocation.find({
                tenantId: req.tenantId,
                academicYearId: academicYear._id,
                ...branchScope(req)
            }).populate('classId', 'name gradeLevel branchId').populate('teacherUserId', 'name email').lean(),
            Class.find({
                tenantId: req.tenantId,
                isActive: true,
                ...branchScope(req)
            }).select('_id name gradeLevel branchId').lean()
        ]);

        sendResponse(res, {
            teachers,
            allocations,
            availableClasses: classes
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Allocate classes to a Dugsi teacher (Admin)
// @route   POST /api/dugsi/admin/allocate-classes
exports.allocateClasses = async (req, res) => {
    try {
        const { teacherUserId, classIds } = req.body || {};
        if (!teacherUserId || !Array.isArray(classIds) || !classIds.length) {
            return sendError(res, 400, 'teacherUserId and classIds array are required');
        }

        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendError(res, 400, 'No active academic year found');

        const teacher = await User.findOne({ _id: teacherUserId, tenantId: req.tenantId }).select('_id name branchId');
        if (!teacher) return sendError(res, 404, 'Teacher not found');

        const classes = await Class.find({ _id: { $in: classIds }, tenantId: req.tenantId }).select('_id branchId');
        if (classes.length !== classIds.length) {
            return sendError(res, 400, 'One or more invalid classes selected');
        }

        const operations = classes.map((c) => ({
            updateOne: {
                filter: {
                    tenantId: req.tenantId,
                    branchId: c.branchId,
                    academicYearId: academicYear._id,
                    teacherUserId: teacher._id,
                    classId: c._id
                },
                update: {
                    $set: {
                        tenantId: req.tenantId,
                        branchId: c.branchId,
                        academicYearId: academicYear._id,
                        teacherUserId: teacher._id,
                        classId: c._id,
                        assignedBy: req.user._id
                    }
                },
                upsert: true
            }
        }));

        await DugsiClassAllocation.bulkWrite(operations);

        await logActivity({
            req,
            action: 'DUGSI_CLASSES_ALLOCATED',
            entityType: 'DugsiClassAllocation',
            entityId: teacher._id.toString(),
            after: { teacher: teacher.name, classCount: classIds.length }
        });

        sendResponse(res, { allocated: classIds.length }, `Allocated ${classIds.length} class(es) to ${teacher.name}`);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Remove an allocated class from a Dugsi teacher (Admin)
// @route   DELETE /api/dugsi/admin/allocations/:allocationId
exports.removeAllocation = async (req, res) => {
    try {
        const { allocationId } = req.params;
        const allocation = await DugsiClassAllocation.findOneAndDelete({
            _id: allocationId,
            tenantId: req.tenantId,
            ...branchScope(req)
        });

        if (!allocation) return sendError(res, 404, 'Class allocation record not found');

        sendResponse(res, allocation, 'Class allocation removed');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Admin School-wide Dugsi Overview
// @route   GET /api/dugsi/admin/overview
exports.getAdminOverview = async (req, res) => {
    try {
        const academicYear = await resolveCurrentAcademicYear(req.tenantId);
        if (!academicYear) return sendResponse(res, { stats: null, circles: [] });

        const enrollments = await DugsiEnrollment.find({
            tenantId: req.tenantId,
            academicYearId: academicYear._id,
            status: 'ACTIVE',
            ...branchScope(req)
        }).populate('teacherUserId', 'name email').populate('studentId', 'firstName lastName admissionNumber').lean();

        const studentCount = enrollments.length;
        const readingCount = enrollments.filter((e) => e.learningStage === 'READING').length;
        const memorizingCount = enrollments.filter((e) => e.learningStage === 'MEMORIZING').length;

        // Group by teacher
        const byTeacher = new Map();
        for (const e of enrollments) {
            const tId = String(e.teacherUserId?._id || 'unknown');
            const entry = byTeacher.get(tId) || {
                teacherId: e.teacherUserId?._id,
                teacherName: e.teacherUserId?.name || 'Assigned Teacher',
                studentsCount: 0,
                readingCount: 0,
                memorizingCount: 0
            };
            entry.studentsCount += 1;
            if (e.learningStage === 'READING') entry.readingCount += 1;
            if (e.learningStage === 'MEMORIZING') entry.memorizingCount += 1;
            byTeacher.set(tId, entry);
        }

        // Dugsi Attendance Rate
        const dugsiSessions = await AttendanceSession.find({
            tenantId: req.tenantId,
            academicYearId: academicYear._id,
            sessionType: 'DUGSI',
            ...branchScope(req)
        }).select('_id').lean();
        const sessionIds = dugsiSessions.map((s) => s._id);

        const totalRecords = await AttendanceRecord.countDocuments({ sessionId: { $in: sessionIds } });
        const attendedRecords = await AttendanceRecord.countDocuments({
            sessionId: { $in: sessionIds },
            status: { $in: ['PRESENT', 'LATE'] }
        });

        const attendanceRate = totalRecords > 0 ? `${((attendedRecords / totalRecords) * 100).toFixed(1)}%` : 'N/A';

        sendResponse(res, {
            stats: {
                totalStudentsInDugsi: studentCount,
                readingCount,
                memorizingCount,
                activeCirclesCount: byTeacher.size,
                attendanceRate,
                totalAttendanceMarked: totalRecords
            },
            circles: Array.from(byTeacher.values())
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};
