const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');
const Section = require('../models/Section');
const ClassCategory = require('../models/ClassCategory');
const AcademicYear = require('../models/AcademicYear');
const Branch = require('../models/Branch');
const { logAction } = require('../services/auditLogService');
const mongoose = require('mongoose');

// @desc    Get Current Academic Year for Branch/Tenant
// @route   GET /api/registrar/academic-years/current
// @access  Private (Registrar)
exports.getCurrentAcademicYear = async (req, res) => {
    try {
        const currentYear = await AcademicYear.findOne({
            tenantId: req.user.tenantId,
            isCurrent: true
        });

        if (!currentYear) {
            return res.status(404).json({ success: false, message: 'No active academic year found for this tenant.' });
        }

        res.json({ success: true, data: currentYear });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const { getNextStudentCode } = require('../services/counterService');
const User = require('../models/User');
const { generateTemporaryPassword } = require('../utils/passwords');
const { normalizeDate, normalizePhone } = require('../utils/userProfile');
const { readTable } = require('../utils/spreadsheetReader');
const { rowsFromTable, FIELD_ALIASES, gradeLevelFromClassName } = require('../utils/importColumns');
const exportService = require('../services/exportService');
const { provisionParentAccess, rollbackParentAccess } = require('../services/parentAccessService');

const exactText = (value) => new RegExp(`^${String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

// Helper to validate section ownership, active status, and capacity
const validateSectionAccess = async ({ tenantId, branchId, classId, sectionId, academicYearId }) => {
    if (!sectionId) return null;

    const section = await Section.findOne({
        _id: sectionId,
        tenantId,
        branchId,
        classId,
        isActive: { $ne: false }
    });
    
    if (!section) {
        throw new Error('Invalid section for this class or branch.');
    }

    // Verify capacity
    if (section.capacity && section.capacity > 0) {
        const activeCount = await Enrollment.countDocuments({
            tenantId,
            branchId,
            sectionId,
            academicYearId,
            status: { $in: ['Current', 'Active', 'current', 'active'] }
        });
        if (activeCount >= section.capacity) {
            throw new Error('Section capacity has been reached.');
        }
    }

    return section;
};

const { buildStudentSearchCriteria } = require('../utils/studentSearch');

const buildRegistrarStudentQuery = async (req) => {
    const { classId, sectionId, academicYearId, status, q } = req.query;
    const query = { tenantId: req.user.tenantId };

    if (req.user.scope === 'branch') {
        query.branchId = req.user.branchId;
    }
    if (status) query.status = status;
    if (q && String(q).trim()) {
        const criteria = buildStudentSearchCriteria(q);
        if (criteria.length) query.$and = criteria;
    }

    if (classId || sectionId || academicYearId) {
        const enrollmentQuery = {
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        };
        if (classId) enrollmentQuery.classId = classId;
        if (sectionId) enrollmentQuery.sectionId = sectionId;
        if (academicYearId) enrollmentQuery.academicYearId = academicYearId;
        else enrollmentQuery.status = { $in: ['Current', 'Active', 'active'] };

        const enrollments = await Enrollment.find(enrollmentQuery).select('studentId');
        query._id = { $in: enrollments.map(e => e.studentId) };
    }

    return query;
};

const getEnrollmentMap = async ({ tenantId, branchId, studentIds, academicYearId }) => {
    if (!studentIds.length) return new Map();
    const enrollmentQuery = {
        tenantId,
        branchId,
        studentId: { $in: studentIds }
    };
    if (academicYearId) enrollmentQuery.academicYearId = academicYearId;
    else enrollmentQuery.status = { $in: ['Current', 'Active', 'current', 'active'] };

    const enrollments = await Enrollment.find(enrollmentQuery)
        .populate('classId', 'name gradeLevel')
        .populate('sectionId', 'name')
        .populate('academicYearId', 'name isCurrent')
        .sort({ createdAt: -1 });

    const map = new Map();
    for (const enrollment of enrollments) {
        const key = String(enrollment.studentId);
        if (!map.has(key)) map.set(key, enrollment);
    }
    return map;
};

// @desc    Create Student + Enrollment (Admission)
// @route   POST /api/registrar/students
// @access  Private (Registrar)
exports.createStudentAdmission = async (req, res) => {
    // NOTE: Removed transactions as current MongoDB instance is standalone.
    
    try {
        const {
            firstName,
            middleName,
            lastName,
            preferredName,
            DOB,
            gender,
            guardianInfo,
            guardians,
            admissionDate,
            nationality,
            placeOfBirth,
            primaryLanguage,
            previousSchool,
            emergencyContact,
            medicalInfo,
            learningSupport,
            notes,
            status,
            classId,
            sectionId,
            sectionName,
            academicYearId
        } = req.body;

        const normalizedDob = DOB ? normalizeDate(DOB, 'Date of birth') : DOB;
        const normalizedGender = gender ? `${String(gender).charAt(0).toUpperCase()}${String(gender).slice(1).toLowerCase()}` : gender;
        const normalizedGuardian = {
            ...(guardianInfo || {}),
            name: guardianInfo?.name ? String(guardianInfo.name).trim() : undefined,
            phone: guardianInfo?.phone ? normalizePhone(guardianInfo.phone, 'Guardian phone') : undefined,
            address: guardianInfo?.address ? String(guardianInfo.address).trim() : undefined,
            email: guardianInfo?.email ? String(guardianInfo.email).trim().toLowerCase() : undefined,
            relationship: String(guardianInfo?.relationship || 'Guardian').trim()
        };
        if (normalizedGuardian.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedGuardian.email)) {
            return res.status(400).json({ success: false, message: 'Guardian email address is invalid.' });
        }

        // 1. Generate Student ID / Admission Number automatically
        const generatedStudentId = await getNextStudentCode(req.user.tenantId, req.user.branchId);
        const studentCode = generatedStudentId;
        const finalAdmissionNumber = generatedStudentId;

        // Prevent re-registering the same child. Names alone are not unique, so
        // require the same name, birth date, and guardian contact to match.
        const guardianIdentity = [];
        if (normalizedGuardian.email) guardianIdentity.push({ 'guardianInfo.email': normalizedGuardian.email });
        if (normalizedGuardian.phone) guardianIdentity.push({ 'guardianInfo.phone': normalizedGuardian.phone });
        const existingStudent = await Student.findOne({ 
            tenantId: req.user.tenantId,
            $or: [
                { admissionNumber: finalAdmissionNumber },
                ...(normalizedDob && guardianIdentity.length ? [{
                    firstName: exactText(firstName),
                    lastName: exactText(lastName),
                    DOB: normalizedDob,
                    $and: [
                        { $or: guardianIdentity },
                        String(middleName || '').trim()
                            ? { middleName: exactText(middleName) }
                            : { $or: [{ middleName: { $exists: false } }, { middleName: null }, { middleName: '' }] }
                    ]
                }] : [])
            ]
        });

        if (existingStudent) {
            const generatedIdCollision = String(existingStudent.admissionNumber || '') === String(finalAdmissionNumber);
            return res.status(409).json({
                success: false,
                message: generatedIdCollision
                    ? 'Admission number already exists for this school.'
                    : `Possible duplicate student found (${existingStudent.admissionNumber}). Open the existing profile and use Re-Enrollment instead.`,
                duplicateStudent: generatedIdCollision ? undefined : {
                    id: existingStudent._id,
                    admissionNumber: existingStudent.admissionNumber,
                    name: [existingStudent.firstName, existingStudent.middleName, existingStudent.lastName].filter(Boolean).join(' ')
                }
            });
        }

        // 2. Resolve Academic Year
        let useYearId = academicYearId;
        if (!useYearId) {
            const currentYear = await AcademicYear.findOne({ tenantId: req.user.tenantId, isCurrent: true });
            if (!currentYear) {
                return res.status(400).json({ success: false, message: 'No current academic year found. Please specify one.' });
            }
            useYearId = currentYear._id;
        } else {
            const checkYear = await AcademicYear.findOne({ _id: useYearId, tenantId: req.user.tenantId, isCurrent: true });
            if (!checkYear) {
                return res.status(400).json({ success: false, message: 'Invalid academic year for this tenant.' });
            }
        }

        // 3. Validate Class existence and scope
        const classObj = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!classObj) {
            return res.status(400).json({ success: false, message: 'Invalid Class ID for this branch.' });
        }

        // 3.5 Resolve Section (existing or create by name) and validate
        let resolvedSectionId = null;
        if (sectionId) {
            try {
                await validateSectionAccess({
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    classId,
                    sectionId,
                    academicYearId: useYearId
                });
                resolvedSectionId = sectionId;
            } catch (err) {
                return res.status(400).json({ success: false, message: err.message });
            }
        } else if (sectionName && sectionName.trim()) {
            const normalizedSectionName = sectionName.trim();
            let sectionObj = await Section.findOne({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                classId,
                name: normalizedSectionName
            });
            if (!sectionObj) {
                sectionObj = await Section.create({
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    classId,
                    name: normalizedSectionName
                });
            }
            try {
                await validateSectionAccess({
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    classId,
                    sectionId: sectionObj._id,
                    academicYearId: useYearId
                });
                resolvedSectionId = sectionObj._id;
            } catch (err) {
                return res.status(400).json({ success: false, message: err.message });
            }
        }

        // 3.6 Student login must be the student ID (admission number)
        const loginUsername = finalAdmissionNumber;
        const existingLogin = await User.findOne({
            tenantId: req.user.tenantId,
            username: loginUsername
        });
        if (existingLogin) {
            return res.status(409).json({
                success: false,
                message: 'Admission number already exists for this school.'
            });
        }
        if (!normalizedGuardian.email) {
            return res.status(400).json({ success: false, message: 'Guardian email is required for parent portal access.' });
        }

        // 4. Create Student (with all-or-nothing rollback)
        let createdStudent = null;
        let createdUser = null;
        let createdEnrollment = null;
        let parentProvision = null;

        try {
            const newStudent = new Student({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                admissionNumber: finalAdmissionNumber,
                studentCode,
                firstName: String(firstName).trim(),
                middleName,
                lastName: String(lastName).trim(),
                preferredName,
                DOB: normalizedDob,
                gender: normalizedGender,
                admissionDate: admissionDate ? normalizeDate(admissionDate, 'Admission date', { allowFuture: true }) : new Date(),
                nationality,
                placeOfBirth,
                primaryLanguage,
                previousSchool,
                guardianInfo: normalizedGuardian,
                guardians,
                emergencyContact,
                medicalInfo,
                learningSupport,
                notes,
                createdBy: req.user._id,
                updatedBy: req.user._id,
                status: status || 'Active'
            });
            await newStudent.save();
            createdStudent = newStudent;

            // 4.5 Create Student User Account
            const defaultPassword = generateTemporaryPassword();

            const studentUser = new User({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                studentId: newStudent._id,
                name: `${firstName} ${lastName}`,
                username: loginUsername,
                passwordHash: defaultPassword, // Hashing is handled by User model pre-save hook
                role: 'student',
                scope: 'branch',
                mustChangePassword: true,
                isActive: true,
                createdBy: req.user._id,
                updatedBy: req.user._id
            });
            await studentUser.save();
            createdUser = studentUser;

            // 5. Create Enrollment
            const newEnrollment = new Enrollment({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                studentId: newStudent._id,
                classId,
                sectionId: resolvedSectionId,
                academicYearId: useYearId,
                status: 'Current'
            });
            await newEnrollment.save();
            createdEnrollment = newEnrollment;

            // 5.5 Parent access is mandatory: create a new parent or link an existing one by email.
            parentProvision = await provisionParentAccess({
                tenantId: req.user.tenantId,
                student: newStudent,
                guardianInfo: normalizedGuardian,
                actorUserId: req.user._id
            });

            // 6. Audit Logs
            try {
                 await logAction({
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    actorUserId: req.user._id,
                    actorRole: 'registrar',
                    action: 'STUDENT_CREATED',
                    entityType: 'Student',
                    entityId: newStudent._id,
                    after: newStudent.toObject(),
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
            } catch (auditErr) { console.error("Audit Log Error:", auditErr); }

            return res.status(201).json({
                success: true,
                data: {
                    student: newStudent,
                    enrollment: newEnrollment,
                    account: {
                        username: loginUsername,
                        defaultPassword: defaultPassword
                    },
                    parentAccount: {
                        email: parentProvision.parentUser.email,
                        created: parentProvision.createdParentUser,
                        active: parentProvision.parentUser.isActive,
                        defaultPassword: parentProvision.temporaryPassword
                    }
                }
            });
        } catch (innerError) {
            // Explicit Rollback
            await rollbackParentAccess(parentProvision, req.user.tenantId, createdStudent?._id);
            if (createdEnrollment) {
                await Enrollment.deleteOne({ _id: createdEnrollment._id, tenantId: req.user.tenantId }).catch(e => console.error("Rollback enrollment error:", e));
            }
            if (createdUser) {
                await User.deleteOne({ _id: createdUser._id, tenantId: req.user.tenantId }).catch(e => console.error("Rollback user error:", e));
            }
            if (createdStudent) {
                await Student.deleteOne({ _id: createdStudent._id, tenantId: req.user.tenantId }).catch(e => console.error("Rollback student error:", e));
            }
            throw innerError;
        }

    } catch (error) {
        console.error("Admission Error:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (error.code === 11000) {
            const errStr = JSON.stringify(error.keyValue || error.message || '');
            if (errStr.includes('admissionNumber') || errStr.includes('username') || errStr.includes('studentCode')) {
                return res.status(409).json({ success: false, message: 'Admission number already exists for this school.' });
            }
            if (errStr.includes('email')) {
                return res.status(409).json({ success: false, message: 'Email already exists for this school.' });
            }
            return res.status(409).json({ success: false, message: 'Duplicate key error.' });
        }
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Admission could not be completed.'
        });
    }
};

// @desc    Reset Student Password
// @route   PUT /api/registrar/students/:id/reset-password
// @access  Private (Registrar)
exports.resetStudentPassword = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid student ID format' });
        }

        const student = await Student.findOne({ _id: req.params.id, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        const userAccount = await User.findOne({ studentId: student._id, tenantId: req.user.tenantId });
        if (!userAccount) return res.status(404).json({ success: false, message: 'User account not found' });

        const defaultPassword = generateTemporaryPassword();
        userAccount.passwordHash = defaultPassword; // Pre-save hook hashes this
        userAccount.mustChangePassword = true;
        await userAccount.save();

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: 'registrar',
            action: 'STUDENT_PASSWORD_RESET',
            entityType: 'User',
            entityId: userAccount._id,
            ip: req.ip
        });

        res.json({
            success: true,
            message: 'Password reset successfully',
            data: { temporaryPassword: defaultPassword }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Students (Filtered & Paginated)
// @route   GET /api/registrar/students
// @access  Private (Registrar)
exports.getStudents = async (req, res) => {
    try {
        let page = parseInt(req.query.page, 10) || 1;
        let limit = parseInt(req.query.limit, 10) || 10;
        if (limit > 100) limit = 100;
        if (limit < 1) limit = 10;
        if (page < 1) page = 1;

        const query = await buildRegistrarStudentQuery(req);

        const total = await Student.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        const students = await Student.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        let responseStudents = students;
        if (String(req.query.includeEnrollment || '').toLowerCase() === 'true') {
            const enrollmentByStudentId = await getEnrollmentMap({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                studentIds: students.map(({ _id }) => _id),
                academicYearId: req.query.enrollmentYearId || undefined
            });
            responseStudents = students.map((student) => ({
                ...student.toObject(),
                currentEnrollment: enrollmentByStudentId.get(String(student._id)) || null
            }));
        }

        res.json({
            success: true,
            data: responseStudents,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Export Students CSV
// @route   GET /api/registrar/students/export.csv
// @access  Private (Registrar)
exports.exportStudents = async (req, res) => {
    try {
        const query = await buildRegistrarStudentQuery(req);
        const students = await Student.find(query)
            .sort({ createdAt: -1 })
            .limit(5000);

        const enrollmentByStudentId = await getEnrollmentMap({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            studentIds: students.map(student => student._id),
            academicYearId: req.query.academicYearId
        });

        const csv = exportService.generateStudentDirectoryCSV(students, enrollmentByStudentId);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=students_${new Date().toISOString().slice(0, 10)}.csv`);
        return res.send(csv);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Download Student Import Template
// @route   GET /api/registrar/students/import-template.csv
// @access  Private (Registrar)
exports.downloadStudentImportTemplate = async (req, res) => {
    const headers = [
        'firstName',
        'middleName',
        'lastName',
        'preferredName',
        'dateOfBirth',
        'gender',
        'classNumber',
        'sectionName',
        'admissionDate',
        'nationality',
        'placeOfBirth',
        'primaryLanguage',
        'previousSchool',
        'guardianName',
        'guardianPhone',
        'guardianEmail',
        'guardianRelationship',
        'guardianAddress',
        'emergencyContactName',
        'emergencyContactPhone',
        'medicalNotes',
        'learningSupportDetails',
        'notes'
    ];

    const sample = {
        firstName: 'Amina',
        middleName: '',
        lastName: 'Hassan',
        preferredName: '',
        dateOfBirth: '2015-01-20',
        gender: 'Female',
        classNumber: '1',
        sectionName: 'A',
        admissionDate: new Date().toISOString().slice(0, 10),
        nationality: 'Somali',
        placeOfBirth: 'Hargeisa',
        primaryLanguage: 'Somali',
        previousSchool: 'Sunrise School',
        guardianName: 'Mohamed Hassan',
        guardianPhone: "'+252610000000",
        guardianEmail: 'guardian@example.com',
        guardianRelationship: 'Father',
        guardianAddress: 'Main Road, Hargeisa',
        emergencyContactName: 'Ahmed Hassan',
        emergencyContactPhone: "'+252611111111",
        medicalNotes: '',
        learningSupportDetails: '',
        notes: ''
    };

    const csv = exportService.toCSV(headers, [sample]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=student_import_template.csv');
    res.send(csv);
};

const normalizeImportPhone = (value) => {
    let text = String(value || '').trim().replace(/^'/, '');
    if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(text)) {
        const numeric = Number(text);
        if (Number.isFinite(numeric)) text = numeric.toFixed(0);
    }
    // A school often puts two numbers in one cell: "0615... / 0617...". The first is the
    // one they answer, so use that. Numbers run together with no separator are left alone,
    // because guessing where to cut a guardian's phone number is worse than asking.
    const firstOfSeveral = text.split(/\s*(?:\/|,|;|&|\bor\b)\s*/i)[0].trim();
    if (firstOfSeveral) text = firstOfSeveral;
    return normalizePhone(text, 'Phone');
};

const normalizeImportDate = (value, fieldName) => {
    const text = String(value || '').trim();
    if (!text) return undefined;
    return normalizeDate(text, fieldName, { allowFuture: fieldName === 'Admission date' }).toISOString().slice(0, 10);
};

/**
 * Create the classes and sections a school's list mentions but the app does not have yet.
 *
 * Only ever called when the user has seen the list and pressed the button. Creating school
 * structure from a spreadsheet without asking would turn one typo in the class column into a
 * class that lives forever.
 */
const createMissingClassesAndSections = async (req, rows) => {
    const created = { classes: [], sections: [] };

    let category = await ClassCategory.findOne({ tenantId: req.user.tenantId, branchId: req.user.branchId });
    if (!category) {
        category = await ClassCategory.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            name: 'General',
            description: 'Created when the student list was imported'
        });
    }

    const existingClasses = await Class.find({ tenantId: req.user.tenantId, branchId: req.user.branchId });
    const byName = new Map(existingClasses.map((item) => [String(item.name).trim().toLowerCase(), item]));

    // Keep the school's own spelling and order, and ignore blanks.
    const wantedClasses = [];
    for (const row of rows) {
        const name = String(row.classNumber || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (byName.has(key) || wantedClasses.some((item) => item.toLowerCase() === key)) continue;
        // A name that matches an existing grade level is already covered by that class.
        if (existingClasses.some((item) => String(item.gradeLevel).trim().toLowerCase() === key)) continue;
        wantedClasses.push(name);
    }

    for (const name of wantedClasses) {
        const made = await Class.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            categoryId: category._id,
            name,
            gradeLevel: gradeLevelFromClassName(name)
        });
        byName.set(name.toLowerCase(), made);
        created.classes.push({ name: made.name, gradeLevel: made.gradeLevel });
    }

    const allClasses = [...byName.values()];
    const existingSections = await Section.find({ tenantId: req.user.tenantId, branchId: req.user.branchId });
    const sectionKey = (classId, name) => `${classId}::${String(name).trim().toLowerCase()}`;
    const haveSection = new Set(existingSections.map((item) => sectionKey(item.classId, item.name)));

    for (const row of rows) {
        const className = String(row.classNumber || '').trim().toLowerCase();
        const sectionName = String(row.sectionName || '').trim();
        if (!className || !sectionName) continue;
        const target = allClasses.find((item) => String(item.name).trim().toLowerCase() === className
            || String(item.gradeLevel).trim().toLowerCase() === className);
        if (!target) continue;
        const key = sectionKey(target._id, sectionName);
        if (haveSection.has(key)) continue;
        haveSection.add(key);
        await Section.create({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            classId: target._id,
            name: sectionName
        });
        created.sections.push({ className: target.name, name: sectionName });
    }

    return created;
};

