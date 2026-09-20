require('dotenv').config();

const mongoose = require('mongoose');
const AcademicYear = require('../models/AcademicYear');
const Branch = require('../models/Branch');
const Class = require('../models/Class');
const ClassSubject = require('../models/ClassSubject');
const Exam = require('../models/Exam');
const ExamCategory = require('../models/ExamCategory');
const ExamTemplate = require('../models/ExamTemplate');
const TeacherAssignment = require('../models/TeacherAssignment');
const Tenant = require('../models/Tenant');
const Term = require('../models/Term');
const TimetableSlot = require('../models/TimetableSlot');
const User = require('../models/User');

const PREPARE_FLAG = '--prepare-full-browser-e2e';

const dayKey = (date) => ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][date.getDay()];
const timeValue = (minutes) => {
    const normalized = Math.max(0, Math.min((23 * 60) + 59, minutes));
    return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};

const run = async () => {
    if (!process.argv.includes(PREPARE_FLAG)) {
        throw new Error(`Refusing to prepare data without ${PREPARE_FLAG}.`);
    }
    await mongoose.connect(process.env.MONGO_URI);
    if (!/_e2e(?:_|$)/i.test(mongoose.connection.name)) {
        throw new Error(`Refusing to modify non-E2E database ${mongoose.connection.name}.`);
    }

    const tenant = await Tenant.findOne({ domain: 'horizon-academy.school' });
    if (!tenant) throw new Error('Horizon showcase tenant was not found.');
    const branch = await Branch.findOne({ tenantId: tenant._id, code: 'CENTRAL' });
    const year = await AcademicYear.findOne({ tenantId: tenant._id, isCurrent: true });
    const gradeOne = await Class.findOne({ tenantId: tenant._id, branchId: branch?._id, gradeLevel: 1 });
    if (!branch || !year || !gradeOne) throw new Error('Central Campus Grade 1 preparation requirements are incomplete.');

    const curriculum = await ClassSubject.find({
        tenantId: tenant._id,
        branchId: branch._id,
        classId: gradeOne._id,
        academicYearId: year._id,
        isActive: { $ne: false }
    }).sort({ _id: 1 });
    if (curriculum.length !== 8) throw new Error(`Expected 8 Grade 1 subjects, found ${curriculum.length}.`);

    const [category, template, term, branchAdmin, cashier] = await Promise.all([
        ExamCategory.findOne({ tenantId: tenant._id, branchId: branch._id, isActive: true }),
        ExamTemplate.findOne({ tenantId: tenant._id, branchId: branch._id, isActive: true }),
        Term.findOne({ tenantId: tenant._id, academicYearId: year._id, isActive: true }).sort({ sequence: -1 }),
        User.findOne({ tenantId: tenant._id, branchId: branch._id, role: 'branch_admin', isActive: true }),
        User.findOne({ tenantId: tenant._id, branchId: branch._id, role: 'cashier', isActive: true })
    ]);
    if (!category || !template || !term || !branchAdmin || !cashier) throw new Error('E2E preparation requirements are incomplete.');

    await User.updateOne(
        { _id: cashier._id },
        { $addToSet: { 'permissions.allow': 'cashier.payments.reverse' } }
    );

    const preparedExams = [];
    for (const classSubject of curriculum) {
        const assignment = await TeacherAssignment.findOne({
            tenantId: tenant._id,
            branchId: branch._id,
            academicYearId: year._id,
            classId: gradeOne._id,
            subjectId: classSubject.subjectId,
            isActive: true
        });
        if (!assignment) throw new Error(`No teacher assignment exists for subject ${classSubject.subjectId}.`);

        const exam = await Exam.findOneAndUpdate(
            {
                tenantId: tenant._id,
                branchId: branch._id,
                academicYearId: year._id,
                termId: term._id,
                examCategoryId: category._id,
                classId: gradeOne._id,
                subjectId: classSubject.subjectId
            },
            {
                $set: {
                    examTemplateId: template._id,
                    name: `E2E Grade 1 ${String(classSubject.subjectId).slice(-6)} Assessment`,
                    startDate: new Date(),
                    endDate: new Date(),
                    status: 'Open',
                    createdByUserId: branchAdmin._id
                },
                $unset: { createdByTeacherId: 1 }
            },
            { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
        );
        preparedExams.push(exam._id);
    }

    const teacher = await User.findOne({
        tenantId: tenant._id,
        branchId: branch._id,
        email: 'central.teacher01@horizonacademy.edu.so'
    });
    const attendanceAssignment = await TeacherAssignment.findOne({
        tenantId: tenant._id,
        branchId: branch._id,
        teacherUserId: teacher?._id,
        academicYearId: year._id,
        classId: gradeOne._id,
        isActive: true
    });
    if (!teacher || !attendanceAssignment) throw new Error('Teacher 01 Grade 1 assignment was not found.');

    const now = new Date();
    const currentDay = dayKey(now);
    if (currentDay === 'SUN') throw new Error('Attendance E2E preparation cannot run on Sunday because Sunday is not a school timetable day.');
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    const startTime = timeValue(nowMinutes - 5);
    const endTime = timeValue(nowMinutes + 30);
    await TimetableSlot.findOneAndUpdate(
        {
            tenantId: tenant._id,
            branchId: branch._id,
            academicYearId: year._id,
            teacherUserId: teacher._id,
            classId: gradeOne._id,
            subjectId: attendanceAssignment.subjectId,
            room: 'E2E Attendance'
        },
        {
            $set: {
                sectionId: attendanceAssignment.sectionId,
                dayOfWeek: currentDay,
                startTime,
                endTime,
                isActive: true,
                createdByUserId: branchAdmin._id
            }
        },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );

    console.log(JSON.stringify({
        status: 'READY',
        database: mongoose.connection.name,
        tenant: tenant.name,
        branch: branch.name,
        className: gradeOne.name,
        openExamCount: preparedExams.length,
        attendanceTeacher: teacher.email,
        delegatedCashierPermission: 'cashier.payments.reverse',
        attendanceDay: currentDay,
        attendanceWindow: `${startTime}-${endTime}`
    }, null, 2));
};

run()
    .then(async () => {
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error(error.stack || error.message);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    });
