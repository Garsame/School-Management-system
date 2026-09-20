const mongoose = require('mongoose');
require('dotenv').config();

const Enrollment = require('../models/Enrollment');

const CURRENT_STATUSES = ['Current', 'Active', 'active'];
const LEGACY_INDEX_KEYS = {
    tenantId: 1,
    studentId: 1,
    academicYearId: 1
};
const CURRENT_INDEX_KEYS = {
    tenantId: 1,
    studentId: 1,
    academicYearId: 1,
    isCurrent: 1
};

const hasExactKeys = (index, expectedKeys) => {
    const actualEntries = Object.entries(index?.key || {});
    const expectedEntries = Object.entries(expectedKeys);
    return actualEntries.length === expectedEntries.length
        && expectedEntries.every(([key, value], position) => (
            actualEntries[position]?.[0] === key && actualEntries[position]?.[1] === value
        ));
};

const isLegacyEnrollmentUniqueIndex = (index) => (
    index?.unique === true && hasExactKeys(index, LEGACY_INDEX_KEYS)
);

const repairEnrollmentIndexes = async ({ mongoUri = process.env.MONGO_URI } = {}) => {
    if (!mongoUri) throw new Error('MONGO_URI must be set.');

    await mongoose.connect(mongoUri);
    const enrollments = mongoose.connection.db.collection('enrollments');

    const duplicateActiveEnrollments = await enrollments.aggregate([
        { $match: { status: { $in: CURRENT_STATUSES } } },
        {
            $group: {
                _id: {
                    tenantId: '$tenantId',
                    studentId: '$studentId',
                    academicYearId: '$academicYearId'
                },
                count: { $sum: 1 }
            }
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 }
    ]).toArray();

    if (duplicateActiveEnrollments.length > 0) {
        throw new Error('Duplicate active enrollments exist. Resolve them before repairing enrollment indexes.');
    }

    await enrollments.updateMany(
        { status: { $in: CURRENT_STATUSES } },
        { $set: { isCurrent: true } }
    );
    await enrollments.updateMany(
        { status: { $nin: CURRENT_STATUSES } },
        { $set: { isCurrent: false } }
    );

    await enrollments.createIndex(
        CURRENT_INDEX_KEYS,
        {
            name: 'tenantId_1_studentId_1_academicYearId_1_isCurrent_1',
            unique: true,
            partialFilterExpression: { isCurrent: true }
        }
    );

    const indexes = await enrollments.indexes();
    const obsoleteIndexes = indexes.filter(isLegacyEnrollmentUniqueIndex);
    for (const index of obsoleteIndexes) {
        await enrollments.dropIndex(index.name);
        console.log(`Dropped obsolete enrollment index '${index.name}'.`);
    }

    await enrollments.createIndex(
        { tenantId: 1, branchId: 1, studentId: 1, academicYearId: 1 },
        { name: 'tenantId_1_branchId_1_studentId_1_academicYearId_1' }
    );

    const repairedIndexes = await enrollments.indexes();
    if (repairedIndexes.some(isLegacyEnrollmentUniqueIndex)) {
        throw new Error('The obsolete enrollment index is still present.');
    }

    const currentIndex = repairedIndexes.find((index) => hasExactKeys(index, CURRENT_INDEX_KEYS));
    if (!currentIndex?.unique || currentIndex.partialFilterExpression?.isCurrent !== true) {
        throw new Error('The current-enrollment partial unique index was not created correctly.');
    }

    return {
        droppedIndexes: obsoleteIndexes.map(({ name }) => name),
        currentIndex: currentIndex.name
    };
};

const run = async () => {
    try {
        const result = await repairEnrollmentIndexes();
        console.log('Enrollment index repair completed successfully.');
        console.log(`Current enrollment index: ${result.currentIndex}`);
    } catch (error) {
        console.error(`Enrollment index repair failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect().catch(() => {});
    }
};

if (require.main === module) {
    run();
}

module.exports = {
    CURRENT_INDEX_KEYS,
    LEGACY_INDEX_KEYS,
    hasExactKeys,
    isLegacyEnrollmentUniqueIndex,
    repairEnrollmentIndexes
};
