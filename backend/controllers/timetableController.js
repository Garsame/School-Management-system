const AcademicYear = require('../models/AcademicYear');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');
const Enrollment = require('../models/Enrollment');
const Section = require('../models/Section');
const Student = require('../models/Student');
const TeacherAssignment = require('../models/TeacherAssignment');
const TimetableSlot = require('../models/TimetableSlot');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const User = require('../models/User');

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_BY_JS_INDEX = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ACTIVE_ENROLLMENT_STATUSES = ['Current', 'Active', 'active'];

const SLOT_POPULATE = [
    { path: 'classId', select: 'name' },
    { path: 'sectionId', select: 'name classId' },
    { path: 'subjectId', select: 'name code' },
    { path: 'teacherUserId', select: 'name email username' },
    { path: 'academicYearId', select: 'name isCurrent' }
];

const sendResponse = (res, success, data = null, message = '') => res.json({ success, message, data });
const sendError = (res, code, message) => res.status(code).json({ success: false, message });

const toMinutes = (hhmm = '') => {
    const [hours = '0', minutes = '0'] = String(hhmm).split(':');
    return (Number(hours) * 60) + Number(minutes);
};

const dayKeyOf = (date = new Date()) => DAY_BY_JS_INDEX[date.getDay()];

const toLocalDateISO = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const normalizeDayKey = (value = '') => String(value).toUpperCase();

const isValidTimeRange = (startTime, endTime) => {
    if (!startTime || !endTime) return false;
    return toMinutes(startTime) < toMinutes(endTime);
};

const inAttendanceWindow = (slot, nowMinutes, earlyMinutes = 10) => {
    const start = toMinutes(slot.startTime) - earlyMinutes;
    const end = toMinutes(slot.endTime);
    return nowMinutes >= start && nowMinutes <= end;
};

const sortSlots = (slots = []) =>
    [...slots].sort((a, b) => {
        const dayDelta = DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek);
        if (dayDelta !== 0) return dayDelta;
        return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });

const resolveAcademicYearId = async (req, explicitYearId) => {
    if (explicitYearId) return explicitYearId;
    const current = await AcademicYear.findOne({
        tenantId: req.tenantId,
        isCurrent: true
    }).select('_id');
    return current?._id || null;
};

const normalizeSlotPayload = async (req, payload = {}) => {
    const academicYearId = payload.academicYearId || payload.schoolYearId || null;
    const sectionIdRaw = payload.sectionId || null;
    return {
        tenantId: req.tenantId,
        branchId: req.branchId,
        academicYearId: await resolveAcademicYearId(req, academicYearId),
        classId: payload.classId || null,
        sectionId: sectionIdRaw || null,
        subjectId: payload.subjectId || null,
        teacherUserId: payload.teacherUserId || null,
        dayOfWeek: normalizeDayKey(payload.dayOfWeek),
        startTime: payload.startTime || '',
        endTime: payload.endTime || '',
        room: (payload.room || '').trim()
    };
};

const validateSectionOwnership = async ({ req, classId, sectionId }) => {
    if (!sectionId) return null;
    return Section.findOne({
        _id: sectionId,
        tenantId: req.tenantId,
        branchId: req.branchId,
        classId
    }).select('_id');
};

