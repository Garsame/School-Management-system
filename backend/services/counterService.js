const Counter = require('../models/Counter');
const Tenant = require('../models/Tenant');
const AcademicYear = require('../models/AcademicYear');

/**
 * Format helper for student ID
 */
exports.formatStudentCode = (prefix = 'KS', year = '', seq = 1, config = {}) => {
    const cleanPrefix = String(prefix || 'KS').trim().toUpperCase();
    const includeYear = config.includeYear !== false;
    const separator = config.separator !== undefined ? config.separator : '-';
    const padding = config.padding || 3;
    const paddedSeq = String(seq).padStart(padding, '0');

    const cleanYear = String(year || '').trim();
    const yearMatch = cleanYear.match(/\d{4}/);
    const yearPart = yearMatch ? yearMatch[0] : cleanYear;

    if (includeYear && yearPart) {
        return separator ? `${cleanPrefix}${separator}${yearPart}${separator}${paddedSeq}` : `${cleanPrefix}${yearPart}${paddedSeq}`;
    }
    return separator ? `${cleanPrefix}${separator}${paddedSeq}` : `${cleanPrefix}${paddedSeq}`;
};

/**
 * Generates an incremental student code like KS-2026-001, KS-2026-002...
 */
exports.getNextStudentCode = async (tenantId, branchId, academicYearName) => {
    let tenant = null;
    let currentYear = null;
    try {
        if (Tenant && typeof Tenant.findById === 'function') {
            const res = Tenant.findById(tenantId);
            tenant = res && typeof res.lean === 'function' ? await res.lean() : await res;
        }
    } catch {}
    try {
        if (!academicYearName && AcademicYear && typeof AcademicYear.findOne === 'function') {
            const res = AcademicYear.findOne({ tenantId, isCurrent: true });
            currentYear = res && typeof res.lean === 'function' ? await res.lean() : await res;
        }
    } catch {}

    const cfg = tenant?.studentIdConfig || {};
    const prefix = cfg.prefix || 'KS';
    const includeYear = cfg.includeYear !== false;
    const separator = cfg.separator !== undefined ? cfg.separator : '-';
    const padding = cfg.padding || 3;

    const rawYear = academicYearName || currentYear?.name || new Date().getFullYear().toString();
    const yearMatch = String(rawYear).match(/\d{4}/);
    const yearPart = yearMatch ? yearMatch[0] : String(rawYear);

    const counterKey = includeYear ? `studentCode_${yearPart}` : 'studentCode';
    const counter = await Counter.findOneAndUpdate(
        { tenantId, branchId, key: counterKey },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );

    const seq = counter?.seq !== undefined ? counter.seq : 1;
    return exports.formatStudentCode(prefix, yearPart, seq, { includeYear, separator, padding });
};

/**
 * Generates an incremental receipt number like REC-000001, REC-000002...
 */
exports.getNextReceiptNumber = async (tenantId, branchId) => {
    const counter = await Counter.findOneAndUpdate(
        { tenantId, branchId, key: 'receiptNumber' },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );

    const paddedSeq = counter.seq.toString().padStart(6, '0');
    return `REC-${paddedSeq}`;
};
