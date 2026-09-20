const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const Class = require('../models/Class');
const User = require('../models/User');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const AcademicYear = require('../models/AcademicYear');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const TeacherAssignment = require('../models/TeacherAssignment');
const ClassCategory = require('../models/ClassCategory');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const ClassSubject = require('../models/ClassSubject');
const ExamCategory = require('../models/ExamCategory');
const Term = require('../models/Term');
const GradingPolicy = require('../models/GradingPolicy');
const { logAction } = require('../services/auditLogService');
const { evaluatePromotionEligibility, buildPromotionDecisionSnapshot, isNextGradeLevel } = require('../services/promotionEligibilityService');
const { resolvePassMarkPercent } = require('../utils/grading');
const { buildProfileFields, withoutCompensationFields } = require('../utils/userProfile');
const { buildStudentSearchCriteria } = require('../utils/studentSearch');
const exportService = require('../services/exportService');

const ACTIVE_ENROLLMENT_STATUSES = ['Current', 'Active', 'active'];

const buildBranchResultsQuery = async (req) => {
    const { examId, classId, studentId } = req.query;
    const query = {
        tenantId: req.user.tenantId,
        branchId: req.user.branchId
    };

    if (classId) {
        const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!cls) {
            const error = new Error('Access denied for this branch resource.');
            error.statusCode = 403;
            throw error;
        }
    }

    if (examId) {
        const examQuery = { _id: examId, tenantId: req.user.tenantId, branchId: req.user.branchId };
        if (classId) examQuery.classId = classId;
        const ex = await Exam.findOne(examQuery);
        if (!ex) {
            const error = new Error('Access denied for this branch resource.');
            error.statusCode = 403;
            throw error;
        }
        query.examId = examId;
    } else if (classId) {
        const exams = await Exam.find({ tenantId: req.user.tenantId, branchId: req.user.branchId, classId }).select('_id');
        query.examId = { $in: exams.map(exam => exam._id) };
    }

    if (studentId) {
        const stud = await Student.findOne({ _id: studentId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!stud) {
            const error = new Error('Access denied for this branch resource.');
            error.statusCode = 403;
            throw error;
        }
        query.studentId = studentId;
    }

    return query;
};

// Helper for standard responses
const sendResponse = (res, success, data = null, message = '') => {
    return res.json({ success, message, data });
};

const sendError = (res, code, message, errors = []) => {
    return res.status(code).json({ success: false, message, errors });
};

// --- B) Class Management ---

