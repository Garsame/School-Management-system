const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SEARCHABLE_STUDENT_FIELDS = [
    'firstName',
    'middleName',
    'lastName',
    'preferredName',
    'admissionNumber',
    'studentCode',
    'guardianInfo.name',
    'guardians.name'
];

const buildStudentSearchCriteria = (query) => {
    const terms = String(query || '').trim().split(/\s+/).filter(Boolean);

    return terms.map((term) => {
        const matcher = new RegExp(escapeRegex(term), 'i');
        return {
            $or: SEARCHABLE_STUDENT_FIELDS.map((field) => ({ [field]: matcher }))
        };
    });
};

module.exports = { buildStudentSearchCriteria };
