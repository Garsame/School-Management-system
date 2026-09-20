const mongoose = require('mongoose');
require('dotenv').config();

const cleanupOrphanAdmissions = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';
    const isFixMode = process.argv.includes('--fix');
    console.log(`Connecting to MongoDB at: ${mongoUri}`);
    console.log(`Mode: ${isFixMode ? 'CLEANUP/FIX' : 'REPORT ONLY'}`);

    try {
        await mongoose.connect(mongoUri);
        console.log('MongoDB Connected successfully.');

        const db = mongoose.connection.db;
        const Student = require('../models/Student');
        const User = require('../models/User');
        const Enrollment = require('../models/Enrollment');
        const Payment = require('../models/Payment');
        const AttendanceRecord = require('../models/AttendanceRecord');
        const AttendanceSession = require('../models/AttendanceSession');

        // Load all records
        const students = await Student.find({});
        const studentUsers = await User.find({ role: 'student' });
        const allUsers = await User.find({});
        const enrollments = await Enrollment.find({});
        const payments = await Payment.find({});
        const attendanceRecords = await AttendanceRecord.find({});
        const attendanceSessions = await AttendanceSession.find({});

        const studentIds = new Set(students.map(s => s._id.toString()));
        const studentUserIds = new Set(studentUsers.map(u => u.studentId ? u.studentId.toString() : ''));
        const enrollmentStudentIds = new Set(enrollments.map(e => e.studentId ? e.studentId.toString() : ''));
        const sessionIds = new Set(attendanceSessions.map(s => s._id.toString()));

        const orphans = {
            studentsNoEnrollment: [],
            studentsNoUser: [],
            userStudentsNoStudent: [],
            enrollmentsNoStudent: [],
            pendingPayments: [],
            invalidReceipts: [],
            attendanceRecordsNoSession: [],
            userStudentBranchMismatches: [],
            enrollmentUserBranchMismatches: []
        };

        // 1. Student with no Enrollment
        for (const student of students) {
            if (!enrollmentStudentIds.has(student._id.toString())) {
                orphans.studentsNoEnrollment.push(student);
            }
        }

        // 2. Student with no User account
        for (const student of students) {
            if (!studentUserIds.has(student._id.toString())) {
                orphans.studentsNoUser.push(student);
            }
        }

        // 3. User with role 'student' but pointing to missing/no studentId
        for (const user of studentUsers) {
            if (!user.studentId || !studentIds.has(user.studentId.toString())) {
                orphans.userStudentsNoStudent.push(user);
            }
        }

        // 4. Enrollment pointing to missing Student
        for (const enrollment of enrollments) {
            if (!enrollment.studentId || !studentIds.has(enrollment.studentId.toString())) {
                orphans.enrollmentsNoStudent.push(enrollment);
            }
        }

        // 5. PENDING payments with no completion
        for (const p of payments) {
            if (p.status === 'PENDING') {
                orphans.pendingPayments.push(p);
            }
        }

        // 6. receiptNumber on non-ACTIVE payment
        for (const p of payments) {
            if (p.receiptNumber && p.status !== 'ACTIVE') {
                orphans.invalidReceipts.push(p);
            }
        }

        // 7. attendance records without session
        for (const r of attendanceRecords) {
            if (!r.sessionId || !sessionIds.has(r.sessionId.toString())) {
                orphans.attendanceRecordsNoSession.push(r);
            }
        }

        // 8. student User.branchId mismatch with Student.branchId after branch transfer
        for (const u of studentUsers) {
            if (u.studentId) {
                const stud = students.find(s => s._id.toString() === u.studentId.toString());
                if (stud && stud.branchId && u.branchId && stud.branchId.toString() !== u.branchId.toString()) {
                    orphans.userStudentBranchMismatches.push({ user: u, student: stud });
                }
            }
        }

        // 9. student with current enrollment branch different from user.branchId
        for (const enrollment of enrollments) {
            if (enrollment.studentId && ['Current', 'Active', 'current', 'active'].includes(enrollment.status)) {
                const sUser = allUsers.find(u => u.studentId && u.studentId.toString() === enrollment.studentId.toString());
                if (sUser && sUser.branchId && enrollment.branchId && enrollment.branchId.toString() !== sUser.branchId.toString()) {
                    orphans.enrollmentUserBranchMismatches.push({ enrollment, user: sUser });
                }
            }
        }

        // Print Report
        console.log('\n--- ORPHAN REPORT ---');
        console.log(`Students with no Enrollment: ${orphans.studentsNoEnrollment.length}`);
        console.log(`Students with no User account: ${orphans.studentsNoUser.length}`);
        console.log(`User Accounts (Student role) with missing Student record: ${orphans.userStudentsNoStudent.length}`);
        console.log(`Enrollments with missing Student record: ${orphans.enrollmentsNoStudent.length}`);
        console.log(`PENDING payments with no completion: ${orphans.pendingPayments.length}`);
        console.log(`Receipts on non-ACTIVE payments: ${orphans.invalidReceipts.length}`);
        console.log(`Attendance records without session: ${orphans.attendanceRecordsNoSession.length}`);
        console.log(`User/Student branchId mismatches: ${orphans.userStudentBranchMismatches.length}`);
        console.log(`Enrollment/User branchId mismatches: ${orphans.enrollmentUserBranchMismatches.length}`);
        console.log('---------------------\n');

        if (isFixMode) {
            console.log('Starting Cleanup/Fix of Orphans...');

            // Delete Students with no enrollment or user
            const studentIdsToDelete = new Set([
                ...orphans.studentsNoEnrollment.map(s => s._id.toString()),
                ...orphans.studentsNoUser.map(s => s._id.toString())
            ]);
            if (studentIdsToDelete.size > 0) {
                const res = await Student.deleteMany({ _id: { $in: Array.from(studentIdsToDelete).map(id => new mongoose.Types.ObjectId(id)) } });
                console.log(`Deleted ${res.deletedCount} orphan student records.`);
            }

            // Delete User accounts with missing student
            if (orphans.userStudentsNoStudent.length > 0) {
                const res = await User.deleteMany({ _id: { $in: orphans.userStudentsNoStudent.map(u => u._id) } });
                console.log(`Deleted ${res.deletedCount} orphan user account records.`);
            }

            // Delete Enrollments with missing student or associated with deleted students
            const enrollmentIdsToDelete = new Set(orphans.enrollmentsNoStudent.map(e => e._id.toString()));
            for (const studentId of studentIdsToDelete) {
                const associateEnrollments = enrollments.filter(e => e.studentId && e.studentId.toString() === studentId);
                associateEnrollments.forEach(e => enrollmentIdsToDelete.add(e._id.toString()));
            }
            if (enrollmentIdsToDelete.size > 0) {
                const res = await Enrollment.deleteMany({ _id: { $in: Array.from(enrollmentIdsToDelete).map(id => new mongoose.Types.ObjectId(id)) } });
                console.log(`Deleted ${res.deletedCount} orphan enrollment records.`);
            }

            // Delete PENDING payments
            if (orphans.pendingPayments.length > 0) {
                const res = await Payment.deleteMany({ _id: { $in: orphans.pendingPayments.map(p => p._id) } });
                console.log(`Deleted ${res.deletedCount} pending payment records.`);
            }

            // Unset receiptNumber on non-ACTIVE payments
            if (orphans.invalidReceipts.length > 0) {
                const res = await Payment.updateMany(
                    { _id: { $in: orphans.invalidReceipts.map(p => p._id) } },
                    { $unset: { receiptNumber: 1 } }
                );
                console.log(`Fixed ${res.modifiedCount} payments with invalid receipts.`);
            }

            // Delete attendance records without session
            if (orphans.attendanceRecordsNoSession.length > 0) {
                const res = await AttendanceRecord.deleteMany({ _id: { $in: orphans.attendanceRecordsNoSession.map(r => r._id) } });
                console.log(`Deleted ${res.deletedCount} attendance records without session.`);
            }

            // Fix User/Student branch mismatches
            if (orphans.userStudentBranchMismatches.length > 0) {
                let fixed = 0;
                for (const mismatch of orphans.userStudentBranchMismatches) {
                    await User.updateOne({ _id: mismatch.user._id }, { branchId: mismatch.student.branchId });
                    fixed++;
                }
                console.log(`Fixed ${fixed} User/Student branch mismatches.`);
            }

            // Fix Enrollment/User branch mismatches
            if (orphans.enrollmentUserBranchMismatches.length > 0) {
                let fixed = 0;
                for (const mismatch of orphans.enrollmentUserBranchMismatches) {
                    await User.updateOne({ _id: mismatch.user._id }, { branchId: mismatch.enrollment.branchId });
                    fixed++;
                }
                console.log(`Fixed ${fixed} Enrollment/User branch mismatches.`);
            }

            console.log('Orphan Cleanup and Fix finished.');
        } else {
            console.log('Run with "--fix" flag to clean up/repair detected orphan records.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error during orphan check/cleanup:', error);
        process.exit(1);
    }
};

cleanupOrphanAdmissions();
