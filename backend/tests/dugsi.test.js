const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
mongoose.set('bufferCommands', false);

const { SURAHS, JUZ_LIST, LEARNING_STAGES } = require('../utils/quranData');
const { getEffectivePermissions, getUserPermissionParts } = require('../utils/permissions');
const { assertValidRoleScope, BRANCH_ADMIN_CREATABLE_ROLES } = require('../utils/rolePolicy');
const DugsiEnrollment = require('../models/DugsiEnrollment');
const DugsiClassAllocation = require('../models/DugsiClassAllocation');
const AttendanceSession = require('../models/AttendanceSession');
const QuranProgress = require('../models/QuranProgress');

test('Quran data dataset contains 114 Surahs and 30 Juz', () => {
    assert.equal(SURAHS.length, 114);
    assert.equal(JUZ_LIST.length, 30);
    assert.deepEqual(LEARNING_STAGES.map(s => s.key), ['READING', 'MEMORIZING']);

    // Check first and last Surah
    assert.equal(SURAHS[0].number, 1);
    assert.equal(SURAHS[0].name, 'Al-Fatihah');
    assert.equal(SURAHS[0].verses, 7);

    assert.equal(SURAHS[113].number, 114);
    assert.equal(SURAHS[113].name, 'An-Nas');
    assert.equal(SURAHS[113].verses, 6);
});

test('dugsi_teacher role has branch scope and default Dugsi permissions', () => {
    assert.deepEqual(assertValidRoleScope('dugsi_teacher', 'branch'), { role: 'dugsi_teacher', scope: 'branch' });
    assert.throws(() => assertValidRoleScope('dugsi_teacher', 'tenant'), /requires branch scope/);

    assert.ok(BRANCH_ADMIN_CREATABLE_ROLES.has('dugsi_teacher'));

    const permissions = getEffectivePermissions({ role: 'dugsi_teacher' });
    assert.ok(permissions.includes('dugsi.students.view'));
    assert.ok(permissions.includes('dugsi.students.manage'));
    assert.ok(permissions.includes('dugsi.attendance.take'));
    assert.ok(permissions.includes('dugsi.progress.manage'));

    // dugsi_teacher should not hold regular school admin features by default
    assert.equal(permissions.includes('finance.invoices.view'), false);
    assert.equal(permissions.includes('payroll.view'), false);
    assert.equal(permissions.includes('branch.staff.create'), false);
});

test('Dugsi schema models declare required indexes and sessionType defaults', () => {
    // AttendanceSession schema should support sessionType 'SCHOOL' and 'DUGSI'
    const sessionTypeEnum = AttendanceSession.schema.path('sessionType').enumValues;
    assert.deepEqual(sessionTypeEnum, ['SCHOOL', 'DUGSI']);
    assert.equal(AttendanceSession.schema.path('sessionType').defaultValue, 'SCHOOL');

    // DugsiEnrollment unique index
    const enrollmentIndexes = DugsiEnrollment.schema.indexes();
    const activeStudentIndex = enrollmentIndexes.find(
        ([idx, opts]) => idx.tenantId === 1 && idx.branchId === 1 && idx.academicYearId === 1 && idx.studentId === 1
    );
    assert.ok(activeStudentIndex, 'DugsiEnrollment should declare compound unique active student index');
    assert.equal(activeStudentIndex[1].unique, true);
    assert.deepEqual(activeStudentIndex[1].partialFilterExpression, { status: 'ACTIVE' });

    // DugsiClassAllocation unique index
    const allocationIndexes = DugsiClassAllocation.schema.indexes();
    const classAllocIndex = allocationIndexes.find(
        ([idx, opts]) => idx.tenantId === 1 && idx.branchId === 1 && idx.teacherUserId === 1 && idx.classId === 1
    );
    assert.ok(classAllocIndex, 'DugsiClassAllocation should declare unique teacher-class index');
    assert.equal(classAllocIndex[1].unique, true);
});

test('Quran progress schema validates surah and ayah ranges', () => {
    const quranProg = new QuranProgress({
        tenantId: new mongoose.Types.ObjectId(),
        branchId: new mongoose.Types.ObjectId(),
        studentId: new mongoose.Types.ObjectId(),
        teacherUserId: new mongoose.Types.ObjectId(),
        academicYearId: new mongoose.Types.ObjectId(),
        date: new Date(),
        learningStage: 'MEMORIZING',
        juz: 30,
        surahNumber: 114,
        surahName: 'An-Nas',
        startAyah: 1,
        endAyah: 6
    });

    const err = quranProg.validateSync();
    assert.equal(err, undefined, 'Valid QuranProgress should pass validation');
});