exports.createClass = async (req, res) => {
    try {
        const { name, gradeLevel, categoryId } = req.body;
 
        if (!name || !gradeLevel || !categoryId) {
            return sendError(res, 400, 'Validation Error', [{ field: 'name/gradeLevel/categoryId', message: 'Required' }]);
        }
 
        // Check duplicate
        const existingClass = await Class.findOne({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            name
        });
 
        if (existingClass) {
            return sendError(res, 400, 'Class with this name already exists in this branch');
        }
 
        const newClass = await Class.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            categoryId,
            name,
            gradeLevel
        });

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: req.user.role,
            action: 'CLASS_CREATED',
            entityType: 'Class',
            entityId: newClass._id.toString(),
            after: newClass.toObject(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        sendResponse(res, true, newClass, 'Class created successfully');
    } catch (error) {
        console.error('createClass Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.getClasses = async (req, res) => {
    try {
        const classes = await Class.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        })
        .populate('categoryId', 'name')
        .sort({ name: 1 });
 
        sendResponse(res, true, classes);
    } catch (error) {
        console.error('getClasses Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.getClass = async (req, res) => {
    try {
        const classExists = await Class.findOne({ _id: req.params.classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!classExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        sendResponse(res, true, classExists);
    } catch (error) {
        console.error('getClass Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.updateClass = async (req, res) => {
    try {
        const { name, gradeLevel } = req.body;
        
        const classExists = await Class.findOne({ _id: req.params.classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!classExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const cls = classExists;
        const beforeSnapshot = cls.toObject();

        if (name) cls.name = name;
        if (gradeLevel) cls.gradeLevel = gradeLevel;

        await cls.save();

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: req.user.role,
            action: 'CLASS_UPDATED',
            entityType: 'Class',
            entityId: cls._id.toString(),
            before: beforeSnapshot,
            after: cls.toObject(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        sendResponse(res, true, cls, 'Class updated successfully');
    } catch (error) {
        console.error('updateClass Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.getCurrentAcademicYear = async (req, res) => {
    try {
        // Academic Years are tenant-wide usually, request said "tenantId only use"
        const academicYear = await AcademicYear.findOne({
            tenantId: req.user.tenantId,
            isCurrent: true
        });

        if (!academicYear) return sendError(res, 404, 'No active academic year set for tenant');

        sendResponse(res, true, academicYear);
    } catch (error) {
        console.error('getCurrentAcademicYear Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.getAcademicYears = async (req, res) => {
    try {
        const academicYears = await AcademicYear.find({ tenantId: req.user.tenantId })
            .sort({ startDate: 1, createdAt: 1 });
        sendResponse(res, true, academicYears);
    } catch (error) {
        console.error('getAcademicYears Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

// --- C) Branch Staff Management ---

exports.createBranchUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role || String(password).length < 8) {
            return sendError(res, 400, 'Name, email, role, and a password of at least 8 characters are required');
        }
        const normalizedEmail = String(email).trim().toLowerCase();

        // Validation
        const validRoles = ['teacher', 'cashier', 'registrar'];
        if (!validRoles.includes(role.toLowerCase())) {
            return sendError(res, 400, 'Invalid role. Allowed: TEACHER, CASHIER, REGISTRAR');
        }

        if (role.toLowerCase() === 'teacher') {
            const employment = req.body.employmentInfo || {};
            const requiredTeacherFields = [
                [req.body.phone, 'Phone'],
                [employment.employmentType, 'Employment type'],
                [employment.hireDate, 'Hire date'],
                [employment.specialization, 'Primary specialization'],
                [employment.qualifiedSubjects, 'Qualified subjects'],
                [employment.qualifications, 'Qualifications or certificates'],
                [employment.yearsExperience, 'Teaching experience']
            ];
            const missingField = requiredTeacherFields.find(([value]) => (
                value === undefined || value === null || String(value).trim() === ''
            ));
            if (missingField) {
                return sendError(res, 400, `${missingField[1]} is required for a teacher`);
            }
        }

        // Check Existence
        const existingUser = await User.findOne({ 
            tenantId: req.user.tenantId, 
            email: normalizedEmail
        });
        if (existingUser) {
            return sendError(res, 409, 'Email already exists for this school.');
        }

        const profileFields = buildProfileFields(withoutCompensationFields(req.body), role.toLowerCase());
        const newUser = new User({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId, // Enforce branch
            name,
            email: normalizedEmail,
            passwordHash: password, // Pre-save hook will hash this
            role: role.toLowerCase(),
            scope: 'branch',
            authorizedBranchIds: role.toLowerCase() === 'teacher' ? [req.user.branchId] : [],
            mustChangePassword: true,
            isActive: true,
            createdBy: req.user._id,
            updatedBy: req.user._id,
            ...profileFields
        });

        await newUser.save();

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: req.user.role,
            action: 'BRANCH_USER_CREATED',
            entityType: 'User',
            entityId: newUser._id.toString(),
            after: { name, email, role, scope: 'branch' },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Return without password
        const userObj = newUser.toObject();
        delete userObj.passwordHash;

        sendResponse(res, true, userObj, 'Branch user created');
    } catch (error) {
        console.error('createBranchUser Error:', error);
        if (error.code === 11000) return sendError(res, 409, 'Employee ID or email already exists for this school.');
        sendError(res, error.statusCode || 500, error.statusCode ? error.message : 'Server Error');
    }
};

exports.getBranchUsers = async (req, res) => {
    try {
        const { role } = req.query;
        const normalizedRole = String(role || '').trim().toLowerCase();
        if (normalizedRole && !['teacher', 'cashier', 'registrar'].includes(normalizedRole)) {
            return sendError(res, 403, 'This branch role cannot be managed here');
        }
        const query = {
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        };
        if (normalizedRole) query.role = normalizedRole;
        if (normalizedRole === 'teacher') {
            delete query.branchId;
            query.$or = [
                { branchId: req.user.branchId },
                { authorizedBranchIds: req.user.branchId }
            ];
        }

        const users = await User.find(query).select('-passwordHash');
        const canViewPayroll = (req.permissions || []).includes('payroll.view');
        const safeUsers = users.map((user) => {
            const value = user.toObject?.() || { ...user };
            if (!canViewPayroll && value.employmentInfo) {
                delete value.employmentInfo.basicSalary;
                delete value.employmentInfo.allowance;
                delete value.employmentInfo.deductions;
                delete value.employmentInfo.bankName;
                delete value.employmentInfo.accountName;
                delete value.employmentInfo.accountNumber;
                delete value.employmentInfo.mobileMoneyNumber;
            }
            return value;
        });
        sendResponse(res, true, safeUsers);
    } catch (error) {
        console.error('getBranchUsers Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.updateBranchUser = async (req, res) => {
    try {
        const { name, password, isActive } = req.body;
        const userToUpdate = await User.findOne({
            _id: req.params.userId,
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        });

        if (!userToUpdate) return sendError(res, 404, 'User not found');

        // Prevent modification of higher roles or self-lockout risk logic if needed
        // Since we filtered by branchId and tenantId, and logic restricts creating only lower roles, it should be safe.
        // But double check the role being edited isn't equivalent or higher if that logic existed.
        // For now, prompt: "Branch Admin can create and manage only... TEACHER, CASHIER, REGISTRAR"
        
        const validRoles = ['teacher', 'cashier', 'registrar'];
        if (!validRoles.includes(userToUpdate.role)) {
             return sendError(res, 403, 'Permission denied: Cannot edit this user role');
        }

        const beforeSnapshot = userToUpdate.toObject();
        delete beforeSnapshot.passwordHash;

        if (name) userToUpdate.name = name;
        if (password) userToUpdate.passwordHash = password; // Will be hashed
        if (typeof isActive !== 'undefined') userToUpdate.isActive = isActive;
        Object.assign(userToUpdate, buildProfileFields(withoutCompensationFields(req.body), userToUpdate.role, { existing: userToUpdate, preserveCompensation: true }));
        userToUpdate.updatedBy = req.user._id;
        if (typeof isActive !== 'undefined') {
            if (isActive) {
                userToUpdate.deactivatedAt = undefined;
                userToUpdate.deactivationReason = undefined;
            } else {
                userToUpdate.deactivatedAt = new Date();
                userToUpdate.deactivationReason = String(req.body.reason || 'Deactivated by branch administrator').trim();
                userToUpdate.security = userToUpdate.security || {};
                userToUpdate.security.tokenVersion = (userToUpdate.security?.tokenVersion || 0) + 1;
            }
        }

        await userToUpdate.save();

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: req.user.role,
            action: 'BRANCH_USER_UPDATED',
            entityType: 'User',
            entityId: userToUpdate._id.toString(),
            before: beforeSnapshot,
            after: { name: userToUpdate.name, isActive: userToUpdate.isActive },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const updatedUser = userToUpdate.toObject();
        delete updatedUser.passwordHash;
        sendResponse(res, true, updatedUser, 'User updated');
    } catch (error) {
        console.error('updateBranchUser Error:', error);
        if (error.code === 11000) return sendError(res, 409, 'Employee ID already exists for this school.');
        sendError(res, error.statusCode || 500, error.statusCode ? error.message : 'Server Error');
    }
};

// --- C.1) Teacher Assignments Management ---

exports.createTeacherWithAssignments = async (req, res) => {
    // Manual rollback tracking — works on standalone MongoDB (no replica set required)
    let createdUserId = null;
    const createdAssignmentIds = [];

    try {
        const { name, email, password, assignments } = req.body;
        if (!name || !email || !password || String(password).length < 8) {
            return sendError(res, 400, 'Name, email, and a password of at least 8 characters are required');
        }
        const normalizedEmail = String(email).trim().toLowerCase();

        // 1. Duplicate email check
        const existingUser = await User.findOne({ tenantId: req.user.tenantId, email: normalizedEmail });
        if (existingUser) {
            return sendError(res, 409, 'Email already exists for this school.');
        }

        // 2. Validate assignments payload before touching the DB
        if (assignments && assignments.length > 0) {
            const invalid = assignments.find(a => !a.subjectId || !a.classId || !a.academicYearId);
            if (invalid) {
                return sendError(res, 400, 'Each assignment must include classId, subjectId, and academicYearId');
            }

            const uniqueKey = new Set();
            for (const a of assignments) {
                const key = `${a.classId}:${a.sectionId || 'none'}:${a.subjectId}:${a.academicYearId}`;
                if (uniqueKey.has(key)) {
                    return sendError(res, 400, 'Duplicate assignment detected in request payload');
                }
                uniqueKey.add(key);
            }

            // Validate all request-supplied IDs against the DB
            for (const a of assignments) {
                const academicYear = await AcademicYear.findOne({ _id: a.academicYearId, tenantId: req.user.tenantId });
                if (!academicYear) {
                    return sendError(res, 403, 'Access denied for this branch resource.');
                }

                const classObj = await Class.findOne({ _id: a.classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
                if (!classObj) {
                    return sendError(res, 403, 'Access denied for this branch resource.');
                }

                if (a.sectionId) {
                    const section = await Section.findOne({ _id: a.sectionId, tenantId: req.user.tenantId, branchId: req.user.branchId, classId: a.classId });
                    if (!section) {
                        return sendError(res, 403, 'Access denied for this branch resource.');
                    }
                }

                const subject = await Subject.findOne({ _id: a.subjectId, tenantId: req.user.tenantId });
                if (!subject) {
                    return sendError(res, 403, 'Access denied for this branch resource.');
                }
                if (subject.branchId && String(subject.branchId) !== String(req.user.branchId)) {
                    return sendError(res, 403, 'Access denied for this branch resource.');
                }
            }
        }

        // 3. Create teacher User
        const profileFields = buildProfileFields(withoutCompensationFields(req.body), 'teacher');
        const newUser = new User({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            name,
            email: normalizedEmail,
            passwordHash: password,
            role: 'teacher',
            scope: 'branch',
            authorizedBranchIds: [req.user.branchId],
            mustChangePassword: true,
            createdBy: req.user._id,
            updatedBy: req.user._id,
            ...profileFields
        });
        await newUser.save();
        createdUserId = newUser._id;

        // 4. Create assignments one-by-one so we can track and roll back on failure
        if (assignments && assignments.length > 0) {
            for (const a of assignments) {
                const [doc] = await TeacherAssignment.create([{
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    teacherUserId: newUser._id,
                    academicYearId: a.academicYearId,
                    classId: a.classId,
                    sectionId: a.sectionId || null,
                    subjectId: a.subjectId,
                    subject: a.subjectId,
                    isActive: true
                }]);
                createdAssignmentIds.push(doc._id);
            }
        }

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: req.user.role,
            action: 'BRANCH_TEACHER_CREATED',
            entityType: 'User',
            entityId: newUser._id.toString(),
            after: { name, email, assignmentsCount: assignments?.length || 0 },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const userObj = newUser.toObject();
        delete userObj.passwordHash;
        sendResponse(res, true, userObj, 'Teacher created with assignments');
    } catch (error) {
        // Manual rollback: remove any assignments created so far, then the user
        if (createdAssignmentIds.length > 0) {
            await TeacherAssignment.deleteMany({ _id: { $in: createdAssignmentIds } }).catch(() => {});
        }
        if (createdUserId) {
            await User.deleteOne({ _id: createdUserId }).catch(() => {});
        }
        console.error('createTeacherWithAssignments Error:', error);
        const statusCode = error.code === 11000 ? 409 : (error.statusCode || 500);
        const message = statusCode === 409
            ? 'Employee ID or email already exists for this school.'
            : (error.statusCode ? error.message : 'Failed to create teacher. Any partial data has been rolled back.');
        sendError(res, statusCode, message);
    }
};

exports.updateTeacherAssignments = async (req, res) => {
    try {
        const { assignments } = req.body;
        const { teacherUserId } = req.params;

        const teacher = await User.findOne({
            _id: teacherUserId,
            tenantId: req.user.tenantId,
            role: 'teacher',
            $or: [{ branchId: req.user.branchId }, { authorizedBranchIds: req.user.branchId }]
        });
        if (!teacher) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        if (assignments && assignments.length > 0) {
            const invalid = assignments.find(a => !a.subjectId || !a.classId || !a.academicYearId);
            if (invalid) return sendError(res, 400, 'Each assignment must include classId, subjectId, and academicYearId');

            const uniqueKey = new Set();
            for (const a of assignments) {
                const key = `${a.classId}:${a.sectionId || 'none'}:${a.subjectId}:${a.academicYearId}`;
                if (uniqueKey.has(key)) {
                    return sendError(res, 400, 'Duplicate assignment detected in request payload');
                }
                uniqueKey.add(key);
            }

            // Validate all request-supplied IDs
            for (const a of assignments) {
                const academicYear = await AcademicYear.findOne({ _id: a.academicYearId, tenantId: req.user.tenantId });
                if (!academicYear) {
                    return sendError(res, 403, 'Access denied for this branch resource.');
                }

                const classObj = await Class.findOne({ _id: a.classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
                if (!classObj) {
                    return sendError(res, 403, 'Access denied for this branch resource.');
                }

                if (a.sectionId) {
                    const section = await Section.findOne({ _id: a.sectionId, tenantId: req.user.tenantId, branchId: req.user.branchId, classId: a.classId });
                    if (!section) {
                        return sendError(res, 403, 'Access denied for this branch resource.');
                    }
                }

                const subject = await Subject.findOne({ _id: a.subjectId, tenantId: req.user.tenantId });
                if (!subject) {
                    return sendError(res, 403, 'Access denied for this branch resource.');
                }
                if (subject.branchId && String(subject.branchId) !== String(req.user.branchId)) {
                    return sendError(res, 403, 'Access denied for this branch resource.');
                }
            }

            // Replace existing assignments for this teacher
            await TeacherAssignment.deleteMany({ teacherUserId, tenantId: req.user.tenantId, branchId: req.user.branchId });

            const assignmentDocs = assignments.map(a => ({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                teacherUserId,
                academicYearId: a.academicYearId,
                classId: a.classId,
                sectionId: a.sectionId || null,
                subjectId: a.subjectId,
                subject: a.subjectId,
                isActive: true
            }));
            await TeacherAssignment.insertMany(assignmentDocs);
        } else {
            // Replace existing assignments with empty array
            await TeacherAssignment.deleteMany({ teacherUserId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        }

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: req.user.role,
            action: 'TEACHER_ASSIGNMENTS_UPDATED',
            entityType: 'User',
            entityId: teacherUserId,
            after: { assignmentsCount: assignments?.length || 0 },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        sendResponse(res, true, null, 'Assignments updated');
    } catch (error) {
        console.error('updateTeacherAssignments Error:', error);
        sendError(res, 500, error.message);
    }
};

exports.getTeacherAssignments = async (req, res) => {
    try {
        const { teacherUserId } = req.params;

        const teacher = await User.findOne({
            _id: teacherUserId,
            tenantId: req.user.tenantId,
            role: 'teacher',
            $or: [{ branchId: req.user.branchId }, { authorizedBranchIds: req.user.branchId }]
        });
        if (!teacher) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const assignments = await TeacherAssignment.find({
            teacherUserId,
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        })
        .populate('classId', 'name')
        .populate('sectionId', 'name')
        .populate('subjectId', 'name')
        .populate('academicYearId', 'name');

        sendResponse(res, true, assignments);
    } catch (error) {
        console.error('getTeacherAssignments Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

// --- D) Student Lifecycle Oversight ---

exports.getStudents = async (req, res) => {
    try {
        const { classId, sectionId, academicYearId, status, q } = req.query;
        
        if (classId) {
            const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
        }

        let studentIds = null;

        if (sectionId) {
            const section = await Section.findOne({ _id: sectionId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!section) return sendError(res, 403, 'Access denied for this branch resource.');
        }

        if (classId || sectionId || academicYearId) {
            const enrollmentQuery = {
                tenantId: req.user.tenantId,
                branchId: req.user.branchId
            };
            if (classId) enrollmentQuery.classId = classId;
            if (sectionId) enrollmentQuery.sectionId = sectionId;
            if (academicYearId) enrollmentQuery.academicYearId = academicYearId;
            else enrollmentQuery.status = { $in: ACTIVE_ENROLLMENT_STATUSES };
            
            const enrollments = await Enrollment.find(enrollmentQuery).select('studentId');
            studentIds = [...new Set(enrollments.map((enrollment) => String(enrollment.studentId)))];
        }

        const studentQuery = {
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        };
        if (status) studentQuery.status = status;
        if (studentIds) studentQuery._id = { $in: studentIds };
        if (q && q.trim().length > 0) {
            studentQuery.$and = buildStudentSearchCriteria(q);
        }

        const students = await Student.find(studentQuery).sort({ createdAt: -1 });
        const enrollmentHistory = await Enrollment.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            studentId: { $in: students.map((student) => student._id) }
        })
            .populate('classId', 'name gradeLevel')
            .populate('sectionId', 'name')
            .populate('academicYearId', 'name isCurrent')
            .sort({ createdAt: -1 });
        const currentByStudent = new Map();
        const latestByStudent = new Map();
        enrollmentHistory.forEach((enrollment) => {
            const key = String(enrollment.studentId);
            if (!latestByStudent.has(key)) latestByStudent.set(key, enrollment);
            if (ACTIVE_ENROLLMENT_STATUSES.includes(enrollment.status) && !currentByStudent.has(key)) currentByStudent.set(key, enrollment);
        });
        sendResponse(res, true, students.map((student) => ({
            ...student.toObject(),
            currentEnrollment: currentByStudent.get(String(student._id)) || null,
            latestEnrollment: latestByStudent.get(String(student._id)) || null
        })));
    } catch (error) {
        console.error('getStudents Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.getStudent = async (req, res) => {
    try {
        const studExists = await Student.findOne({ _id: req.params.studentId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!studExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }
        const enrollments = await Enrollment.find({
            tenantId: req.user.tenantId,
            studentId: studExists._id
        })
            .populate('classId', 'name gradeLevel')
            .populate('sectionId', 'name')
            .populate('academicYearId', 'name isCurrent')
            .populate('branchId', 'name')
            .populate('promotionDecision.targetAcademicYearId', 'name')
            .populate('promotionDecision.targetClassId', 'name gradeLevel')
            .sort({ createdAt: -1 });
        sendResponse(res, true, { ...studExists.toObject(), enrollments });
    } catch (error) {
         console.error('getStudent Error:', error);
         sendError(res, 500, 'Server Error');
    }
};

exports.promoteStudents = async (req, res) => {
    try {
        const { fromAcademicYearId, toAcademicYearId, rules } = req.body;
        // rules: { classMap: [{ fromClassId, toClassId }] }

        if (!fromAcademicYearId || !toAcademicYearId || !rules || !rules.classMap) {
             return sendError(res, 400, 'Missing promotion parameters');
        }
        if (String(fromAcademicYearId) === String(toAcademicYearId)) {
            return sendError(res, 400, 'Target academic year must be different from source year');
        }
        const [fromYear, toYear, academicPolicy] = await Promise.all([
            AcademicYear.findOne({ _id: fromAcademicYearId, tenantId: req.user.tenantId }),
            AcademicYear.findOne({ _id: toAcademicYearId, tenantId: req.user.tenantId }),
            GradingPolicy.findOne({ tenantId: req.user.tenantId }).lean()
        ]);
        if (!fromYear || !toYear) {
            return sendError(res, 403, 'Access denied for this academic resource.');
        }
        if (!fromYear.isCurrent) {
            return sendError(res, 400, 'The source must be the current academic year set by the school administrator.');
        }
        const sourceStartYear = new Date(fromYear.startDate).getUTCFullYear();
        const targetStartYear = new Date(toYear.startDate).getUTCFullYear();
        if (!Number.isFinite(sourceStartYear) || !Number.isFinite(targetStartYear) || targetStartYear !== sourceStartYear + 1) {
            return sendError(res, 400, 'The target must be the immediate next academic year.');
        }
        const finalGradeLevel = String(academicPolicy?.finalGradeLevel || '12').trim().toLowerCase();

        // Logic:
        // 1. For each map entry, find Enrollments in fromClass + fromYear
        // 2. Create new Enrollments in toClass + toYear
        // 3. Mark old Enrollments as 'Promoted'
        // 4. Log everything.
        
        const results = {
            promoted: 0,
            retained: 0,
            incomplete: 0,
            failed: 0,
            skippedExisting: 0,
            totalConsidered: 0,
            retainedStudents: [],
            incompleteStudents: [],
            errors: []
        };

        for (const map of rules.classMap) {
            const { fromClassId, toClassId } = map;
            if (!fromClassId || !toClassId) {
                return sendError(res, 400, 'Each promotion mapping requires a source and target class');
            }
            const [fromClass, toClass] = await Promise.all([
                Class.findOne({ _id: fromClassId, tenantId: req.user.tenantId, branchId: req.user.branchId }),
                Class.findOne({ _id: toClassId, tenantId: req.user.tenantId, branchId: req.user.branchId })
            ]);
            if (!fromClass || !toClass) {
                return sendError(res, 403, 'Access denied for this branch resource.');
            }
            if (String(fromClass.gradeLevel || '').trim().toLowerCase() === finalGradeLevel) {
                return sendError(res, 400, `${fromClass.name} is the configured final grade. Use the school graduation operation instead.`);
            }
            if (!isNextGradeLevel(fromClass.gradeLevel, toClass.gradeLevel)) {
                return sendError(res, 400, `${fromClass.name} can only be promoted to the class one grade above it.`);
            }

            const enrollments = await Enrollment.find({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                academicYearId: fromAcademicYearId,
                classId: fromClassId,
                status: { $in: ACTIVE_ENROLLMENT_STATUSES }
            }).populate('studentId', 'firstName lastName admissionNumber');

            if (!enrollments.length) continue;

            const promotionDecisions = await evaluatePromotionEligibility({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                classId: fromClassId,
                academicYearId: fromAcademicYearId,
                enrollments
            });

            for (const enrollment of enrollments) {
                results.totalConsidered++;
                const studentId = enrollment.studentId?._id || enrollment.studentId;
                const studentLabel = {
                    studentId,
                    admissionNumber: enrollment.studentId?.admissionNumber || '',
                    name: [enrollment.studentId?.firstName, enrollment.studentId?.lastName].filter(Boolean).join(' ')
                };
                const decision = promotionDecisions.get(String(studentId));
                if (!decision || decision.outcome === 'Incomplete') {
                    const incompleteDecision = decision || {
                        outcome: 'Incomplete', totalSubjects: 0, gradedSubjects: 0,
                        failedSubjects: 0, retentionThreshold: 0,
                        reason: 'Promotion eligibility could not be calculated.'
                    };
                    await Enrollment.updateOne(
                        { _id: enrollment._id, tenantId: req.user.tenantId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } },
                        { $set: { promotionDecision: buildPromotionDecisionSnapshot(incompleteDecision, {
                            targetAcademicYearId: toAcademicYearId,
                            targetClassId: toClassId
                        }) } }
                    );
                    results.incomplete++;
                    results.incompleteStudents.push({ ...studentLabel, ...incompleteDecision });
                    continue;
                }

                const retained = decision.outcome === 'Retained';
                const destinationClassId = retained ? fromClassId : toClassId;
                const destinationStatus = retained ? 'Retained' : 'Promoted';
                const decisionSnapshot = buildPromotionDecisionSnapshot(decision, {
                    targetAcademicYearId: toAcademicYearId,
                    targetClassId: destinationClassId
                });

                // Check if already enrolled in new year (idempotency)
                const existingNext = await Enrollment.findOne({
                     tenantId: req.user.tenantId,
                     branchId: req.user.branchId,
                     academicYearId: toAcademicYearId,
                     studentId
                });

                if (existingNext && String(existingNext.classId) !== String(destinationClassId)) {
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: destination-year enrollment is in a different class.`);
                    continue;
                }
                if (existingNext && !ACTIVE_ENROLLMENT_STATUSES.includes(existingNext.status)) {
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: destination-year enrollment is not current.`);
                    continue;
                }

                if (!existingNext) {
                    let newEnrollment;
                    try {
                        newEnrollment = await Enrollment.create({
                            tenantId: req.user.tenantId,
                            branchId: req.user.branchId,
                            studentId,
                            academicYearId: toAcademicYearId,
                            classId: destinationClassId,
                            sectionId: retained ? (enrollment.sectionId || null) : null,
                            status: 'Current'
                        });

                        const updateResult = await Enrollment.updateOne(
                            {
                                _id: enrollment._id,
                                tenantId: req.user.tenantId,
                                status: { $in: ACTIVE_ENROLLMENT_STATUSES }
                            },
                            { $set: { status: destinationStatus, promotionDecision: decisionSnapshot } }
                        );
                        if (updateResult.matchedCount === 0) {
                            await Enrollment.deleteOne({ _id: newEnrollment._id, tenantId: req.user.tenantId });
                            results.failed++;
                            continue;
                        }

                        if (retained) results.retained++;
                        else results.promoted++;
                    } catch (error) {
                        if (newEnrollment?._id) {
                            await Enrollment.deleteOne({ _id: newEnrollment._id, tenantId: req.user.tenantId }).catch(() => {});
                        }
                        results.failed++;
                        results.errors.push(`${studentLabel.admissionNumber || studentId}: ${error.message}`);
                    }
                } else {
                    const updateResult = await Enrollment.updateOne(
                        {
                            _id: enrollment._id,
                            tenantId: req.user.tenantId,
                            status: { $in: ACTIVE_ENROLLMENT_STATUSES }
                        },
                        { $set: { status: destinationStatus, promotionDecision: decisionSnapshot } }
                    );
                    if (updateResult.matchedCount === 0) {
                        results.failed++;
                        results.errors.push(`${studentLabel.admissionNumber || studentId}: enrollment changed during promotion.`);
                        continue;
                    }
                    results.skippedExisting++;
                }

                if (retained) results.retainedStudents.push({ ...studentLabel, ...decision });
            }
        }

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: req.user.role,
            action: 'BRANCH_PROMOTION_TRIGGERED',
            entityType: 'AcademicYear',
            entityId: toAcademicYearId,
            after: results,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        sendResponse(res, true, results, 'Promotion process completed');
    } catch (error) {
        console.error('promoteStudents Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

// --- E) Exams Oversight ---

exports.getExamResults = async (req, res) => {
    try {
        const query = await buildBranchResultsQuery(req);

        const results = await Result.find(query)
            .populate('studentId', 'firstName lastName admissionNumber')
            .populate({
                path: 'examId',
                select: 'name term classId subjectId academicYearId',
                populate: [
                    { path: 'classId', select: 'name' },
                    { path: 'subjectId', select: 'name code' },
                    { path: 'academicYearId', select: 'name' }
                ]
            });

        sendResponse(res, true, results);
    } catch (error) {
        console.error('getExamResults Error:', error);
        sendError(res, error.statusCode || 500, error.statusCode ? error.message : 'Server Error');
    }
};

exports.exportExamResults = async (req, res) => {
    try {
        const query = await buildBranchResultsQuery(req);
        const results = await Result.find(query)
            .populate('studentId', 'firstName lastName admissionNumber')
            .populate({
                path: 'examId',
                select: 'name classId subjectId academicYearId',
                populate: [
                    { path: 'classId', select: 'name' },
                    { path: 'subjectId', select: 'name code' },
                    { path: 'academicYearId', select: 'name' }
                ]
            })
            .sort({ createdAt: -1 })
            .limit(5000);

        const headers = [
            'Admission Number',
            'Student Name',
            'Exam',
            'Class',
            'Subject',
            'Academic Year',
            'Marks',
            'Max Score',
            'Percentage',
            'Grade',
            'Status',
            'Absent',
            'Remarks',
            'Date'
        ];

        const rows = results.map((result) => ({
            'Admission Number': result.studentId?.admissionNumber || '',
            'Student Name': [result.studentId?.firstName, result.studentId?.lastName].filter(Boolean).join(' '),
            Exam: result.examId?.name || '',
            Class: result.examId?.classId?.name || '',
            Subject: result.examId?.subjectId?.name || '',
            'Academic Year': result.examId?.academicYearId?.name || '',
            Marks: result.marksObtained || 0,
            'Max Score': result.maxScore || 0,
            Percentage: result.percentage || 0,
            Grade: result.grade || '',
            Status: result.status || '',
            Absent: result.isAbsent ? 'Yes' : 'No',
            Remarks: result.remarks || '',
            Date: exportService.formatDate(result.updatedAt || result.createdAt)
        }));

        const csv = exportService.toCSV(headers, rows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=branch_results_${new Date().toISOString().slice(0, 10)}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('exportExamResults Error:', error);
        sendError(res, error.statusCode || 500, error.statusCode ? error.message : 'Server Error');
    }
};

exports.getClassResults = async (req, res) => {
    try {
        const { classId, subjectId, academicYearId, term } = req.query;
        if (!classId || !subjectId || !academicYearId) {
            return sendError(res, 400, 'classId, subjectId, and academicYearId are required');
        }

        if (classId) {
            const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
        }
        if (subjectId) {
            const sub = await Subject.findOne({ _id: subjectId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!sub) return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const exams = await Exam.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
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
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            classId,
            academicYearId
        }).select('studentId');

        const studentIds = enrollments.map(e => e.studentId);
        const students = await Student.find({
            _id: { $in: studentIds },
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        }).sort({ firstName: 1 }).select('firstName lastName admissionNumber');

        const results = await Result.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            examId: { $in: exams.map(e => e._id) }
        });

        const resultsByExam = new Map();
        for (const result of results) {
            const examKey = result.examId.toString();
            if (!resultsByExam.has(examKey)) resultsByExam.set(examKey, new Map());
            resultsByExam.get(examKey).set(result.studentId.toString(), result);
        }

        const curriculum = await ClassSubject.findOne({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
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

        const sorted = [...rows].sort((a, b) => {
            if (b.totalMarks !== a.totalMarks) return b.totalMarks - a.totalMarks;
            return (a.student.admissionNumber || '').localeCompare(b.student.admissionNumber || '', undefined, { numeric: true, sensitivity: 'base' });
        });

        const rankMap = new Map();
        sorted.forEach((row, index) => {
            rankMap.set(row.student.id.toString(), index + 1);
        });

        const rankedRows = rows.map(row => ({
            ...row,
            rank: rankMap.get(row.student.id.toString())
        }));

        sendResponse(res, true, { categories, rows: rankedRows });
    } catch (error) {
        console.error('getClassResults Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.getStudentResults = async (req, res) => {
    try {
        const { studentId, academicYearId, term } = req.query;
        if (!studentId) return sendError(res, 400, 'studentId is required');

        const studExists = await Student.findOne({ _id: studentId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!studExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const student = studExists;

        const enrollment = await Enrollment.findOne({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            studentId,
            ...(academicYearId
                ? { academicYearId }
                : { status: { $in: ACTIVE_ENROLLMENT_STATUSES } })
        })
            .populate('classId', 'name')
            .populate('academicYearId', 'name');

        if (!enrollment) {
            return sendResponse(res, true, {
                student: {
                    id: student._id,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    admissionNumber: student.admissionNumber,
                    studentCode: student.studentCode
                },
                enrollment: null,
                categories: [],
                subjects: [],
                overall: {
                    totalMarks: 0,
                    totalMax: 0,
                    overallPassMark: 0,
                    overallStatus: 'FAIL'
                },
                rank: { rank: null, classSize: 0 }
            }, 'No active enrollment found for this student');
        }

        const curriculum = await ClassSubject.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
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
                    subjectName: c.subjectId?.name,
                    passMarkPercent: resolvePassMarkPercent(c)
                });
            }
        });
        const subjectMeta = Array.from(subjectMetaMap.values()).sort((a, b) =>
            (a.subjectName || '').localeCompare(b.subjectName || '', undefined, { sensitivity: 'base' })
        );

        if (subjectMeta.length === 0) {
            return sendResponse(res, true, {
                student: {
                    id: student._id,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    admissionNumber: student.admissionNumber,
                    studentCode: student.studentCode
                },
                enrollment: {
                    classId: enrollment.classId?._id || enrollment.classId,
                    className: enrollment.classId?.name,
                    academicYearId: enrollment.academicYearId?._id || enrollment.academicYearId,
                    academicYearName: enrollment.academicYearId?.name
                },
                categories: [],
                subjects: [],
                overall: {
                    totalMarks: 0,
                    totalMax: 0,
                    overallPassMark: 0,
                    overallStatus: 'FAIL'
                },
                rank: { rank: null, classSize: 0 }
            }, 'No curriculum subjects found for this class');
        }

        const exams = await Exam.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            classId: enrollment.classId,
            academicYearId: enrollment.academicYearId,
            ...(term ? { termId: term } : {}),
            subjectId: { $in: subjectMeta.map(s => s.subjectId) }
        })
            .populate('examCategoryId', 'name maxScore')
            .populate('subjectId', 'name')
            .sort({ createdAt: 1 });

        const categoriesMap = new Map();
        const examMapBySubject = new Map();
        const examSubjectMap = new Map();

        for (const exam of exams) {
            const subjectId = (exam.subjectId?._id || exam.subjectId).toString();
            const categoryId = (exam.examCategoryId?._id || exam.examCategoryId)?.toString();
            if (categoryId) {
                if (!categoriesMap.has(categoryId)) {
                    categoriesMap.set(categoryId, {
                        categoryId,
                        categoryName: exam.examCategoryId?.name || 'Category',
                        maxScore: exam.examCategoryId?.maxScore || 100
                    });
                }
                if (!examMapBySubject.has(subjectId)) examMapBySubject.set(subjectId, new Map());
                examMapBySubject.get(subjectId).set(categoryId, exam);
            }
            examSubjectMap.set(exam._id.toString(), subjectId);
        }

        const categories = Array.from(categoriesMap.values()).sort((a, b) =>
            (a.categoryName || '').localeCompare(b.categoryName || '', undefined, { sensitivity: 'base' })
        );

        const results = await Result.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            studentId,
            examId: { $in: exams.map(e => e._id) }
        });

        const resultsByExam = new Map(results.map(r => [r.examId.toString(), r]));

        const subjects = subjectMeta.map(meta => {
            let totalMarks = 0;
            let totalMax = 0;
            const subjectExams = examMapBySubject.get(meta.subjectId) || new Map();

            const categoryMarks = categories.map(category => {
                const exam = subjectExams.get(category.categoryId);
                if (!exam) {
                    return {
                        categoryId: category.categoryId,
                        examId: null,
                        marksObtained: null,
                        maxScore: category.maxScore
                    };
                }
                const result = resultsByExam.get(exam._id.toString());
                const marks = result ? result.marksObtained : 0;
                totalMarks += marks;
                totalMax += category.maxScore || 0;
                return {
                    categoryId: category.categoryId,
                    examId: exam._id,
                    marksObtained: marks,
                    maxScore: category.maxScore
                };
            });

            const percentage = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
            const status = percentage >= meta.passMarkPercent ? 'PASS' : 'FAIL';

            return {
                subjectId: meta.subjectId,
                subjectName: meta.subjectName,
                categoryMarks,
                totalMarks,
                totalMax,
                percentage: Math.round(percentage * 100) / 100,
                passMark: meta.passMarkPercent,
                status
            };
        });

        const overall = {
            totalMarks: subjects.reduce((sum, s) => sum + (s.totalMarks || 0), 0),
            totalMax: subjects.reduce((sum, s) => sum + (s.totalMax || 0), 0),
            overallPassMark: 0,
            overallStatus: 'FAIL'
        };
        overall.overallPassMark = overall.totalMax / 2;
        overall.overallStatus = overall.totalMarks >= overall.overallPassMark ? 'PASS' : 'FAIL';

        const enrollments = await Enrollment.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            classId: enrollment.classId,
            academicYearId: enrollment.academicYearId,
            ...(academicYearId ? {} : { status: { $in: ACTIVE_ENROLLMENT_STATUSES } })
        }).select('studentId');

        const studentIds = enrollments.map(e => e.studentId);
        const students = await Student.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            _id: { $in: studentIds }
        }).select('admissionNumber');
        const admissionMap = new Map(students.map(s => [s._id.toString(), s.admissionNumber || '']));

        const subjectMaxMap = new Map();
        exams.forEach(exam => {
            const subjectId = (exam.subjectId?._id || exam.subjectId).toString();
            const maxScore = exam.examCategoryId?.maxScore || 100;
            subjectMaxMap.set(subjectId, (subjectMaxMap.get(subjectId) || 0) + maxScore);
        });

        const allResults = await Result.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            studentId: { $in: studentIds },
            examId: { $in: exams.map(e => e._id) }
        });

        const totalsMap = new Map();
        for (const r of allResults) {
            const sId = r.studentId.toString();
            const subjectId = examSubjectMap.get(r.examId.toString());
            if (!subjectId) continue;
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
                const marks = subjectMap.get(meta.subjectId) || 0;
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

        sendResponse(res, true, {
            student: {
                id: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                admissionNumber: student.admissionNumber,
                studentCode: student.studentCode
            },
            enrollment: {
                classId: enrollment.classId?._id || enrollment.classId,
                className: enrollment.classId?.name,
                academicYearId: enrollment.academicYearId?._id || enrollment.academicYearId,
                academicYearName: enrollment.academicYearId?.name
            },
            categories,
            subjects,
            overall,
            rank: { rank, classSize: stats.length }
        });
    } catch (error) {
        console.error('getStudentResults Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.getResultsSummary = async (req, res) => {
    try {
        const { examId, classId } = req.query;
        if (!examId) return sendError(res, 400, 'examId required for summary');

        // Aggregation for Average, Pass Rate
        const stats = await Result.aggregate([
            { $match: { 
                tenantId: req.user.tenantId, 
                branchId: req.user.branchId,
                examId: new mongoose.Types.ObjectId(examId) 
            }},
            { $group: {
                _id: '$examId',
                avgTotal: { $avg: '$total' },
                maxTotal: { $max: '$total' },
                minTotal: { $min: '$total' },
                count: { $sum: 1 }
            }}
        ]);

        sendResponse(res, true, stats[0] || {});
    } catch (error) {
        console.error('getResultsSummary Error:', error);
       // sendError(res, 500, 'Server Error'); 
       // Note: avoid sending nothing if aggregation fails or returns empty
       sendResponse(res, true, {});
    }
};

// --- F) Branch Reporting ---

exports.getBranchOverview = async (req, res) => {
    try {
        const { academicYearId } = req.query;
        const baseQuery = { tenantId: req.user.tenantId, branchId: req.user.branchId };
        
        const yearObjectId = academicYearId && mongoose.Types.ObjectId.isValid(academicYearId)
            ? new mongoose.Types.ObjectId(academicYearId)
            : null;
        const aggregateScope = {
            tenantId: new mongoose.Types.ObjectId(req.user.tenantId),
            branchId: new mongoose.Types.ObjectId(req.user.branchId)
        };
        const studentCount = await Student.countDocuments({ ...baseQuery, status: 'Active' });
        const extendedAnalytics = mongoose.connection.readyState === 0 ? [[], [], [], [], []] : await Promise.all([
            Student.aggregate([{ $match: aggregateScope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
            User.aggregate([{ $match: { ...aggregateScope, isActive: { $ne: false } } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
            Exam.aggregate([{ $match: { ...aggregateScope, ...(yearObjectId ? { academicYearId: yearObjectId } : {}) } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
            Result.aggregate([{ $match: { ...aggregateScope, status: { $ne: 'ABSENT' } } }, { $group: { _id: null, averagePercentage: { $avg: '$percentage' }, resultsRecorded: { $sum: 1 } } }]),
            yearObjectId ? Enrollment.aggregate([
                { $match: { ...aggregateScope, academicYearId: yearObjectId, status: { $ne: 'Withdrawn' } } },
                { $group: { _id: '$classId', count: { $sum: 1 } } },
                { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'class' } },
                { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
                { $project: { _id: 0, name: { $ifNull: ['$class.name', 'Unassigned'] }, count: 1 } },
                { $sort: { name: 1 } }
            ]) : []
        ]);
        const [studentStatuses, staffRoles, examStatuses, resultStats, enrollmentByClass] = extendedAnalytics;

        // 2. Enrollments (for specific year if provided)
        let activeEnrollments = 0;
        if (academicYearId) {
            activeEnrollments = await Enrollment.countDocuments({ 
                ...baseQuery, 
                academicYearId, 
                status: { $ne: 'Withdrawn' } 
            });
        }

        // 3. Finance (Invoices & Payments)
        const tenantId = new mongoose.Types.ObjectId(req.user.tenantId);
        const branchId = new mongoose.Types.ObjectId(req.user.branchId);

        const invoiceStats = await Invoice.aggregate([
            { $match: { tenantId, branchId, status: { $ne: 'Void' } } },
            { $group: { _id: null, totalSales: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
        ]);

        const paymentStats = await Payment.aggregate([
            { $match: { tenantId, branchId, status: 'ACTIVE' } },
            { $group: { _id: null, totalCollected: { $sum: '$amount' } } }
        ]);

        // Monthly trend for the last 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setHours(0, 0, 0, 0);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

        const invoiceMonthly = await Invoice.aggregate([
            { 
                $match: { 
                    tenantId, 
                    branchId, 
                    status: { $ne: 'Void' },
                    createdAt: { $gte: sixMonthsAgo }
                } 
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    invoiced: { $sum: '$totalAmount' }
                }
            }
        ]);

        const paymentMonthly = await Payment.aggregate([
            { 
                $match: { 
                    tenantId, 
                    branchId, 
                    status: 'ACTIVE',
                    createdAt: { $gte: sixMonthsAgo }
                } 
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    collected: { $sum: '$amount' }
                }
            }
        ]);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const trendData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - i);
            const mVal = d.getMonth() + 1;
            const yVal = d.getFullYear();

            const inv = invoiceMonthly.find(item => item._id.year === yVal && item._id.month === mVal);
            const pay = paymentMonthly.find(item => item._id.year === yVal && item._id.month === mVal);

            trendData.push({
                month: monthNames[d.getMonth()],
                Invoiced: inv ? inv.invoiced : 0,
                Collected: pay ? pay.collected : 0
            });
        }

        sendResponse(res, true, {
            students: { totalActive: studentCount, enrolledCurrentYear: activeEnrollments },
            finance: {
                totalInvoiced: invoiceStats[0]?.totalSales || 0,
                totalCollected: paymentStats[0]?.totalCollected || 0,
                outstanding: Math.max(0, (invoiceStats[0]?.totalSales || 0) - (paymentStats[0]?.totalCollected || 0)),
                invoiceCount: invoiceStats[0]?.count || 0
            },
            financeTrend: trendData,
            studentStatuses: studentStatuses.map(({ _id, count }) => ({ name: _id || 'Unknown', count })),
            enrollmentByClass,
            staff: { total: staffRoles.reduce((sum, item) => sum + item.count, 0), byRole: staffRoles.map(({ _id, count }) => ({ name: _id || 'Other', count })) },
            exams: { total: examStatuses.reduce((sum, item) => sum + item.count, 0), byStatus: examStatuses.map(({ _id, count }) => ({ name: _id || 'Unknown', count })) },
            academics: { averagePercentage: Math.round((resultStats[0]?.averagePercentage || 0) * 10) / 10, resultsRecorded: resultStats[0]?.resultsRecorded || 0 }
        });

    } catch (error) {
        console.error('getBranchOverview Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

// --- G) Class Categories ---

exports.getClassCategories = async (req, res) => {
    try {
        const categories = await ClassCategory.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        }).sort({ name: 1 });
        sendResponse(res, true, categories);
    } catch (error) {
        console.error('getClassCategories Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.createClassCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return sendError(res, 400, 'Name is required');

        const existing = await ClassCategory.findOne({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            name
        });
        if (existing) return sendError(res, 400, 'Category already exists');

        const category = await ClassCategory.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            name,
            description
        });

        sendResponse(res, true, category, 'Category created');
    } catch (error) {
        console.error('createClassCategory Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

// --- H) Sections ---

exports.getSections = async (req, res) => {
    try {
        const { classId } = req.query;
        if (classId) {
            const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const query = {
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        };
        if (classId) query.classId = classId;

        const sections = await Section.find(query).populate('classId', 'name').sort({ name: 1 });
        sendResponse(res, true, sections);
    } catch (error) {
        console.error('getSections Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.createSection = async (req, res) => {
    try {
        const { classId, name, roomNumber, capacity } = req.body;
        if (!classId || !name) return sendError(res, 400, 'Class and Name are required');

        if (classId) {
            const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const section = await Section.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            classId,
            name,
            roomNumber,
            capacity
        });
        sendResponse(res, true, section, 'Section created');
    } catch (error) {
        console.error('createSection Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

// --- I) Subjects ---

exports.getSubjects = async (req, res) => {
    try {
        const subjects = await Subject.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        }).sort({ name: 1 });
        sendResponse(res, true, subjects);
    } catch (error) {
        console.error('getSubjects Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.createSubject = async (req, res) => {
    try {
        const { name, code } = req.body;
        const normalizedName = String(name || '').trim();
        const normalizedCode = String(code || '').trim().toUpperCase();
        if (!normalizedName) return sendError(res, 400, 'Name is required');

        const duplicateChecks = [{ name: normalizedName }];
        if (normalizedCode) duplicateChecks.push({ code: normalizedCode });
        const existingSubject = await Subject.findOne({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            $or: duplicateChecks
        });
        if (existingSubject) {
            const existingCode = String(existingSubject.code || '').trim().toUpperCase();
            if (normalizedCode && existingCode === normalizedCode) {
                return sendError(res, 409, 'Subject code already exists for this branch');
            }
            return sendError(res, 409, 'Subject already exists for this branch');
        }

        const subject = await Subject.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            name: normalizedName,
            ...(normalizedCode ? { code: normalizedCode } : {})
        });
        sendResponse(res, true, subject, 'Subject created');
    } catch (error) {
        console.error('createSubject Error:', error);
        if (error.code === 11000) {
            const duplicateKey = Object.keys(error.keyPattern || error.keyValue || {}).join(',');
            if (duplicateKey.includes('code')) {
                return sendError(res, 409, 'Subject code already exists for this branch');
            }
            return sendError(res, 409, 'Subject already exists for this branch');
        }
        sendError(res, 500, 'Server Error');
    }
};

exports.getAllBranchAssignments = async (req, res) => {
    try {
        const assignments = await TeacherAssignment.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        })
        .populate('classId', 'name')
        .populate('sectionId', 'name')
        .populate('subjectId', 'name');

        sendResponse(res, true, assignments);
    } catch (error) {
        console.error('getAllBranchAssignments Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.getClassSubjects = async (req, res) => {
    try {
        const { classId } = req.query;
        if (classId) {
            const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const query = {
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        };
        if (classId) query.classId = classId;

        const classSubjects = await ClassSubject.find(query)
            .populate('classId', 'name')
            .populate('sectionId', 'name')
            .populate('subjectId', 'name code');

        sendResponse(res, true, classSubjects);
    } catch (error) {
        console.error('getClassSubjects Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.createClassSubject = async (req, res) => {
    try {
        const { classId, sectionId, subjectId, totalMarks = 100, passMarks = 40 } = req.body;
        if (!classId || !subjectId) return sendError(res, 400, 'Class and Subject are required');
        if (Number(totalMarks) <= 0 || Number(passMarks) < 0 || Number(passMarks) > Number(totalMarks)) {
            return sendError(res, 400, 'Pass marks must be between 0 and total marks');
        }

        if (classId) {
            const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
        }
        if (sectionId) {
            const sec = await Section.findOne({ _id: sectionId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!sec) return sendError(res, 403, 'Access denied for this branch resource.');
        }
        if (subjectId) {
            const sub = await Subject.findOne({ _id: subjectId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!sub) return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const existing = await ClassSubject.findOne({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            classId,
            sectionId: sectionId || null,
            subjectId
        });

        if (existing) return sendError(res, 400, 'Subject already exists for this scope');

        const classSubject = await ClassSubject.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            classId,
            sectionId: sectionId || null,
            subjectId,
            totalMarks: Number(totalMarks),
            passMarks: Number(passMarks),
            passMarkPercent: resolvePassMarkPercent({ totalMarks, passMarks })
        });

        sendResponse(res, true, classSubject, 'Subject assigned to class successfully');
    } catch (error) {
        console.error('createClassSubject Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.deleteClassSubject = async (req, res) => {
    try {
        const csExists = await ClassSubject.findOne({ _id: req.params.id, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!csExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        // Before delete, verify class, subject, and section belong to the same tenant and branch
        const classExists = await Class.findOne({ _id: csExists.classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!classExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const subjectQuery = { _id: csExists.subjectId, tenantId: req.user.tenantId };
        if (Subject.schema.paths.branchId) {
            subjectQuery.branchId = req.user.branchId;
        }
        const subjectExists = await Subject.findOne(subjectQuery);
        if (!subjectExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        if (csExists.sectionId) {
            const sectionExists = await Section.findOne({ _id: csExists.sectionId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!sectionExists) {
                return sendError(res, 403, 'Access denied for this branch resource.');
            }
        }

        await ClassSubject.deleteOne({ _id: req.params.id, tenantId: req.user.tenantId, branchId: req.user.branchId });
        sendResponse(res, true, null, 'Subject removed from class');
    } catch (error) {
        console.error('deleteClassSubject Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

// --- Exam Category Management ---
exports.getExamCategories = async (req, res) => {
    try {
        const categories = await ExamCategory.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        }).sort({ name: 1 });
        sendResponse(res, true, categories);
    } catch (error) {
        console.error('getExamCategories Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.createExamCategory = async (req, res) => {
    try {
        const { name, maxScore, description } = req.body;
        const numericMaxScore = Number(maxScore);
        if (!String(name || '').trim() || !Number.isFinite(numericMaxScore)) return sendError(res, 400, 'Name and maxScore are required');
        if (numericMaxScore <= 0 || numericMaxScore > 100) return sendError(res, 400, 'Maximum score must be between 1 and 100.');

        const category = await ExamCategory.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            name: String(name).trim(),
            maxScore: numericMaxScore,
            description
        });
        sendResponse(res, true, category, 'Exam category created');
    } catch (error) {
        console.error('createExamCategory Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

// --- Structured Exam Management ---
exports.getExams = async (req, res) => {
    try {
        const { classId, academicYearId, subjectId } = req.query;
        if (classId && classId !== 'all') {
            const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
        }
        if (subjectId) {
            const sub = await Subject.findOne({ _id: subjectId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!sub) return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const query = {
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        };
        if (classId) query.classId = classId;
        if (academicYearId) query.academicYearId = academicYearId;
        if (subjectId) query.subjectId = subjectId;

        const exams = await Exam.find(query)
            .populate('examCategoryId', 'name maxScore')
            .populate('classId', 'name')
            .populate('subjectId', 'name')
            .populate('academicYearId', 'name')
            .populate('termId', 'name sequence')
            .sort({ createdAt: -1 });

        sendResponse(res, true, exams);
    } catch (error) {
        console.error('getExams Error:', error);
        sendError(res, 500, 'Server Error');
    }
};

exports.createExam = async (req, res) => {
    try {
        const { 
            examCategoryId, 
            academicYearId, 
            classId, // Single ID or "all"
            classIds, // Array of IDs (New)
            subjectId, 
            date,
            termId
        } = req.body;

        if (!examCategoryId || !academicYearId || !subjectId || (!classId && (!classIds || classIds.length === 0))) {
            return sendError(res, 400, 'Required fields missing');
        }

        if (examCategoryId) {
            const cat = await ExamCategory.findOne({ _id: examCategoryId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cat) return sendError(res, 403, 'Access denied for this branch resource.');
        }
        if (classId && classId !== 'all') {
            const cls = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
        }
        if (classIds && Array.isArray(classIds)) {
            for (const cId of classIds) {
                const cls = await Class.findOne({ _id: cId, tenantId: req.user.tenantId, branchId: req.user.branchId });
                if (!cls) return sendError(res, 403, 'Access denied for this branch resource.');
            }
        }
        if (subjectId) {
            const sub = await Subject.findOne({ _id: subjectId, tenantId: req.user.tenantId, branchId: req.user.branchId });
            if (!sub) return sendError(res, 403, 'Access denied for this branch resource.');
        }
        if (termId) {
            const term = await Term.findOne({ _id: termId, tenantId: req.user.tenantId, academicYearId, isActive: true });
            if (!term) return sendError(res, 403, 'Access denied for this academic term.');
        }

        const baseData = {
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            examCategoryId,
            academicYearId,
            subjectId,
            termId: termId || null,
            date,
            status: 'Draft'
        };

        // Resolve which classes we are targeting
        let targetClassIds = [];
        if (classId === 'all') {
            const classes = await Class.find({ 
                tenantId: req.user.tenantId, 
                branchId: req.user.branchId 
            });
            targetClassIds = classes.map(c => c._id.toString());
        } else if (classIds && Array.isArray(classIds)) {
            targetClassIds = classIds;
        } else if (classId) {
            targetClassIds = [classId];
        }

        const createdExams = [];
        const skippedNotAssigned = [];
        const skippedDuplicates = [];
        const errors = [];

        for (const clsId of targetClassIds) {
            try {
                const clsDoc = await Class.findOne({ _id: clsId, tenantId: req.user.tenantId, branchId: req.user.branchId });
                const clsName = clsDoc ? clsDoc.name : clsId;

                // 1. Verify that this subject is assigned in the class curriculum (ClassSubject)
                const assignment = await ClassSubject.findOne({
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    classId: clsId,
                    subjectId: subjectId,
                    $or: [
                        { academicYearId: academicYearId },
                        { academicYearId: { $exists: false } },
                        { academicYearId: null }
                    ],
                    isActive: true
                });

                if (!assignment) {
                    skippedNotAssigned.push(clsName);
                    continue;
                }

                // 2. Create the Exam
                const exam = await Exam.create({ ...baseData, classId: clsId });
                createdExams.push(exam);

            } catch (err) {
                const clsDoc = await Class.findOne({ _id: clsId, tenantId: req.user.tenantId, branchId: req.user.branchId });
                const clsName = clsDoc ? clsDoc.name : clsId;
                
                if (err.code === 11000) {
                    skippedDuplicates.push(clsName);
                } else {
                    errors.push(`${clsName}: ${err.message}`);
                }
            }
        }

        let message = `Successfully created ${createdExams.length} exams.`;
        if (skippedNotAssigned.length > 0) {
            message += `\nWarning: The following classes do not have this subject assigned in their curriculum: ${skippedNotAssigned.join(', ')}.`;
        }
        if (skippedDuplicates.length > 0) {
            message += `\nNote: Exams already exist for: ${skippedDuplicates.join(', ')}.`;
        }
        if (errors.length > 0) {
            message += `\nErrors: ${errors.join('; ')}.`;
        }

        return sendResponse(res, true, { 
            createdExams, 
            skippedNotAssigned, 
            skippedDuplicates, 
            errors 
        }, message);

    } catch (error) {
        console.error('createExam Error:', error);
        sendError(res, 500, error.message || 'Server Error');
    }
};

exports.updateExamStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!['Draft', 'Open', 'Closed'].includes(status)) {
            return sendError(res, 400, 'Invalid status');
        }

        const examExists = await Exam.findOne({ _id: req.params.id, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!examExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }

        const allowedTransitions = { Draft: ['Open'], Open: ['Closed'], Closed: ['Open'] };
        if (status !== examExists.status && !allowedTransitions[examExists.status]?.includes(status)) {
            return sendError(res, 409, `Exam cannot move from ${examExists.status} to ${status}.`);
        }
        if (status === 'Open') {
            const relatedExams = await Exam.find({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                academicYearId: examExists.academicYearId,
                termId: examExists.termId,
                classId: examExists.classId,
                subjectId: examExists.subjectId,
                _id: { $ne: examExists._id }
            }).populate('examCategoryId', 'maxScore');
            await examExists.populate('examCategoryId', 'maxScore');
            const totalMaximum = relatedExams.reduce((sum, exam) => sum + Number(exam.examCategoryId?.maxScore || 0), Number(examExists.examCategoryId?.maxScore || 0));
            if (totalMaximum > 100) return sendError(res, 409, `Cannot open this exam: assessment components total ${totalMaximum} marks. The subject/term maximum is 100.`);
        }
        examExists.status = status;
        await examExists.save();

        sendResponse(res, true, examExists, `Exam status updated to ${status}`);
    } catch (error) {
        sendError(res, 500, 'Server Error');
    }
};

exports.deleteExam = async (req, res) => {
    try {
        const examExists = await Exam.findOne({ _id: req.params.id, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!examExists) {
            return sendError(res, 403, 'Access denied for this branch resource.');
        }
        
        // Check if results exist under the same tenant/branch context
        const resultQuery = { examId: examExists._id, tenantId: req.user.tenantId };
        if (Result.schema.paths.branchId) {
            resultQuery.branchId = req.user.branchId;
        }
        const resultsCount = await Result.countDocuments(resultQuery);
        if (resultsCount > 0) {
            return sendError(res, 400, 'Cannot delete exam with existing results. Remove results first.');
        }

        await Exam.deleteOne({ _id: examExists._id, tenantId: req.user.tenantId, branchId: req.user.branchId });
        sendResponse(res, true, null, 'Exam deleted successfully');
    } catch (error) {
        sendError(res, 500, 'Server Error');
    }
};