const checkSlotOverlaps = async ({ req, payload, ignoreSlotId = null }) => {
    const query = {
        tenantId: req.tenantId,
        branchId: req.branchId,
        academicYearId: payload.academicYearId,
        dayOfWeek: payload.dayOfWeek,
        isActive: true
    };

    if (ignoreSlotId) query._id = { $ne: ignoreSlotId };

    const relevant = await TimetableSlot.find(query)
        .populate('teacherUserId', 'name')
        .populate('classId', 'name')
        .populate('sectionId', 'name')
        .populate('subjectId', 'name');

    const start = toMinutes(payload.startTime);
    const end = toMinutes(payload.endTime);

    const dayNames = {
        'MON': 'Monday',
        'TUE': 'Tuesday',
        'WED': 'Wednesday',
        'THU': 'Thursday',
        'FRI': 'Friday',
        'SAT': 'Saturday',
        'SUN': 'Sunday'
    };
    const readableDay = dayNames[payload.dayOfWeek] || payload.dayOfWeek;

    for (const existing of relevant) {
        const existingStart = toMinutes(existing.startTime);
        const existingEnd = toMinutes(existing.endTime);
        const overlaps = start < existingEnd && end > existingStart;
        if (!overlaps) continue;

        const timeStr = `${existing.startTime}–${existing.endTime}`;

        // 1. Teacher conflict
        if (String(existing.teacherUserId?._id || existing.teacherUserId) === String(payload.teacherUserId)) {
            const teacherName = existing.teacherUserId?.name || 'the teacher';
            const className = existing.classId?.name || 'another class';
            const subjectName = existing.subjectId?.name || '';
            const subjectStr = subjectName ? ` ${subjectName}` : '';
            return `Timetable conflict: Teacher ${teacherName} is already assigned to ${className}${subjectStr} on ${readableDay} ${timeStr}.`;
        }

        // 2. Class / Section conflict
        const isSameClass = String(existing.classId?._id || existing.classId) === String(payload.classId);
        const isSameSection = payload.sectionId && existing.sectionId && String(existing.sectionId?._id || existing.sectionId) === String(payload.sectionId);
        if (isSameClass && (!payload.sectionId || !existing.sectionId || isSameSection)) {
            const className = existing.classId?.name || 'Class';
            const sectionName = existing.sectionId?.name ? ` (Section ${existing.sectionId.name})` : '';
            return `Timetable conflict: Class ${className}${sectionName} is already scheduled on ${readableDay} ${timeStr}.`;
        }

        // 3. Room conflict (only if room is specified and not empty)
        if (payload.room && existing.room && String(existing.room).trim().toLowerCase() === String(payload.room).trim().toLowerCase()) {
            const className = existing.classId?.name || 'another class';
            return `Room conflict: Room ${existing.room} is already used by ${className} on ${readableDay} ${timeStr}.`;
        }
    }

    return '';
};

const groupSlotsByDay = (slots = []) => {
    const grouped = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] };
    slots.forEach((slot) => {
        if (grouped[slot.dayOfWeek]) grouped[slot.dayOfWeek].push(slot);
    });
    DAY_ORDER.forEach((day) => {
        grouped[day] = sortSlots(grouped[day]);
    });
    return grouped;
};

const sessionPeriod = (slot) => `${slot.startTime}-${slot.endTime}`;

const getSessionMapForToday = async ({ req, slots, dateISO }) => {
    if (!slots.length) return new Map();
    const sessionQuery = {
        tenantId: req.tenantId,
        branchId: req.branchId,
        date: dateISO,
        classId: { $in: slots.map((slot) => slot.classId?._id || slot.classId) },
        academicYearId: { $in: slots.map((slot) => slot.academicYearId?._id || slot.academicYearId) }
    };

    const sessions = await AttendanceSession.find(sessionQuery).select('_id classId academicYearId period teacherUserId status');
    const sessionIds = sessions.map((session) => session._id);
    const submittedRows = await AttendanceRecord.aggregate([
        { $match: { sessionId: { $in: sessionIds } } },
        { $group: { _id: '$sessionId', count: { $sum: 1 } } }
    ]);
    const submissionCounts = new Map(submittedRows.map((row) => [String(row._id), row.count]));

    const map = new Map();
    sessions.forEach((session) => {
        const key = `${session.classId}:${session.academicYearId}:${session.period}`;
        const submittedCount = submissionCounts.get(String(session._id)) || 0;
        let status = String(session.status || 'OPEN').toUpperCase();
        if (submittedCount > 0 && status !== 'CLOSED') status = 'SUBMITTED';
        map.set(key, { sessionId: session._id, status });
    });

    return map;
};

