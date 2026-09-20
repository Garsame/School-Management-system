/**
 * Step 5 — admit the students, as the Admissions Officer.
 *
 * Also the place where the Phase 0 seat fix matters. This school is on the foundation plan:
 * 60 user seats, 500 students. With students and parents counted as seats the school would
 * have hit the wall at student 45 and been unable to admit the rest.
 */
const { loginTenant, step } = require('./lib');

const FIRST_NAMES_M = ['Abdirahman', 'Mohamed', 'Yusuf', 'Ismail', 'Liban', 'Bashir', 'Ahmed', 'Omar', 'Hassan', 'Khalid', 'Said', 'Aden', 'Farah', 'Jamal', 'Nuur'];
const FIRST_NAMES_F = ['Amina', 'Hodan', 'Ubah', 'Fartun', 'Naima', 'Sahra', 'Khadra', 'Ilham', 'Ayaan', 'Zamzam', 'Muna', 'Hani', 'Deqa', 'Asli', 'Ifrah'];
const MIDDLE_NAMES = ['Ali', 'Ibrahim', 'Hassan', 'Abdi', 'Yusuf', 'Ahmed', 'Omar', 'Mohamud', 'Hussein', 'Abdullahi'];
const LAST_NAMES = ['Warsame', 'Jama', 'Elmi', 'Guled', 'Hersi', 'Osman', 'Dahir', 'Said', 'Kahin', 'Jibril', 'Farah', 'Nur', 'Aden', 'Dirie', 'Maxamed'];
const DISTRICTS = ['Hodan', 'Waberi', 'Hamar Weyne', 'Wadajir', 'Kaaraan', 'Shibis'];

const pick = (list, index) => list[index % list.length];

/**
 * Some children share a guardian, so the parent portal has households with more than one
 * child in them — a single-child demo hides bugs in the linked-student views.
 */
const buildStudents = (classes, total) => {
    const students = [];
    const slots = classes.flatMap((klass) => klass.sections.map((section) => ({ klass, section })));

    for (let index = 0; index < total; index += 1) {
        const slot = slots[index % slots.length];
        const isMale = index % 2 === 0;
        const first = isMale ? pick(FIRST_NAMES_M, index) : pick(FIRST_NAMES_F, index);
        const last = pick(LAST_NAMES, Math.floor(index / 3));
        // Every third child shares the previous household.
        const household = Math.floor(index / 3);
        const guardianFirst = household % 2 === 0 ? pick(FIRST_NAMES_M, household + 3) : pick(FIRST_NAMES_F, household + 5);
        const birthYear = 2026 - (5 + slot.klass.gradeLevel);

        students.push({
            firstName: first,
            middleName: pick(MIDDLE_NAMES, index),
            lastName: last,
            DOB: `${birthYear}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
            gender: isMale ? 'Male' : 'Female',
            nationality: 'Somali',
            admissionDate: '2026-09-01',
            guardianInfo: {
                name: `${guardianFirst} ${last}`,
                phone: `+2526100${String(1000 + household).slice(-4)}`,
                email: `guardian${String(household).padStart(3, '0')}@nuur-al-ilm.school`,
                address: `House ${100 + index}, ${pick(DISTRICTS, household)} District, Mogadishu`,
                relationship: household % 2 === 0 ? 'Father' : 'Mother'
            },
            classId: slot.klass._id,
            sectionId: slot.section._id,
            createParentPortal: true
        });
    }
    return students;
};

const run = async ({ classes, yearId, total = 120 }) => {
    const admissions = await loginTenant('admissions', 'admissions@nuur-al-ilm.school');

    step(1, `Admit ${total} students`);
    const roster = buildStudents(classes, total);
    const admitted = [];
    let failed = 0;

    for (const student of roster) {
        try {
            const result = await admissions.post('/registrar/students', { ...student, academicYearId: yearId });
            admitted.push(result.data || result);
        } catch (error) {
            failed += 1;
            if (failed <= 3) console.log(`   failed: ${student.firstName} ${student.lastName} — ${error.status}: ${error.body?.message}`);
        }
    }
    console.log(`   ${admitted.length} admitted${failed ? `, ${failed} failed` : ''}`);

    step(2, 'Roster by class');
    // A student's class comes from their enrolment, not the student record, so read the
    // class listing which reports enrolment counts.
    for (const klass of classes) {
        const roll = await admissions.get(`/registrar/students?classId=${klass._id}&limit=200`);
        const rows = roll.data?.students || roll.data || roll;
        console.log(`   ${klass.name.padEnd(10)} ${Array.isArray(rows) ? rows.length : 0} students`);
    }

    step(3, 'The seat limit counts staff, not children');
    const admin = await loginTenant('super admin', 'admin@nuur-al-ilm.school');
    const staff = await admin.get('/tenant/users?category=all_staff');
    const staffCount = (staff.data || staff).length;
    console.log(`   staff seats used   : ${staffCount} of 60`);
    console.log(`   students admitted  : ${admitted.length} of 500`);
    console.log(`   before the fix these shared one 60-seat pool, so admission would have`);
    console.log(`   stopped at student ${Math.max(0, 60 - staffCount)} and the school could not have opened.`);

    return { admitted };
};

module.exports = { run, buildStudents };

if (require.main === module) {
    (async () => {
        // Read the structure back from the API rather than depending on step 4's return,
        // so this step can be run on its own.
        const admissions = await loginTenant('admissions', 'admissions@nuur-al-ilm.school');
        const classRes = await admissions.get('/branch/classes');
        const sectionRes = await admissions.get('/branch/sections');
        const yearRes = await admissions.get('/registrar/academic-years/current');

        const sections = sectionRes.data || sectionRes;
        const classes = (classRes.data || classRes).map((klass) => ({
            ...klass,
            sections: sections.filter((section) => String(section.classId?._id || section.classId) === String(klass._id))
        }));
        const yearId = (yearRes.data || yearRes)?._id;

        await run({ classes, yearId, total: Number(process.argv[2]) || 120 });
        console.log('\nStep 5 complete.');
    })().catch((error) => {
        console.error('\nFAILED:', error.message);
        process.exit(1);
    });
}
