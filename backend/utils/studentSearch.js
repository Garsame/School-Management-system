const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SEARCHABLE_STUDENT_FIELDS = [
    'firstName',
    'middleName',
    'lastName',
    'preferredName',
    'admissionNumber',
    'studentCode',
    'guardianInfo.name',
    'guardianInfo.phone',
    'guardianInfo.email',
    'guardians.name',
    'notes'
];

const buildStudentSearchCriteria = (query) => {
    const terms = String(query || '').trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    return terms.map((term) => {
        const matcher = new RegExp(escapeRegex(term).slice(0, 50), 'i');
        return {
            $or: SEARCHABLE_STUDENT_FIELDS.map((field) => ({ [field]: matcher }))
        };
    });
};

module.exports = { buildStudentSearchCriteria };
