const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const Class = require('../models/Class');
// Required for registration only: getSessions populates branchId, which throws
// "Schema hasn't been registered" if this module has not been loaded first.
require('../models/Branch');
const { logActivity } = require('../utils/logger');

/**
 * Attendance oversight.
 *
 * Until now the only way to see attendance was to be the teacher who took it, the student it
 * was about, or that student's parent. Nobody running the school could look at it at all.
 *
 * This is the school-side view: anyone the school grants `attendance.oversight.view` can see
 * any class's attendance, and `attendance.oversight.manage` can take it. The teacher path in
 * teacherController is untouched — a teacher still owns their own sessions and is still bound
 * by their class assignments.
 *
 * Branch is resolved the same way as elsewhere: a branch-scoped caller is confined to their
 * own branch, a school-wide caller covers all of them and takes the branch from the class
 * being acted on rather than from their own record, which has none.
 */

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

const sendResponse = (res, data, message) => res.json({ success: true, data, message });
const sendError = (res, status, message) => res.status(status).json({ success: false, message });

const branchScope = (req) => (req.scope === 'branch' ? { branchId: req.branchId } : {});

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();

/** A school-wide caller has no branch, so take it from the class being acted on. */
const resolveBranchForClass = async (req, classId) => {
    const classDoc = await Class.findOne({ _id: classId, tenantId: req.tenantId, ...branchScope(req) })
        .select('_id branchId name');
    if (!classDoc) return null;
    return classDoc;
};

/**
 * @desc    Attendance sessions across the school, filtered by class, date, or status
 * @route   GET /api/attendance/sessions
 */
