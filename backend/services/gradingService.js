const GradingPolicy = require('../models/GradingPolicy');

/**
 * Default grading rules if tenant hasn't configured any
 */
const DEFAULT_RULES = [
    { min: 95, max: 100, grade: 'A+' },
    { min: 90, max: 94, grade: 'A-' },
    { min: 85, max: 89, grade: 'B+' },
    { min: 80, max: 84, grade: 'B-' },
    { min: 75, max: 79, grade: 'C+' },
    { min: 70, max: 74, grade: 'C-' },
    { min: 65, max: 69, grade: 'D+' },
    { min: 60, max: 64, grade: 'D-' },
    { min: 0, max: 59, grade: 'F' }
];

const LEGACY_DEFAULT_RULES = [
    { min: 90, max: 100, grade: 'A' },
    { min: 80, max: 89, grade: 'B' },
    { min: 70, max: 79, grade: 'C' },
    { min: 60, max: 69, grade: 'D' },
    { min: 0, max: 59, grade: 'F' }
];

const sameRule = (left, right) => (
    Number(left?.min) === Number(right.min) &&
    Number(left?.max) === Number(right.max) &&
    String(left?.grade || '').trim().toUpperCase() === right.grade
);

const isLegacyDefaultRules = (rules = []) => {
    if (!Array.isArray(rules) || rules.length !== LEGACY_DEFAULT_RULES.length) return false;
    const sorted = [...rules].sort((a, b) => Number(b.min || 0) - Number(a.min || 0));
    return LEGACY_DEFAULT_RULES.every((rule, index) => sameRule(sorted[index], rule));
};

const normalizeGradingRules = (rules) => {
    if (!Array.isArray(rules) || rules.length === 0) return DEFAULT_RULES;
    return isLegacyDefaultRules(rules) ? DEFAULT_RULES : rules;
};

/**
 * Computes Total and Grade for a set of subjects
 * @param {string} tenantId 
 * @param {Array} subjects - [{ name, score }]
 * @returns {Object} { total, grade }
 */
exports.calculateResult = async (tenantId, subjects) => {
    // 1. Compute Total
    const total = subjects.reduce((sum, s) => sum + s.score, 0);
    
    // 2. Compute Percentage (assuming each subject is out of 100)
    const percentage = subjects.length > 0 ? (total / (subjects.length * 100)) * 100 : 0;

    // 3. Fetch Policy
    const policy = await GradingPolicy.findOne({ tenantId });
    const rules = normalizeGradingRules(policy?.rules);

    // 4. Find Grade
    const grade = exports.gradeForPercentage(percentage, rules);

    return { total, grade };
};

exports.getGradingRules = async (tenantId) => {
    const policy = await GradingPolicy.findOne({ tenantId });
    return normalizeGradingRules(policy?.rules);
};

exports.gradeForPercentage = (percentage, rules = DEFAULT_RULES) => {
    const match = [...rules]
        .sort((a, b) => Number(b.min) - Number(a.min))
        .find((rule) => Number(percentage) >= Number(rule.min) && Number(percentage) <= Number(rule.max));
    return match?.grade || 'N/A';
};

exports.DEFAULT_RULES = DEFAULT_RULES;
exports.normalizeGradingRules = normalizeGradingRules;
