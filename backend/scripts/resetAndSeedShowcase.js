const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

const AcademicYear = require('../models/AcademicYear');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');
const AuditLog = require('../models/AuditLog');
const Branch = require('../models/Branch');
const Class = require('../models/Class');
const ClassCategory = require('../models/ClassCategory');
const ClassSubject = require('../models/ClassSubject');
const Counter = require('../models/Counter');
const Enrollment = require('../models/Enrollment');
const Exam = require('../models/Exam');
const ExamCategory = require('../models/ExamCategory');
const ExamTemplate = require('../models/ExamTemplate');
const FeeStructure = require('../models/FeeStructure');
const FinancePolicy = require('../models/FinancePolicy');
const GradingPolicy = require('../models/GradingPolicy');
const Invoice = require('../models/Invoice');
const LeaveRequest = require('../models/LeaveRequest');
const Notification = require('../models/Notification');
const ParentStudentLink = require('../models/ParentStudentLink');
const Payment = require('../models/Payment');
const Payroll = require('../models/Payroll');
const Plan = require('../models/Plan');
const PlatformSetting = require('../models/PlatformSetting');
const Result = require('../models/Result');
const Section = require('../models/Section');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const TeacherAssignment = require('../models/TeacherAssignment');
const Tenant = require('../models/Tenant');
const Term = require('../models/Term');
const TimetableSlot = require('../models/TimetableSlot');
const User = require('../models/User');

const RESET_FLAG = '--reset-showcase';
const CURRENT_YEAR = '2025-2026';
const HISTORICAL_YEAR = '2024-2025';
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const TIMES = [
    ['08:00', '08:45'],
    ['08:50', '09:35'],
    ['09:40', '10:25'],
    ['10:45', '11:30']
];

const plans = [
    {
        name: 'Foundation',
        slug: 'foundation',
        description: 'For a growing school that needs dependable daily administration.',
        price: 29,
        monthlyPrice: 29,
        yearlyPrice: 290,
        billingCycle: 'monthly',
        maxBranches: 2,
        maxStudents: 500,
        maxUsers: 60,
        storage: '10GB',
        storageLimit: '10GB',
        features: ['Student admissions', 'Attendance and results', 'Fee collection', 'Parent and student portals'],
        icon: 'School',
        color: 'text-blue-700',
        bg: 'bg-blue-50'
    },
    {
        name: 'Growth',
        slug: 'growth',
        description: 'For multi-branch schools that need stronger operations and reporting.',
        price: 69,
        monthlyPrice: 69,
        yearlyPrice: 690,
        billingCycle: 'monthly',
        maxBranches: 5,
        maxStudents: 2500,
        maxUsers: 200,
        storage: '50GB',
        storageLimit: '50GB',
        features: ['Everything in Foundation', 'Multi-branch management', 'Finance and payroll', 'Advanced reports'],
        icon: 'TrendingUp',
        color: 'text-emerald-700',
        bg: 'bg-emerald-50'
    },
    {
        name: 'Excellence',
        slug: 'excellence',
        description: 'For established school groups that need scale, control, and priority support.',
        price: 129,
        monthlyPrice: 129,
        yearlyPrice: 1290,
        billingCycle: 'monthly',
        maxBranches: 15,
        maxStudents: 10000,
        maxUsers: 800,
        storage: '250GB',
        storageLimit: '250GB',
        features: ['Everything in Growth', 'High-capacity operations', 'Audit and compliance tools', 'Priority support'],
        hasPrioritySupport: true,
        icon: 'Crown',
        color: 'text-amber-700',
        bg: 'bg-amber-50'
    }
];

const subjectDefinitions = [
    ['Mathematics', 'MATH'],
    ['English Language', 'ENG'],
    ['Somali Language', 'SOM'],
    ['Integrated Science', 'SCI'],
    ['Social Studies', 'SST'],
    ['Islamic Studies', 'ISL'],
    ['Computer Studies', 'ICT'],
    ['Physical Education', 'PE']
];

const gradingPolicies = {
    horizon: [
        { min: 95, max: 100, grade: 'A+' },
        { min: 90, max: 94.99, grade: 'A-' },
        { min: 85, max: 89.99, grade: 'B+' },
        { min: 80, max: 84.99, grade: 'B-' },
        { min: 70, max: 79.99, grade: 'C+' },
        { min: 60, max: 69.99, grade: 'C-' },
        { min: 50, max: 59.99, grade: 'D' },
        { min: 0, max: 49.99, grade: 'F' }
    ],
    barwaaqo: [
        { min: 90, max: 100, grade: 'A+' },
        { min: 85, max: 89.99, grade: 'A-' },
        { min: 80, max: 84.99, grade: 'B+' },
        { min: 75, max: 79.99, grade: 'B-' },
        { min: 65, max: 74.99, grade: 'C+' },
        { min: 55, max: 64.99, grade: 'C-' },
        { min: 50, max: 54.99, grade: 'D' },
        { min: 0, max: 49.99, grade: 'F' }
    ]
};

