const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const Class = require('../models/Class');
const AcademicYear = require('../models/AcademicYear');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Section = require('../models/Section');
const GradingPolicy = require('../models/GradingPolicy');
const { logAction } = require('../services/auditLogService');
const {
    assertMatchingTransferGrade,
    filterMatchingGradeClasses,
    getCurrentClassForStudent,
    resolveClassFromEnrollments
} = require('../services/transferGradeService');
const {
    evaluatePromotionEligibility,
    buildPromotionDecisionSnapshot,
    isNextGradeLevel
} = require('../services/promotionEligibilityService');

const ACTIVE_ENROLLMENT_STATUSES = ['Current', 'Active', 'active'];
const objectId = (value) => String(value?._id || value || '');

// @desc    Promote students to next class
// @route   POST /api/academic/promote
const promoteStudents = async (req, res) => {
    const { studentIds, nextClassId, nextAcademicYearId } = req.body;

    try {
        if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ message: 'studentIds are required.' });
        }

        // 1. Verify nextClassId exists and belongs to the same tenant (and branch if branch-scoped)
        const classQuery = { _id: nextClassId, tenantId: req.tenantId };
        if (req.branchId) {
            classQuery.branchId = req.branchId;
        }
        const nextClass = await Class.findOne(classQuery);
        if (!nextClass) {
            return res.status(403).json({ message: 'Access denied for this academic resource.' });
        }

        // 2. Verify nextAcademicYearId belongs to the same tenant
        const nextYear = await AcademicYear.findOne({ _id: nextAcademicYearId, tenantId: req.tenantId });
        if (!nextYear) {
            return res.status(403).json({ message: 'Access denied for this academic resource.' });
        }

        // 3. Verify all studentIds exist and belong to the same tenant (and branch if branch-scoped)
        const verifiedStudents = [];
        for (const studentId of studentIds) {
            const studentQuery = { _id: studentId, tenantId: req.tenantId };
            if (req.branchId) {
                studentQuery.branchId = req.branchId;
            }
            const student = await Student.findOne(studentQuery);
            if (!student) {
                return res.status(403).json({ message: 'Access denied for this academic resource.' });
            }
            verifiedStudents.push(student);
        }

        const academicPolicy = await GradingPolicy.findOne({ tenantId: req.tenantId }).lean();
        const finalGradeLevel = String(academicPolicy?.finalGradeLevel || '12').trim().toLowerCase();

        const activeEnrollments = new Map();
        for (const student of verifiedStudents) {
            const enrollmentQuery = {
                studentId: student._id,
                tenantId: req.tenantId,
                status: { $in: ACTIVE_ENROLLMENT_STATUSES }
            };
            if (req.branchId) enrollmentQuery.branchId = req.branchId;
            const activeEnrollment = await Enrollment.findOne(enrollmentQuery).populate('classId', 'name gradeLevel');
            if (!activeEnrollment) {
                return res.status(400).json({ message: 'Every selected student must have a current enrollment.' });
            }
            if (
                activeEnrollment?.classId
                && String(activeEnrollment.classId.gradeLevel || '').trim().toLowerCase() === finalGradeLevel
            ) {
                return res.status(400).json({
                    message: `${activeEnrollment.classId.name || 'Final grade'} students must use the school graduation operation.`
                });
            }
            if (!isNextGradeLevel(activeEnrollment.classId?.gradeLevel, nextClass.gradeLevel)) {
                return res.status(400).json({ message: `${activeEnrollment.classId?.name || 'Current class'} can only be promoted to the class one grade above it.` });
            }
            if (objectId(activeEnrollment.academicYearId) === objectId(nextAcademicYearId)) {
                return res.status(400).json({ message: 'Target academic year must be different from the current academic year.' });
            }
            if (objectId(activeEnrollment.branchId) && objectId(nextClass.branchId) !== objectId(activeEnrollment.branchId)) {
                return res.status(400).json({ message: 'Class promotion must remain in the student current branch. Use transfer for another branch.' });
            }
            activeEnrollments.set(objectId(student._id), activeEnrollment);
        }

        const groupedEnrollments = new Map();
        for (const enrollment of activeEnrollments.values()) {
            const key = [objectId(enrollment.branchId), objectId(enrollment.classId), objectId(enrollment.academicYearId)].join(':');
            if (!groupedEnrollments.has(key)) groupedEnrollments.set(key, []);
            groupedEnrollments.get(key).push(enrollment);
        }

        const decisions = new Map();
        for (const enrollments of groupedEnrollments.values()) {
            const sample = enrollments[0];
            const groupDecisions = await evaluatePromotionEligibility({
                tenantId: req.tenantId,
                branchId: sample.branchId,
                classId: objectId(sample.classId),
                academicYearId: sample.academicYearId,
                enrollments
            });
            for (const [studentId, decision] of groupDecisions) decisions.set(studentId, decision);
        }

        const results = {
            promoted: 0,
            retained: 0,
            incomplete: 0,
            skippedExisting: 0,
            failed: 0,
            retainedStudents: [],
            incompleteStudents: [],
            errors: []
        };

        for (const student of verifiedStudents) {
            const studentId = objectId(student._id);
            const enrollment = activeEnrollments.get(studentId);
            const decision = decisions.get(studentId);
            const studentLabel = {
                studentId,
                admissionNumber: student.admissionNumber || '',
                name: [student.firstName, student.lastName].filter(Boolean).join(' ')
            };

            if (!decision || decision.outcome === 'Incomplete') {
                const incompleteDecision = decision || {
                    outcome: 'Incomplete', totalSubjects: 0, gradedSubjects: 0,
                    failedSubjects: 0, retentionThreshold: 0,
                    reason: 'Promotion eligibility could not be calculated.'
                };
                await Enrollment.updateOne(
                    { _id: enrollment._id, tenantId: req.tenantId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } },
                    { $set: { promotionDecision: buildPromotionDecisionSnapshot(incompleteDecision, {
                        targetAcademicYearId: nextAcademicYearId,
                        targetClassId: nextClassId
                    }) } }
                );
                results.incomplete++;
                results.incompleteStudents.push({ ...studentLabel, ...incompleteDecision });
                continue;
            }

            const retained = decision.outcome === 'Retained';
            const destinationClassId = retained ? objectId(enrollment.classId) : nextClassId;
            const destinationStatus = retained ? 'Retained' : 'Promoted';
            const snapshot = buildPromotionDecisionSnapshot(decision, {
                targetAcademicYearId: nextAcademicYearId,
                targetClassId: destinationClassId
            });
            const existingNext = await Enrollment.findOne({
                tenantId: req.tenantId,
                branchId: enrollment.branchId,
                academicYearId: nextAcademicYearId,
                studentId
            });

            if (existingNext && objectId(existingNext.classId) !== objectId(destinationClassId)) {
                results.failed++;
                results.errors.push(`${studentLabel.admissionNumber || studentId}: destination-year enrollment is in a different class.`);
                continue;
            }
            if (existingNext && !ACTIVE_ENROLLMENT_STATUSES.includes(existingNext.status)) {
                results.failed++;
                results.errors.push(`${studentLabel.admissionNumber || studentId}: destination-year enrollment is not current.`);
                continue;
            }

            let newEnrollment = null;
            try {
                if (!existingNext) {
                    newEnrollment = await Enrollment.create({
                        tenantId: req.tenantId,
                        branchId: enrollment.branchId,
                        studentId,
                        classId: destinationClassId,
                        sectionId: retained ? (enrollment.sectionId || null) : null,
                        academicYearId: nextAcademicYearId,
                        status: 'Current'
                    });
                }

                const updateResult = await Enrollment.updateOne(
                    { _id: enrollment._id, tenantId: req.tenantId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } },
                    { $set: { status: destinationStatus, promotionDecision: snapshot } }
                );
                if (updateResult.matchedCount === 0) {
                    if (newEnrollment) await Enrollment.deleteOne({ _id: newEnrollment._id, tenantId: req.tenantId });
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: enrollment changed during promotion.`);
                    continue;
                }

                if (existingNext) results.skippedExisting++;
                else if (retained) results.retained++;
                else results.promoted++;
                if (retained) results.retainedStudents.push({ ...studentLabel, ...decision });
            } catch (error) {
                if (newEnrollment?._id) {
                    await Enrollment.deleteOne({ _id: newEnrollment._id, tenantId: req.tenantId }).catch(() => {});
                }
                results.failed++;
                results.errors.push(`${studentLabel.admissionNumber || studentId}: ${error.message}`);
            }
        }

        res.status(200).json(results);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTransferBranches = async (req, res) => {
    const branches = await Branch.find({
        tenantId: req.tenantId,
        _id: { $ne: req.branchId },
        isActive: { $ne: false }
    }).select('name code').sort({ name: 1 });
    res.json({ success: true, data: branches });
};

const getTransferClasses = async (req, res) => {
    const targetBranchId = req.params.targetBranchId || req.params.branchId;
    const branch = await Branch.findOne({ _id: targetBranchId, tenantId: req.tenantId, isActive: { $ne: false } });
    if (!branch) return res.status(404).json({ success: false, message: 'Target branch not found.' });
    const classes = await Class.find({ tenantId: req.tenantId, branchId: branch._id }).select('name gradeLevel').sort({ name: 1 });
    if (!req.query.studentId) return res.json({ success: true, data: classes });
    const student = await Student.findOne({ _id: req.query.studentId, tenantId: req.tenantId, branchId: req.branchId });
    if (!student) return res.status(403).json({ success: false, message: 'Access denied for this academic resource.' });
    try {
        const sourceClass = await getCurrentClassForStudent({ tenantId: req.tenantId, studentId: student._id, branchId: req.branchId });
        return res.json({ success: true, data: filterMatchingGradeClasses(classes, sourceClass), sourceGrade: sourceClass.gradeLevel });
    } catch (error) {
        return res.status(error.statusCode || 400).json({ success: false, message: error.message });
    }
};

const getTransferSections = async (req, res) => {
    const targetBranchId = req.params.targetBranchId || req.params.branchId;
    const targetClass = await Class.findOne({
        _id: req.params.classId,
        tenantId: req.tenantId,
        branchId: targetBranchId
    });
    if (!targetClass) return res.status(404).json({ success: false, message: 'Target class not found.' });
    const sections = await Section.find({
        tenantId: req.tenantId,
        branchId: targetBranchId,
        classId: targetClass._id,
        isActive: { $ne: false }
    }).select('name capacity').sort({ name: 1 });
    res.json({ success: true, data: sections });
};

// @desc    Transfer a student from the authenticated admin's branch
// @route   POST /api/academic/transfer
const transferStudent = async (req, res) => {
    const { studentId, newBranchId, newClassId, newSectionId, newAcademicYearId, reason } = req.body;
    if (!studentId || !newBranchId || !newClassId || !newAcademicYearId) {
        return res.status(400).json({ message: 'Student, destination branch, class, and academic year are required.' });
    }
    if (req.branchId && String(newBranchId) === String(req.branchId)) {
        return res.status(400).json({ message: 'Destination branch must be different from the current branch.' });
    }

    try {
        const student = await Student.findOne({ _id: studentId, tenantId: req.tenantId, branchId: req.branchId });
        if (!student) return res.status(403).json({ message: 'Access denied for this academic resource.' });

        const [targetBranch, targetClass, targetYear] = await Promise.all([
            Branch.findOne({ _id: newBranchId, tenantId: req.tenantId, isActive: { $ne: false } }),
            Class.findOne({ _id: newClassId, tenantId: req.tenantId, branchId: newBranchId }),
            AcademicYear.findOne({ _id: newAcademicYearId, tenantId: req.tenantId, isCurrent: true })
        ]);
        if (!targetBranch || !targetClass || !targetYear) {
            return res.status(403).json({ message: 'Access denied for this academic resource.' });
        }

        let targetSection = null;
        if (newSectionId) {
            targetSection = await Section.findOne({
                _id: newSectionId,
                tenantId: req.tenantId,
                branchId: newBranchId,
                classId: newClassId,
                isActive: { $ne: false }
            });
            if (!targetSection) return res.status(400).json({ message: 'Invalid destination section.' });
            if (targetSection.capacity > 0) {
                const sectionCount = await Enrollment.countDocuments({
                    tenantId: req.tenantId,
                    branchId: newBranchId,
                    sectionId: targetSection._id,
                    academicYearId: newAcademicYearId,
                    isCurrent: true
                });
                if (sectionCount >= targetSection.capacity) return res.status(409).json({ message: 'Destination section is full.' });
            }
        }

        const currentEnrollments = await Enrollment.find({
            tenantId: req.tenantId,
            studentId,
            branchId: req.branchId,
            status: { $in: ['Current', 'Active', 'active'] }
        });
        if (currentEnrollments.length === 0) {
            return res.status(400).json({ message: 'Student has no current enrollment in this branch.' });
        }
        const sourceClass = await resolveClassFromEnrollments({
            tenantId: req.tenantId,
            branchId: req.branchId,
            enrollments: currentEnrollments
        });
        assertMatchingTransferGrade(sourceClass, targetClass);
        if (!String(reason || '').trim()) {
            return res.status(400).json({ message: 'A transfer reason is required.' });
        }

        const linkedUser = await User.findOne({ tenantId: req.tenantId, studentId, role: 'student' });
        const originalStudent = { branchId: student.branchId, status: student.status };
        const originalUserBranchId = linkedUser?.branchId;
        let newEnrollment = null;

        try {
            await Enrollment.updateMany(
                { _id: { $in: currentEnrollments.map(({ _id }) => _id) }, tenantId: req.tenantId },
                { $set: { status: 'Transferred' } }
            );
            await Student.updateOne(
                { _id: studentId, tenantId: req.tenantId, branchId: originalStudent.branchId },
                { branchId: newBranchId, status: 'Active' }
            );
            newEnrollment = await Enrollment.create({
                tenantId: req.tenantId,
                branchId: newBranchId,
                studentId,
                classId: newClassId,
                sectionId: targetSection?._id || null,
                academicYearId: newAcademicYearId,
                status: 'Current'
            });
            if (linkedUser) {
                await User.updateOne({ _id: linkedUser._id, tenantId: req.tenantId }, { branchId: newBranchId });
            }
        } catch (error) {
            if (newEnrollment) await Enrollment.deleteOne({ _id: newEnrollment._id, tenantId: req.tenantId }).catch(() => {});
            await Student.updateOne(
                { _id: studentId, tenantId: req.tenantId },
                { branchId: originalStudent.branchId, status: originalStudent.status }
            ).catch(() => {});
            if (linkedUser) await User.updateOne({ _id: linkedUser._id, tenantId: req.tenantId }, { branchId: originalUserBranchId }).catch(() => {});
            for (const enrollment of currentEnrollments) {
                await Enrollment.updateOne({ _id: enrollment._id, tenantId: req.tenantId }, { $set: { status: enrollment.status } }).catch(() => {});
            }
            throw error;
        }

        await logAction({
            tenantId: req.tenantId,
            branchId: req.branchId,
            actorUserId: req.user?._id,
            actorRole: req.user?.role || 'branch_admin',
            action: 'BRANCH_TRANSFER_OUT',
            entityType: 'Student',
            entityId: student._id.toString(),
            before: { branchId: originalStudent.branchId },
            after: { branchId: newBranchId, classId: newClassId, sectionId: targetSection?._id || null, reason: String(reason || 'Branch transfer').trim() },
            ip: req.ip,
            userAgent: req.get?.('User-Agent')
        });

        res.json({ success: true, message: 'Student transferred successfully.', data: newEnrollment });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'Student already has a current enrollment in that academic year.' });
        res.status(error.statusCode || 500).json({ message: error.message || 'Transfer failed.' });
    }
};

// @desc    Transfer a student to another class in the same branch
// @route   POST /api/academic/transfer/class
const transferStudentClass = async (req, res) => {
    const { studentId, newClassId, newSectionId, reason } = req.body;
    if (!studentId || !newClassId) {
        return res.status(400).json({ message: 'Student and destination class are required.' });
    }

    try {
        const studentQuery = { _id: studentId, tenantId: req.tenantId };
        if (req.branchId) studentQuery.branchId = req.branchId;
        const student = await Student.findOne(studentQuery);
        if (!student) return res.status(403).json({ message: 'Access denied for this academic resource.' });

        const effectiveBranchId = student.branchId || req.branchId;

        const [activeYear, targetClass] = await Promise.all([
            AcademicYear.findOne({ tenantId: req.tenantId, isCurrent: true }),
            Class.findOne({ _id: newClassId, tenantId: req.tenantId, branchId: effectiveBranchId })
        ]);

        if (!activeYear) {
            return res.status(400).json({ message: 'No active academic year found.' });
        }
        if (!targetClass) {
            return res.status(400).json({ message: 'Destination class not found in this branch.' });
        }

        let targetSection = null;
        if (newSectionId) {
            targetSection = await Section.findOne({
                _id: newSectionId,
                tenantId: req.tenantId,
                branchId: effectiveBranchId,
                classId: newClassId,
                isActive: { $ne: false }
            });
            if (!targetSection) return res.status(400).json({ message: 'Invalid destination section.' });
            if (targetSection.capacity > 0) {
                const sectionCount = await Enrollment.countDocuments({
                    tenantId: req.tenantId,
                    branchId: effectiveBranchId,
                    sectionId: targetSection._id,
                    academicYearId: activeYear._id,
                    isCurrent: true
                });
                if (sectionCount >= targetSection.capacity) {
                    return res.status(409).json({ message: 'Destination section is full.' });
                }
            }
        }

        const currentEnrollments = await Enrollment.find({
            tenantId: req.tenantId,
            studentId,
            branchId: effectiveBranchId,
            academicYearId: activeYear._id,
            status: { $in: ['Current', 'Active', 'active'] }
        }).populate('classId', 'name gradeLevel').populate('sectionId', 'name');

        if (currentEnrollments.length === 0) {
            return res.status(400).json({ message: 'Student has no active enrollment in the current academic year. Use Re-Enrollment instead.' });
        }

        const currentEnrollment = currentEnrollments[0];
        const isSameClass = String(currentEnrollment.classId?._id || currentEnrollment.classId) === String(newClassId);
        const isSameSection = String(currentEnrollment.sectionId?._id || currentEnrollment.sectionId || '') === String(newSectionId || '');

        if (isSameClass && isSameSection) {
            return res.status(400).json({ message: 'Student is already enrolled in this class and section.' });
        }

        const previousClassSnapshot = {
            classId: currentEnrollment.classId?._id || currentEnrollment.classId,
            className: currentEnrollment.classId?.name || '',
            sectionId: currentEnrollment.sectionId?._id || currentEnrollment.sectionId || null,
            sectionName: currentEnrollment.sectionId?.name || ''
        };

        let newEnrollment = null;
        try {
            await Enrollment.updateMany(
                { _id: { $in: currentEnrollments.map(({ _id }) => _id) }, tenantId: req.tenantId },
                { $set: { status: 'Transferred' } }
            );

            newEnrollment = await Enrollment.create({
                tenantId: req.tenantId,
                branchId: effectiveBranchId,
                studentId,
                classId: newClassId,
                sectionId: targetSection?._id || null,
                academicYearId: activeYear._id,
                status: 'Current'
            });

            if (student.status !== 'Active') {
                await Student.updateOne({ _id: studentId, tenantId: req.tenantId }, { status: 'Active', updatedBy: req.user?._id });
            }
        } catch (error) {
            if (newEnrollment) await Enrollment.deleteOne({ _id: newEnrollment._id, tenantId: req.tenantId }).catch(() => {});
            for (const enrollment of currentEnrollments) {
                await Enrollment.updateOne({ _id: enrollment._id, tenantId: req.tenantId }, { $set: { status: enrollment.status } }).catch(() => {});
            }
            throw error;
        }

        await logAction({
            tenantId: req.tenantId,
            branchId: effectiveBranchId,
            actorUserId: req.user?._id,
            actorRole: req.user?.role || 'branch_admin',
            action: 'STUDENT_CLASS_TRANSFER',
            entityType: 'Student',
            entityId: student._id.toString(),
            before: previousClassSnapshot,
            after: {
                classId: newClassId,
                className: targetClass.name,
                sectionId: targetSection?._id || null,
                sectionName: targetSection?.name || '',
                reason: String(reason || 'Class transfer').trim()
            },
            ip: req.ip,
            userAgent: req.get?.('User-Agent')
        });

        const populatedEnrollment = await Enrollment.findById(newEnrollment._id)
            .populate('classId', 'name gradeLevel')
            .populate('sectionId', 'name')
            .populate('academicYearId', 'name isCurrent');

        res.json({
            success: true,
            message: 'Student transferred to new class successfully.',
            data: {
                enrollment: populatedEnrollment,
                previousClass: previousClassSnapshot,
                newClass: {
                    id: targetClass._id,
                    name: targetClass.name,
                    section: targetSection?.name || null
                }
            }
        });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'Student already has an active enrollment in this academic year.' });
        res.status(error.statusCode || 500).json({ message: error.message || 'Class transfer failed.' });
    }
};

module.exports = {
    promoteStudents,
    transferStudent,
    transferStudentClass,
    getTransferBranches,
    getTransferClasses,
    getTransferSections
};