// Resolve human-friendly values without writing any student records. Shared by the two
// ways a list arrives: rows already parsed in the browser, or a file the school uploaded.
const buildImportPreview = async (req, rows, { createMissing = false } = {}) => {
        const createdStructure = createMissing ? await createMissingClassesAndSections(req, rows) : null;

        const [currentYear, classes, sections] = await Promise.all([
            AcademicYear.findOne({ tenantId: req.user.tenantId, isCurrent: true }),
            Class.find({ tenantId: req.user.tenantId, branchId: req.user.branchId }),
            Section.find({ tenantId: req.user.tenantId, branchId: req.user.branchId, isActive: { $ne: false } })
        ]);
        if (!currentYear) throw importError('No active academic year is configured.');

        // Naming the classes that exist turns "not found" from a dead end into an answer.
        // Without it a school comparing two screens cannot tell whether the class is missing,
        // spelled differently, or sitting in another campus.
        const classNames = classes.map((item) => item.name).sort();
        const availableClasses = classNames.length
            ? `This campus has: ${classNames.join(', ')}`
            : 'This campus has no classes yet. Create the classes first, then import the students.';

        const emails = [...new Set(rows.map((row) => String(row.guardianEmail || '').trim().toLowerCase()).filter(Boolean))];
        const existingUsers = emails.length
            ? await User.find({ tenantId: req.user.tenantId, email: { $in: emails } }).select('email role isActive')
            : [];
        const userByEmail = new Map(existingUsers.map((user) => [String(user.email).toLowerCase(), user]));

        const newParentEmailsSeen = new Set();
        const previewRows = rows.map((row, index) => {
            const errors = [];
            // Which cells the user has to correct. The screen turns these into boxes on the
            // row itself, so a messy cell is fixed here instead of back in Excel.
            const problemFields = new Set();
            const fail = (field, message) => { errors.push(message); if (field) problemFields.add(field); };
            const value = (key) => String(row[key] || '').trim();
            const requestedClass = value('classNumber').toLowerCase();
            const classMatches = classes.filter((item) => (
                String(item.gradeLevel || '').trim().toLowerCase() === requestedClass
                || String(item.name || '').trim().toLowerCase() === requestedClass
            ));
            if (!requestedClass) fail('classNumber', 'Class number is required');
            else if (!classMatches.length) fail('classNumber', `Class "${value('classNumber')}" was not found. ${availableClasses}`);
            else if (classMatches.length > 1) fail('classNumber', `Class number "${value('classNumber')}" matches more than one class`);
            const resolvedClass = classMatches.length === 1 ? classMatches[0] : null;

            const requestedSection = value('sectionName');
            const sectionMatches = resolvedClass && requestedSection
                ? sections.filter((item) => String(item.classId) === String(resolvedClass._id) && String(item.name).trim().toLowerCase() === requestedSection.toLowerCase())
                : [];
            if (requestedSection && !sectionMatches.length && resolvedClass) {
                const sectionNames = sections
                    .filter((item) => String(item.classId) === String(resolvedClass._id))
                    .map((item) => item.name).sort();
                fail('sectionName', sectionNames.length
                    ? `Section "${requestedSection}" was not found in ${resolvedClass.name}, which has: ${sectionNames.join(', ')}`
                    : `${resolvedClass.name} has no sections yet, so "${requestedSection}" cannot be matched`);
            }
            if (sectionMatches.length > 1) fail('sectionName', `Section "${requestedSection}" is ambiguous`);
            const resolvedSection = sectionMatches.length === 1 ? sectionMatches[0] : null;

            [
                ['firstName', 'First name'], ['lastName', 'Last name'], ['dateOfBirth', 'Date of birth'],
                ['gender', 'Gender'], ['guardianName', 'Guardian name'], ['guardianPhone', 'Guardian phone'],
                ['guardianEmail', 'Guardian email'], ['guardianAddress', 'Guardian address']
            ].forEach(([key, label]) => { if (!value(key)) fail(key, `${label} is required`); });

            const gender = `${value('gender').charAt(0).toUpperCase()}${value('gender').slice(1).toLowerCase()}`;
            if (value('gender') && !['Male', 'Female', 'Other'].includes(gender)) fail('gender', 'Gender must be Male, Female, or Other');
            const email = value('guardianEmail').toLowerCase();
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('guardianEmail', 'Guardian email is invalid');

            let guardianPhone;
            let emergencyPhone;
            let DOB;
            let admissionDate;
            try { if (value('guardianPhone')) guardianPhone = normalizeImportPhone(value('guardianPhone')); } catch (error) { fail('guardianPhone', error.message); }
            try { if (value('emergencyContactPhone')) emergencyPhone = normalizeImportPhone(value('emergencyContactPhone')); } catch (error) { fail('emergencyContactPhone', `Emergency contact ${error.message.toLowerCase()}`); }
            try { if (value('dateOfBirth')) DOB = normalizeImportDate(value('dateOfBirth'), 'Date of birth'); } catch (error) { fail('dateOfBirth', error.message); }
            try { if (value('admissionDate')) admissionDate = normalizeImportDate(value('admissionDate'), 'Admission date'); } catch (error) { fail('admissionDate', error.message); }

            const existingUser = userByEmail.get(email);
            let parentAction = 'New parent account';
            if (existingUser && existingUser.role !== 'parent') {
                parentAction = 'Email conflict';
                fail('guardianEmail', 'Guardian email belongs to a non-parent account');
            } else if (existingUser && !existingUser.isActive) {
                parentAction = 'Inactive parent review required';
                fail('guardianEmail', 'Matching parent account is inactive');
            } else if (existingUser) {
                parentAction = 'Existing parent will be linked';
            } else if (email && newParentEmailsSeen.has(email)) {
                parentAction = 'Parent created by an earlier row will be linked';
            } else if (email) {
                newParentEmailsSeen.add(email);
            }

            const payload = resolvedClass && !errors.length ? {
                firstName: value('firstName'), middleName: value('middleName') || undefined,
                lastName: value('lastName'), preferredName: value('preferredName') || undefined,
                DOB, gender, admissionDate,
                nationality: value('nationality') || undefined,
                placeOfBirth: value('placeOfBirth') || undefined,
                primaryLanguage: value('primaryLanguage') || undefined,
                previousSchool: value('previousSchool') || undefined,
                classId: String(resolvedClass._id),
                sectionId: resolvedSection ? String(resolvedSection._id) : undefined,
                guardianInfo: {
                    name: value('guardianName'), phone: guardianPhone, email,
                    relationship: value('guardianRelationship') || 'Guardian', address: value('guardianAddress')
                },
                emergencyContact: value('emergencyContactName') || emergencyPhone ? {
                    name: value('emergencyContactName'), phone: emergencyPhone, relationship: 'Emergency contact'
                } : undefined,
                medicalInfo: value('medicalNotes') ? { notes: value('medicalNotes') } : undefined,
                learningSupport: value('learningSupportDetails') ? { hasSpecialNeeds: true, details: value('learningSupportDetails') } : undefined,
                notes: value('notes') || undefined
            } : null;

            return {
                rowNumber: index + 2,
                label: `${value('firstName') || 'Unnamed'} ${value('lastName')}`.trim(),
                className: resolvedClass?.name || value('classNumber') || '-',
                sectionName: resolvedSection?.name || requestedSection || '-',
                guardianEmail: email,
                parentAction,
                payload,
                errors,
                problemFields: [...problemFields],
                // Only a failing row needs its raw cells back; sending all 254 would be waste.
                source: errors.length ? { ...row } : undefined
            };
        });

        // Classes and sections the list mentions that the app does not have. The screen
        // offers to create these rather than sending the user off to build them by hand.
        const classKeys = new Set(classes.flatMap((item) => [
            String(item.name).trim().toLowerCase(),
            String(item.gradeLevel).trim().toLowerCase()
        ]));
        const missingClasses = [];
        const missingSections = [];
        for (const row of rows) {
            const className = String(row.classNumber || '').trim();
            const sectionName = String(row.sectionName || '').trim();
            if (className && !classKeys.has(className.toLowerCase())
                && !missingClasses.includes(className)) missingClasses.push(className);
            if (!className || !sectionName) continue;
            const known = classes.find((item) => String(item.name).trim().toLowerCase() === className.toLowerCase()
                || String(item.gradeLevel).trim().toLowerCase() === className.toLowerCase());
            const hasSection = known && sections.some((item) => String(item.classId) === String(known._id)
                && String(item.name).trim().toLowerCase() === sectionName.toLowerCase());
            const label = `${className} / ${sectionName}`;
            if (!hasSection && !missingSections.includes(label)) missingSections.push(label);
        }

        return {
            academicYear: currentYear.name,
            rows: previewRows,
            missing: { classes: missingClasses, sections: missingSections },
            created: createdStructure
        };
};