const schools = [
    {
        key: 'horizon',
        code: 'HIA',
        name: 'Horizon International Academy',
        domain: 'horizon-academy.school',
        emailDomain: 'horizonacademy.edu.so',
        plan: 'growth',
        billingCycle: 'monthly',
        primaryColor: '#176B5B',
        secondaryColor: '#D6A62E',
        logoUrl: '/uploads/logos/horizon-academy.svg',
        superAdmin: 'Safiya Ali Warsame',
        financeDirector: 'Abdirizak Yusuf Noor',
        hrManager: 'Nadiifa Mohamed Ali',
        feeMode: 'MONTHLY',
        branches: [
            {
                name: 'Central Campus',
                code: 'CENTRAL',
                address: 'Maka Al-Mukarama Road, Hodan, Mogadishu',
                phone: '+252 61 555 1101',
                admin: 'Hodan Mohamed Aden',
                registrar: 'Khadar Ali Osman',
                cashier: 'Maryan Hassan Jama',
                teachers: ['Yusuf Abdullahi Nur', 'Fadumo Ibrahim Ali', 'Abdiqani Warsame Omar', 'Nimo Ahmed Hassan', 'Ismail Osman Jama', 'Rahma Nur Mohamed', 'Mahad Ali Yusuf', 'Sahra Aden Farah']
            },
            {
                name: 'Riverside Campus',
                code: 'RIVERSIDE',
                address: 'Jidka Warshadaha, Wadajir, Mogadishu',
                phone: '+252 61 555 1102',
                admin: 'Abdirahman Said Ali',
                registrar: 'Hibo Mohamed Nur',
                cashier: 'Bashir Ahmed Osman',
                teachers: ['Amina Yusuf Hassan', 'Ahmed Ali Farah', 'Nasra Mohamed Jama', 'Mohamud Aden Nur', 'Hawa Ibrahim Warsame', 'Abdullahi Omar Ali', 'Khadija Hassan Yusuf', 'Ilyas Mohamed Said']
            }
        ]
    },
    {
        key: 'barwaaqo',
        code: 'BSS',
        name: 'Barwaaqo Scholars School',
        domain: 'barwaaqo-scholars.school',
        emailDomain: 'barwaaqoscholars.edu.so',
        plan: 'excellence',
        billingCycle: 'yearly',
        primaryColor: '#1F4F8A',
        secondaryColor: '#C58A1D',
        logoUrl: '/uploads/logos/barwaaqo-scholars.svg',
        superAdmin: 'Abdinasir Mohamed Farah',
        financeDirector: 'Sumaya Hassan Ali',
        hrManager: 'Abdirahman Yusuf Hassan',
        feeMode: 'TERM',
        branches: [
            {
                name: 'Mogadishu Main Campus',
                code: 'MAIN',
                address: 'Taleex Road, Hodan, Mogadishu',
                phone: '+252 61 555 2201',
                admin: 'Asha Abdullahi Osman',
                registrar: 'Abukar Yusuf Said',
                cashier: 'Nasteho Ali Ahmed',
                teachers: ['Mustafa Hassan Nur', 'Farhia Mohamed Ali', 'Abdirahman Jama Yusuf', 'Ubah Ahmed Aden', 'Said Osman Farah', 'Hamdi Ibrahim Nur', 'Abdiwali Ali Hassan', 'Muna Mohamed Omar']
            },
            {
                name: 'Hodan Campus',
                code: 'HODAN',
                address: 'Digfeer Road, Hodan, Mogadishu',
                phone: '+252 61 555 2202',
                admin: 'Mohamed Abdullahi Jama',
                registrar: 'Ifrah Hassan Warsame',
                cashier: 'Yasin Ali Nur',
                teachers: ['Hodan Yusuf Osman', 'Ali Mohamed Hassan', 'Maryan Aden Jama', 'Abdishakur Ibrahim Ali', 'Sagal Ahmed Nur', 'Faisal Omar Yusuf', 'Ruqiya Said Hassan', 'Anas Mohamed Farah']
            }
        ]
    }
];

const studentFirstNames = [
    'Ayaan', 'Abdirahman', 'Hani', 'Mohamed', 'Ifrah', 'Ahmed', 'Sahra', 'Yusuf',
    'Nimco', 'Abdullahi', 'Maryan', 'Ibrahim', 'Hodan', 'Ismail', 'Fadumo', 'Mahad',
    'Nasra', 'Abdiqani', 'Ubah', 'Mustafa', 'Rahma', 'Bashir', 'Muna', 'Anas'
];
const studentLastNames = [
    'Ali', 'Hassan', 'Mohamed', 'Osman', 'Warsame', 'Jama', 'Nur', 'Farah',
    'Yusuf', 'Aden', 'Omar', 'Said', 'Ibrahim', 'Abdullahi', 'Ahmed', 'Abdi'
];
const guardianFirstNames = ['Ahmed', 'Hassan', 'Amina', 'Mohamed', 'Fadumo', 'Abdullahi', 'Hodan', 'Yusuf', 'Maryan', 'Ibrahim', 'Sahra', 'Osman', 'Rahma'];
const scorePool = [97, 92, 88, 83, 77, 68, 56, 43];

const cleanKey = (value) => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
const roleSalary = { hr_payroll_manager: 1000, branch_admin: 900, registrar: 650, cashier: 600, teacher: 700 };
const gradeFor = (rules, percentage) => rules.find((rule) => percentage >= rule.min && percentage <= rule.max)?.grade || 'F';

const createUserDoc = ({ tenantId, branchId, name, email, username, role, scope, passwordHash, createdBy, employeeId, students = [] }) => ({
    tenantId,
    branchId,
    name,
    email,
    username,
    passwordHash,
    role,
    scope,
    students,
    employeeId,
    phone: role === 'student' ? undefined : '+252 61 555 0000',
    employmentInfo: ['super_admin', 'finance_director', 'hr_payroll_manager', 'branch_admin', 'registrar', 'cashier', 'teacher'].includes(role) ? {
        jobTitle: role.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' '),
        department: role === 'finance_director' || role === 'cashier' ? 'Finance' : role === 'teacher' ? 'Academic' : 'Administration',
        employmentType: 'Permanent',
        hireDate: new Date('2024-08-15'),
        basicSalary: roleSalary[role] || 1200,
        allowance: role === 'teacher' ? 50 : 100,
        deductions: 0,
        currency: 'USD',
        paymentMethod: 'Bank'
    } : undefined,
    permissions: { allow: [], deny: [] },
    isActive: true,
    mustChangePassword: false,
    emailVerifiedAt: email ? new Date('2025-08-20') : undefined,
    createdBy
});

const clearDatabase = async (ownerId) => {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
        if (collection.collectionName === 'users') {
            await collection.deleteMany({ _id: { $ne: ownerId } });
        } else {
            await collection.deleteMany({});
        }
    }
    await User.collection.updateOne(
        { _id: ownerId },
        {
            $set: { role: 'platform_owner', scope: 'platform', isActive: true },
            $unset: { tenantId: '', branchId: '', authorizedBranchIds: '' }
        }
    );
};

const seedSubscriptionHistory = async ({ tenant, plan, ownerId, schoolIndex }) => {
    const monthly = tenant.subscription.billingCycle === 'monthly';
    const periods = monthly
        ? [
            [new Date('2026-05-01'), new Date('2026-06-01')],
            [new Date('2026-06-01'), new Date('2026-07-01')]
        ]
        : [
            [new Date('2024-09-01'), new Date('2025-09-01')],
            [new Date('2025-09-01'), new Date('2026-09-01')]
        ];
    const amount = monthly ? plan.monthlyPrice : plan.yearlyPrice;

    for (let index = 0; index < periods.length; index += 1) {
        const [periodStart, periodEnd] = periods[index];
        const invoice = await SubscriptionInvoice.create({
            tenantId: tenant._id,
            planId: plan._id,
            planSlug: plan.slug,
            invoiceNumber: `SUB-${tenant.plan.toUpperCase()}-${schoolIndex + 1}-${index + 1}`,
            billingEmail: tenant.billingContactEmail,
            billingCycle: tenant.subscription.billingCycle,
            periodStart,
            periodEnd,
            dueDate: new Date(periodStart.getTime() + (7 * 24 * 60 * 60 * 1000)),
            currency: 'USD',
            amount,
            paidAmount: amount,
            balance: 0,
            status: 'PAID',
            notes: index === periods.length - 1 ? 'Current paid subscription period' : 'Previous renewal period',
            createdBy: ownerId
        });
        await SubscriptionPayment.create({
            tenantId: tenant._id,
            invoiceId: invoice._id,
            amount,
            method: 'BANK_TRANSFER',
            reference: `BANK-${tenant.plan.toUpperCase()}-${schoolIndex + 1}-${index + 1}`,
            receiptNumber: `SUB-REC-${schoolIndex + 1}-${index + 1}`,
            status: 'ACTIVE',
            recordedBy: ownerId
        });
    }
};