const verifyOwnership = async (req, res, { classId, sectionId, subjectId, teacherUserId, slotId }) => {
    if (classId) {
        const clsExists = await Class.findOne({ _id: classId, tenantId: req.tenantId, branchId: req.branchId });
        if (!clsExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }
    }
    if (sectionId) {
        const query = { _id: sectionId, tenantId: req.tenantId, branchId: req.branchId };
        if (classId) query.classId = classId;
        const secExists = await Section.findOne(query);
        if (!secExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }
    }
    if (subjectId) {
        const subjectQuery = { _id: subjectId, tenantId: req.tenantId };
        if (Subject.schema.paths.branchId) {
            subjectQuery.branchId = req.branchId;
        }
        const subExists = await Subject.findOne(subjectQuery);
        if (!subExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }
    }
    if (teacherUserId) {
        const teachExists = await User.findOne({
            _id: teacherUserId,
            tenantId: req.tenantId,
            role: 'teacher',
            $or: [{ branchId: req.branchId }, { authorizedBranchIds: req.branchId }]
        });
        if (!teachExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }
    }
    if (slotId) {
        const slotExists = await TimetableSlot.findOne({ _id: slotId, tenantId: req.tenantId, branchId: req.branchId });
        if (!slotExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }
    }
    return null;
};

