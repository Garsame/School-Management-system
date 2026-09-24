const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const TeacherAssignment = require('../models/TeacherAssignment');
const Branch = require('../models/Branch');
const Class = require('../models/Class');
const AcademicYear = require('../models/AcademicYear');
const Section = require('../models/Section');
const User = require('../models/User');
const { generateTemporaryPassword } = require('../utils/passwords');
const { normalizeDate } = require('../utils/userProfile');
const { provisionParentAccess, rollbackParentAccess } = require('../services/parentAccessService');
const { buildStudentSearchCriteria } = require('../utils/studentSearch');

const applyBranchScope = (req, query) => {
    if (req.scope === 'branch') query.branchId = req.branchId;
    return query;
};

const canAccessStudent = (req, studentId) => {
    if (req.role === 'student') return req.user.studentId?.toString() === studentId.toString();
    if (req.role === 'parent') {
        return (req.user.students || []).some((id) => id.toString() === studentId.toString());
    }
    return true;
};

// @desc    Admit a new student
// @route   POST /api/students
const admitStudent = async (req, res) => {
    let { 
        admissionNumber, firstName, middleName, lastName, preferredName, DOB, gender, guardianInfo,
        admissionDate, nationality, placeOfBirth, primaryLanguage, previousSchool,
        classId, academicYearId, branchId, sectionId
    } = req.body;

    try {
        if (!admissionNumber || !firstName || !lastName || !classId || !academicYearId) {
            return res.status(400).json({ message: 'Admission number, student name, class, and academic year are required' });
        }

        if (gender) gender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
        const normalizedDob = DOB ? normalizeDate(DOB, 'Date of birth') : DOB;
        const normalizedGuardian = {
            ...(guardianInfo || {}),
            phone: guardianInfo?.phone ? String(guardianInfo.phone).trim() : undefined,
            email: guardianInfo?.email ? String(guardianInfo.email).trim().toLowerCase() : undefined,
            relationship: guardianInfo?.relationship || 'Guardian'
        };
        
        if (req.scope === 'branch') branchId = req.branchId;
        else if (!branchId) {
            const defaultBranch = await Branch.findOne({ tenantId: req.tenantId, isActive: true });
            branchId = defaultBranch?._id;
        }

        const branch = branchId && await Branch.findOne({ _id: branchId, tenantId: req.tenantId, isActive: true });
        if (!branch) return res.status(400).json({ message: 'A valid active branch is required' });

        // Validate class
        const targetClass = await Class.findOne({ _id: classId, tenantId: req.tenantId, branchId });
        if (!targetClass) {
            return res.status(400).json({ message: 'Invalid class for this branch.' });
        }

        // Validate academic year
        const targetYear = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId });
        if (!targetYear) {
            return res.status(400).json({ message: 'Invalid academic year for this tenant.' });
        }

        // Validate section (if provided)
        let resolvedSectionId = null;
        if (sectionId) {
            const section = await Section.findOne({
                _id: sectionId,
                tenantId: req.tenantId,
                branchId,
                classId,
                isActive: { $ne: false }
            });
            if (!section) {
                return res.status(400).json({ message: 'Invalid section for this class or branch.' });
            }

            // Enforce capacity check if section capacity exists
            if (section.capacity && section.capacity > 0) {
                const activeCount = await Enrollment.countDocuments({
                    tenantId: req.tenantId,
                    branchId,
                    sectionId: section._id,
                    academicYearId,
                    status: { $in: ['Current', 'Active', 'current', 'active'] }
                });
                if (activeCount >= section.capacity) {
                    return res.status(400).json({ message: 'Section capacity has been reached.' });
                }
            }
            resolvedSectionId = section._id;
        }

        const existingStudent = await Student.findOne({
            tenantId: req.tenantId,
            admissionNumber
        });
        if (existingStudent) {
            return res.status(409).json({ message: 'Admission number already exists for this school.' });
        }
        if (!normalizedGuardian.email) {
            return res.status(400).json({ message: 'Guardian email is required for parent portal access.' });
        }

        const loginUsername = String(admissionNumber).trim().toUpperCase();
        const student = await Student.create({
            tenantId: req.tenantId,
            branchId,
            admissionNumber,
            studentCode: loginUsername,
            firstName: String(firstName).trim(),
            middleName,
            lastName: String(lastName).trim(),
            preferredName,
            DOB: normalizedDob,
            gender,
            admissionDate: admissionDate ? normalizeDate(admissionDate, 'Admission date', { allowFuture: true }) : new Date(),
            nationality,
            placeOfBirth,
            primaryLanguage,
            previousSchool,
            guardianInfo: normalizedGuardian,
            createdBy: req.user?._id,
            updatedBy: req.user?._id
        });

        let studentUser;
        let enrollment;
        let parentProvision;
        try {
            const temporaryPassword = generateTemporaryPassword();
            studentUser = await User.create({
                tenantId: req.tenantId,
                branchId,
                studentId: student._id,
                name: `${firstName} ${lastName}`,
                username: loginUsername,
                passwordHash: temporaryPassword,
                role: 'student',
                scope: 'branch',
                mustChangePassword: true,
                isActive: true,
                createdBy: req.user?._id,
                updatedBy: req.user?._id
            });
            enrollment = await Enrollment.create({
                tenantId: req.tenantId,
                branchId,
                studentId: student._id,
                classId,
                sectionId: resolvedSectionId || null,
                academicYearId,
                status: 'Current'
            });
            parentProvision = await provisionParentAccess({
                tenantId: req.tenantId,
                student,
                guardianInfo: normalizedGuardian,
                actorUserId: req.user?._id
            });
            return res.status(201).json({
                student,
                enrollment,
                account: { username: loginUsername, temporaryPassword },
                parentAccount: {
                    email: parentProvision.parentUser.email,
                    created: parentProvision.createdParentUser,
                    active: parentProvision.parentUser.isActive,
                    temporaryPassword: parentProvision.temporaryPassword
                }
            });
        } catch (error) {
            await rollbackParentAccess(parentProvision, req.tenantId, student._id);
            if (enrollment) await Enrollment.deleteOne({ _id: enrollment._id, tenantId: req.tenantId }).catch(() => {});
            if (studentUser) await User.deleteOne({ _id: studentUser._id, tenantId: req.tenantId }).catch(() => {});
            await Student.deleteOne({ _id: student._id, tenantId: req.tenantId });
            throw error;
        }
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        if (error.code === 11000) {
            const errStr = JSON.stringify(error.keyValue || error.message || '');
            if (errStr.includes('admissionNumber') || errStr.includes('studentCode')) {
                return res.status(409).json({ message: 'Admission number already exists for this school.' });
            }
            if (errStr.includes('email')) {
                return res.status(409).json({ message: 'Email already exists for this school.' });
            }
            return res.status(409).json({ message: 'Duplicate key error.' });
        }
        res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Admission could not be completed.' });
    }
};