/**
 * Corrections typed on the preview screen, as { "86": { "guardianPhone": "+252615648340" } },
 * keyed by the row number shown to the user. Only fields the importer knows are accepted, so
 * a crafted request cannot reach anything else.
 */
const parseImportFixes = (value) => {
    const fixes = new Map();
    if (!value) return fixes;
    let parsed;
    try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch (error) { return fixes; }
    if (!parsed || typeof parsed !== 'object') return fixes;

    const known = new Set(Object.keys(FIELD_ALIASES));
    for (const [key, patch] of Object.entries(parsed)) {
        const rowNumber = Number(key);
        if (!Number.isInteger(rowNumber) || rowNumber < 2) continue;
        if (!patch || typeof patch !== 'object') continue;
        const clean = {};
        for (const [field, cell] of Object.entries(patch)) {
            if (!known.has(field)) continue;
            if (typeof cell !== 'string' && typeof cell !== 'number') continue;
            clean[field] = String(cell).trim();
        }
        if (Object.keys(clean).length) fixes.set(rowNumber, clean);
    }
    return fixes;
};

const importError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const sendPreviewFailure = (res, error) => res
    .status(error.statusCode || 500)
    .json({
        success: false,
        message: error.statusCode ? error.message : 'Import preview could not be generated.'
    });