const seedSchool = async ({ config, schoolIndex, planMap, owner, passwordHash }) => {
    const plan = planMap.get(config.plan);
    const subscriptionDates = config.billingCycle === 'monthly'
        ? { start: new Date('2026-06-01'), end: new Date('2026-07-01') }
        : { start: new Date('2025-09-01'), end: new Date('2026-09-01') };
    const tenant = await Tenant.create({
        name: config.name,
        domain: config.domain,
        logoUrl: config.logoUrl,
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        plan: config.plan,
        billingContactEmail: `billing@${config.emailDomain}`,
        subscription: {
            billingCycle: config.billingCycle,
            status: 'active',
            currentPeriodStart: subscriptionDates.start,
            currentPeriodEnd: subscriptionDates.end,
            nextBillingDate: subscriptionDates.end
        },
        status: 'active',
        statusHistory: [{ status: 'active', reason: 'Approved showcase school', changedBy: owner._id, changedAt: new Date('2025-08-01') }],
        subscriptionLimits: {
            maxBranches: Number(plan.maxBranches),
            maxUsers: Number(plan.maxUsers),
            maxStudents: Number(plan.maxStudents),
            storageLimit: plan.storageLimit
        }
    });

    const branches = await Branch.insertMany(config.branches.map((branch) => ({
        tenantId: tenant._id,
        name: branch.name,
        code: branch.code,
        address: branch.address,
        phone: branch.phone,
        email: `${cleanKey(branch.code)}@${config.emailDomain}`,
        logoUrl: config.logoUrl,
        receiptFooter: `Thank you for supporting learning at ${config.name}.`,
        isActive: true
    })));

    const tenantUsers = await User.insertMany([
        createUserDoc({
            tenantId: tenant._id,
            name: config.superAdmin,
            email: `superadmin@${config.emailDomain}`,
            role: 'super_admin',
            scope: 'tenant',
            passwordHash,
            createdBy: owner._id,
            employeeId: `${config.code}-SA-001`
        }),
        createUserDoc({
            tenantId: tenant._id,
            name: config.financeDirector,
            email: `finance@${config.emailDomain}`,
            role: 'finance_director',
            scope: 'tenant',
            passwordHash,
            createdBy: owner._id,
            employeeId: `${config.code}-FD-001`
        }),
        createUserDoc({
            tenantId: tenant._id,
            name: config.hrManager,
            email: `hr@${config.emailDomain}`,
            role: 'hr_payroll_manager',
            scope: 'tenant',
            passwordHash,
            createdBy: owner._id,
            employeeId: `${config.code}-HR-001`
        })
    ]);
    const superAdmin = tenantUsers.find((user) => user.role === 'super_admin');

    const branchStates = [];
    for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
        const branch = branches[branchIndex];
        const branchConfig = config.branches[branchIndex];
        const staffDocs = [
            createUserDoc({ tenantId: tenant._id, branchId: branch._id, name: branchConfig.admin, email: `${cleanKey(branch.code)}.admin@${config.emailDomain}`, role: 'branch_admin', scope: 'branch', passwordHash, createdBy: superAdmin._id, employeeId: `${config.code}-${branchIndex + 1}-BA-001` }),
            createUserDoc({ tenantId: tenant._id, branchId: branch._id, name: branchConfig.registrar, email: `${cleanKey(branch.code)}.registrar@${config.emailDomain}`, role: 'registrar', scope: 'branch', passwordHash, createdBy: superAdmin._id, employeeId: `${config.code}-${branchIndex + 1}-RG-001` }),
            createUserDoc({ tenantId: tenant._id, branchId: branch._id, name: branchConfig.cashier, email: `${cleanKey(branch.code)}.cashier@${config.emailDomain}`, role: 'cashier', scope: 'branch', passwordHash, createdBy: superAdmin._id, employeeId: `${config.code}-${branchIndex + 1}-CS-001` }),
            ...branchConfig.teachers.map((name, teacherIndex) => createUserDoc({
                tenantId: tenant._id,
                branchId: branch._id,
                name,
                email: `${cleanKey(branch.code)}.teacher${String(teacherIndex + 1).padStart(2, '0')}@${config.emailDomain}`,
                role: 'teacher',
                scope: 'branch',
                passwordHash,
                createdBy: superAdmin._id,
                employeeId: `${config.code}-${branchIndex + 1}-TR-${String(teacherIndex + 1).padStart(3, '0')}`
            }))
        ];

        const parentDocs = Array.from({ length: branchIndex === 0 ? 13 : 12 }, (_, parentIndex) => createUserDoc({
            tenantId: tenant._id,
            name: `${guardianFirstNames[parentIndex]} ${studentLastNames[(parentIndex + branchIndex + schoolIndex) % studentLastNames.length]}`,
            email: `guardian.${cleanKey(branch.code)}.${String(parentIndex + 1).padStart(2, '0')}@${config.emailDomain}`,
            role: 'parent',
            scope: 'tenant',
            passwordHash,
            createdBy: superAdmin._id
        }));
        const insertedUsers = await User.insertMany([...staffDocs, ...parentDocs]);
        branchStates.push({
            branch,
            config: branchConfig,
            branchIndex,
            branchAdmin: insertedUsers.find((user) => user.role === 'branch_admin'),
            registrar: insertedUsers.find((user) => user.role === 'registrar'),
            cashier: insertedUsers.find((user) => user.role === 'cashier'),
            teachers: insertedUsers.filter((user) => user.role === 'teacher'),
            parents: insertedUsers.filter((user) => user.role === 'parent'),
            students: []
        });
    }

    const years = await AcademicYear.insertMany([
        { tenantId: tenant._id, name: HISTORICAL_YEAR, startDate: new Date('2024-09-01'), endDate: new Date('2025-06-30'), isCurrent: false },
        { tenantId: tenant._id, name: CURRENT_YEAR, startDate: new Date('2025-09-01'), endDate: new Date('2026-06-30'), isCurrent: true }
    ]);
    const historicalYear = years.find((year) => year.name === HISTORICAL_YEAR);
    const currentYear = years.find((year) => year.name === CURRENT_YEAR);
    const termDefinitions = [
        ['Term One', 1, '2025-09-01', '2025-12-18'],
        ['Term Two', 2, '2026-01-05', '2026-03-31'],
        ['Term Three', 3, '2026-04-05', '2026-06-30']
    ];
    const historicalTermDefinitions = [
        ['Term One', 1, '2024-09-01', '2024-12-18'],
        ['Term Two', 2, '2025-01-05', '2025-03-31'],
        ['Term Three', 3, '2025-04-05', '2025-06-30']
    ];
    const terms = await Term.insertMany([
        ...termDefinitions.map(([name, sequence, startDate, endDate]) => ({ tenantId: tenant._id, academicYearId: currentYear._id, name, sequence, startDate: new Date(startDate), endDate: new Date(endDate), isActive: true })),
        ...historicalTermDefinitions.map(([name, sequence, startDate, endDate]) => ({ tenantId: tenant._id, academicYearId: historicalYear._id, name, sequence, startDate: new Date(startDate), endDate: new Date(endDate), isActive: false }))
    ]);
    const currentTerm = terms.find((term) => term.academicYearId.equals(currentYear._id) && term.sequence === 3);
    const historicalTerm = terms.find((term) => term.academicYearId.equals(historicalYear._id) && term.sequence === 3);

    await GradingPolicy.create({
        tenantId: tenant._id,
        name: `${config.name} Grade Scale`,
        finalGradeLevel: '12',
        graduationRequiresPass: true,
        rules: gradingPolicies[config.key]
    });
    await FinancePolicy.create({ tenantId: tenant._id, dueDay: 10 });

    for (const state of branchStates) {
        const categories = await ClassCategory.insertMany([
            { tenantId: tenant._id, branchId: state.branch._id, name: 'Primary School', description: 'Grades 1 through 6', isActive: true },
            { tenantId: tenant._id, branchId: state.branch._id, name: 'Secondary School', description: 'Grades 7 through 12', isActive: true }
        ]);
        const primary = categories.find((category) => category.name === 'Primary School');
        const secondary = categories.find((category) => category.name === 'Secondary School');
        const classes = await Class.insertMany(Array.from({ length: 12 }, (_, index) => ({
            tenantId: tenant._id,
            branchId: state.branch._id,
            categoryId: index < 6 ? primary._id : secondary._id,
            name: `Grade ${index + 1}`,
            gradeLevel: String(index + 1)
        })));
        const sections = await Section.insertMany(classes.map((classDoc, index) => ({
            tenantId: tenant._id,
            branchId: state.branch._id,
            classId: classDoc._id,
            name: 'A',
            roomNumber: `${index < 6 ? 'P' : 'S'}-${String(index + 1).padStart(2, '0')}`,
            capacity: 35,
            isActive: true
        })));
        const subjects = await Subject.insertMany(subjectDefinitions.map(([name, code]) => ({ tenantId: tenant._id, branchId: state.branch._id, name, code, isActive: true })));
        const sectionByClass = new Map(sections.map((section) => [String(section.classId), section]));
        const classByGrade = new Map(classes.map((classDoc) => [Number(classDoc.gradeLevel), classDoc]));

        await ClassSubject.insertMany(classes.flatMap((classDoc) => subjects.map((subject) => ({
            tenantId: tenant._id,
            branchId: state.branch._id,
            classId: classDoc._id,
            sectionId: sectionByClass.get(String(classDoc._id))._id,
            subjectId: subject._id,
            academicYearId: currentYear._id,
            passMarks: 50,
            totalMarks: 100,
            passMarkPercent: 50,
            isActive: true
        }))));

        await TeacherAssignment.insertMany(classes.flatMap((classDoc) => subjects.map((subject, subjectIndex) => ({
            tenantId: tenant._id,
            branchId: state.branch._id,
            teacherUserId: state.teachers[subjectIndex]._id,
            academicYearId: currentYear._id,
            classId: classDoc._id,
            sectionId: sectionByClass.get(String(classDoc._id))._id,
            subjectId: subject._id,
            subject: subject._id,
            isActive: true
        }))));

        await TimetableSlot.insertMany(classes.flatMap((classDoc, classIndex) => subjects.slice(0, 3).map((subject, subjectIndex) => {
            const timeIndex = classIndex >= 6 ? 2 + (subjectIndex % 2) : subjectIndex % 2;
            return {
                tenantId: tenant._id,
                branchId: state.branch._id,
                academicYearId: currentYear._id,
                classId: classDoc._id,
                sectionId: sectionByClass.get(String(classDoc._id))._id,
                subjectId: subject._id,
                teacherUserId: state.teachers[subjectIndex]._id,
                dayOfWeek: DAYS[(classIndex + subjectIndex) % DAYS.length],
                startTime: TIMES[timeIndex][0],
                endTime: TIMES[timeIndex][1],
                room: sectionByClass.get(String(classDoc._id)).roomNumber,
                isActive: true,
                createdByUserId: state.branchAdmin._id
            };
        })));

        const studentDocs = [];
        for (let grade = 1; grade <= 12; grade += 1) {
            for (let studentIndex = 0; studentIndex < 2; studentIndex += 1) {
                const flatIndex = ((grade - 1) * 2) + studentIndex;
                const nameOffset = (schoolIndex * 8) + (state.branchIndex * 5);
                const firstName = studentFirstNames[(flatIndex + nameOffset) % studentFirstNames.length];
                const middleName = studentLastNames[(flatIndex + schoolIndex + 3) % studentLastNames.length];
                const lastName = studentLastNames[(flatIndex + state.branchIndex + 7) % studentLastNames.length];
                const parentIndex = (((grade - 1) % 6) * 2) + studentIndex;
                const parent = state.parents[parentIndex];
                const sequence = flatIndex + 1;
                studentDocs.push({
                    tenantId: tenant._id,
                    branchId: state.branch._id,
                    admissionNumber: `${config.code}-2026-${state.branch.code.slice(0, 3)}-${String(sequence).padStart(3, '0')}`,
                    studentCode: `${config.code}-${state.branch.code.slice(0, 3)}-${String(sequence).padStart(3, '0')}`,
                    firstName,
                    middleName,
                    lastName,
                    DOB: new Date(`${2020 - grade}-${String((flatIndex % 12) + 1).padStart(2, '0')}-15`),
                    gender: flatIndex % 2 === 0 ? 'Female' : 'Male',
                    admissionDate: new Date('2025-08-25'),
                    nationality: 'Somali',
                    placeOfBirth: 'Mogadishu',
                    primaryLanguage: 'Somali',
                    guardianInfo: {
                        name: parent.name,
                        phone: '+252 61 555 3000',
                        address: state.branch.address,
                        email: parent.email,
                        relationship: studentIndex === 0 ? 'Mother' : 'Father'
                    },
                    guardians: [{
                        name: parent.name,
                        phone: '+252 61 555 3000',
                        email: parent.email,
                        address: state.branch.address,
                        relationship: studentIndex === 0 ? 'Mother' : 'Father',
                        isPrimary: true,
                        isEmergencyContact: true,
                        isBillingContact: true,
                        pickupAuthorized: true
                    }],
                    emergencyContact: { name: parent.name, relationship: 'Guardian', phone: '+252 61 555 3000' },
                    status: 'Active',
                    createdBy: state.registrar._id,
                    grade,
                    parentId: parent._id
                });
            }
        }
        const studentPayloads = studentDocs.map(({ grade, parentId, ...student }) => student);
        const insertedStudents = await Student.insertMany(studentPayloads);
        state.students = insertedStudents.map((student, index) => ({
            student,
            grade: studentDocs[index].grade,
            parentId: studentDocs[index].parentId,
            classDoc: classByGrade.get(studentDocs[index].grade),
            section: sectionByClass.get(String(classByGrade.get(studentDocs[index].grade)._id))
        }));

        if (state.branchIndex === 0) {
            const alumniParent = state.parents[12];
            const graduate = await Student.create({
                tenantId: tenant._id,
                branchId: state.branch._id,
                admissionNumber: `${config.code}-2024-${state.branch.code.slice(0, 3)}-900`,
                studentCode: `${config.code}-${state.branch.code.slice(0, 3)}-900`,
                firstName: schoolIndex === 0 ? 'Ilham' : 'Hamza',
                middleName: schoolIndex === 0 ? 'Abdi' : 'Nur',
                lastName: schoolIndex === 0 ? 'Farah' : 'Osman',
                DOB: new Date('2007-04-18'),
                gender: schoolIndex === 0 ? 'Female' : 'Male',
                admissionDate: new Date('2013-09-01'),
                nationality: 'Somali',
                placeOfBirth: 'Mogadishu',
                primaryLanguage: 'Somali',
                guardianInfo: { name: alumniParent.name, phone: '+252 61 555 3900', address: state.branch.address, email: alumniParent.email, relationship: 'Guardian' },
                status: 'Graduated',
                graduationDate: new Date('2025-06-30'),
                createdBy: state.registrar._id
            });
            state.graduate = { student: graduate, parentId: alumniParent._id, classDoc: classByGrade.get(12), section: sectionByClass.get(String(classByGrade.get(12)._id)) };
        }

        const allStudentStates = state.graduate ? [...state.students, state.graduate] : state.students;
        const studentUsers = await User.insertMany(allStudentStates.map(({ student }) => createUserDoc({
            tenantId: tenant._id,
            branchId: state.branch._id,
            name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '),
            username: student.studentCode,
            role: 'student',
            scope: 'branch',
            passwordHash,
            createdBy: state.registrar._id
        })));
        allStudentStates.forEach((studentState, index) => {
            studentState.user = studentUsers[index];
        });
        await Promise.all(studentUsers.map((studentUser, index) => User.updateOne({ _id: studentUser._id }, { $set: { studentId: allStudentStates[index].student._id } })));

        const childrenByParent = new Map();
        for (const studentState of allStudentStates) {
            const key = String(studentState.parentId);
            if (!childrenByParent.has(key)) childrenByParent.set(key, []);
            childrenByParent.get(key).push(studentState.student._id);
        }
        await Promise.all([...childrenByParent.entries()].map(([parentId, childIds]) => User.updateOne({ _id: parentId }, { $set: { students: childIds } })));
        await ParentStudentLink.insertMany(allStudentStates.map((studentState, index) => ({
            tenantId: tenant._id,
            parentUserId: studentState.parentId,
            studentId: studentState.student._id,
            relationship: index % 2 === 0 ? 'Mother' : 'Father',
            isPrimaryContact: true,
            isBillingContact: true,
            isEmergencyContact: true,
            pickupAuthorized: true,
            hasPortalAccess: true,
            createdBy: state.registrar._id
        })));

        const enrollmentDocs = [];
        for (const studentState of state.students) {
            if (studentState.grade > 1) {
                const previousClass = classByGrade.get(studentState.grade - 1);
                enrollmentDocs.push({
                    tenantId: tenant._id,
                    branchId: state.branch._id,
                    studentId: studentState.student._id,
                    classId: previousClass._id,
                    sectionId: sectionByClass.get(String(previousClass._id))._id,
                    academicYearId: historicalYear._id,
                    status: 'Promoted',
                    isCurrent: false
                });
            }
            enrollmentDocs.push({
                tenantId: tenant._id,
                branchId: state.branch._id,
                studentId: studentState.student._id,
                classId: studentState.classDoc._id,
                sectionId: studentState.section._id,
                academicYearId: currentYear._id,
                status: 'Current',
                isCurrent: true
            });
        }
        if (state.graduate) {
            enrollmentDocs.push({
                tenantId: tenant._id,
                branchId: state.branch._id,
                studentId: state.graduate.student._id,
                classId: state.graduate.classDoc._id,
                sectionId: state.graduate.section._id,
                academicYearId: historicalYear._id,
                status: 'Graduated',
                isCurrent: false
            });
        }
        await Enrollment.insertMany(enrollmentDocs);
        await Counter.create({ tenantId: tenant._id, branchId: state.branch._id, key: 'studentCode', seq: allStudentStates.length });

        const examCategory = await ExamCategory.create({ tenantId: tenant._id, branchId: state.branch._id, name: 'Term Assessment', maxScore: 100, description: 'End-of-term subject assessment', isActive: true });
        const examTemplate = await ExamTemplate.create({ tenantId: tenant._id, branchId: state.branch._id, name: 'Standard 100-Mark Assessment', maxScore: 100, description: 'School standard assessment template', isActive: true });
        const exams = await Exam.insertMany(classes.flatMap((classDoc) => subjects.slice(0, 3).map((subject, subjectIndex) => ({
            tenantId: tenant._id,
            branchId: state.branch._id,
            academicYearId: currentYear._id,
            termId: currentTerm._id,
            examCategoryId: examCategory._id,
            examTemplateId: examTemplate._id,
            classId: classDoc._id,
            subjectId: subject._id,
            name: `Term Three ${subject.name} Assessment`,
            startDate: new Date(`2026-06-${String(8 + subjectIndex).padStart(2, '0')}`),
            endDate: new Date(`2026-06-${String(8 + subjectIndex).padStart(2, '0')}`),
            status: 'Closed',
            createdByUserId: state.branchAdmin._id
        }))));
        const examByClassSubject = new Map(exams.map((exam) => [`${exam.classId}:${exam.subjectId}`, exam]));
        const resultDocs = [];
        for (const [studentIndex, studentState] of state.students.entries()) {
            for (let subjectIndex = 0; subjectIndex < 3; subjectIndex += 1) {
                const subject = subjects[subjectIndex];
                const exam = examByClassSubject.get(`${studentState.classDoc._id}:${subject._id}`);
                const score = scorePool[(studentState.grade + studentIndex + subjectIndex + schoolIndex + state.branchIndex) % scorePool.length];
                resultDocs.push({
                    tenantId: tenant._id,
                    branchId: state.branch._id,
                    examId: exam._id,
                    studentId: studentState.student._id,
                    marksObtained: score,
                    maxScore: 100,
                    percentage: score,
                    passMarkPercent: 50,
                    status: score >= 50 ? 'PASS' : 'FAIL',
                    grade: gradeFor(gradingPolicies[config.key], score),
                    isAbsent: false,
                    remarks: score >= 80 ? 'Excellent progress' : score >= 50 ? 'Satisfactory progress' : 'Support and reassessment required',
                    createdByTeacherId: state.teachers[subjectIndex]._id,
                    gradedByTeacherId: state.teachers[subjectIndex]._id
                });
            }
        }
        await Result.insertMany(resultDocs);

        if (state.graduate) {
            const graduationExam = await Exam.create({
                tenantId: tenant._id,
                branchId: state.branch._id,
                academicYearId: historicalYear._id,
                termId: historicalTerm._id,
                examCategoryId: examCategory._id,
                examTemplateId: examTemplate._id,
                classId: state.graduate.classDoc._id,
                subjectId: subjects[0]._id,
                name: 'Grade 12 Graduation Assessment',
                startDate: new Date('2025-06-10'),
                endDate: new Date('2025-06-10'),
                status: 'Closed',
                createdByUserId: state.branchAdmin._id
            });
            const graduateScore = schoolIndex === 0 ? 92 : 88;
            await Result.insertMany([{
                tenantId: tenant._id,
                branchId: state.branch._id,
                examId: graduationExam._id,
                studentId: state.graduate.student._id,
                marksObtained: graduateScore,
                maxScore: 100,
                percentage: graduateScore,
                passMarkPercent: 50,
                status: 'PASS',
                grade: gradeFor(gradingPolicies[config.key], graduateScore),
                remarks: 'Graduation requirements completed',
                createdByTeacherId: state.teachers[0]._id,
                gradedByTeacherId: state.teachers[0]._id
            }]);
        }

        for (const [classIndex, classDoc] of classes.entries()) {
            const session = await AttendanceSession.create({
                tenantId: tenant._id,
                branchId: state.branch._id,
                teacherUserId: state.teachers[classIndex % state.teachers.length]._id,
                classId: classDoc._id,
                academicYearId: currentYear._id,
                date: '2026-06-15',
                period: 'Morning registration',
                status: 'CLOSED'
            });
            const classStudents = state.students.filter((studentState) => studentState.grade === classIndex + 1);
            await AttendanceRecord.insertMany(classStudents.map((studentState, index) => ({
                tenantId: tenant._id,
                branchId: state.branch._id,
                sessionId: session._id,
                studentId: studentState.student._id,
                status: ['PRESENT', 'LATE', 'PRESENT', 'ABSENT'][(classIndex + index + state.branchIndex) % 4]
            })));
        }

        // Every fee structure is a monthly fee: its items are what one student pays each month.
        // The school that used to bill by term gets the same yearly total spread over its ten
        // school months, so both showcase schools can be billed from the Generate page.
        const feeStructures = [];
        for (let grade = 1; grade <= 12; grade += 1) {
            const classDoc = classByGrade.get(grade);
            const monthlyAmount = config.feeMode === 'MONTHLY'
                ? 40 + (grade * 3)
                : Math.round(((180 + (grade * 12)) * 3) / 10);
            const tuition = Math.round(monthlyAmount * 0.8);
            feeStructures.push({
                tenantId: tenant._id,
                branchId: state.branch._id,
                academicYearId: currentYear._id,
                classId: classDoc._id,
                name: `Grade ${grade} monthly fee`,
                billingFrequency: 'MONTHLY',
                billingPeriods: [],
                amountsArePerMonth: true,
                isOpen: true,
                feeItems: [{ name: 'Tuition', amount: tuition }, { name: 'Activities and resources', amount: monthlyAmount - tuition }],
                totalAmount: monthlyAmount
            });
        }
        const insertedFeeStructures = await FeeStructure.insertMany(feeStructures);
        const feeByClass = new Map(insertedFeeStructures.map((fee) => [String(fee.classId), fee]));
        const invoices = [];
        for (const [studentIndex, studentState] of state.students.entries()) {
            const fee = feeByClass.get(String(studentState.classDoc._id));
            // One June bill per student, as the Generate page would have made it.
            const amount = fee.totalAmount;
            const paymentMode = studentIndex % 3;
            const paidAmount = paymentMode === 0 ? amount : paymentMode === 1 ? Math.round((amount / 2) * 100) / 100 : 0;
            invoices.push({
                tenantId: tenant._id,
                branchId: state.branch._id,
                studentId: studentState.student._id,
                academicYearId: currentYear._id,
                feeStructureId: fee._id,
                billingPeriodKey: '2026-06',
                billingPeriodLabel: 'June 2026',
                items: fee.feeItems.map(({ name, amount: itemAmount }) => ({ name, amount: itemAmount })),
                totalAmount: amount,
                paidAmount,
                balance: Math.round((amount - paidAmount) * 100) / 100,
                status: paidAmount === amount ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
                dueDate: new Date('2026-06-10')
            });
        }
        const insertedInvoices = await Invoice.insertMany(invoices);
        const paymentDocs = insertedInvoices.flatMap((invoice, index) => {
            if (!invoice.paidAmount) return [];
            const method = index % 2 === 0 ? 'CASH' : 'EVC_PLUS';
            return [{
                tenantId: tenant._id,
                branchId: state.branch._id,
                invoiceId: invoice._id,
                amount: invoice.paidAmount,
                method,
                reference: method === 'CASH' ? undefined : `MM-${config.code}-${state.branchIndex + 1}-${index + 1}`,
                receiptNumber: `REC-${config.code}-${state.branchIndex + 1}-${String(index + 1).padStart(4, '0')}`,
                recordedBy: state.cashier._id,
                status: 'ACTIVE',
                createdAt: new Date('2026-06-16')
            }];
        });
        if (paymentDocs.length) await Payment.insertMany(paymentDocs);

        const payrollUsers = [state.branchAdmin, state.registrar, state.cashier, ...state.teachers];
        await Payroll.insertMany(payrollUsers.map((user, index) => {
            const basicSalary = roleSalary[user.role];
            const allowances = user.role === 'teacher' ? 50 : 75;
            const deductions = index % 4 === 0 ? 10 : 0;
            return {
                tenantId: tenant._id,
                branchId: state.branch._id,
                userId: user._id,
                month: 6,
                year: 2026,
                basicSalary,
                allowances,
                deductions,
                netSalary: basicSalary + allowances - deductions,
                currency: 'USD',
                status: 'Paid',
                paidAt: new Date('2026-06-20')
            };
        }));
        await LeaveRequest.insertMany([
            { tenantId: tenant._id, branchId: state.branch._id, userId: state.teachers[0]._id, type: 'Sick', startDate: new Date('2026-05-12'), endDate: new Date('2026-05-13'), reason: 'Medical recovery', status: 'Approved', reviewedBy: state.branchAdmin._id, reviewRemarks: 'Approved with lesson cover arranged' },
            { tenantId: tenant._id, branchId: state.branch._id, userId: state.registrar._id, type: 'Annual', startDate: new Date('2026-07-05'), endDate: new Date('2026-07-10'), reason: 'Annual leave request', status: 'Pending' }
        ]);

        await Notification.insertMany(state.students.flatMap((studentState, index) => [
            { tenantId: tenant._id, recipientId: studentState.user._id, title: 'Term results published', message: `Your ${CURRENT_YEAR} Term Three results are now available.`, type: 'Grade', isRead: index % 2 === 0 },
            { tenantId: tenant._id, recipientId: studentState.user._id, title: 'Attendance updated', message: 'Your attendance record for 15 June 2026 has been recorded.', type: 'Attendance', isRead: true }
        ]));
        await Notification.insertMany(state.parents.map((parent, index) => ({
            tenantId: tenant._id,
            recipientId: parent._id,
            title: 'School fee statement available',
            message: 'The latest student fee statement is available in your parent portal.',
            type: 'Invoice',
            isRead: index % 3 === 0
        })));

        await AuditLog.insertMany([
            { scope: 'tenant', tenantId: tenant._id, branchId: state.branch._id, actorUserId: state.branchAdmin._id, actorName: state.branchAdmin.name, actorEmail: state.branchAdmin.email, actorRole: 'branch_admin', action: 'ACADEMIC_SETUP_COMPLETED', entityType: 'Branch', entityId: String(state.branch._id), after: { grades: 12, subjects: subjects.length } },
            { scope: 'tenant', tenantId: tenant._id, branchId: state.branch._id, actorUserId: state.registrar._id, actorName: state.registrar.name, actorEmail: state.registrar.email, actorRole: 'registrar', action: 'STUDENT_ADMISSIONS_COMPLETED', entityType: 'Student', after: { activeStudents: state.students.length, graduates: state.graduate ? 1 : 0 } },
            { scope: 'tenant', tenantId: tenant._id, branchId: state.branch._id, actorUserId: state.cashier._id, actorName: state.cashier.name, actorEmail: state.cashier.email, actorRole: 'cashier', action: 'FEE_PAYMENTS_RECORDED', entityType: 'Payment', after: { payments: paymentDocs.length } }
        ]);

        Object.assign(state, { classes, sections, subjects, classByGrade, sectionByClass });
    }

    await seedSubscriptionHistory({ tenant, plan, ownerId: owner._id, schoolIndex });
    await AuditLog.insertMany([
        { scope: 'platform', actorUserId: owner._id, actorName: owner.name, actorEmail: owner.email, actorRole: 'platform_owner', action: 'TENANT_APPROVED', entityType: 'Tenant', entityId: String(tenant._id), after: { name: tenant.name, plan: tenant.plan, billingCycle: tenant.subscription.billingCycle } },
        { scope: 'tenant', tenantId: tenant._id, actorUserId: superAdmin._id, actorName: superAdmin.name, actorEmail: superAdmin.email, actorRole: 'super_admin', action: 'SCHOOL_SETUP_COMPLETED', entityType: 'Tenant', entityId: String(tenant._id), after: { branches: branches.length, academicYear: CURRENT_YEAR } }
    ]);

    return { tenant, branches, superAdmin, branchStates };
};

