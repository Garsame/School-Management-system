const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');
const AcademicYear = require('../models/AcademicYear');
const TeacherAssignment = require('../models/TeacherAssignment');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const ExamCategory = require('../models/ExamCategory');
const ExamTemplate = require('../models/ExamTemplate');
const ClassSubject = require('../models/ClassSubject');
const User = require('../models/User');
const { createNotification } = require('../services/notificationService');
const { logAction } = require('../services/auditLogService');
const gradingService = require('../services/gradingService');
const exportService = require('../services/exportService');
const { resolvePassMarkPercent } = require('../utils/grading');

// Helper for standard responses
const sendResponse = (res, success, data = null, message = '') => {
    return res.json({ success, message, data });
};

const sendError = (res, code, message, errors = []) => {
    return res.status(code).json({ success: false, message, errors });
};

exports.getAuthorizedBranches = async (req, res) => {
    try {
        const branchIds = [...new Set([req.user.branchId, ...(req.user.authorizedBranchIds || [])].filter(Boolean).map(String))];
        const branches = await require('../models/Branch').find({
            _id: { $in: branchIds },
            tenantId: req.tenantId,
            isActive: true
        }).select('name code');
        sendResponse(res, true, branches);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

const normalizeStatus = (status) => String(status || '').toUpperCase();

const resolveMaxScore = (exam) => {
    if (exam?.examTemplateId?.maxScore) return exam.examTemplateId.maxScore;
    if (exam?.examCategoryId?.maxScore) return exam.examCategoryId.maxScore;
    return 100;
};

// --- A) Exam Management ---

// --- A) Exam Management ---
// Teachers read exams assigned to them, but DO NOT create them.

exports.getExams = async (req, res) => {
    try {
        const { classId, subjectId, schoolYearId, term } = req.query;

        const assignments = await TeacherAssignment.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            isActive: true
        });

        if (assignments.length === 0) return sendResponse(res, true, [], 'No assignments found');

        const filter = {
            tenantId: req.tenantId,
            branchId: req.branchId,
            $or: assignments.map(a => ({
                classId: a.classId,
                subjectId: a.subjectId,
                academicYearId: a.academicYearId
            }))
        };

        if (classId) filter.classId = classId;
        if (subjectId) filter.subjectId = subjectId;
        if (schoolYearId) filter.academicYearId = schoolYearId;
        if (term) filter.termId = term;

        const exams = await Exam.find(filter)
            .populate('examCategoryId', 'name maxScore')
            .populate('examTemplateId', 'name maxScore')
            .populate('subjectId', 'name code')
            .populate('classId', 'name')
            .populate('academicYearId', 'name')
            .populate('termId', 'name')
            .sort({ createdAt: -1 });

        const data = exams.map(exam => {
            const status = normalizeStatus(exam.status);
            return {
                ...exam.toObject(),
                status,
                maxScore: resolveMaxScore(exam),
                canEnter: status === 'OPEN'
            };
        });

        sendResponse(res, true, data);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.getExamStudents = async (req, res) => {
    try {
        const { examId } = req.params;
        const exam = await Exam.findOne({ _id: examId, tenantId: req.tenantId, branchId: req.branchId })
            .populate('examCategoryId')
            .populate('examTemplateId')
            .populate('subjectId', 'name')
            .populate('classId', 'name');

        if (!exam) return sendError(res, 404, 'Assessment not found');

        // Verify assignment exists (Guard should have done this, but we double-check)
        const assignment = await TeacherAssignment.findOne({
            tenantId: req.tenantId,
            teacherUserId: req.user._id,
            classId: exam.classId,
            subjectId: exam.subjectId,
            academicYearId: exam.academicYearId,
            isActive: true
        });
        if (!assignment) return sendError(res, 403, 'Unauthorized access to this assessment');

        // Load students enrolled in this class/year
        // Broaden status to match Registrar logic (supporting both 'Current' and 'active')
        const enrollments = await Enrollment.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            classId: exam.classId,
            academicYearId: exam.academicYearId,
            status: { $in: ['Current', 'Active', 'active'] }
        }).select('studentId');

        const studentIds = enrollments.map(e => e.studentId);
        
        // Fetch students using the same criteria as the "Register" role
        const students = await Student.find({
            _id: { $in: studentIds },
            tenantId: req.tenantId,
            branchId: req.branchId
        }).sort({ firstName: 1 }).select('firstName lastName admissionNumber studentCode');

        // Load existing results
        const existingResults = await Result.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            examId
        });

        const normalizedStatus = normalizeStatus(exam.status);
        sendResponse(res, true, { 
            exam: { 
                ...exam.toObject(), 
                status: normalizedStatus,
                maxScore: resolveMaxScore(exam),
                canEnter: normalizedStatus === 'OPEN'
            }, 
            students, 
            existingResults 
        });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.getExam = async (req, res) => {
    try {
        const exam = await Exam.findOne({ _id: req.params.examId, tenantId: req.tenantId, branchId: req.branchId });
        if (!exam) return sendError(res, 404, 'Exam not found');
        sendResponse(res, true, exam);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.getExamCategories = async (req, res) => {
    try {
        const categories = await ExamCategory.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            isActive: true
        }).sort({ name: 1 });

        sendResponse(res, true, categories);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.getExamTemplates = async (req, res) => {
    try {
        const templates = await ExamTemplate.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            isActive: true
        }).sort({ name: 1 });

        sendResponse(res, true, templates);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};



// --- B) Result Entry ---

const processBulkResults = async (req, examId, results) => {
    if (!examId || !Array.isArray(results)) {
        const error = new Error('Invalid data structure');
        error.status = 400;
        throw error;
    }
    if (results.length === 0) {
        const error = new Error('No results provided');
        error.status = 400;
        throw error;
    }

    const exam = await Exam.findOne({ _id: examId, tenantId: req.tenantId, branchId: req.branchId })
        .populate('examCategoryId')
        .populate('examTemplateId');
    if (!exam) {
        const error = new Error('Exam not found');
        error.status = 404;
        throw error;
    }

    if (exam.createdByTeacherId) {
        const error = new Error('Only branch-admin created exams can be graded');
        error.status = 403;
        throw error;
    }

    if (normalizeStatus(exam.status) !== 'OPEN') {
        const error = new Error('Assessment is not Open for grading');
        error.status = 403;
        throw error;
    }

    const assignment = await TeacherAssignment.findOne({
        tenantId: req.tenantId,
        branchId: req.branchId,
        teacherUserId: req.user._id,
        classId: exam.classId,
        subjectId: exam.subjectId,
        academicYearId: exam.academicYearId,
        isActive: true
    });
    if (!assignment) {
        const error = new Error('Not assigned to this subject');
        error.status = 403;
        throw error;
    }

    const enrollments = await Enrollment.find({
        tenantId: req.tenantId,
        branchId: req.branchId,
        classId: exam.classId,
        academicYearId: exam.academicYearId,
        status: { $in: ['Current', 'Active', 'active'] }
    }).select('studentId');
    const allowedStudentIds = new Set(enrollments.map(e => e.studentId.toString()));

    const seen = new Set();
    for (const row of results) {
        if (!row.studentId) {
            const error = new Error('studentId is required for all results');
            error.status = 400;
            throw error;
        }
        if (seen.has(row.studentId)) {
            const error = new Error('Duplicate result exists in payload');
            error.status = 400;
            throw error;
        }
        seen.add(row.studentId);
        if (!allowedStudentIds.has(row.studentId.toString())) {
            const error = new Error('Student is not enrolled in this class/year');
            error.status = 403;
            throw error;
        }
    }

    const curriculum = await ClassSubject.findOne({
        tenantId: req.tenantId,
        branchId: req.branchId,
        classId: exam.classId,
        subjectId: exam.subjectId,
        academicYearId: exam.academicYearId
    });
    const passMarkPercent = resolvePassMarkPercent(curriculum);
    const maxScore = resolveMaxScore(exam);
    const gradingRules = await gradingService.getGradingRules(req.tenantId);

    const studentIds = results.map(r => r.studentId);
    const existingResults = await Result.find({
        tenantId: req.tenantId,
        branchId: req.branchId,
        examId,
        studentId: { $in: studentIds }
    });
    const existingMap = new Map(existingResults.map(r => [r.studentId.toString(), r]));

    const created = [];
    const updated = [];

    for (const row of results) {
        const existing = existingMap.get(row.studentId.toString());
        if (existing) {
            const createdBy = existing.createdByTeacherId || existing.gradedByTeacherId;
            if (createdBy && createdBy.toString() !== req.user._id.toString()) {
                const error = new Error('Only the assigned teacher can update these results');
                error.status = 403;
                throw error;
            }
        }

        const isAbsent = !!row.isAbsent;
        const marks = isAbsent ? 0 : Number(row.marksObtained);

        if (!isAbsent && (Number.isNaN(marks) || marks < 0 || marks > maxScore)) {
            const error = new Error(`Marks must be between 0 and ${maxScore}`);
            error.status = 400;
            throw error;
        }

        const percentage = maxScore > 0 ? (marks / maxScore) * 100 : 0;
        const status = percentage >= passMarkPercent ? 'PASS' : 'FAIL';
        const grade = gradingService.gradeForPercentage(percentage, gradingRules);
        const createdByTeacherId = existing?.createdByTeacherId || existing?.gradedByTeacherId || req.user._id;

        const doc = await Result.findOneAndUpdate(
            { tenantId: req.tenantId, branchId: req.branchId, examId, studentId: row.studentId },
            {
                $set: {
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    examId,
                    studentId: row.studentId,
                    marksObtained: marks,
                    maxScore,
                    percentage: Math.round(percentage * 100) / 100,
                    passMarkPercent,
                    status,
                    grade,
                    isAbsent,
                    remarks: row.remarks,
                    createdByTeacherId,
                    gradedByTeacherId: req.user._id,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date()
                }
            },
            { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
        );

        if (existing) {
            updated.push(doc);
            await logAction({
                tenantId: req.tenantId,
                branchId: req.branchId,
                actorUserId: req.user._id,
                actorRole: 'TEACHER',
                action: 'RESULT_UPDATED',
                entityType: 'Result',
                entityId: doc._id.toString(),
                before: existing.toObject(),
                after: doc.toObject(),
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        } else {
            created.push(doc);
            await logAction({
                tenantId: req.tenantId,
                branchId: req.branchId,
                actorUserId: req.user._id,
                actorRole: 'TEACHER',
                action: 'RESULT_CREATED',
                entityType: 'Result',
                entityId: doc._id.toString(),
                after: doc.toObject(),
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        }

        // Dispatch notifications for result updates to student and parent
        try {
            const studentUser = await User.findOne({ studentId: row.studentId, tenantId: req.tenantId });
            if (studentUser) {
                await createNotification({
                    tenantId: req.tenantId,
                    recipientId: studentUser._id,
                    title: `New Exam Result: ${exam.name || 'Exam published'}`,
                    message: `Your result for the exam "${exam.name || 'Exam'}" has been published. Score: ${doc.marksObtained}/${doc.maxScore} (${doc.status}).`,
                    type: 'Grade'
                });
            }

            const parentUser = await User.findOne({ students: row.studentId, tenantId: req.tenantId });
            if (parentUser) {
                const student = await Student.findOne({ _id: row.studentId, tenantId: req.tenantId, branchId: req.branchId });
                const studentName = student ? `${student.firstName} ${student.lastName}` : 'Your child';
                await createNotification({
                    tenantId: req.tenantId,
                    recipientId: parentUser._id,
                    title: `Exam Result Alert: ${studentName}`,
                    message: `The exam result for ${studentName} for the exam "${exam.name || 'Exam'}" has been published. Score: ${doc.marksObtained}/${doc.maxScore} (${doc.status}).`,
                    type: 'Grade'
                });
            }
        } catch (err) {
            console.error('Failed to send result notification:', err);
        }
    }

    return { exam, createdCount: created.length, updatedCount: updated.length };
};

exports.enterResult = async (req, res) => {
    try {
        const { examId, studentId, marksObtained, isAbsent, remarks } = req.body;
        if (!examId || !studentId) return sendError(res, 400, 'examId and studentId are required');

        const payload = [{ studentId, marksObtained, isAbsent, remarks }];
        const summary = await processBulkResults(req, examId, payload);
        sendResponse(res, true, summary, 'Result recorded successfully');
    } catch (error) {
        sendError(res, error.status || 500, error.message);
    }
};

exports.batchEnterResults = async (req, res) => {
    try {
        const { examId, results } = req.body;
        const summary = await processBulkResults(req, examId, results);
        sendResponse(res, true, summary, 'Batch results processed successfully');
    } catch (error) {
        sendError(res, error.status || 500, error.message);
    }
};

exports.updateResult = async (req, res) => {
    try {
        const { marksObtained, isAbsent, remarks } = req.body;
        const resultId = req.params.resultId;

        const result = await Result.findOne({ _id: resultId, tenantId: req.tenantId, branchId: req.branchId });
        if (!result) return sendError(res, 404, 'Result not found');

        await processBulkResults(req, result.examId, [{
            studentId: result.studentId,
            marksObtained,
            isAbsent,
            remarks
        }]);
        const updated = await Result.findOne({ _id: result._id, tenantId: req.tenantId, branchId: req.branchId });
        sendResponse(res, true, updated, 'Result updated successfully');
    } catch (error) {
        sendError(res, error.status || 500, error.message);
    }
};

// --- C) Performance Views ---

exports.getResults = async (req, res) => {
    try {
        const { examId } = req.query;
        if (!examId) return sendError(res, 400, 'examId is required');

        const exam = await Exam.findOne({ _id: examId, tenantId: req.tenantId, branchId: req.branchId });
        if (!exam) return sendError(res, 404, 'Exam not found');

        const assignment = await TeacherAssignment.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            classId: exam.classId,
            subjectId: exam.subjectId,
            academicYearId: exam.academicYearId,
            isActive: true
        });
        if (!assignment) return sendError(res, 403, 'Not assigned to this subject');

        const results = await Result.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            examId
        })
            .populate('studentId', 'firstName lastName admissionNumber')
            .populate({
                path: 'examId',
                populate: [
                    { path: 'examCategoryId', select: 'name' },
                    { path: 'examTemplateId', select: 'name maxScore' },
                    { path: 'subjectId', select: 'name' }
                ]
            });

        sendResponse(res, true, results);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.getClassResults = async (req, res) => {
    try {
        const { classId, subjectId, academicYearId, term } = req.query;
        if (!classId || !subjectId || !academicYearId) {
            return sendError(res, 400, 'classId, subjectId, and academicYearId are required');
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
        if (!assignment) return sendError(res, 403, 'Not assigned to this subject');

        const exams = await Exam.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            classId,
            subjectId,
            academicYearId,
            ...(term ? { termId: term } : {})
        })
            .populate('examCategoryId', 'name maxScore')
            .sort({ createdAt: 1 });

        const categories = exams.map(exam => ({
            examId: exam._id,
            categoryId: exam.examCategoryId?._id,
            categoryName: exam.examCategoryId?.name,
            maxScore: exam.examCategoryId?.maxScore || 100
        }));

        const enrollments = await Enrollment.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            classId,
            academicYearId
        }).select('studentId');

        const studentIds = enrollments.map(e => e.studentId);
        const students = await Student.find({
            _id: { $in: studentIds },
            tenantId: req.tenantId,
            branchId: req.branchId
        }).sort({ firstName: 1 }).select('firstName lastName admissionNumber');

        const results = await Result.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            examId: { $in: exams.map(e => e._id) }
        });

        const resultsByExam = new Map();
        for (const result of results) {
            const examKey = result.examId.toString();
            if (!resultsByExam.has(examKey)) resultsByExam.set(examKey, new Map());
            resultsByExam.get(examKey).set(result.studentId.toString(), result);
        }

        const curriculum = await ClassSubject.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            classId,
            subjectId,
            $or: [
                { academicYearId },
                { academicYearId: { $exists: false } },
                { academicYearId: null }
            ]
        });
        const passMarkPercent = resolvePassMarkPercent(curriculum);

        const rows = students.map(student => {
            let totalMarks = 0;
            let totalMax = 0;
            const categoryMarks = categories.map(category => {
                const result = resultsByExam.get(category.examId.toString())?.get(student._id.toString());
                const marks = result ? result.marksObtained : 0;
                totalMarks += marks;
                totalMax += category.maxScore || 0;
                return {
                    examId: category.examId,
                    marksObtained: marks,
                    maxScore: category.maxScore
                };
            });

            const percentage = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
            const status = percentage >= passMarkPercent ? 'PASS' : 'FAIL';

            return {
                student: {
                    id: student._id,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    admissionNumber: student.admissionNumber
                },
                categoryMarks,
                totalMarks,
                totalMax,
                percentage: Math.round(percentage * 100) / 100,
                status
            };
        });

        sendResponse(res, true, { categories, rows });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.getResultsSummary = async (req, res) => {
    try {
        const { examId } = req.query;
        if (!examId) return sendError(res, 400, 'examId is required for summary');

        const match = { 
            tenantId: req.tenantId, 
            branchId: req.branchId,
            examId: new mongoose.Types.ObjectId(examId) 
        };

        const stats = await Result.aggregate([
            { $match: match },
            { $project: {
                marksObtained: 1,
                maxScore: 1,
                status: 1,
                percentage: { 
                    $ifNull: [ 
                        '$percentage', 
                        { $cond: [ { $gt: [ '$maxScore', 0 ] }, { $multiply: [ { $divide: [ '$marksObtained', '$maxScore' ] }, 100 ] }, 0 ] } 
                    ] 
                }
            }},
            { $group: {
                _id: '$examId',
                avgPercentage: { $avg: '$percentage' },
                maxPercentage: { $max: '$percentage' },
                minPercentage: { $min: '$percentage' },
                count: { $sum: 1 },
                passCount: { $sum: { $cond: [{ $eq: ['$status', 'PASS'] }, 1, 0] } }
            }}
        ]);

        if (stats.length === 0) return sendResponse(res, true, {}, 'No results found for this exam');

        const result = stats[0];
        const summary = {
            averageScore: result ? Math.round((result.avgPercentage || 0) * 10) / 10 : 0,
            highestScore: result ? Math.round((result.maxPercentage || 0) * 10) / 10 : 0,
            lowestScore: result ? Math.round((result.minPercentage || 0) * 10) / 10 : 0,
            totalStudents: result ? result.count : 0,
            passRate: (result && result.count > 0) ? Math.round((result.passCount / result.count) * 100) + '%' : '0%'
        };

        sendResponse(res, true, summary);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};


// --- D) Exports ---

exports.exportResults = async (req, res) => {
    try {
        const { examId, format } = req.query;
        if (!examId) return sendError(res, 400, 'examId is required');

        const results = await Result.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            examId
        }).populate('studentId', 'firstName lastName admissionNumber');

        if (format === 'csv') {
            const csv = exportService.generateResultsCSV(results);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=exam_results_${examId}.csv`);
            return res.send(csv);
        }

        sendResponse(res, true, results);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// --- E) Policy ---

exports.getGradingPolicy = async (req, res) => {
    try {
        const rules = await gradingService.getGradingRules(req.tenantId);
        sendResponse(res, true, rules);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// --- F) Students ---

exports.getStudents = async (req, res) => {
    try {
        const { classId, academicYearId, status } = req.query;
        let studentIds = null;

        if (classId || academicYearId) {
            const enrollmentQuery = {
                tenantId: req.tenantId,
                branchId: req.branchId
            };
            if (classId) enrollmentQuery.classId = classId;
            if (academicYearId) enrollmentQuery.academicYearId = academicYearId;
            
            const enrollments = await Enrollment.find(enrollmentQuery).select('studentId');
            studentIds = enrollments.map(e => e.studentId);
        }

        const studentQuery = {
            tenantId: req.tenantId,
            branchId: req.branchId
        };
        if (status) studentQuery.status = status;
        if (studentIds) studentQuery._id = { $in: studentIds };

        const students = await Student.find(studentQuery);
        sendResponse(res, true, students);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// --- G) Assignments ---

exports.getTeacherAssignments = async (req, res) => {
    try {
        const { academicYearId } = req.query;
        const query = {
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            isActive: true
        };
        if (academicYearId) query.academicYearId = academicYearId;

        const assignments = await TeacherAssignment.find(query)
            .populate('classId', 'name gradeLevel')
            .populate('sectionId', 'name')
            .populate('subjectId', 'name code')
            .populate('academicYearId', 'name');

        sendResponse(res, true, assignments);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// --- H) Attendance ---

exports.createAttendanceSession = async (req, res) => {
    try {
        const { classId, academicYearId, date, period } = req.body;
        
        // Note: Global guard handles "is user assigned to this class"
        
        const newSession = new AttendanceSession({
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            classId,
            academicYearId,
            sessionType: 'SCHOOL',
            date,
            period
        });

        await newSession.save();

        await logAction({
            tenantId: req.tenantId,
            branchId: req.branchId,
            actorUserId: req.user._id,
            actorRole: 'TEACHER',
            action: 'ATTENDANCE_SESSION_CREATED',
            entityType: 'AttendanceSession',
            entityId: newSession._id,
            after: newSession.toObject(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        sendResponse(res, true, newSession, 'Attendance session created');
    } catch (error) {
        if (error.code === 11000) return sendError(res, 409, 'Session already exists for this slot');
        sendError(res, 500, error.message);
    }
};

exports.getAttendanceSessions = async (req, res) => {
    try {
        const { classId, academicYearId, from, to } = req.query;
        const query = {
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            sessionType: 'SCHOOL'
        };
        if (classId) query.classId = classId;
        if (academicYearId) query.academicYearId = academicYearId;
        if (from && to) query.date = { $gte: from, $lte: to };

        const sessions = await AttendanceSession.find(query).sort({ date: -1 });
        sendResponse(res, true, sessions);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.submitAttendanceRecords = async (req, res) => {
    try {
        const { records } = req.body;
        const { sessionId } = req.params;
        if (!Array.isArray(records) || records.length === 0) {
            return sendError(res, 400, 'At least one attendance record is required');
        }

        const sessionDoc = await AttendanceSession.findOne({ 
            _id: sessionId, 
            tenantId: req.tenantId, 
            branchId: req.branchId 
        });

        if (!sessionDoc) return sendError(res, 404, 'Attendance session not found');
        if (sessionDoc.teacherUserId.toString() !== req.user._id.toString()) {
            return sendError(res, 403, 'Unauthorized: You did not create this session');
        }
        if (sessionDoc.status !== 'OPEN') {
            return sendError(res, 403, 'Attendance session is closed');
        }

        const allowedStatuses = new Set(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
        const normalizedRecords = records.map((record) => ({
            ...record,
            status: normalizeStatus(record.status)
        }));
        if (normalizedRecords.some((record) => !record.studentId || !allowedStatuses.has(record.status))) {
            return sendError(res, 400, 'Each record requires a student and a valid attendance status');
        }

        const enrolledStudentIds = await Enrollment.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            classId: sessionDoc.classId,
            academicYearId: sessionDoc.academicYearId,
            status: { $in: ['Current', 'Active', 'active'] }
        }).distinct('studentId');
        const allowedStudentIds = new Set(enrolledStudentIds.map((id) => id.toString()));
        if (normalizedRecords.some((record) => !allowedStudentIds.has(record.studentId.toString()))) {
            return sendError(res, 403, 'Attendance includes a student not enrolled in this class');
        }

        const recordDocs = normalizedRecords.map(r => ({
            tenantId: req.tenantId,
            branchId: req.branchId,
            sessionId: sessionDoc._id,
            studentId: r.studentId,
            status: r.status
        }));

        // Fetch original records for rollback
        const originalRecords = await AttendanceRecord.find({ sessionId: sessionDoc._id });

        try {
            await AttendanceRecord.bulkWrite(recordDocs.map((record) => ({
                updateOne: {
                    filter: { sessionId: sessionDoc._id, studentId: record.studentId },
                    update: { $set: record },
                    upsert: true
                }
            })));
            await AttendanceRecord.deleteMany({
                sessionId: sessionDoc._id,
                studentId: { $nin: recordDocs.map((record) => record.studentId) }
            });
        } catch (dbError) {
            // Rollback changes
            await AttendanceRecord.deleteMany({ sessionId: sessionDoc._id });
            if (originalRecords.length > 0) {
                const recordsToRestore = originalRecords.map(doc => doc.toObject());
                await AttendanceRecord.insertMany(recordsToRestore);
            }
            if (dbError.code === 11000) {
                return sendError(res, 409, 'Duplicate attendance record detected');
            }
            throw dbError;
        }

        for (const r of normalizedRecords) {
            if (r.status === 'ABSENT' || r.status === 'LATE') {
                try {
                    const studentUser = await User.findOne({ studentId: r.studentId, tenantId: req.tenantId });
                    if (studentUser) {
                        await createNotification({
                            tenantId: req.tenantId,
                            recipientId: studentUser._id,
                            title: `Attendance Alert: ${r.status}`,
                            message: `You were marked ${r.status.toLowerCase()} on ${new Date(sessionDoc.date).toLocaleDateString()}.`,
                            type: 'Attendance'
                        });
                    }
                    
                    const parentUser = await User.findOne({ students: r.studentId, tenantId: req.tenantId });
                    if (parentUser) {
                        const student = await Student.findOne({ _id: r.studentId, tenantId: req.tenantId, branchId: req.branchId });
                        const studentName = student ? `${student.firstName} ${student.lastName}` : 'Your child';
                        await createNotification({
                            tenantId: req.tenantId,
                            recipientId: parentUser._id,
                            title: `Attendance Alert: ${studentName}`,
                            message: `${studentName} was marked ${r.status.toLowerCase()} on ${new Date(sessionDoc.date).toLocaleDateString()}.`,
                            type: 'Attendance'
                        });
                    }
                } catch (err) {
                    console.error('Failed to dispatch attendance notification:', err);
                }
            }
        }

        await logAction({
            tenantId: req.tenantId,
            branchId: req.branchId,
            actorUserId: req.user._id,
            actorRole: 'TEACHER',
            action: 'ATTENDANCE_RECORDED',
            entityType: 'AttendanceSession',
            entityId: sessionDoc._id,
            after: { count: normalizedRecords.length },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        sendResponse(res, true, null, 'Attendance recorded successfully');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// --- I) Self Profile & Password Change ---

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-passwordHash');
        if (!user) return sendError(res, 404, 'User profile not found');
        sendResponse(res, true, user);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { phone, address, name } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return sendError(res, 404, 'User not found');

        if (phone !== undefined) user.phone = phone;
        if (address !== undefined) user.address = address;
        if (name !== undefined && String(name).trim()) user.name = name;

        await user.save();

        const updated = user.toObject();
        delete updated.passwordHash;

        sendResponse(res, true, updated, 'Profile updated successfully');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return sendError(res, 400, 'Current password and new password are required');
        }

        if (String(newPassword).length < 8) {
            return sendError(res, 400, 'New password must be at least 8 characters long');
        }

        const user = await User.findById(req.user._id);
        if (!user) return sendError(res, 404, 'User not found');

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return sendError(res, 400, 'Invalid current password');
        }

        user.passwordHash = newPassword;
        await user.save();

        sendResponse(res, true, null, 'Password changed successfully');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