// Rows already parsed by the browser. Kept so the existing screen and the template keep working.
exports.previewStudentImport = async (req, res) => {
    try {
        const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 500) : [];
        if (!rows.length) throw importError('At least one import row is required.');
        const data = await buildImportPreview(req, rows);
        res.json({ success: true, data });
    } catch (error) {
        sendPreviewFailure(res, error);
    }
};

/**
 * The school's own file: .xlsx straight from Excel, or .csv. Headings are matched loosely,
 * so "First Name" works as well as "firstName".
 */
exports.previewStudentImportFile = async (req, res) => {
    try {
        if (!req.file?.buffer) throw importError('Choose an Excel or CSV file to import.');

        let table;
        try {
            table = readTable(req.file.buffer);
        } catch (error) {
            throw importError(error.message || 'That file could not be read.');
        }
        if (table.length < 2) throw importError('That file has a heading row but no students under it.');

        const { rows, headings, missingRequired } = rowsFromTable(table);

        // A school's file always has a few messy cells. Applying the user's typed
        // corrections here means the whole list can be finished on this one screen,
        // instead of sending them back to Excel for two phone numbers in one box.
        const fixes = parseImportFixes(req.body && req.body.fixes);
        for (const [rowNumber, patch] of fixes) {
            const row = rows[rowNumber - 2];
            if (!row) continue;
            Object.assign(row, patch);
        }

        // When nothing required was found, the file is almost certainly the wrong one or has
        // different headings. Saying so once beats repeating "is required" on every row.
        if (missingRequired.length) {
            const found = headings.recognised.map((item) => item.heading);
            throw importError(
                `These columns are needed and were not found: ${missingRequired.join(', ')}. `
                + (found.length
                    ? `The file's columns were read as: ${found.join(', ')}.`
                    : 'No column in the file was recognised, so check the heading row.')
            );
        }

        const data = await buildImportPreview(req, rows.slice(0, 500), {
            createMissing: String(req.body?.createMissing || '') === 'true'
        });
        res.json({
            success: true,
            data: {
                ...data,
                fileName: req.file.originalname,
                columns: {
                    understood: headings.recognised,
                    ignored: headings.ignored,
                    notRecognised: headings.unknown
                }
            }
        });
    } catch (error) {
        sendPreviewFailure(res, error);
    }
};