const verifyShowcase = async () => {
    const failures = [];
    const expect = (condition, message) => {
        if (!condition) failures.push(message);
    };
    const [ownerCount, tenantCount, planCount, branchCount, hrManagerCount, studentCount, graduateCount, currentEnrollmentCount, resultCount] = await Promise.all([
        User.countDocuments({ role: 'platform_owner' }),
        Tenant.countDocuments({}),
        Plan.countDocuments({ isActive: true }),
        Branch.countDocuments({}),
        User.countDocuments({ role: 'hr_payroll_manager', isActive: true }),
        Student.countDocuments({}),
        Student.countDocuments({ status: 'Graduated' }),
        Enrollment.countDocuments({ isCurrent: true }),
        Result.countDocuments({})
    ]);
    expect(ownerCount === 1, `Expected 1 platform owner, found ${ownerCount}`);
    expect(tenantCount === 2, `Expected 2 tenants, found ${tenantCount}`);
    expect(planCount === 3, `Expected 3 active plans, found ${planCount}`);
    expect(branchCount === 4, `Expected 4 branches, found ${branchCount}`);
    expect(hrManagerCount === 2, `Expected 2 active HR managers, found ${hrManagerCount}`);
    expect(studentCount === 98, `Expected 98 students including graduates, found ${studentCount}`);
    expect(graduateCount === 2, `Expected 2 graduates, found ${graduateCount}`);
    expect(currentEnrollmentCount === 96, `Expected 96 current enrollments, found ${currentEnrollmentCount}`);
    expect(resultCount === 290, `Expected 290 results, found ${resultCount}`);

    const tenants = await Tenant.find({}).lean();
    const branches = await Branch.find({}).lean();
    const branchMap = new Map(branches.map((branch) => [String(branch._id), branch]));
    for (const tenant of tenants) {
        const tenantBranches = branches.filter((branch) => String(branch.tenantId) === String(tenant._id));
        const tenantHrManagers = await User.find({ tenantId: tenant._id, role: 'hr_payroll_manager', isActive: true }).lean();
        expect(tenantBranches.length === 2, `${tenant.name} does not have exactly two branches`);
        expect(tenantHrManagers.length === 1, `${tenant.name} does not have exactly one active HR manager`);
        for (const hrManager of tenantHrManagers) {
            expect(hrManager.scope === 'tenant', `${tenant.name} HR manager is not tenant-scoped`);
            expect(!hrManager.branchId, `${tenant.name} HR manager must not be assigned to a branch`);
            expect(Number(hrManager.employmentInfo?.basicSalary) > 0, `${tenant.name} HR manager has no basic salary`);
        }
        expect(['monthly', 'yearly'].includes(tenant.subscription?.billingCycle), `${tenant.name} has an invalid renewal cycle`);
        for (const branch of tenantBranches) {
            const grades = (await Class.find({ tenantId: tenant._id, branchId: branch._id }).distinct('gradeLevel')).map(Number).sort((a, b) => a - b);
            expect(JSON.stringify(grades) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), `${tenant.name}/${branch.name} is missing Grades 1-12`);
        }
    }

    const students = await Student.find({}).lean();
    const studentMap = new Map(students.map((student) => [String(student._id), student]));
    const studentUsers = await User.find({ role: 'student' }).lean();
    expect(studentUsers.length === studentCount, `Student/User mismatch: ${studentCount} students and ${studentUsers.length} student users`);
    for (const user of studentUsers) {
        const student = studentMap.get(String(user.studentId));
        expect(Boolean(student), `Student user ${user.username} has no student record`);
        if (student) {
            expect(String(user.tenantId) === String(student.tenantId), `Student user ${user.username} has a tenant mismatch`);
            expect(String(user.branchId) === String(student.branchId), `Student user ${user.username} has a branch mismatch`);
        }
    }

    const enrollments = await Enrollment.find({}).lean();
    for (const enrollment of enrollments) {
        const student = studentMap.get(String(enrollment.studentId));
        const branch = branchMap.get(String(enrollment.branchId));
        expect(Boolean(student), `Enrollment ${enrollment._id} has no student`);
        expect(Boolean(branch), `Enrollment ${enrollment._id} has no branch`);
        if (student && branch) {
            expect(String(student.tenantId) === String(enrollment.tenantId), `Enrollment ${enrollment._id} has a tenant mismatch`);
            expect(String(student.branchId) === String(enrollment.branchId), `Enrollment ${enrollment._id} has a branch mismatch`);
            expect(String(branch.tenantId) === String(enrollment.tenantId), `Enrollment ${enrollment._id} points to a foreign branch`);
        }
    }

    const activeStudents = students.filter((student) => student.status === 'Active');
    for (const student of activeStudents) {
        const [currentEnrollment, results, attendance, invoices] = await Promise.all([
            Enrollment.countDocuments({ studentId: student._id, isCurrent: true }),
            Result.countDocuments({ studentId: student._id }),
            AttendanceRecord.countDocuments({ studentId: student._id }),
            Invoice.countDocuments({ studentId: student._id })
        ]);
        expect(currentEnrollment === 1, `${student.studentCode} does not have exactly one current enrollment`);
        expect(results >= 3, `${student.studentCode} is missing subject results`);
        expect(attendance >= 1, `${student.studentCode} is missing attendance`);
        expect(invoices >= 1, `${student.studentCode} is missing an invoice`);
    }

    const indexesWithSchoolId = [];
    for (const collection of await mongoose.connection.db.collections()) {
        for (const index of await collection.indexes()) {
            if (index.key && Object.prototype.hasOwnProperty.call(index.key, 'schoolId')) {
                indexesWithSchoolId.push(`${collection.collectionName}.${index.name}`);
            }
        }
    }
    expect(indexesWithSchoolId.length === 0, `Legacy schoolId indexes remain: ${indexesWithSchoolId.join(', ')}`);

    if (failures.length) {
        throw new Error(`Showcase integrity verification failed:\n- ${failures.join('\n- ')}`);
    }

    const collectionCounts = {};
    for (const collection of await mongoose.connection.db.collections()) {
        const count = await collection.countDocuments({});
        if (count > 0) collectionCounts[collection.collectionName] = count;
    }
    return {
        status: 'PASS',
        ownerCount,
        tenantCount,
        planCount,
        branchCount,
        hrManagerCount,
        studentCount,
        graduateCount,
        currentEnrollmentCount,
        resultCount,
        collectionCounts
    };
};