const getStudents = async (req, res) => {
    try {
        const query = applyBranchScope(req, { tenantId: req.tenantId });
        const { q, classId, sectionId, academicYearId, branchId, status } = req.query;
        if (branchId && req.scope !== 'branch') query.branchId = branchId;
        if (status) query.status = status;
        if (q && String(q).trim()) {
            const criteria = buildStudentSearchCriteria(q);
            if (criteria.length) {
                query.$and = (query.$and || []).concat(criteria);
            }
        }
        
        if (req.role === 'teacher') {
            const assignments = await TeacherAssignment.find({
                tenantId: req.tenantId,
                branchId: req.branchId,
                teacherUserId: req.user._id,
                isActive: true
            });
            const classIds = assignments.map(a => a.classId);
            
            const enrollments = await Enrollment.find({ 
                tenantId: req.tenantId,
                branchId: req.branchId,
                classId: { $in: classIds }, 
                status: { $in: ['Current', 'Active', 'active'] } 
            }).select('studentId');
            
            query._id = { $in: enrollments.map(e => e.studentId) };
        }
        if ((classId || sectionId || academicYearId) && req.role !== 'teacher') {
            const enrollments = await Enrollment.find({
                tenantId: req.tenantId,
                ...(req.scope === 'branch' ? { branchId: req.branchId } : {}),
                ...(branchId && req.scope !== 'branch' ? { branchId } : {}),
                ...(classId ? { classId } : {}),
                ...(sectionId ? { sectionId } : {}),
                ...(academicYearId ? { academicYearId } : { status: { $in: ['Current', 'Active', 'active'] } })
            }).select('studentId');
            query._id = { $in: [...new Set(enrollments.map((enrollment) => String(enrollment.studentId)))] };
        }

        const students = await Student.find(query).sort({ createdAt: -1 });
        const currentEnrollmentQuery = {
            tenantId: req.tenantId,
            studentId: { $in: students.map((student) => student._id) },
            status: { $in: ['Current', 'Active', 'active'] }
        };
        if (req.scope === 'branch') currentEnrollmentQuery.branchId = req.branchId;
        const currentEnrollments = await Enrollment.find(currentEnrollmentQuery)
            .populate('classId', 'name gradeLevel')
            .populate('sectionId', 'name')
            .populate('academicYearId', 'name isCurrent')
            .populate('branchId', 'name')
            .sort({ createdAt: -1 });
        const currentByStudent = new Map();
        currentEnrollments.forEach((enrollment) => {
            const key = String(enrollment.studentId);
            if (!currentByStudent.has(key)) currentByStudent.set(key, enrollment);
        });
        const latestEnrollments = await Enrollment.find({
            tenantId: req.tenantId,
            studentId: { $in: students.map((student) => student._id) },
            ...(req.scope === 'branch' ? { branchId: req.branchId } : {})
        })
            .populate('classId', 'name gradeLevel')
            .populate('sectionId', 'name')
            .populate('academicYearId', 'name isCurrent endDate')
            .populate('branchId', 'name')
            .sort({ createdAt: -1 });
        const latestByStudent = new Map();
        latestEnrollments.forEach((enrollment) => {
            const key = String(enrollment.studentId);
            if (!latestByStudent.has(key)) latestByStudent.set(key, enrollment);
        });
        res.json(students.map((student) => ({
            ...student.toObject(),
            currentEnrollment: currentByStudent.get(String(student._id)) || null,
            latestEnrollment: latestByStudent.get(String(student._id)) || null
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getStudentDetails = async (req, res) => {
    try {
        if (!canAccessStudent(req, req.params.id)) {
            return res.status(403).json({ message: 'Not authorized to access this student' });
        }

        const studentQuery = applyBranchScope(req, { _id: req.params.id, tenantId: req.tenantId });
        const student = await Student.findOne(studentQuery);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const historyQuery = { tenantId: req.tenantId, studentId: student._id };
        if (req.scope === 'branch') historyQuery.branchId = req.branchId;
        const enrollments = await Enrollment.find(historyQuery)
            .populate('classId', 'name gradeLevel')
            .populate('sectionId', 'name')
            .populate('academicYearId', 'name isCurrent')
            .populate('branchId', 'name')
            .populate('promotionDecision.targetAcademicYearId', 'name')
            .populate('promotionDecision.targetClassId', 'name gradeLevel')
            .sort({ createdAt: -1 });
        const enrollment = enrollments.find((item) => ['Current', 'Active', 'active'].includes(item.status)) || null;
        res.json({ student, enrollment, enrollments });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getStudentsByClass = async (req, res) => {
    try {
        const { classId } = req.params;
        if (req.role === 'teacher') {
            const assigned = await TeacherAssignment.exists({
                tenantId: req.tenantId,
                branchId: req.branchId,
                teacherUserId: req.user._id,
                classId,
                isActive: true
            });
            if (!assigned) return res.status(403).json({ message: 'Not assigned to this class' });
        }

        const enrollmentQuery = applyBranchScope(req, {
            classId, 
            status: { $in: ['Current', 'Active', 'active'] },
            tenantId: req.tenantId
        });
        const enrollments = await Enrollment.find(enrollmentQuery).populate('studentId');

        const students = enrollments
            .filter(e => e.studentId)
            .map(e => e.studentId);
            
        res.json(students);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { admitStudent, getStudents, getStudentDetails, getStudentsByClass };