// @desc    Get Printable Admission Summary
// @route   GET /api/registrar/students/:id/admission-summary
// @access  Private (Registrar)
exports.getAdmissionSummary = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid student ID format' });
        }

        const student = await Student.findOne({
            _id: req.params.id,
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found in this branch.' });
        }

        const [branch, enrollment] = await Promise.all([
            Branch.findOne({ _id: req.user.branchId, tenantId: req.user.tenantId }).select('name address phone email logoUrl'),
            Enrollment.findOne({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                studentId: student._id,
                status: { $in: ['Current', 'Active', 'current', 'active'] }
            })
                .populate('classId', 'name gradeLevel')
                .populate('sectionId', 'name')
                .populate('academicYearId', 'name isCurrent')
        ]);

        res.json({
            success: true,
            data: {
                documentType: 'Admission Summary',
                issuedAt: new Date(),
                school: {
                    name: branch?.name || '',
                    address: branch?.address || '',
                    phone: branch?.phone || '',
                    email: branch?.email || '',
                    logoUrl: branch?.logoUrl || ''
                },
                student: {
                    id: student._id,
                    admissionNumber: student.admissionNumber,
                    studentCode: student.studentCode,
                    name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '),
                    preferredName: student.preferredName || '',
                    gender: student.gender || '',
                    dateOfBirth: student.DOB,
                    admissionDate: student.admissionDate,
                    status: student.status
                },
                enrollment: enrollment ? {
                    className: enrollment.classId?.name || '',
                    sectionName: enrollment.sectionId?.name || '',
                    academicYearName: enrollment.academicYearId?.name || '',
                    status: enrollment.status
                } : null,
                guardian: student.guardianInfo || null,
                emergencyContact: student.emergencyContact || null,
                medicalInfo: student.medicalInfo || null,
                learningSupport: student.learningSupport || null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Single Student Details
// @route   GET /api/registrar/students/:id
// @access  Private (Registrar)
exports.getStudentById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid student ID format' });
        }

        const query = {
            _id: req.params.id,
            tenantId: req.user.tenantId
        };

        // Branch-scoped users (Registrars, etc.) can only see their own branch
        if (req.user.scope === 'branch') {
            query.branchId = req.user.branchId;
        }

        const student = await Student.findOne(query);

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found in this branch.' });
        }

        // Get current enrollment(s)
        const enrollments = await Enrollment.find({
            studentId: student._id,
            tenantId: req.user.tenantId
        })
        .populate('classId', 'name gradeLevel')
        .populate('sectionId', 'name')
        .populate('academicYearId', 'name isCurrent')
        .populate('branchId', 'name')
        .populate('promotionDecision.targetAcademicYearId', 'name')
        .populate('promotionDecision.targetClassId', 'name gradeLevel')
        .sort({ createdAt: -1 });

        // Get associated user account (for login details)
        const userAccount = await User.findOne({ studentId: student._id }).select('username mustChangePassword');

        res.json({
            success: true,
            data: {
                ...student.toObject(),
                enrollments,
                portalAccount: userAccount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Student Profile
// @route   PUT /api/registrar/students/:id
// @access  Private (Registrar)
exports.updateStudent = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid student ID format' });
        }

        const {
            guardianInfo, guardians, status, firstName, middleName, lastName, preferredName, gender, DOB,
            admissionDate, nationality, placeOfBirth, primaryLanguage, previousSchool, emergencyContact,
            medicalInfo, learningSupport, notes, photoUrl
        } = req.body;
        
        const student = await Student.findOne({
            _id: req.params.id,
            tenantId: req.user.tenantId,
            branchId: req.user.branchId
        });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        const oldData = student.toObject();

        // Update allowed fields
        if (guardianInfo) {
            const currentGuardian = student.guardianInfo?.toObject?.() || student.guardianInfo || {};
            const nextGuardian = { ...currentGuardian, ...guardianInfo };
            if (nextGuardian.phone) nextGuardian.phone = normalizePhone(nextGuardian.phone, 'Guardian phone');
            student.guardianInfo = nextGuardian;
            const primaryIndex = (student.guardians || []).findIndex((guardian) => guardian.isPrimary);
            if (primaryIndex >= 0) {
                const currentPrimary = student.guardians[primaryIndex].toObject?.() || student.guardians[primaryIndex];
                student.guardians[primaryIndex] = { ...currentPrimary, ...nextGuardian };
            }
        }
        if (Array.isArray(guardians)) student.guardians = guardians;
        let leaving = false;
        if (status && status !== student.status) {
            if (!['Active', 'Inactive', 'Left'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Only Active, Inactive or Left can be set here. Transfer and graduation statuses are managed by their workflows.'
                });
            }
            // A student who left has no class any more. Bringing them back means choosing one,
            // which is what Re-Enrollment does, so a plain status change cannot undo Left.
            if (student.status === 'Left') {
                return res.status(409).json({
                    success: false,
                    message: 'This student has left. Use Re-Enrollment to bring them back into a class.'
                });
            }
            if (status === 'Left') {
                leaving = true;
                student.withdrawalDate = req.body.leftOn ? normalizeDate(req.body.leftOn, 'Leaving date', { allowFuture: true }) : new Date();
                student.withdrawalReason = String(req.body.leftReason || '').trim().slice(0, 300) || undefined;
            }
            student.status = status;
        }
        if (firstName) student.firstName = firstName;
        if (middleName !== undefined) student.middleName = middleName;
        if (lastName) student.lastName = lastName;
        if (preferredName !== undefined) student.preferredName = preferredName;
        if (gender) student.gender = gender;
        if (DOB) student.DOB = normalizeDate(DOB, 'Date of birth');
        if (admissionDate) student.admissionDate = normalizeDate(admissionDate, 'Admission date', { allowFuture: true });
        if (nationality !== undefined) student.nationality = nationality;
        if (placeOfBirth !== undefined) student.placeOfBirth = placeOfBirth;
        if (primaryLanguage !== undefined) student.primaryLanguage = primaryLanguage;
        if (previousSchool !== undefined) student.previousSchool = previousSchool;
        if (emergencyContact !== undefined) student.emergencyContact = emergencyContact;
        if (medicalInfo !== undefined) student.medicalInfo = medicalInfo;
        if (learningSupport !== undefined) student.learningSupport = learningSupport;
        if (notes !== undefined) student.notes = notes;
        if (photoUrl !== undefined) student.photoUrl = photoUrl;
        student.updatedBy = req.user._id;

        await student.save();

        // Leaving ends the student's place in their class: they drop off registers and class
        // lists, and monthly billing never reaches them again. Bills they already have stay.
        if (leaving) {
            await Enrollment.updateMany(
                { tenantId: req.user.tenantId, studentId: student._id, isCurrent: true },
                { $set: { status: 'Withdrawn' } }
            );
        }

        // Audit Log
        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: req.user.role,
            action: leaving ? 'STUDENT_LEFT' : 'STUDENT_UPDATED',
            entityType: 'Student',
            entityId: student._id,
            before: oldData,
            after: student.toObject(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ success: true, data: student });
    } catch (error) {
        res.status(error.statusCode || (error.name === 'ValidationError' ? 400 : 500)).json({ success: false, message: error.message });
    }
};

