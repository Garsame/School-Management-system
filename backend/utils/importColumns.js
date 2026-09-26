/**
 * Work out what a school's column headings mean.
 *
 * The import used to match headings letter for letter: a column had to be called `firstName`
 * or it was treated as missing. A school's own list says "First Name", so every field came
 * back empty and every row was reported as "First name is required" — telling the user their
 * data was broken when it was fine.
 *
 * So headings are compared with spaces, underscores and capitals removed, and the common
 * ways of writing each one are accepted.
 */

/** "Guardian Phone", "guardian_phone" and "GUARDIANPHONE" all become "guardianphone". */
const normaliseHeading = (heading) => String(heading || '')
    .replace(/﻿/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// The field the app stores, and the headings a school might write for it. The field's own
// name is always accepted, so the downloadable template keeps working.
const FIELD_ALIASES = Object.freeze({
    firstName: ['first', 'firstname', 'givenname', 'forename', 'fname', 'name'],
    middleName: ['middlename', 'middle', 'secondname', 'mname'],
    lastName: ['lastname', 'last', 'surname', 'familyname', 'lname'],
    preferredName: ['preferredname', 'nickname', 'knownas', 'calledname'],
    dateOfBirth: ['dateofbirth', 'dob', 'birthdate', 'birthday', 'dateborn', 'born'],
    gender: ['gender', 'sex'],
    classNumber: ['classnumber', 'class', 'classname', 'grade', 'gradelevel', 'gradenumber', 'form', 'level'],
    sectionName: ['sectionname', 'section', 'stream', 'streamname', 'classsection'],
    admissionDate: ['admissiondate', 'dateadmitted', 'dateofadmission', 'enrolmentdate', 'enrollmentdate', 'joined', 'datejoined'],
    nationality: ['nationality', 'citizenship'],
    placeOfBirth: ['placeofbirth', 'birthplace', 'pob'],
    primaryLanguage: ['primarylanguage', 'language', 'mothertongue', 'firstlanguage'],
    previousSchool: ['previousschool', 'formerschool', 'lastschool', 'oldschool'],
    guardianName: ['guardianname', 'guardian', 'parentname', 'parent', 'fathername', 'mothername', 'nameofguardian'],
    guardianPhone: ['guardianphone', 'parentphone', 'phone', 'mobile', 'phonenumber', 'mobilenumber', 'contact', 'contactnumber', 'telephone', 'tel'],
    guardianEmail: ['guardianemail', 'parentemail', 'email', 'emailaddress'],
    guardianRelationship: ['guardianrelationship', 'relationship', 'relation', 'relationtostudent'],
    guardianAddress: ['guardianaddress', 'address', 'homeaddress', 'residence', 'location'],
    emergencyContactName: ['emergencycontactname', 'emergencycontact', 'emergencyname'],
    emergencyContactPhone: ['emergencycontactphone', 'emergencyphone', 'emergencynumber'],
    medicalNotes: ['medicalnotes', 'medical', 'medicalinfo', 'healthnotes', 'allergies'],
    learningSupportDetails: ['learningsupportdetails', 'learningsupport', 'specialneeds', 'support'],
    notes: ['notes', 'note', 'comment', 'comments', 'remarks']
});

// Headings a school's own export carries that the app has no use for. Recognised so they can
// be reported as "ignored" rather than "not understood", which would look like a problem.
const IGNORED_HEADINGS = new Set([
    'no', 'number', 'sn', 'sno', 'serial', 'serialnumber', 'index', 'rowno', 'row',
    'studentid', 'id', 'admissionnumber', 'admissionno', 'studentnumber', 'studentcode',
    'fullname', 'name', 'studentname', 'status', 'age', 'studentphone'
]);

const LOOKUP = new Map();
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    LOOKUP.set(normaliseHeading(field), field);
    for (const alias of aliases) LOOKUP.set(alias, field);
}
// "Name" on its own is ambiguous: a full name column, or a first name. A school's export
// almost always means the full name, which the app splits itself, so leave it out.
LOOKUP.delete('name');

/**
 * Match a sheet's headings to the fields the app stores.
 *
 * Returns the field for each column position, plus what was recognised, what was ignored and
 * which required fields no column supplies — so the screen can explain itself instead of
 * repeating "is required" on every row.
 */
const mapHeadings = (headings = []) => {
    const columns = [];
    const recognised = [];
    const ignored = [];
    const unknown = [];
    const seen = new Set();

    headings.forEach((heading, index) => {
        const key = normaliseHeading(heading);
        if (!key) { columns[index] = null; return; }

        const field = LOOKUP.get(key);
        // A heading that repeats must not overwrite the first, or "Name" later in the sheet
        // would replace the real first name column.
        if (field && !seen.has(field)) {
            seen.add(field);
            columns[index] = field;
            recognised.push({ heading, field });
            return;
        }
        columns[index] = null;
        if (IGNORED_HEADINGS.has(key) || field) ignored.push(heading);
        else unknown.push(heading);
    });

    return { columns, recognised, ignored, unknown };
};

// What a row cannot be imported without. Mirrors the checks in previewStudentImport.
const REQUIRED_FIELDS = Object.freeze([
    'firstName', 'lastName', 'dateOfBirth', 'gender', 'classNumber',
    'guardianName', 'guardianPhone', 'guardianEmail', 'guardianAddress'
]);

/** Turn a sheet into the row objects the importer already understands. */
const rowsFromTable = (table = []) => {
    if (!table.length) return { rows: [], headings: { columns: [], recognised: [], ignored: [], unknown: [] } };

    const headings = mapHeadings(table[0]);
    const rows = table.slice(1).map((cells) => {
        const row = {};
        headings.columns.forEach((field, index) => {
            if (field) row[field] = String(cells[index] ?? '').trim();
        });
        return row;
    });

    const supplied = new Set(headings.recognised.map((item) => item.field));
    const missingRequired = REQUIRED_FIELDS.filter((field) => !supplied.has(field));
    return { rows, headings, missingRequired };
};

/**
 * Work out a grade number from a class name.
 *
 * A school's list names classes the way it speaks about them - "Class 3", "Form 1",
 * "Baby Class" - but the app stores a grade level too, and fees can be set by grade. Taking
 * the number out of the name gets it right for most, and anything without a number keeps its
 * own name as the grade so two classes can never collide on one grade by accident.
 */
const gradeLevelFromClassName = (className) => {
    const name = String(className || '').trim();
    const number = (name.match(/(\d+)/) || [])[1];
    if (!number) return name;
    // Form 1 follows Class 8, so it is grade 9. This matches how the school already numbers them.
    if (/^\s*form\b/i.test(name)) return String(Number(number) + 8);
    return String(Number(number));
};

module.exports = {
    FIELD_ALIASES,
    gradeLevelFromClassName,
    REQUIRED_FIELDS,
    mapHeadings,
    normaliseHeading,
    rowsFromTable
};
