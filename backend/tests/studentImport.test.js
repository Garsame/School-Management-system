/**
 * The student list import: reading a school's own .xlsx or .csv, and working out what its
 * column headings mean.
 *
 * A school hands over the file it already keeps. Everything here guards a way that file has
 * already gone wrong in practice: an empty cell that quietly blanked the columns after it,
 * headings written the school's way instead of the app's, a birthday arriving as a number,
 * and two phone numbers typed into one box.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isExcel,
    readTable,
    readCsv,
    readSheetRows,
    serialToDate,
    looksLikeDateFormat
} = require('../utils/spreadsheetReader');
const {
    mapHeadings,
    normaliseHeading,
    rowsFromTable,
    gradeLevelFromClassName,
    REQUIRED_FIELDS
} = require('../utils/importColumns');
const { buildWorkbook } = require('../utils/xlsxWriter');

// ------------------------------------------------------------------ reading cells

const sheet = (inner) => `<worksheet><sheetData>${inner}</sheetData></worksheet>`;
const inline = (ref, text) => `<c r="${ref}" t="inlineStr" s="0"><is><t xml:space="preserve">${text}</t></is></c>`;

test('an empty cell written self-closing does not swallow the cell after it', () => {
    // Excel writes a styled but empty cell as <c r="B1"/>. Reading the open-tag form first
    // let that run on to the next </c>, so B and C merged and every later column shifted -
    // which showed up as "Guardian name is required" on rows whose guardian name was filled.
    const rows = readSheetRows(sheet(
        `<row r="1">${inline('A1', 'Amina')}<c r="B1" s="0"/>${inline('C1', 'Yusuf')}</row>`
    ));
    assert.deepEqual(rows[0][0], 'Amina');
    assert.equal(rows[0][1], '', 'the empty cell stays empty');
    assert.deepEqual(rows[0][2], 'Yusuf', 'the cell after the empty one keeps its own value');
});

test('several self-closing cells in a row leave every later column in place', () => {
    const rows = readSheetRows(sheet(
        `<row r="2">${inline('A2', 'one')}<c r="B2" s="0"/><c r="C2" s="0"/>${inline('D2', 'four')}<c r="E2" s="0"/>${inline('F2', 'six')}</row>`
    ));
    assert.equal(rows[0][0], 'one');
    assert.equal(rows[0][3], 'four');
    assert.equal(rows[0][5], 'six');
});

test('a cell is placed by its own column letter, not by the order it appears', () => {
    const rows = readSheetRows(sheet(`<row r="1">${inline('C1', 'third')}${inline('A1', 'first')}</row>`));
    assert.equal(rows[0][0], 'first');
    assert.equal(rows[0][2], 'third');
});

test('shared strings, inline strings and plain numbers all read back', () => {
    const rows = readSheetRows(
        sheet(`<row r="1"><c r="A1" t="s"><v>1</v></c>${inline('B1', 'inline')}<c r="C1"><v>42</v></c></row>`),
        ['nothing', 'from the shared table']
    );
    assert.deepEqual(rows[0], ['from the shared table', 'inline', '42']);
});

test('an ampersand and a quote in a cell come back as the school typed them', () => {
    const rows = readSheetRows(sheet(`<row r="1">${inline('A1', 'Hodan &amp; Sons &quot;Trading&quot;')}</row>`));
    assert.equal(rows[0][0], 'Hodan & Sons "Trading"');
});

// ------------------------------------------------------------------ dates

test('an Excel date serial becomes the date the school meant', () => {
    // 9 March 2018 is day 43168 in Excel's count.
    assert.equal(serialToDate(43168), '2018-03-09');
    assert.equal(serialToDate(1), '1900-01-01');
    assert.equal(serialToDate(0), '', 'day zero is not a date');
});

test('a date cell is recognised by its format, and a money cell is not', () => {
    assert.equal(looksLikeDateFormat('dd/mm/yyyy'), true);
    assert.equal(looksLikeDateFormat('mmm-yy'), true);
    assert.equal(looksLikeDateFormat('#,##0.00'), false);
    // A currency format naming a unit must not be mistaken for a month.
    assert.equal(looksLikeDateFormat('[Red]"m"#,##0'), false);
    assert.equal(looksLikeDateFormat('"$"#,##0.00'), false);
});

test('a number in a date-formatted cell is read as a date, and otherwise as a number', () => {
    const asDate = readSheetRows(sheet('<row r="1"><c r="A1" s="3"><v>43168</v></c></row>'), [], new Set([3]));
    assert.equal(asDate[0][0], '2018-03-09');
    const asNumber = readSheetRows(sheet('<row r="1"><c r="A1" s="3"><v>43168</v></c></row>'), [], new Set());
    assert.equal(asNumber[0][0], '43168');
});

// ------------------------------------------------------------------ whole files

test('a workbook written by the app reads back as the same table', () => {
    const table = [
        ['First Name', 'Middle Name', 'Last Name'],
        ['Amina', '', 'Yusuf'],
        ['Bilal', 'Omar', 'Ali']
    ];
    const read = readTable(buildWorkbook([{ name: 'Students', rows: table }]));
    assert.equal(read.length, 3);
    assert.deepEqual(read[0], ['First Name', 'Middle Name', 'Last Name']);
    assert.equal(read[1][0], 'Amina');
    assert.equal(read[1][2], 'Yusuf');
    assert.deepEqual(read[2], ['Bilal', 'Omar', 'Ali']);
});

test('a .xlsx is recognised by its own bytes, and a .csv is not', () => {
    assert.equal(isExcel(buildWorkbook([{ name: 'S', rows: [['a']] }])), true);
    assert.equal(isExcel(Buffer.from('First Name,Last Name\nAmina,Yusuf')), false);
});

test('a csv keeps a comma inside an address and drops the byte-order mark', () => {
    const rows = readCsv('﻿First Name,Guardian Address\nAmina,"Mogadishu, Somalia"\n');
    assert.deepEqual(rows[0], ['First Name', 'Guardian Address']);
    assert.deepEqual(rows[1], ['Amina', 'Mogadishu, Somalia']);
});

test('a csv keeps a doubled quote and ignores a blank line', () => {
    const rows = readCsv('Name,Note\n"Ali","said ""yes"""\n\n"Hodan","fine"\n');
    assert.equal(rows.length, 3);
    assert.equal(rows[1][1], 'said "yes"');
    assert.equal(rows[2][0], 'Hodan');
});

test('an empty upload is refused with a reason a school can act on', () => {
    assert.throws(() => readTable(Buffer.alloc(0)), /empty/i);
    assert.throws(() => readTable(Buffer.from('PK\u0003\u0004 not really a zip')), /Excel/i);
});

// ------------------------------------------------------------------ headings

test('a school writing "First Name" is understood as well as the template does', () => {
    assert.equal(normaliseHeading('  Guardian   Phone  '), 'guardianphone');
    assert.equal(normaliseHeading('GUARDIAN_PHONE'), 'guardianphone');
    assert.equal(normaliseHeading('﻿First Name'), 'firstname');

    const { columns } = mapHeadings(['First Name', 'Date of Birth', 'Guardian Phone', 'Class']);
    assert.deepEqual(columns, ['firstName', 'dateOfBirth', 'guardianPhone', 'classNumber']);
});

test('the app\'s own template headings still work', () => {
    const { columns, unknown } = mapHeadings(['firstName', 'lastName', 'guardianEmail']);
    assert.deepEqual(columns, ['firstName', 'lastName', 'guardianEmail']);
    assert.deepEqual(unknown, []);
});

test('a column the app has no use for is reported as ignored, not as a problem', () => {
    const { ignored, unknown, columns } = mapHeadings(['No.', 'Student ID', 'Full Name', 'First Name']);
    assert.deepEqual(columns, [null, null, null, 'firstName']);
    assert.deepEqual(ignored, ['No.', 'Student ID', 'Full Name']);
    assert.deepEqual(unknown, [], 'a heading the app knows to skip is not called unrecognised');
});

test('a heading nobody recognises is named so the school can see which one', () => {
    const { unknown } = mapHeadings(['First Name', 'Bus Route', 'House Colour']);
    assert.deepEqual(unknown, ['Bus Route', 'House Colour']);
});

test('a repeated heading does not overwrite the first column that claimed it', () => {
    // A school export often carries "Name" twice. The second must not take over.
    const { columns } = mapHeadings(['First Name', 'Last Name', 'First Name']);
    assert.deepEqual(columns, ['firstName', 'lastName', null]);
});

test('"Name" on its own is left alone, because it usually means the full name', () => {
    const { columns } = mapHeadings(['Name']);
    assert.deepEqual(columns, [null], 'the app splits a full name itself rather than guessing');
});

// ------------------------------------------------------------------ rows

test('a sheet becomes rows keyed by what the app stores', () => {
    const { rows, missingRequired } = rowsFromTable([
        ['First Name', 'Last Name', 'Date of Birth', 'Gender', 'Class', 'Section',
            'Guardian Name', 'Guardian Phone', 'Guardian Email', 'Guardian Address'],
        ['Amina', 'Yusuf', '2018-01-15', 'Female', 'Class 3', 'A',
            'Yusuf Ali', '+252615648340', 'parent@example.com', 'Mogadishu']
    ]);
    assert.deepEqual(missingRequired, [], 'every required column was supplied');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].firstName, 'Amina');
    assert.equal(rows[0].guardianName, 'Yusuf Ali');
    assert.equal(rows[0].classNumber, 'Class 3');
    assert.equal(rows[0].sectionName, 'A');
});

test('a missing column is named once, instead of failing every row', () => {
    const { missingRequired } = rowsFromTable([
        ['First Name', 'Last Name', 'Class'],
        ['Amina', 'Yusuf', 'Class 3']
    ]);
    // Saying which columns are absent is what stops the screen repeating "is required"
    // 254 times on a file that is actually fine apart from its headings.
    assert.ok(missingRequired.includes('dateOfBirth'));
    assert.ok(missingRequired.includes('guardianName'));
    assert.ok(!missingRequired.includes('firstName'));
    REQUIRED_FIELDS.forEach((field) => assert.equal(typeof field, 'string'));
});

test('a row shorter than the heading row leaves the rest of its fields empty', () => {
    const { rows } = rowsFromTable([['First Name', 'Last Name', 'Guardian Name'], ['Amina']]);
    assert.equal(rows[0].firstName, 'Amina');
    assert.equal(rows[0].lastName, '');
    assert.equal(rows[0].guardianName, '');
});

test('an empty sheet gives no rows rather than throwing', () => {
    const { rows, headings } = rowsFromTable([]);
    assert.deepEqual(rows, []);
    assert.deepEqual(headings.columns, []);
});

// ------------------------------------------------------------------ class names

test('a class name gives up its grade number the way the school counts', () => {
    assert.equal(gradeLevelFromClassName('Class 3'), '3');
    assert.equal(gradeLevelFromClassName('Grade 10'), '10');
    // Form 1 follows Class 8, so it is grade 9. Getting this wrong put secondary students
    // on primary fees.
    assert.equal(gradeLevelFromClassName('Form 1'), '9');
    assert.equal(gradeLevelFromClassName('Form 4'), '12');
});

test('a class with no number in its name keeps its own name as the grade', () => {
    // Baby Class and Top Class share no number, so they must not both land on grade 0 and
    // collide - a fee set for one would otherwise silently cover the other.
    assert.equal(gradeLevelFromClassName('Baby Class'), 'Baby Class');
    assert.equal(gradeLevelFromClassName('Top Class'), 'Top Class');
    assert.equal(gradeLevelFromClassName('  Nursery  '), 'Nursery');
    assert.equal(gradeLevelFromClassName(''), '');
    assert.equal(gradeLevelFromClassName(null), '');
});

// ------------------------------------------------------------------ the file the school sent

test('a sheet with self-closing empty cells reads every guardian name', () => {
    // The shape of the file a school actually sent: a blank Previous School column sitting
    // between filled ones. Before the cell fix, 187 of 254 rows lost their guardian name.
    const headings = ['First Name', 'Last Name', 'Date of Birth', 'Gender', 'Class', 'Section',
        'Previous School', 'Guardian Name', 'Guardian Phone', 'Guardian Email', 'Guardian Address'];
    const headingRow = `<row r="1">${headings.map((text, index) => inline(`${String.fromCharCode(65 + index)}1`, text)).join('')}</row>`;
    const body = [1, 2, 3].map((n) => {
        const values = ['Child' + n, 'Family' + n, '2018-01-15', 'Male', 'Class 3', 'A',
            null, 'Guardian' + n, '+25261564834' + n, 'p' + n + '@example.com', 'Mogadishu'];
        const cells = values.map((value, index) => {
            const ref = `${String.fromCharCode(65 + index)}${n + 1}`;
            return value === null ? `<c r="${ref}" s="0"/>` : inline(ref, value);
        }).join('');
        return `<row r="${n + 1}">${cells}</row>`;
    }).join('');

    const { rows, missingRequired } = rowsFromTable(readSheetRows(sheet(headingRow + body)));
    assert.deepEqual(missingRequired, []);
    assert.equal(rows.length, 3);
    rows.forEach((row, index) => {
        assert.equal(row.previousSchool, '', 'the blank column stays blank');
        assert.equal(row.guardianName, 'Guardian' + (index + 1), 'the column after it is intact');
        assert.equal(row.guardianAddress, 'Mogadishu', 'and so is the last column');
    });
});
