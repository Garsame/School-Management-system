const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStudentSearchCriteria } = require('../utils/studentSearch');

test('student search matches every part of a full student name independently', () => {
    const criteria = buildStudentSearchCriteria('Ayaan Farah');

    assert.equal(criteria.length, 2);
    assert.equal(criteria[0].$or.find((entry) => entry.firstName).firstName.test('Ayaan'), true);
    assert.equal(criteria[1].$or.find((entry) => entry.lastName).lastName.test('Farah'), true);
});

test('student search includes primary and additional parent names', () => {
    const [criterion] = buildStudentSearchCriteria('Mohamed');

    assert.equal(criterion.$or.find((entry) => entry['guardianInfo.name'])['guardianInfo.name'].test('Mohamed Hassan'), true);
    assert.equal(criterion.$or.find((entry) => entry['guardians.name'])['guardians.name'].test('Mohamed Hassan'), true);
});

test('student search keeps admission-number matching and escapes regex input', () => {
    const [admissionCriterion] = buildStudentSearchCriteria('HIA-CEN-001');
    const admissionMatcher = admissionCriterion.$or.find((entry) => entry.admissionNumber).admissionNumber;
    assert.equal(admissionMatcher.test('HIA-CEN-001'), true);

    const [escapedCriterion] = buildStudentSearchCriteria('Ayaan.*');
    const firstNameMatcher = escapedCriterion.$or.find((entry) => entry.firstName).firstName;
    assert.equal(firstNameMatcher.test('Ayaan.*'), true);
    assert.equal(firstNameMatcher.test('Ayaan Farah'), false);
});
