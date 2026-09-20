const AcademicYear = require('../models/AcademicYear');
const Class = require('../models/Class');
const Branch = require('../models/Branch');

// @desc    Create Academic Year
// @route   POST /api/academic/years
const createAcademicYear = async (req, res) => {
    const { name, startDate, endDate, isCurrent } = req.body;
    try {
        if (isCurrent) {
            await AcademicYear.updateMany({ tenantId: req.tenantId }, { isCurrent: false });
        }
        const year = await AcademicYear.create({
            tenantId: req.tenantId,
            name,
            startDate,
            endDate,
            isCurrent
        });
        res.status(201).json(year);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create Class
// @route   POST /api/academic/classes
const createClass = async (req, res) => {
    const { name, gradeLevel, branchId } = req.body;
    try {
        const targetBranchId = req.branchId || branchId;
        if (!targetBranchId) {
            return res.status(403).json({ message: 'Access denied for this academic resource.' });
        }
        
        // Verify branch exists and belongs to the same tenant
        const branch = await Branch.findOne({ _id: targetBranchId, tenantId: req.tenantId });
        if (!branch) {
            return res.status(403).json({ message: 'Access denied for this academic resource.' });
        }

        const newClass = await Class.create({
            tenantId: req.tenantId,
            branchId: targetBranchId,
            name,
            gradeLevel
        });
        res.status(201).json(newClass);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAcademicYears = async (req, res) => {
    try {
        const years = await AcademicYear.find({ tenantId: req.tenantId });
        res.json(years);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getClasses = async (req, res) => {
    try {
        const query = { tenantId: req.tenantId };
        const reqQuery = req.query || {};
        const queryBranchId = reqQuery.branchId;

        if (req.branchId) {
            if (queryBranchId && queryBranchId.toString() !== req.branchId.toString()) {
                return res.status(403).json({ message: 'Access denied for this academic resource.' });
            }
            query.branchId = req.branchId;
        } else if (queryBranchId) {
            const branch = await Branch.findOne({ _id: queryBranchId, tenantId: req.tenantId });
            if (!branch) {
                return res.status(403).json({ message: 'Access denied for this academic resource.' });
            }
            query.branchId = queryBranchId;
        }

        const classes = await Class.find(query);
        res.json(classes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createAcademicYear, createClass, getAcademicYears, getClasses };
