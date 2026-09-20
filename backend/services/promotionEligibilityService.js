const ClassSubject = require('../models/ClassSubject');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const { resolvePassMarkPercent } = require('../utils/grading');

const objectId = (value) => String(value?._id || value || '');

const gradeNumber = (value) => {
    const match = String(value ?? '').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
};

const isNextGradeLevel = (fromGradeLevel, toGradeLevel) => {
    const fromGrade = gradeNumber(fromGradeLevel);
    const toGrade = gradeNumber(toGradeLevel);
    return Number.isFinite(fromGrade) && Number.isFinite(toGrade) && toGrade === fromGrade + 1;
};

const classifyPromotion = ({ totalSubjects, gradedSubjects, failedSubjects }) => {
    const total = Math.max(0, Number(totalSubjects) || 0);
    const graded = Math.max(0, Number(gradedSubjects) || 0);
    const failed = Math.max(0, Number(failedSubjects) || 0);
    const retentionThreshold = total > 0 ? Math.ceil(total / 2) : 0;

    if (total === 0) {
        return {
            outcome: 'Incomplete',
            retentionThreshold,
            reason: 'No subjects are configured for this class and academic year.'
        };
    }
    if (graded < total) {
        return {
            outcome: 'Incomplete',
            retentionThreshold,
            reason: `${total - graded} of ${total} subjects do not have results.`
        };
    }
    if (failed >= retentionThreshold) {
        return {
            outcome: 'Retained',
            retentionThreshold,
            reason: `Failed ${failed} of ${total} subjects; the retention threshold is ${retentionThreshold}.`
        };
    }
    return {
        outcome: 'Promoted',
        retentionThreshold,
        reason: `Failed ${failed} of ${total} subjects; fewer than ${retentionThreshold}.`
    };
};

const evaluatePromotionEligibility = async ({ tenantId, branchId, classId, academicYearId, enrollments }) => {
    const studentIds = [...new Set((enrollments || []).map((enrollment) => objectId(enrollment.studentId)).filter(Boolean))];
    if (!studentIds.length) return new Map();

    const [curriculum, exams] = await Promise.all([
        ClassSubject.find({
            tenantId,
            branchId,
            classId,
            isActive: { $ne: false },
            $or: [
                { academicYearId },
                { academicYearId: null },
                { academicYearId: { $exists: false } }
            ]
        }).lean(),
        Exam.find({ tenantId, branchId, classId, academicYearId })
            .select('_id subjectId')
            .lean()
    ]);

    const examSubjectById = new Map(exams.map((exam) => [objectId(exam._id), objectId(exam.subjectId)]));
    const examIds = exams.map((exam) => exam._id);
    const recordedResults = examIds.length
        ? await Result.find({
            tenantId,
            branchId,
            examId: { $in: examIds },
            studentId: { $in: studentIds }
        }).select('studentId examId marksObtained maxScore percentage passMarkPercent status isAbsent').lean()
        : [];

    const resultsByStudent = new Map();
    for (const result of recordedResults) {
        const studentId = objectId(result.studentId);
        const subjectId = examSubjectById.get(objectId(result.examId));
        if (!subjectId) continue;
        if (!resultsByStudent.has(studentId)) resultsByStudent.set(studentId, new Map());
        const subjectResults = resultsByStudent.get(studentId);
        if (!subjectResults.has(subjectId)) subjectResults.set(subjectId, []);
        subjectResults.get(subjectId).push(result);
    }

    const fallbackSubjectIds = [...new Set(exams.map((exam) => objectId(exam.subjectId)).filter(Boolean))];
    const decisions = new Map();

    for (const enrollment of enrollments) {
        const studentId = objectId(enrollment.studentId);
        const sectionId = objectId(enrollment.sectionId);
        const subjectConfig = new Map();
        const subjectConfigRank = new Map();

        for (const item of curriculum) {
            const itemSectionId = objectId(item.sectionId);
            if (itemSectionId && itemSectionId !== sectionId) continue;
            const subjectId = objectId(item.subjectId);
            const isExactYear = objectId(item.academicYearId) === objectId(academicYearId);
            const rank = (isExactYear ? 2 : 0) + (itemSectionId ? 1 : 0);
            if (!subjectConfig.has(subjectId) || rank > subjectConfigRank.get(subjectId)) {
                subjectConfig.set(subjectId, item);
                subjectConfigRank.set(subjectId, rank);
            }
        }

        if (!subjectConfig.size) {
            fallbackSubjectIds.forEach((subjectId) => subjectConfig.set(subjectId, null));
        }

        const subjectResults = resultsByStudent.get(studentId) || new Map();
        const subjects = [];
        let failedSubjects = 0;
        let gradedSubjects = 0;

        for (const [subjectId, config] of subjectConfig) {
            const entries = subjectResults.get(subjectId) || [];
            const totalMarks = entries.reduce((sum, result) => sum + Number(result.marksObtained || 0), 0);
            const totalMax = entries.reduce((sum, result) => sum + Number(result.maxScore || 0), 0);
            const graded = entries.length > 0 && totalMax > 0;
            const percentage = graded ? (totalMarks / totalMax) * 100 : null;
            const resultPassMark = entries.find((result) => Number.isFinite(Number(result.passMarkPercent)))?.passMarkPercent;
            const passMarkPercent = resolvePassMarkPercent(config || { passMarkPercent: resultPassMark }, 40);
            const failed = graded && percentage < passMarkPercent;

            if (graded) gradedSubjects += 1;
            if (failed) failedSubjects += 1;
            subjects.push({ subjectId, graded, failed, percentage, passMarkPercent });
        }

        const totalSubjects = subjects.length;
        const classification = classifyPromotion({ totalSubjects, gradedSubjects, failedSubjects });
        decisions.set(studentId, {
            ...classification,
            totalSubjects,
            gradedSubjects,
            failedSubjects,
            subjects
        });
    }

    return decisions;
};

const buildPromotionDecisionSnapshot = (decision, { targetAcademicYearId, targetClassId, outcome = decision.outcome }) => ({
    outcome,
    totalSubjects: decision.totalSubjects,
    gradedSubjects: decision.gradedSubjects,
    failedSubjects: decision.failedSubjects,
    retentionThreshold: decision.retentionThreshold,
    reason: decision.reason,
    targetAcademicYearId,
    targetClassId,
    evaluatedAt: new Date()
});

module.exports = {
    classifyPromotion,
    isNextGradeLevel,
    evaluatePromotionEligibility,
    buildPromotionDecisionSnapshot
};