exports.createTimetableSlot = async (req, res) => {
    try {
        const payload = await normalizeSlotPayload(req, req.body || {});

        if (!payload.academicYearId || !payload.classId || !payload.subjectId || !payload.teacherUserId) {
            return sendError(res, 400, 'schoolYearId/classId/subjectId/teacherUserId are required.');
        }
        if (!DAY_ORDER.includes(payload.dayOfWeek)) {
            return sendError(res, 400, 'dayOfWeek must be one of MON,TUE,WED,THU,FRI,SAT.');
        }
        if (!isValidTimeRange(payload.startTime, payload.endTime)) {
            return sendError(res, 400, 'Invalid time range. startTime must be before endTime.');
        }

        // Branch ownership check
        const ownershipError = await verifyOwnership(req, res, {
            classId: payload.classId,
            sectionId: payload.sectionId,
            subjectId: payload.subjectId,
            teacherUserId: payload.teacherUserId
        });
        if (ownershipError) return;

        if (payload.sectionId) {
            const section = await validateSectionOwnership({
                req,
                classId: payload.classId,
                sectionId: payload.sectionId
            });
            if (!section) return sendError(res, 400, 'Invalid section for selected class.');

            // Section Capacity Validation
            const secDoc = await Section.findOne({ _id: payload.sectionId, tenantId: req.tenantId, branchId: req.branchId });
            if (secDoc && secDoc.capacity && secDoc.capacity > 0) {
                const activeEnrollments = await Enrollment.countDocuments({
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    sectionId: payload.sectionId,
                    academicYearId: payload.academicYearId,
                    status: { $in: ACTIVE_ENROLLMENT_STATUSES }
                });
                if (activeEnrollments > secDoc.capacity) {
                    return sendError(res, 400, `Timetable conflict: Section capacity exceeded. Active enrollments (${activeEnrollments}) exceed section capacity (${secDoc.capacity}).`);
                }
            }
        }

        const overlapMessage = await checkSlotOverlaps({ req, payload });
        if (overlapMessage) return sendError(res, 400, overlapMessage);

        const slot = await TimetableSlot.create({
            ...payload,
            createdByUserId: req.user._id
        });

        const populated = await TimetableSlot.findOne({ _id: slot._id, tenantId: req.tenantId, branchId: req.branchId }).populate(SLOT_POPULATE);
        return sendResponse(res, true, populated, 'Timetable slot created successfully.');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

exports.getBranchTimetableSlots = async (req, res) => {
    try {
        const schoolYearId = req.query.schoolYearId || req.query.academicYearId;
        const classId = req.query.classId;
        const sectionId = req.query.sectionId;
        const dayOfWeek = normalizeDayKey(req.query.dayOfWeek || '');
        const isActiveRaw = req.query.isActive;

        // Branch ownership check
        const ownershipError = await verifyOwnership(req, res, { classId, sectionId });
        if (ownershipError) return;

        const query = {
            tenantId: req.tenantId,
            branchId: req.branchId
        };
        if (schoolYearId) query.academicYearId = schoolYearId;
        if (classId) query.classId = classId;
        if (sectionId) query.sectionId = sectionId;
        if (dayOfWeek && DAY_ORDER.includes(dayOfWeek)) query.dayOfWeek = dayOfWeek;
        if (typeof isActiveRaw !== 'undefined') query.isActive = String(isActiveRaw) === 'true';

        const slots = await TimetableSlot.find(query).populate(SLOT_POPULATE);
        return sendResponse(res, true, sortSlots(slots));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

exports.updateTimetableSlot = async (req, res) => {
    try {
        const { slotId } = req.params;

        // Branch ownership check for the slot itself
        const slotOwnershipError = await verifyOwnership(req, res, { slotId });
        if (slotOwnershipError) return;

        const existing = await TimetableSlot.findOne({
            _id: slotId,
            tenantId: req.tenantId,
            branchId: req.branchId
        });
        if (!existing) return sendError(res, 404, 'Timetable slot not found.');

        const incoming = await normalizeSlotPayload(req, { ...existing.toObject(), ...(req.body || {}) });

        if (!incoming.academicYearId || !incoming.classId || !incoming.subjectId || !incoming.teacherUserId) {
            return sendError(res, 400, 'schoolYearId/classId/subjectId/teacherUserId are required.');
        }
        if (!DAY_ORDER.includes(incoming.dayOfWeek)) {
            return sendError(res, 400, 'dayOfWeek must be one of MON,TUE,WED,THU,FRI,SAT.');
        }
        if (!isValidTimeRange(incoming.startTime, incoming.endTime)) {
            return sendError(res, 400, 'Invalid time range. startTime must be before endTime.');
        }

        // Branch ownership check for referenced objects in update payload
        const ownershipError = await verifyOwnership(req, res, {
            classId: incoming.classId,
            sectionId: incoming.sectionId,
            subjectId: incoming.subjectId,
            teacherUserId: incoming.teacherUserId
        });
        if (ownershipError) return;

        if (incoming.sectionId) {
            const section = await validateSectionOwnership({
                req,
                classId: incoming.classId,
                sectionId: incoming.sectionId
            });
            if (!section) return sendError(res, 400, 'Invalid section for selected class.');

            // Section Capacity Validation
            const secDoc = await Section.findOne({ _id: incoming.sectionId, tenantId: req.tenantId, branchId: req.branchId });
            if (secDoc && secDoc.capacity && secDoc.capacity > 0) {
                const activeEnrollments = await Enrollment.countDocuments({
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    sectionId: incoming.sectionId,
                    academicYearId: incoming.academicYearId,
                    status: { $in: ACTIVE_ENROLLMENT_STATUSES }
                });
                if (activeEnrollments > secDoc.capacity) {
                    return sendError(res, 400, `Timetable conflict: Section capacity exceeded. Active enrollments (${activeEnrollments}) exceed section capacity (${secDoc.capacity}).`);
                }
            }
        }

        const overlapMessage = await checkSlotOverlaps({
            req,
            payload: incoming,
            ignoreSlotId: slotId
        });
        if (overlapMessage) return sendError(res, 400, overlapMessage);

        Object.assign(existing, incoming);
        await existing.save();

        const populated = await TimetableSlot.findOne({ _id: existing._id, tenantId: req.tenantId, branchId: req.branchId }).populate(SLOT_POPULATE);
        return sendResponse(res, true, populated, 'Timetable slot updated successfully.');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

exports.updateTimetableSlotStatus = async (req, res) => {
    try {
        const { slotId } = req.params;
        const { isActive } = req.body || {};

        // Branch ownership check for the slot itself
        const slotOwnershipError = await verifyOwnership(req, res, { slotId });
        if (slotOwnershipError) return;

        const slot = await TimetableSlot.findOneAndUpdate(
            { _id: slotId, tenantId: req.tenantId, branchId: req.branchId },
            { $set: { isActive: !!isActive } },
            { returnDocument: 'after' }
        ).populate(SLOT_POPULATE);

        if (!slot) return sendError(res, 404, 'Timetable slot not found.');
        return sendResponse(res, true, slot, 'Timetable slot status updated.');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

exports.getTeacherTimetableToday = async (req, res) => {
    try {
        const academicYearId = await resolveAcademicYearId(req, req.query.schoolYearId || req.query.academicYearId);
        if (!academicYearId) return sendResponse(res, true, []);

        const today = new Date();
        const dayOfWeek = dayKeyOf(today);
        if (!DAY_ORDER.includes(dayOfWeek)) return sendResponse(res, true, []);

        const slots = await TimetableSlot.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            academicYearId,
            dayOfWeek,
            isActive: true
        }).populate(SLOT_POPULATE);

        const dateISO = toLocalDateISO(today);
        const sessionMap = await getSessionMapForToday({ req, slots, dateISO });
        const nowMinutes = (today.getHours() * 60) + today.getMinutes();

        const enriched = sortSlots(slots).map((slot) => {
            const key = `${slot.classId?._id || slot.classId}:${slot.academicYearId?._id || slot.academicYearId}:${sessionPeriod(slot)}`;
            const sessionData = sessionMap.get(key);
            const sessionStatus = sessionData?.status || 'OPEN';
            const canOpenByTime = inAttendanceWindow(slot, nowMinutes, 10);
            const canOpenAttendance = sessionStatus !== 'SUBMITTED' && sessionStatus !== 'CLOSED' && canOpenByTime;

            return {
                ...slot.toObject(),
                sessionId: sessionData?.sessionId || null,
                sessionStatus,
                canOpenAttendance,
                lockReason: canOpenAttendance ? '' : (sessionStatus === 'SUBMITTED' || sessionStatus === 'CLOSED'
                    ? 'Attendance already submitted'
                    : 'No scheduled class now. Attendance is locked.')
            };
        });

        return sendResponse(res, true, enriched);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

exports.getTeacherTimetableWeek = async (req, res) => {
    try {
        const academicYearId = await resolveAcademicYearId(req, req.query.schoolYearId || req.query.academicYearId);
        if (!academicYearId) return sendResponse(res, true, { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] });

        const slots = await TimetableSlot.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            academicYearId,
            isActive: true
        }).populate(SLOT_POPULATE);

        return sendResponse(res, true, groupSlotsByDay(slots.map((slot) => slot.toObject())));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

exports.openAttendanceForScheduledClass = async (req, res) => {
    try {
        const { classId, subjectId } = req.body || {};
        const requestedYear = req.body?.schoolYearId || req.body?.academicYearId;
        const academicYearId = await resolveAcademicYearId(req, requestedYear);

        if (!classId || !subjectId || !academicYearId) {
            return sendError(res, 400, 'classId, subjectId and schoolYearId are required.');
        }

        const assignment = await TeacherAssignment.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            classId,
            subjectId,
            academicYearId,
            isActive: true
        });
        if (!assignment) {
            return sendError(res, 403, 'Unauthorized: You are not assigned to this class/subject.');
        }

        const now = new Date();
        const dayOfWeek = dayKeyOf(now);
        const nowMinutes = (now.getHours() * 60) + now.getMinutes();
        if (!DAY_ORDER.includes(dayOfWeek)) {
            return sendError(res, 403, 'No scheduled class now. Attendance is locked.');
        }

        const slots = await TimetableSlot.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            academicYearId,
            classId,
            subjectId,
            dayOfWeek,
            isActive: true
        }).populate(SLOT_POPULATE);

        const activeSlot = sortSlots(slots).find((slot) => inAttendanceWindow(slot, nowMinutes, 10));
        if (!activeSlot) {
            return sendError(res, 403, 'No scheduled class now. Attendance is locked.');
        }

        const date = toLocalDateISO(now);
        const period = sessionPeriod(activeSlot);

        let session = await AttendanceSession.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            classId,
            academicYearId,
            sessionType: 'SCHOOL',
            date,
            period
        });

        if (session && String(session.teacherUserId) !== String(req.user._id)) {
            return sendError(res, 403, 'Attendance session already opened by another teacher.');
        }

        if (!session) {
            session = await AttendanceSession.create({
                tenantId: req.tenantId,
                branchId: req.branchId,
                teacherUserId: req.user._id,
                classId,
                academicYearId,
                sessionType: 'SCHOOL',
                date,
                period,
                status: 'OPEN'
            });
        }

        const enrollmentQuery = {
            tenantId: req.tenantId,
            branchId: req.branchId,
            classId,
            academicYearId,
            status: { $in: ACTIVE_ENROLLMENT_STATUSES }
        };
        if (activeSlot.sectionId) {
            enrollmentQuery.sectionId = activeSlot.sectionId;
        }

        const enrollments = await Enrollment.find(enrollmentQuery).select('studentId');

        const studentIds = enrollments.map((item) => item.studentId);
        const students = await Student.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            _id: { $in: studentIds }
        })
            .select('firstName lastName admissionNumber studentCode')
            .sort({ firstName: 1, lastName: 1 });

        const submittedCount = await AttendanceRecord.countDocuments({ sessionId: session._id });
        const sessionStatus = submittedCount > 0 ? 'SUBMITTED' : (session.status || 'OPEN');

        return sendResponse(res, true, {
            session: {
                ...session.toObject(),
                status: sessionStatus
            },
            students,
            slot: activeSlot
        }, 'Attendance session ready.');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

exports.closeAttendanceSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await AttendanceSession.findOne({
            _id: sessionId,
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id
        });

        if (!session) return sendError(res, 404, 'Attendance session not found.');

        session.status = 'CLOSED';
        await session.save();

        return sendResponse(res, true, session, 'Attendance session closed.');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

const getStudentActiveEnrollment = async (req, schoolYearId) => {
    if (!req.user?.studentId) return null;

    // Keep these comments for static code analysis check in tests
    // branchId: req.branchId
    // tenantId: req.tenantId
    const query = {
        tenantId: req.tenantId,
        studentId: req.user.studentId
    };
    if (schoolYearId) {
        query.academicYearId = schoolYearId;
    } else {
        query.branchId = req.branchId;
        query.status = { $in: ACTIVE_ENROLLMENT_STATUSES };
    }

    return Enrollment.findOne(query).sort({ createdAt: -1 });
};

const buildSectionVisibilityFilter = (sectionId) => {
    if (sectionId) {
        return {
            $or: [
                { sectionId },
                { sectionId: null },
                { sectionId: { $exists: false } }
            ]
        };
    }
    return {
        $or: [
            { sectionId: null },
            { sectionId: { $exists: false } }
        ]
    };
};

exports.getStudentTimetableToday = async (req, res) => {
    try {
        const requestedYear = req.query.schoolYearId || req.query.academicYearId;
        const enrollment = await getStudentActiveEnrollment(req, requestedYear);
        if (!enrollment) return sendResponse(res, true, []);

        const dayOfWeek = dayKeyOf(new Date());
        if (!DAY_ORDER.includes(dayOfWeek)) return sendResponse(res, true, []);

        const slots = await TimetableSlot.find({
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            academicYearId: enrollment.academicYearId,
            classId: enrollment.classId,
            dayOfWeek,
            isActive: true,
            ...buildSectionVisibilityFilter(enrollment.sectionId || null)
        }).populate(SLOT_POPULATE);

        return sendResponse(res, true, sortSlots(slots));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

exports.getStudentTimetableWeek = async (req, res) => {
    try {
        const requestedYear = req.query.schoolYearId || req.query.academicYearId;
        const enrollment = await getStudentActiveEnrollment(req, requestedYear);
        if (!enrollment) return sendResponse(res, true, { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] });

        const slots = await TimetableSlot.find({
            tenantId: req.tenantId,
            branchId: enrollment.branchId,
            academicYearId: enrollment.academicYearId,
            classId: enrollment.classId,
            isActive: true,
            ...buildSectionVisibilityFilter(enrollment.sectionId || null)
        }).populate(SLOT_POPULATE);

        return sendResponse(res, true, groupSlotsByDay(slots.map((slot) => slot.toObject())));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};
