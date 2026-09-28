/**
 * Show every class and section a school has, and exactly what is attached to each one.
 *
 * A class looks harmless to delete until you find out a fee, a timetable slot or a student's
 * enrollment was pointing at it. This reads only - it never writes, deletes or changes
 * anything - so it is safe to run against a live school.
 *
 *   node scripts/reviewClasses.js                     every school
 *   node scripts/reviewClasses.js --tenant "KINGS"    just the schools whose name matches
 *   node scripts/reviewClasses.js --file "list.xlsx"  also compare against a student list
 */
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const argOf = (name) => {
    const at = process.argv.indexOf(name);
    return at === -1 ? null : process.argv[at + 1];
};

// Everything in the app that can point at a class, and what to call it in the report.
const CLASS_REFERENCES = [
    ['Enrollment', 'classId', 'student enrollments'],
    ['Section', 'classId', 'sections'],
    ['FeeStructure', 'classId', 'fee structures'],
    ['TimetableSlot', 'classId', 'timetable slots'],
    ['Exam', 'classId', 'exams'],
    ['ClassSubject', 'classId', 'subjects'],
    ['TeacherAssignment', 'classId', 'teacher assignments'],
    ['AttendanceSession', 'classId', 'attendance sessions'],
    ['DugsiClassAllocation', 'classId', 'dugsi allocations']
];

const SECTION_REFERENCES = [
    ['Enrollment', 'sectionId', 'student enrollments'],
    ['TimetableSlot', 'sectionId', 'timetable slots'],
    ['ClassSubject', 'sectionId', 'subjects'],
    ['TeacherAssignment', 'sectionId', 'teacher assignments'],
    ['AttendanceSession', 'sectionId', 'attendance sessions']
];

const countFor = async (pairs, id) => {
    const found = {};
    for (const [modelName, field, label] of pairs) {
        let Model;
        try { Model = require('../models/' + modelName); } catch (error) { continue; }
        const count = await Model.countDocuments({ [field]: id });
        if (count > 0) found[label] = count;
    }
    return found;
};

const describe = (attached) => Object.entries(attached)
    .map(([label, count]) => `${count} ${label}`)
    .join(', ');

const run = async () => {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_management';
    console.log(`Reading ${uri.replace(/\/\/[^@]*@/, '//***@')} - nothing will be changed.`);
    console.log('');
    await mongoose.connect(uri);

    const Tenant = require('../models/Tenant');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const Section = require('../models/Section');

    // A student list to compare against, so it is clear which classes the file will reuse.
    const wanted = new Set();
    const file = argOf('--file');
    if (file) {
        const { readTable } = require('../utils/spreadsheetReader');
        const { rowsFromTable } = require('../utils/importColumns');
        const { rows } = rowsFromTable(readTable(fs.readFileSync(file)));
        rows.forEach((row) => {
            const name = String(row.classNumber || '').trim();
            if (name) wanted.add(name.toLowerCase());
        });
        console.log(`The list "${file}" names ${wanted.size} classes.`);
        console.log('');
    }

    const nameFilter = argOf('--tenant');
    const tenantQuery = nameFilter ? { name: new RegExp(nameFilter, 'i') } : {};
    const tenants = await Tenant.find(tenantQuery).select('_id name').lean();
    if (!tenants.length) {
        console.log('No school matched.');
        return mongoose.disconnect();
    }

    const emptyClasses = [];
    const emptySections = [];

    for (const tenant of tenants) {
        const branches = await Branch.find({ tenantId: tenant._id }).select('_id name').lean();
        console.log('='.repeat(78));
        console.log(`SCHOOL: ${tenant.name}`);

        for (const branch of branches) {
            const classes = await Class.find({ tenantId: tenant._id, branchId: branch._id })
                .select('_id name gradeLevel').lean();
            console.log('');
            console.log(`  CAMPUS: ${branch.name}  (${classes.length} classes)`);
            if (!classes.length) { console.log('    no classes yet'); continue; }

            // Two classes answering to the same name or grade is what makes an import create
            // a twin, so they are worth naming before anything is deleted.
            const seenName = new Map();
            const seenGrade = new Map();
            classes.forEach((item) => {
                const n = String(item.name || '').trim().toLowerCase();
                const g = String(item.gradeLevel || '').trim().toLowerCase();
                seenName.set(n, (seenName.get(n) || 0) + 1);
                if (g) seenGrade.set(g, (seenGrade.get(g) || 0) + 1);
            });

            for (const item of classes.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
                const attached = await countFor(CLASS_REFERENCES, item._id);
                const busy = Object.keys(attached).length > 0;
                const key = String(item.name || '').trim().toLowerCase();

                const flags = [];
                if (seenName.get(key) > 1) flags.push('DUPLICATE NAME');
                const grade = String(item.gradeLevel || '').trim().toLowerCase();
                if (grade && seenGrade.get(grade) > 1) flags.push('SHARES ITS GRADE');
                if (wanted.size) flags.push(wanted.has(key) ? 'the list will reuse this' : 'the list does not mention it');

                console.log(`    ${busy ? '[KEEP]  ' : '[EMPTY] '}${item.name}  (grade ${item.gradeLevel})`);
                if (busy) console.log(`              holds: ${describe(attached)}`);
                if (flags.length) console.log(`              note:  ${flags.join(' | ')}`);
                if (!busy) emptyClasses.push(`${tenant.name} / ${branch.name} / ${item.name}`);
            }

            const sections = await Section.find({ tenantId: tenant._id, branchId: branch._id })
                .select('_id name classId').lean();
            const classNameOf = new Map(classes.map((item) => [String(item._id), item.name]));
            const loose = [];
            for (const item of sections) {
                const attached = await countFor(SECTION_REFERENCES, item._id);
                if (Object.keys(attached).length === 0) {
                    loose.push(`${classNameOf.get(String(item.classId)) || 'unknown class'} / ${item.name}`);
                    emptySections.push(`${tenant.name} / ${branch.name} / ${classNameOf.get(String(item.classId)) || '?'} / ${item.name}`);
                }
            }
            console.log(`    sections: ${sections.length} in total, ${loose.length} with nothing attached`);
            if (loose.length) console.log(`              ${loose.join(', ')}`);
        }
        console.log('');
    }

    console.log('='.repeat(78));
    console.log(`Classes with nothing attached: ${emptyClasses.length}`);
    emptyClasses.forEach((line) => console.log('  ' + line));
    console.log(`Sections with nothing attached: ${emptySections.length}`);
    console.log('');
    console.log('A class marked [KEEP] has records pointing at it. Deleting it would leave');
    console.log('those records pointing at nothing. Only an [EMPTY] one is safe to remove.');
    console.log('Nothing was changed by this command.');

    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Could not read: ' + error.message);
    try { await mongoose.disconnect(); } catch (ignored) { /* already closed */ }
    process.exit(1);
});
