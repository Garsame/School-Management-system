const Class = require('../models/Class');
const Enrollment = require('../models/Enrollment');
const { isSameGradeLevel } = require('../utils/gradeLevel');

const ACTIVE_ENROLLMENT_STATUSES = ['Current', 'Active', 'active'];
const objectId = (value) => String(value?._id || value || '');
const transferError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const resolveClassFromEnrollments = async ({ tenantId, branchId, enrollments }) => {
    const classIds = [...new Set((enrollments || []).map((enrollment) => objectId(enrollment.classId)).filter(Boolean))];
    if (classIds.length !== 1) {
        throw transferError('Student must have exactly one current class before branch transfer.');
    }
    const sourceClass = await Class.findOne({ _id: classIds[0], tenantId, branchId });
    if (!sourceClass) throw transferError('The student current class could not be verified.');
    return sourceClass;
};

const getCurrentClassForStudent = async ({ tenantId, studentId, branchId }) => {
    const enrollment = await Enrollment.findOne({
        tenantId,
        studentId,
        ...(branchId ? { branchId } : {}),
        status: { $in: ACTIVE_ENROLLMENT_STATUSES }
    });
    if (!enrollment) throw transferError('Student has no current enrollment.');
    return resolveClassFromEnrollments({ tenantId, branchId: enrollment.branchId || branchId, enrollments: [enrollment] });
};

const assertMatchingTransferGrade = (sourceClass, targetClass) => {
    if (!isSameGradeLevel(sourceClass?.gradeLevel, targetClass?.gradeLevel)) {
        throw transferError(
            `Grade mismatch: ${sourceClass?.name || 'the current class'} can only transfer to the same grade in another branch. ` +
            `Selected destination is ${targetClass?.name || 'a different grade'}. Use the promotion process to change grade.`
        );
    }
};

const filterMatchingGradeClasses = (classes, sourceClass) => (
    (classes || []).filter((targetClass) => isSameGradeLevel(sourceClass?.gradeLevel, targetClass?.gradeLevel))
);

module.exports = {
    assertMatchingTransferGrade,
    filterMatchingGradeClasses,
    getCurrentClassForStudent,
    resolveClassFromEnrollments
};
