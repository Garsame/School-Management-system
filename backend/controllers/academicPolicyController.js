const asyncHandler = require('express-async-handler');
const AcademicYear = require('../models/AcademicYear');
const GradingPolicy = require('../models/GradingPolicy');
const Term = require('../models/Term');
const { DEFAULT_RULES, normalizeGradingRules } = require('../services/gradingService');
const { logActivity } = require('../utils/logger');

const validateRules = (rules) => {
    if (!Array.isArray(rules) || rules.length === 0) {
        const error = new Error('At least one grading rule is required');
        error.statusCode = 400;
        throw error;
    }
    const normalized = rules.map((rule) => ({
        min: Number(rule.min),
        max: Number(rule.max),
        grade: String(rule.grade || '').trim()
    })).sort((a, b) => a.min - b.min);

    if (normalized.some((rule) => !rule.grade || !Number.isFinite(rule.min) || !Number.isFinite(rule.max) || rule.min < 0 || rule.max > 100 || rule.min > rule.max)) {
        const error = new Error('Grading rules require a grade and a valid 0-100 range');
        error.statusCode = 400;
        throw error;
    }
    if (normalized[0].min !== 0 || normalized[normalized.length - 1].max !== 100) {
        const error = new Error('Grading rules must cover the complete 0-100 range');
        error.statusCode = 400;
        throw error;
    }
    for (let index = 1; index < normalized.length; index++) {
        if (normalized[index].min !== normalized[index - 1].max + 1) {
            const error = new Error('Grading rules cannot overlap or leave gaps');
            error.statusCode = 400;
            throw error;
        }
    }
    return normalized;
};

const getAcademicPolicy = asyncHandler(async (req, res) => {
    const policy = await GradingPolicy.findOne({ tenantId: req.tenantId }).lean();
    if (policy) {
        return res.json({
            ...policy,
            rules: normalizeGradingRules(policy.rules)
        });
    }
    res.json({
        name: 'Institution Grading Scale',
        finalGradeLevel: '12',
        graduationRequiresPass: true,
        rules: DEFAULT_RULES
    });
});

const updateAcademicPolicy = asyncHandler(async (req, res) => {
    const rules = validateRules(req.body.rules);
    const finalGradeLevel = String(req.body.finalGradeLevel || '').trim();
    if (!finalGradeLevel) {
        res.status(400);
        throw new Error('Final grade level is required');
    }

    const before = await GradingPolicy.findOne({ tenantId: req.tenantId }).lean();
    const policy = await GradingPolicy.findOneAndUpdate(
        { tenantId: req.tenantId },
        {
            $set: {
                name: String(req.body.name || '').trim() || 'Institution Grading Scale',
                finalGradeLevel,
                graduationRequiresPass: req.body.graduationRequiresPass !== false,
                rules,
                updatedAt: new Date()
            }
        },
        { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    );

    await logActivity({ req, action: 'ACADEMIC_POLICY_UPDATED', entityType: 'GradingPolicy', entityId: policy._id.toString(), before, after: policy });
    res.json(policy);
});

const getTerms = asyncHandler(async (req, res) => {
    const query = { tenantId: req.tenantId };
    const academicYearId = req.params.yearId || req.query.academicYearId;
    if (academicYearId) query.academicYearId = academicYearId;
    const terms = await Term.find(query).populate('academicYearId', 'name').sort({ academicYearId: -1, sequence: 1 });
    res.json(terms);
});

const validateTermContext = async (req, payload) => {
    const year = await AcademicYear.findOne({ _id: payload.academicYearId, tenantId: req.tenantId });
    if (!year) {
        const error = new Error('Academic year not found in this institution');
        error.statusCode = 400;
        throw error;
    }
    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
        const error = new Error('Term start and end dates are invalid');
        error.statusCode = 400;
        throw error;
    }
    if (startDate < new Date(year.startDate) || endDate > new Date(year.endDate)) {
        const error = new Error('Term dates must be inside the academic year');
        error.statusCode = 400;
        throw error;
    }
    return { startDate, endDate };
};

const validateTermIdentity = (name, sequence) => {
    const normalizedName = String(name || '').trim();
    const normalizedSequence = Number(sequence);
    if (!normalizedName) {
        const error = new Error('Term name is required');
        error.statusCode = 400;
        throw error;
    }
    if (!Number.isInteger(normalizedSequence) || normalizedSequence < 1) {
        const error = new Error('Term sequence must be a positive whole number');
        error.statusCode = 400;
        throw error;
    }
    return { name: normalizedName, sequence: normalizedSequence };
};

const createTerm = asyncHandler(async (req, res) => {
    const academicYearId = req.params.yearId;
    const identity = validateTermIdentity(req.body.name, req.body.sequence);
    const dates = await validateTermContext(req, { ...req.body, academicYearId });
    try {
        const term = await Term.create({
            tenantId: req.tenantId,
            academicYearId,
            ...identity,
            ...dates
        });
        res.status(201).json(term);
    } catch (error) {
        if (error.code === 11000) {
            res.status(409);
            throw new Error('A term with this name or sequence already exists for the academic year');
        }
        throw error;
    }
});

const updateTerm = asyncHandler(async (req, res) => {
    const term = await Term.findOne({ _id: req.params.termId, tenantId: req.tenantId });
    if (!term) {
        res.status(404);
        throw new Error('Term not found');
    }
    const payload = {
        academicYearId: term.academicYearId,
        startDate: req.body.startDate ?? term.startDate,
        endDate: req.body.endDate ?? term.endDate
    };
    const identity = validateTermIdentity(req.body.name ?? term.name, req.body.sequence ?? term.sequence);
    const dates = await validateTermContext(req, payload);
    term.name = identity.name;
    term.sequence = identity.sequence;
    if (req.body.isActive !== undefined) term.isActive = Boolean(req.body.isActive);
    term.startDate = dates.startDate;
    term.endDate = dates.endDate;
    await term.save();
    res.json(term);
});

const deleteTerm = asyncHandler(async (req, res) => {
    const term = await Term.findOne({ _id: req.params.termId, tenantId: req.tenantId });
    if (!term) {
        res.status(404);
        throw new Error('Term not found');
    }
    const Exam = require('../models/Exam');
    if (await Exam.exists({ tenantId: req.tenantId, termId: term._id })) {
        res.status(409);
        throw new Error('Cannot delete a term that is used by exams');
    }
    await Term.deleteOne({ _id: term._id, tenantId: req.tenantId });
    res.json({ message: 'Term deleted' });
});

module.exports = { getAcademicPolicy, updateAcademicPolicy, getTerms, createTerm, updateTerm, deleteTerm, validateRules };