exports.getSessions = async (req, res) => {
    try {
        const { classId, academicYearId, from, to, status } = req.query;
        const query = { tenantId: req.tenantId, ...branchScope(req) };
        if (classId) query.classId = classId;
        if (academicYearId) query.academicYearId = academicYearId;
        if (status) query.status = normalizeStatus(status);
        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = from;
            if (to) query.date.$lte = to;
        }

        const sessions = await AttendanceSession.find(query)
            .sort({ date: -1, createdAt: -1 })
            .limit(Math.min(Number(req.query.limit) || 200, 500))
            .populate('classId', 'name gradeLevel')
            .populate('teacherUserId', 'name')
            .populate('branchId', 'name')
            .lean();

        // Attach a present/absent tally so a list is useful without opening every session.
        const sessionIds = sessions.map((session) => session._id);
        const tallies = await AttendanceRecord.aggregate([
            { $match: { sessionId: { $in: sessionIds } } },
            { $group: { _id: { sessionId: '$sessionId', status: '$status' }, count: { $sum: 1 } } }
        ]);
        const bySession = new Map();
        for (const row of tallies) {
            const key = String(row._id.sessionId);
            const entry = bySession.get(key) || {};
            entry[row._id.status] = row.count;
            bySession.set(key, entry);
        }

        sendResponse(res, sessions.map((session) => ({
            ...session,
            tally: bySession.get(String(session._id)) || {}
        })));
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/**
 * @desc    The register for one session: every enrolled student and their marked status
 * @route   GET /api/attendance/sessions/:sessionId
 */
exports.getSessionRegister = async (req, res) => {
    try {
        const session = await AttendanceSession.findOne({
            _id: req.params.sessionId,
            tenantId: req.tenantId,
            ...branchScope(req)
        }).populate('classId', 'name gradeLevel').populate('teacherUserId', 'name');

        if (!session) return sendError(res, 404, 'Attendance session not found');

        const studentIds = await Enrollment.find({
            tenantId: req.tenantId,
            branchId: session.branchId,
            classId: session.classId._id || session.classId,
            academicYearId: session.academicYearId,
            status: { $in: ['Current', 'Active', 'active'] }
        }).distinct('studentId');

        const [students, records] = await Promise.all([
            Student.find({ _id: { $in: studentIds } }).select('firstName lastName admissionNumber').lean(),
            AttendanceRecord.find({ sessionId: session._id }).select('studentId status').lean()
        ]);

        const statusByStudent = new Map(records.map((record) => [String(record.studentId), record.status]));

        // Every enrolled student appears, marked or not — an unmarked register should show
        // who is still missing rather than silently omitting them.
        sendResponse(res, {
            session,
            register: students.map((student) => ({
                studentId: student._id,
                name: `${student.firstName} ${student.lastName}`.trim(),
                admissionNumber: student.admissionNumber,
                status: statusByStudent.get(String(student._id)) || null
            }))
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/**
 * @desc    Open a session for any class, without needing a teaching assignment
 * @route   POST /api/attendance/sessions
 */
exports.openSession = async (req, res) => {
    try {
        const { classId, academicYearId, date, period } = req.body || {};
        if (!classId || !academicYearId || !date) {
            return sendError(res, 400, 'classId, academicYearId and date are required');
        }

        const classDoc = await resolveBranchForClass(req, classId);
        if (!classDoc) return sendError(res, 404, 'Class not found in this school');

        // teacherUserId records who is responsible for the session. When an administrator
        // takes the register themselves that is them, which is also what lets them submit
        // to it afterwards.
        const session = await AttendanceSession.create({
            tenantId: req.tenantId,
            branchId: classDoc.branchId,
            teacherUserId: req.user._id,
            classId,
            academicYearId,
            date,
            period
        });

        await logActivity({
            req,
            action: 'ATTENDANCE_SESSION_OPENED',
            entityType: 'AttendanceSession',
            entityId: session._id.toString(),
            after: { classId, academicYearId, date, period, branchId: classDoc.branchId }
        });

        sendResponse(res, session, `Attendance opened for ${classDoc.name}`);
    } catch (error) {
        if (error.code === 11000) {
            return sendError(res, 409, 'Attendance is already open for this class, date and period');
        }
        sendError(res, 500, error.message);
    }
};

/**
 * @desc    Mark or correct attendance for any session
 * @route   PUT /api/attendance/sessions/:sessionId/records
 */
exports.submitRecords = async (req, res) => {
    try {
        const { records } = req.body || {};
        if (!Array.isArray(records) || records.length === 0) {
            return sendError(res, 400, 'At least one attendance record is required');
        }

        const session = await AttendanceSession.findOne({
            _id: req.params.sessionId,
            tenantId: req.tenantId,
            ...branchScope(req)
        });
        if (!session) return sendError(res, 404, 'Attendance session not found');
        if (session.status !== 'OPEN') return sendError(res, 409, 'This attendance session is closed');

        const normalized = records.map((record) => ({
            studentId: record.studentId,
            status: normalizeStatus(record.status)
        }));
        if (normalized.some((record) => !record.studentId || !ATTENDANCE_STATUSES.includes(record.status))) {
            return sendError(res, 400, `Each record needs a student and one of: ${ATTENDANCE_STATUSES.join(', ')}`);
        }

        // Only students actually enrolled in this class may be marked. Without this an
        // administrator could mark a student from any class, in any branch.
        const enrolled = await Enrollment.find({
            tenantId: req.tenantId,
            branchId: session.branchId,
            classId: session.classId,
            academicYearId: session.academicYearId,
            status: { $in: ['Current', 'Active', 'active'] }
        }).distinct('studentId');
        const allowed = new Set(enrolled.map((id) => String(id)));
        const strangers = normalized.filter((record) => !allowed.has(String(record.studentId)));
        if (strangers.length) {
            return sendError(res, 403, 'Attendance includes a student not enrolled in this class');
        }

        await AttendanceRecord.bulkWrite(normalized.map((record) => ({
            updateOne: {
                filter: { sessionId: session._id, studentId: record.studentId },
                update: {
                    $set: {
                        tenantId: req.tenantId,
                        branchId: session.branchId,
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
            action: 'ATTENDANCE_RECORDED',
            entityType: 'AttendanceSession',
            entityId: session._id.toString(),
            after: { marked: normalized.length, date: session.date, classId: session.classId }
        });

        sendResponse(res, { sessionId: session._id, marked: normalized.length }, 'Attendance saved');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/**
 * @desc    Close a session so it can no longer be edited
 * @route   PATCH /api/attendance/sessions/:sessionId/close
 */
exports.closeSession = async (req, res) => {
    try {
        const session = await AttendanceSession.findOne({
            _id: req.params.sessionId,
            tenantId: req.tenantId,
            ...branchScope(req)
        });
        if (!session) return sendError(res, 404, 'Attendance session not found');
        if (session.status === 'CLOSED') return sendError(res, 409, 'This session is already closed');

        session.status = 'CLOSED';
        await session.save();

        await logActivity({
            req,
            action: 'ATTENDANCE_SESSION_CLOSED',
            entityType: 'AttendanceSession',
            entityId: session._id.toString(),
            after: { status: 'CLOSED' }
        });

        sendResponse(res, session, 'Attendance session closed');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/**
 * @desc    One student's attendance history — the activity watch
 * @route   GET /api/attendance/students/:studentId
 */
exports.getStudentAttendance = async (req, res) => {
    try {
        const student = await Student.findOne({
            _id: req.params.studentId,
            tenantId: req.tenantId,
            ...branchScope(req)
        }).select('firstName lastName admissionNumber branchId');
        if (!student) return sendError(res, 404, 'Student not found in this school');

        const { from, to, academicYearId } = req.query;
        const sessionQuery = { tenantId: req.tenantId, branchId: student.branchId };
        if (academicYearId) sessionQuery.academicYearId = academicYearId;
        if (from || to) {
            sessionQuery.date = {};
            if (from) sessionQuery.date.$gte = from;
            if (to) sessionQuery.date.$lte = to;
        }

        const sessions = await AttendanceSession.find(sessionQuery)
            .select('_id classId date period')
            .populate('classId', 'name')
            .lean();
        const sessionById = new Map(sessions.map((session) => [String(session._id), session]));

        const records = await AttendanceRecord.find({
            studentId: student._id,
            sessionId: { $in: sessions.map((session) => session._id) }
        }).select('sessionId status').lean();

        const counts = ATTENDANCE_STATUSES.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
        const history = records.map((record) => {
            counts[record.status] = (counts[record.status] || 0) + 1;
            const session = sessionById.get(String(record.sessionId));
            return {
                date: session?.date,
                period: session?.period,
                className: session?.classId?.name,
                status: record.status
            };
        }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const marked = records.length;
        sendResponse(res, {
            student: {
                _id: student._id,
                name: `${student.firstName} ${student.lastName}`.trim(),
                admissionNumber: student.admissionNumber
            },
            counts,
            // Present and late both mean the student turned up.
            attendanceRate: marked ? Math.round(((counts.PRESENT + counts.LATE) / marked) * 100) : null,
            sessionsMarked: marked,
            history
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/**
 * @desc    Attendance rates per class for a day or range — the overview
 * @route   GET /api/attendance/summary
 */
exports.getSummary = async (req, res) => {
    try {
        const { from, to, academicYearId } = req.query;
        const sessionQuery = { tenantId: req.tenantId, ...branchScope(req) };
        if (academicYearId) sessionQuery.academicYearId = academicYearId;
        if (from || to) {
            sessionQuery.date = {};
            if (from) sessionQuery.date.$gte = from;
            if (to) sessionQuery.date.$lte = to;
        }

        const sessions = await AttendanceSession.find(sessionQuery)
            .select('_id classId date status')
            .populate('classId', 'name gradeLevel')
            .lean();

        const tallies = await AttendanceRecord.aggregate([
            { $match: { sessionId: { $in: sessions.map((session) => session._id) } } },
            { $group: { _id: { sessionId: '$sessionId', status: '$status' }, count: { $sum: 1 } } }
        ]);

        const perSession = new Map();
        for (const row of tallies) {
            const key = String(row._id.sessionId);
            const entry = perSession.get(key) || { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
            entry[row._id.status] = row.count;
            perSession.set(key, entry);
        }

        const byClass = new Map();
        let openSessions = 0;
        for (const session of sessions) {
            if (session.status === 'OPEN') openSessions += 1;
            const className = session.classId?.name || 'Unassigned';
            const entry = byClass.get(className) || { className, sessions: 0, present: 0, absent: 0, late: 0, excused: 0 };
            const tally = perSession.get(String(session._id)) || { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
            entry.sessions += 1;
            entry.present += tally.PRESENT;
            entry.absent += tally.ABSENT;
            entry.late += tally.LATE;
            entry.excused += tally.EXCUSED;
            byClass.set(className, entry);
        }

        const classes = [...byClass.values()].map((entry) => {
            const marked = entry.present + entry.absent + entry.late + entry.excused;
            return { ...entry, marked, attendanceRate: marked ? Math.round(((entry.present + entry.late) / marked) * 100) : null };
        }).sort((a, b) => a.className.localeCompare(b.className));

        const totals = classes.reduce((acc, entry) => ({
            sessions: acc.sessions + entry.sessions,
            present: acc.present + entry.present,
            absent: acc.absent + entry.absent,
            late: acc.late + entry.late,
            excused: acc.excused + entry.excused
        }), { sessions: 0, present: 0, absent: 0, late: 0, excused: 0 });
        const totalMarked = totals.present + totals.absent + totals.late + totals.excused;

        sendResponse(res, {
            totals: {
                ...totals,
                openSessions,
                marked: totalMarked,
                attendanceRate: totalMarked ? Math.round(((totals.present + totals.late) / totalMarked) * 100) : null
            },
            classes
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};
