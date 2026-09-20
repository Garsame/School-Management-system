const mongoose = require('mongoose');
require('dotenv').config();

const fixLegacyIndexes = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';
    console.log(`Connecting to MongoDB at: ${mongoUri}`);

    try {
        await mongoose.connect(mongoUri);
        console.log('MongoDB Connected successfully.');

        const db = mongoose.connection.db;

        // Fetch all collections in the database
        const collections = await db.collections();
        console.log(`Auditing ${collections.length} collections for legacy schoolId indexes...`);

        for (const coll of collections) {
            const collName = coll.collectionName;
            const indexes = await coll.indexes();
            
            for (const idx of indexes) {
                if (idx.name === '_id_') continue;
                
                // Check if index keys contain 'schoolId'
                const hasSchoolId = idx.key && ('schoolId' in idx.key);
                
                if (hasSchoolId) {
                    console.log(`Dropping obsolete index '${idx.name}' from collection '${collName}'`);
                    await coll.dropIndex(idx.name).catch(err => {
                        console.error(`Failed to drop index '${idx.name}' from collection '${collName}':`, err.message);
                    });
                }
            }
        }

        // Additional drop checks for specific obsolete indexes if they still linger
        const specificDrops = [
            { coll: 'students', name: 'schoolId_1_admissionNumber_1' },
            { coll: 'students', name: 'schoolId_1_branchId_1' },
            { coll: 'users', name: 'schoolId_1_email_1' },
            { coll: 'attendancerecords', name: 'schoolId_1_branchId_1_timetableSlotId_1_date_1' },
            { coll: 'payments', name: 'tenantId_1_branchId_1_receiptNumber_1' },
            { coll: 'subjects', name: 'schoolId_1_code_1' },
            { coll: 'academicyears', name: 'schoolId_1_name_1' },
            { coll: 'invoices', name: 'tenantId_1_branchId_1_studentId_1_academicYearId_1' },
            { coll: 'enrollments', name: 'tenantId_1_studentId_1_academicYearId_1' }
        ];

        for (const spec of specificDrops) {
            try {
                const coll = db.collection(spec.coll);
                const idxs = await coll.indexes();
                if (idxs.some(i => i.name === spec.name)) {
                    console.log(`Dropping specific obsolete index '${spec.name}' from '${spec.coll}'`);
                    await coll.dropIndex(spec.name);
                }
            } catch (err) {
                // Ignore if collection or index is already dropped
            }
        }

        const normalizeSubjectCodesForUniqueIndex = async () => {
            const subjects = db.collection('subjects');
            const docs = await subjects.find({ code: { $type: 'string' } })
                .project({ _id: 1, tenantId: 1, branchId: 1, code: 1, createdAt: 1 })
                .sort({ createdAt: 1, _id: 1 })
                .toArray();

            const seen = new Set();
            const operations = [];

            for (const doc of docs) {
                const tenantId = String(doc.tenantId || '');
                const branchId = String(doc.branchId || '');
                const originalCode = String(doc.code || '');
                const normalizedCode = originalCode.trim().toUpperCase();

                if (!normalizedCode) {
                    operations.push({
                        updateOne: {
                            filter: { _id: doc._id },
                            update: { $unset: { code: '' } }
                        }
                    });
                    continue;
                }

                let nextCode = normalizedCode;
                let key = `${tenantId}|${branchId}|${nextCode}`;

                if (seen.has(key)) {
                    const suffix = String(doc._id).slice(-6).toUpperCase();
                    let attempt = `${normalizedCode}-${suffix}`;
                    let attemptNumber = 1;
                    while (seen.has(`${tenantId}|${branchId}|${attempt}`)) {
                        attempt = `${normalizedCode}-${suffix}-${attemptNumber++}`;
                    }
                    nextCode = attempt;
                    key = `${tenantId}|${branchId}|${nextCode}`;
                    console.log(`Renaming duplicate subject code '${normalizedCode}' to '${nextCode}' for subject '${doc._id}'.`);
                }

                seen.add(key);

                if (nextCode !== originalCode) {
                    operations.push({
                        updateOne: {
                            filter: { _id: doc._id },
                            update: { $set: { code: nextCode } }
                        }
                    });
                }
            }

            if (operations.length > 0) {
                await subjects.bulkWrite(operations);
                console.log(`Normalized ${operations.length} subject code value(s) before index sync.`);
            }
        };

        await normalizeSubjectCodesForUniqueIndex();

        // Sync new model schemas
        console.log('Synchronizing new tenant-based indexes...');
        
        // Import models to register schema definitions
        const Student = require('../models/Student');
        const User = require('../models/User');
        const AttendanceRecord = require('../models/AttendanceRecord');
        const AttendanceSession = require('../models/AttendanceSession');
        const Payment = require('../models/Payment');
        const Subject = require('../models/Subject');
        const AcademicYear = require('../models/AcademicYear');
        const Invoice = require('../models/Invoice');
        const Term = require('../models/Term');
        const Enrollment = require('../models/Enrollment');
        const ParentStudentLink = require('../models/ParentStudentLink');

        const enrollments = db.collection('enrollments');
        await enrollments.updateMany(
            { status: { $nin: ['Current', 'Active', 'active'] } },
            { $set: { isCurrent: false } }
        );

        const activeEnrollments = await enrollments.find({ status: { $in: ['Current', 'Active', 'active'] } })
            .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
            .toArray();
        const activeEnrollmentKeys = new Set();
        const enrollmentOperations = [];

        for (const enrollment of activeEnrollments) {
            const key = `${enrollment.tenantId}|${enrollment.studentId}|${enrollment.academicYearId}`;
            if (!activeEnrollmentKeys.has(key)) {
                activeEnrollmentKeys.add(key);
                enrollmentOperations.push({
                    updateOne: { filter: { _id: enrollment._id }, update: { $set: { status: 'Current', isCurrent: true } } }
                });
            } else {
                enrollmentOperations.push({
                    updateOne: { filter: { _id: enrollment._id }, update: { $set: { status: 'Superseded', isCurrent: false } } }
                });
                console.log(`Marked duplicate active enrollment '${enrollment._id}' as Superseded.`);
            }
        }
        if (enrollmentOperations.length > 0) await enrollments.bulkWrite(enrollmentOperations);

        const parentUsers = await db.collection('users').find({ role: 'parent', students: { $exists: true, $ne: [] } })
            .project({ _id: 1, tenantId: 1, students: 1 })
            .toArray();
        const parentLinkOperations = parentUsers.flatMap((parent) => (parent.students || []).map((studentId, index) => ({
            updateOne: {
                filter: { tenantId: parent.tenantId, parentUserId: parent._id, studentId },
                update: {
                    $setOnInsert: {
                        relationship: 'Guardian',
                        isPrimaryContact: index === 0,
                        isBillingContact: index === 0,
                        isEmergencyContact: index === 0,
                        pickupAuthorized: true,
                        hasPortalAccess: true,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                },
                upsert: true
            }
        })));
        if (parentLinkOperations.length > 0) {
            await db.collection('parentstudentlinks').bulkWrite(parentLinkOperations);
            console.log(`Backfilled ${parentLinkOperations.length} parent/student relationship link(s).`);
        }

        await db.collection('invoices').updateMany(
            { billingPeriodKey: { $exists: false } },
            { $set: { billingPeriodKey: 'YEARLY', billingPeriodLabel: 'Annual' } }
        );

        await Student.syncIndexes();
        console.log("Indexes synchronized for model 'Student'.");

        await User.syncIndexes();
        console.log("Indexes synchronized for model 'User'.");

        await AttendanceRecord.syncIndexes();
        console.log("Indexes synchronized for model 'AttendanceRecord'.");

        await AttendanceSession.syncIndexes();
        console.log("Indexes synchronized for model 'AttendanceSession'.");

        await Payment.syncIndexes();
        console.log("Indexes synchronized for model 'Payment'.");

        await Subject.syncIndexes();
        console.log("Indexes synchronized for model 'Subject'.");

        await AcademicYear.syncIndexes();
        console.log("Indexes synchronized for model 'AcademicYear'.");

        await Invoice.syncIndexes();
        console.log("Indexes synchronized for model 'Invoice'.");

        await Term.syncIndexes();
        console.log("Indexes synchronized for model 'Term'.");

        await Enrollment.syncIndexes();
        console.log("Indexes synchronized for model 'Enrollment'.");

        await ParentStudentLink.syncIndexes();
        console.log("Indexes synchronized for model 'ParentStudentLink'.");

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error during index migration:', error);
        process.exit(1);
    }
};

fixLegacyIndexes();