const run = async () => {
    if (!process.argv.includes(RESET_FLAG)) {
        throw new Error(`Refusing to delete data without the explicit ${RESET_FLAG} flag.`);
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('This showcase reset is disabled when NODE_ENV=production.');
    }
    const password = process.env.SHOWCASE_PASSWORD;
    if (!password || password.length < 12) {
        throw new Error('Set SHOWCASE_PASSWORD to at least 12 characters before running this script.');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to ${mongoose.connection.name}.`);
    const preferredOwnerEmail = String(process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();
    const ownerQuery = preferredOwnerEmail
        ? { role: 'platform_owner', email: preferredOwnerEmail, isActive: true }
        : { role: 'platform_owner', scope: 'platform', isActive: true };
    const owner = await User.findOne(ownerQuery).sort({ createdAt: 1 });
    if (!owner) {
        throw new Error('No active platform owner was found. The reset was not started.');
    }

    console.log(`Preserving platform owner: ${owner.email}`);
    await clearDatabase(owner._id);
    console.log('Cleared all tenant, workflow, test, and duplicate platform-owner data.');

    const insertedPlans = await Plan.insertMany(plans);
    const planMap = new Map(insertedPlans.map((plan) => [plan.slug, plan]));
    await PlatformSetting.create({
        platformName: 'MadrasaHub',
        officialWebsite: 'https://madrasahub.com',
        primaryColor: '#1B2A4A',
        secondaryColor: '#4477F5',
        supportEmail: 'support@madrasahub.com',
        defaultCurrency: 'USD',
        defaultPlan: 'foundation',
        isRegistrationEnabled: true,
        updatedBy: owner._id
    });

    const passwordHash = await bcrypt.hash(password, 10);
    for (let schoolIndex = 0; schoolIndex < schools.length; schoolIndex += 1) {
        const result = await seedSchool({ config: schools[schoolIndex], schoolIndex, planMap, owner, passwordHash });
        console.log(`Seeded ${result.tenant.name}: ${result.branches.length} branches, Grades 1-12, and complete operational records.`);
    }

    const verification = await verifyShowcase();
    console.log('\nSHOWCASE VERIFICATION');
    console.log(JSON.stringify(verification, null, 2));
    console.log('\nDEMO ACCOUNTS');
    for (const school of schools) {
        console.log(`${school.name}`);
        console.log(`  Super Admin: superadmin@${school.emailDomain}`);
        console.log(`  Finance Director: finance@${school.emailDomain}`);
        console.log(`  HR & Payroll Manager: hr@${school.emailDomain}`);
        console.log(`  Branch Admin: ${cleanKey(school.branches[0].code)}.admin@${school.emailDomain}`);
        console.log(`  Registrar: ${cleanKey(school.branches[0].code)}.registrar@${school.emailDomain}`);
        console.log(`  Cashier: ${cleanKey(school.branches[0].code)}.cashier@${school.emailDomain}`);
        console.log(`  Teacher: ${cleanKey(school.branches[0].code)}.teacher01@${school.emailDomain}`);
        console.log(`  Parent: guardian.${cleanKey(school.branches[0].code)}.01@${school.emailDomain}`);
        console.log(`  Student username: ${school.code}-${school.branches[0].code.slice(0, 3)}-001`);
    }
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