// @desc    Create Enrollment (Re-enrollment)
// @route   POST /api/registrar/enrollments
// @access  Private (Registrar)
exports.createEnrollment = async (req, res) => {
    try {
        const { studentId, classId, sectionId, sectionName, academicYearId, status } = req.body;

        // 1. Verify Student Ownership
        const student = await Student.findOne({ _id: studentId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

        // 1.5 Validate Class ownership
        const classObj = await Class.findOne({ _id: classId, tenantId: req.user.tenantId, branchId: req.user.branchId });
        if (!classObj) {
            return res.status(400).json({ success: false, message: 'Invalid Class ID for this branch.' });
        }

        // 1.6 Validate Academic Year ownership
        const yearObj = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.user.tenantId, isCurrent: true });
        if (!yearObj) {
            return res.status(400).json({ success: false, message: 'Invalid academic year for this tenant.' });
        }

        // 2. Prevent Duplicate Active Enrollment (including lowercase variations)
        const existingActive = await Enrollment.findOne({
            tenantId: req.user.tenantId,
            studentId,
            academicYearId,
            status: { $in: ['Current', 'Active', 'current', 'active'] }
        });

        if (existingActive) {
            return res.status(400).json({ success: false, message: 'Student is already enrolled in this academic year.' });
        }

        let resolvedSectionId = null;
        if (sectionId) {
            try {
                await validateSectionAccess({
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    classId,
                    sectionId,
                    academicYearId
                });
                resolvedSectionId = sectionId;
            } catch (err) {
                return res.status(400).json({ success: false, message: err.message });
            }
        } else if (sectionName && sectionName.trim()) {
            const normalizedSectionName = sectionName.trim();
            let sectionObj = await Section.findOne({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                classId,
                name: normalizedSectionName
            });
            if (!sectionObj) {
                sectionObj = await Section.create({
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    classId,
                    name: normalizedSectionName
                });
            }
            try {
                await validateSectionAccess({
                    tenantId: req.user.tenantId,
                    branchId: req.user.branchId,
                    classId,
                    sectionId: sectionObj._id,
                    academicYearId
                });
                resolvedSectionId = sectionObj._id;
            } catch (err) {
                return res.status(400).json({ success: false, message: err.message });
            }
        }

        if (['Graduated', 'Transferred'].includes(student.status)) {
            return res.status(409).json({ success: false, message: `${student.status} students cannot be re-enrolled in this branch. Use the appropriate academic workflow.` });
        }

        const previousEnrollments = mongoose.connection.readyState === 0 ? [] : await Enrollment.find({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            studentId,
            academicYearId: { $ne: academicYearId },
            status: { $in: ['Current', 'Active', 'current', 'active'] }
        });
        const previousStudentStatus = student.status;
        let newEnrollment = null;
        try {
            if (previousEnrollments.length) {
                await Enrollment.updateMany(
                    { _id: { $in: previousEnrollments.map(item => item._id) }, tenantId: req.user.tenantId },
                    { $set: { status: 'Superseded' } }
                );
            }
            newEnrollment = await Enrollment.create({
                tenantId: req.user.tenantId,
                branchId: req.user.branchId,
                studentId,
                classId,
                sectionId: resolvedSectionId,
                academicYearId,
                status: status || 'Current'
            });
            if (student.status && student.status !== 'Active') {
                student.status = 'Active';
                student.updatedBy = req.user._id;
                await student.save();
            }
        } catch (error) {
            if (newEnrollment?._id) await Enrollment.deleteOne({ _id: newEnrollment._id, tenantId: req.user.tenantId }).catch(() => {});
            for (const previous of previousEnrollments) {
                await Enrollment.updateOne({ _id: previous._id, tenantId: req.user.tenantId }, { $set: { status: previous.status } }).catch(() => {});
            }
            if (student.status !== previousStudentStatus) {
                student.status = previousStudentStatus;
                await student.save().catch(() => {});
            }
            throw error;
        }

        await logAction({
            tenantId: req.user.tenantId,
            branchId: req.user.branchId,
            actorUserId: req.user._id,
            actorRole: 'registrar',
            action: 'ENROLLMENT_CREATED',
            entityType: 'Enrollment',
            entityId: newEnrollment._id,
            after: newEnrollment.toObject(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(201).json({
            success: true,
            message: 'Student re-enrolled successfully.',
            data: newEnrollment,
            previousEnrollmentsClosed: previousEnrollments.length
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Student already has a current enrollment for this academic year.' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Registrar Dashboard Statistics
// @route   GET /api/registrar/stats
// @access  Private (Registrar)
exports.getRegistrarStats = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const branchId = req.user.branchId;

        // Find current academic year
        const currentYear = await AcademicYear.findOne({ tenantId, isCurrent: true });
        const currentYearId = currentYear ? currentYear._id : null;

        const totalStudents = await Student.countDocuments({ tenantId, branchId });
        const activeStudents = await Student.countDocuments({ tenantId, branchId, status: 'Active' });
        const inactiveStudents = await Student.countDocuments({ tenantId, branchId, status: 'Inactive' });
        const transferredStudents = await Student.countDocuments({ tenantId, branchId, status: 'Transferred' });
        const graduatedStudents = await Student.countDocuments({ tenantId, branchId, status: 'Graduated' });

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const newAdmissionsThisMonth = await Student.countDocuments({
            tenantId,
            branchId,
            createdAt: { $gte: startOfMonth }
        });

        let currentYearEnrollments = 0;
        if (currentYearId) {
            currentYearEnrollments = await Enrollment.countDocuments({
                tenantId,
                branchId,
                academicYearId: currentYearId,
                status: { $in: ['Current', 'Active', 'current', 'active'] }
            });
        }

        res.json({
            success: true,
            data: {
                totalStudents,
                activeStudents,
                inactiveStudents,
                transferredStudents,
                graduatedStudents,
                newAdmissionsThisMonth,
                currentYearEnrollments
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
