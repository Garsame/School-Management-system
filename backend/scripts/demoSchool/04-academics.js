/**
 * Step 4 — the academic year and the classes, built by the Admissions Officer.
 *
 * This is the clearest proof that the configuration works. Creating classes, sections and
 * subjects used to require the branch_admin role. The Admissions Officer is a branch-scoped
 * role the school configured itself, and it does all of this here.
 */
const { loginTenant, step } = require('./lib');
const { SCHOOL } = require('./02-school-and-roles');

const YEAR = { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30' };

const TERMS = [
    { name: 'Term 1', sequence: 1, startDate: '2026-09-01', endDate: '2026-12-15' },
    { name: 'Term 2', sequence: 2, startDate: '2027-01-05', endDate: '2027-03-25' },
    { name: 'Term 3', sequence: 3, startDate: '2027-04-05', endDate: '2027-06-30' }
];

const SUBJECTS = [
    ['Mathematics', 'MATH'],
    ['English', 'ENG'],
    ['Science', 'SCI'],
    ['Social Studies', 'SOC'],
    ['Somali', 'SOM'],
    ['Islamic Studies', 'ISL'],
    ['Physical Education', 'PE']
];

// Grades 1 to 6, the larger ones split into two sections.
const GRADES = [
    { name: 'Grade 1', gradeLevel: 1, sections: ['A', 'B'] },
    { name: 'Grade 2', gradeLevel: 2, sections: ['A', 'B'] },
    { name: 'Grade 3', gradeLevel: 3, sections: ['A', 'B'] },
    { name: 'Grade 4', gradeLevel: 4, sections: ['A'] },
    { name: 'Grade 5', gradeLevel: 5, sections: ['A'] },
    { name: 'Grade 6', gradeLevel: 6, sections: ['A'] }
];

const run = async () => {
    const admin = await loginTenant('super admin', SCHOOL.adminEmail);
    const admissions = await loginTenant('admissions', 'admissions@nuur-al-ilm.school');

    step(1, 'Super admin opens the academic year');
    const year = await admin.post('/tenant/academic-years', YEAR);
    const yearId = year._id || year.data?._id;
    await admin.patch(`/tenant/academic-years/${yearId}/set-current`);
    console.log(`   ${YEAR.name} created and set as current`);

    for (const term of TERMS) {
        await admin.post(`/tenant/academic-years/${yearId}/terms`, term);
    }
    console.log(`   ${TERMS.length} terms added`);

    step(2, 'Admissions Officer builds the academic structure');
    console.log('   (classes, sections and subjects used to need a branch admin)');

    const category = await admissions.post('/branch/class-categories', {
        name: 'Primary',
        description: 'Grades 1 to 6'
    });
    const categoryId = category.data?._id || category._id;
    console.log('   class category: Primary');

    const subjects = [];
    for (const [name, code] of SUBJECTS) {
        const subject = await admissions.post('/branch/subjects', { name, code });
        subjects.push(subject.data || subject);
    }
    console.log(`   ${subjects.length} subjects`);

    const classes = [];
    for (const grade of GRADES) {
        const created = await admissions.post('/branch/classes', {
            name: grade.name,
            gradeLevel: grade.gradeLevel,
            categoryId
        });
        const classDoc = created.data || created;
        const sections = [];
        for (const sectionName of grade.sections) {
            const section = await admissions.post('/branch/sections', {
                classId: classDoc._id,
                name: sectionName,
                capacity: 30
            });
            sections.push(section.data || section);
        }
        // Every class teaches every subject at this school.
        for (const subject of subjects) {
            await admissions.post('/branch/class-subjects', {
                classId: classDoc._id,
                subjectId: subject._id,
                totalMarks: 100,
                passMarks: 40
            });
        }
        classes.push({ ...classDoc, sections });
    }
    console.log(`   ${classes.length} classes, ${classes.reduce((n, c) => n + c.sections.length, 0)} sections`);
    console.log(`   ${classes.length * subjects.length} class-subject links`);

    step(3, 'What the Admissions Officer sees now');
    const visible = await admissions.get('/branch/classes');
    (visible.data || visible).forEach((item) => {
        console.log(`   ${item.name.padEnd(10)} grade ${item.gradeLevel}`);
    });

    return { yearId, categoryId, classes, subjects };
};

if (require.main === module) {
    run().then(() => console.log('\nStep 4 complete.')).catch((error) => {
        console.error('\nFAILED:', error.message);
        process.exit(1);
    });
}

module.exports = { run, GRADES, SUBJECTS, YEAR, TERMS };
