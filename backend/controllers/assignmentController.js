const TeacherAssignment = require('../models/TeacherAssignment');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Subject = require('../models/Subject');
const Class = require('../models/Class');
const AcademicYear = require('../models/AcademicYear');
const Section = require('../models/Section');

// @desc    Assign a teacher to a class and subject
// @route   POST /api/assignments
const assignTeacher = async (req, res) => {
    let { teacherId, teacherUserId, classId, subjectId, subject, academicYearId, branchId, sectionId } = req.body;

    try {
        const targetBranchId = req.branchId || branchId;
        if (!targetBranchId) {
            return res.status(403).json({ message: 'Access denied for this assignment resource.' });
        }

        // 1. Verify target branch belongs to the same tenant
        const branch = await Branch.findOne({ _id: targetBranchId, tenantId: req.tenantId });
        if (!branch) {
            return res.status(403).json({ message: 'Access denied for this assignment resource.' });
        }

        // 2. Verify classId belongs to the same tenant and branch
        const targetClass = await Class.findOne({ _id: classId, tenantId: req.tenantId, branchId: targetBranchId });
        if (!targetClass) {
            return res.status(403).json({ message: 'Access denied for this assignment resource.' });
        }

        // 3. Verify academicYearId belongs to the same tenant
        const targetYear = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId });
        if (!targetYear) {
            return res.status(403).json({ message: 'Access denied for this assignment resource.' });
        }

        const resolvedTeacherId = teacherUserId || teacherId;
        if (!resolvedTeacherId) return res.status(400).json({ message: 'teacherUserId is required' });

        // 4. Verify teacherUserId belongs to the same tenant and is a teacher
        const teacherUser = await User.findOne({ _id: resolvedTeacherId, tenantId: req.tenantId, role: 'teacher' });
        if (!teacherUser) {
            return res.status(403).json({ message: 'Access denied for this assignment resource.' });
        }
        const authorizedBranchIds = [teacherUser.branchId, ...(teacherUser.authorizedBranchIds || [])]
            .filter(Boolean)
            .map((id) => id.toString());
        if (!authorizedBranchIds.includes(targetBranchId.toString())) {
            return res.status(403).json({ message: 'Access denied for this assignment resource.' });
        }

        let resolvedSubjectId = subjectId;
        if (!resolvedSubjectId && subject) {
            const match = await Subject.findOne({
                tenantId: req.tenantId,
                branchId: targetBranchId,
                name: new RegExp(`^${subject.trim()}$`, 'i')
            }).select('_id');
            resolvedSubjectId = match?._id;
        }
        if (!resolvedSubjectId) return res.status(400).json({ message: 'subjectId is required' });

        // 5. Verify resolvedSubjectId belongs to the same tenant and branch
        const targetSubject = await Subject.findOne({ _id: resolvedSubjectId, tenantId: req.tenantId, branchId: targetBranchId });
        if (!targetSubject) {
            return res.status(403).json({ message: 'Access denied for this assignment resource.' });
        }

        // Validate sectionId if provided
        if (sectionId) {
            const section = await Section.findOne({
                _id: sectionId,
                tenantId: req.tenantId,
                branchId: targetBranchId,
                classId: classId,
                isActive: { $ne: false }
            });
            if (!section) {
                return res.status(403).json({ message: 'Access denied for this assignment resource.' });
            }
        }

        // Check for existing assignment including branchId, teacherUserId, and sectionId if present
        const duplicateQuery = {
            tenantId: req.tenantId,
            branchId: targetBranchId,
            teacherUserId: resolvedTeacherId,
            classId,
            subjectId: resolvedSubjectId,
            academicYearId
        };
        if (sectionId) {
            duplicateQuery.sectionId = sectionId;
        }

        const existingAssignment = await TeacherAssignment.findOne(duplicateQuery).populate('teacherUserId', 'name');

        if (existingAssignment) {
            return res.status(400).json({ 
                message: `This class was assigned the teacher name: ${existingAssignment.teacherUserId?.name} for this subject.` 
            });
        }

        const assignment = await TeacherAssignment.create({
            tenantId: req.tenantId,
            branchId: targetBranchId,
            teacherUserId: resolvedTeacherId,
            classId,
            academicYearId,
            sectionId: sectionId || null,
            subjectId: resolvedSubjectId,
            subject: resolvedSubjectId
        });

        res.status(201).json(assignment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get assignments for the logged-in teacher
// @route   GET /api/assignments/my
const getMyAssignments = async (req, res) => {
    try {
        const assignments = await TeacherAssignment.find({ 
            teacherUserId: req.user._id,
            tenantId: req.tenantId
        })
        .populate('classId')
        .populate('academicYearId');
        
        res.json(assignments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all assignments (for admin)
// @route   GET /api/assignments
const getAllAssignments = async (req, res) => {
    try {
        const query = { tenantId: req.tenantId };
        if (req.branchId) {
            query.branchId = req.branchId;
        }
        const assignments = await TeacherAssignment.find(query)
            .populate('teacherUserId', 'name email')
            .populate('classId', 'name')
            .populate('academicYearId', 'name')
            .sort({ createdAt: -1 });
        res.json(assignments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { assignTeacher, getMyAssignments, getAllAssignments };
