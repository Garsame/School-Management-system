const crypto = require('crypto');

const STAFF_ROLES = new Set([
    'finance_director',
    'hr_payroll_manager',
    'branch_admin',
    'teacher',
    'dugsi_teacher',
    'cashier',
    'registrar'
]);
const COMPENSATION_FIELDS = new Set(['basicSalary', 'allowance', 'deductions', 'currency', 'paymentMethod', 'bankName', 'accountName', 'accountNumber', 'mobileMoneyNumber']);

const cleanString = (value) => {
    if (value === undefined || value === null) return undefined;
    const cleaned = String(value).trim();
    return cleaned || undefined;
};

const validationError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const normalizePhone = (value, fieldName = 'Phone') => {
    const cleaned = cleanString(value);
    if (!cleaned) return undefined;
    const normalized = cleaned.replace(/[\s()-]/g, '');
    if (!/^\+?[0-9]{7,20}$/.test(normalized)) {
        throw validationError(`${fieldName} must contain 7 to 20 digits and may start with +`);
    }
    return normalized;
};

const normalizeDate = (value, fieldName, { allowFuture = false } = {}) => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw validationError(`${fieldName} is not a valid date`);
    if (!allowFuture && date > new Date()) throw validationError(`${fieldName} cannot be in the future`);
    return date;
};

const normalizeMoney = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw validationError(`${fieldName} must be a non-negative number`);
    return number;
};

const generateEmployeeId = (role = 'staff') => {
    const prefix = String(role).split('_').map((part) => part[0]).join('').toUpperCase().slice(0, 3) || 'EMP';
    return `${prefix}-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

const withoutCompensationFields = (payload = {}) => {
    const sanitized = { ...payload };
    if (payload.employmentInfo) {
        sanitized.employmentInfo = { ...payload.employmentInfo };
        for (const field of COMPENSATION_FIELDS) delete sanitized.employmentInfo[field];
    }
    return sanitized;
};

const buildProfileFields = (payload = {}, role, { existing = null, preserveCompensation = false } = {}) => {
    const fields = {};
    const phone = normalizePhone(payload.phone, 'Phone');
    const address = cleanString(payload.address);
    const employeeId = cleanString(payload.employeeId)?.toUpperCase();
    const dateOfBirth = normalizeDate(payload.dateOfBirth, 'Date of birth');
    const gender = cleanString(payload.gender);
    const avatarUrl = cleanString(payload.avatarUrl);

    if (phone !== undefined) fields.phone = phone;
    if (address !== undefined) fields.address = address;
    if (dateOfBirth !== undefined) fields.dateOfBirth = dateOfBirth;
    if (gender !== undefined) {
        if (!['Male', 'Female', 'Other', 'Prefer not to say'].includes(gender)) throw validationError('Gender value is invalid');
        fields.gender = gender;
    }
    if (avatarUrl !== undefined) fields.avatarUrl = avatarUrl;
    if (STAFF_ROLES.has(role)) fields.employeeId = employeeId || existing?.employeeId || generateEmployeeId(role);

    if (payload.emergencyContact) {
        fields.emergencyContact = {
            name: cleanString(payload.emergencyContact.name),
            relationship: cleanString(payload.emergencyContact.relationship),
            phone: normalizePhone(payload.emergencyContact.phone, 'Emergency contact phone'),
            email: cleanString(payload.emergencyContact.email)?.toLowerCase()
        };
    }

    if (STAFF_ROLES.has(role) && payload.employmentInfo) {
        const employment = payload.employmentInfo;
        const existingEmployment = existing?.employmentInfo?.toObject?.() || existing?.employmentInfo || {};
        const qualifications = Array.isArray(employment.qualifications)
            ? employment.qualifications.map(cleanString).filter(Boolean)
            : cleanString(employment.qualifications)?.split(',').map((item) => item.trim()).filter(Boolean);
        const qualifiedSubjects = Array.isArray(employment.qualifiedSubjects)
            ? employment.qualifiedSubjects.map(cleanString).filter(Boolean)
            : cleanString(employment.qualifiedSubjects)?.split(',').map((item) => item.trim()).filter(Boolean);
        const yearsExperience = normalizeMoney(employment.yearsExperience, 'Teaching experience');
        const currency = cleanString(employment.currency)?.toUpperCase();
        if (currency && !/^[A-Z]{3}$/.test(currency)) throw validationError('Salary currency must be a 3-letter code');
        const employmentType = cleanString(employment.employmentType);
        if (employmentType && !['Permanent', 'Contract', 'Part-time', 'Temporary', 'Volunteer'].includes(employmentType)) {
            throw validationError('Employment type is invalid');
        }
        const paymentMethod = cleanString(employment.paymentMethod);
        if (paymentMethod && !['Bank', 'Mobile Money', 'Cash', 'Other'].includes(paymentMethod)) {
            throw validationError('Payment method is invalid');
        }

        fields.employmentInfo = {
            ...existingEmployment,
            jobTitle: cleanString(employment.jobTitle),
            department: cleanString(employment.department),
            employmentType,
            hireDate: normalizeDate(employment.hireDate, 'Hire date', { allowFuture: true }),
            terminationDate: normalizeDate(employment.terminationDate, 'Termination date', { allowFuture: true }),
            terminationReason: cleanString(employment.terminationReason),
            specialization: cleanString(employment.specialization),
            qualifiedSubjects,
            yearsExperience: yearsExperience ?? existing?.employmentInfo?.yearsExperience ?? 0,
            qualifications,
            basicSalary: preserveCompensation ? existingEmployment.basicSalary ?? 0 : normalizeMoney(employment.basicSalary, 'Basic salary') ?? existingEmployment.basicSalary ?? 0,
            allowance: preserveCompensation ? existingEmployment.allowance ?? 0 : normalizeMoney(employment.allowance, 'Allowance') ?? existingEmployment.allowance ?? 0,
            deductions: preserveCompensation ? existingEmployment.deductions ?? 0 : normalizeMoney(employment.deductions, 'Deductions') ?? existingEmployment.deductions ?? 0,
            currency: preserveCompensation ? existingEmployment.currency || 'USD' : currency || existingEmployment.currency || 'USD',
            paymentMethod: preserveCompensation ? existingEmployment.paymentMethod : paymentMethod,
            bankName: preserveCompensation ? existingEmployment.bankName : cleanString(employment.bankName),
            accountName: preserveCompensation ? existingEmployment.accountName : cleanString(employment.accountName),
            accountNumber: preserveCompensation ? existingEmployment.accountNumber : cleanString(employment.accountNumber),
            mobileMoneyNumber: preserveCompensation ? existingEmployment.mobileMoneyNumber : normalizePhone(employment.mobileMoneyNumber, 'Mobile money number')
        };
    }

    return fields;
};

module.exports = {
    STAFF_ROLES,
    buildProfileFields,
    cleanString,
    generateEmployeeId,
    normalizeDate,
    normalizePhone,
    withoutCompensationFields,
    validationError
};
