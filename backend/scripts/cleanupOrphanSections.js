/**
 * Remove sections whose class no longer exists.
 *
 * Deleting a class by hand leaves its sections behind, pointing at nothing. They never show
 * on any screen, but they sit in the database and can be matched by an import, so a student
 * ends up in a section that belongs to no class.
 *
 * This only ever deletes a section that satisfies both:
 *   - its classId matches no Class record at all, and
 *   - nothing points at the section itself - no enrollment, timetable slot, subject,
 *     teacher assignment or attendance session.
 *
 * A section whose class still exists is never touched, however empty it looks. Report only
 * unless --fix is given.
 *
 *   node scripts/cleanupOrphanSections.js          report what would go
 *   node scripts/cleanupOrphanSections.js --fix    delete them
 */
const mongoose = require('mongoose');
require('dotenv').config();

// Everything that can point at a section. A section held by any of these is left alone.
const SECTION_REFERENCES = [
    ['Enrollment', 'student enrollments'],
    ['TimetableSlot', 'timetable slots'],
    ['ClassSubject', 'subjects'],
    ['TeacherAssignment', 'teacher assignments'],
    ['AttendanceSession', 'attendance sessions']
];

const run = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';
    const isFixMode = process.argv.includes('--fix');

    console.log(`Connecting to ${mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);
    console.log(`Mode: ${isFixMode ? 'DELETE' : 'REPORT ONLY - nothing will be changed'}`);
    console.log('');

    await mongoose.connect(mongoUri);
    try {
        const Class = require('../models/Class');
        const Section = require('../models/Section');
        const Tenant = require('../models/Tenant');

        const classIds = new Set((await Class.find({}).select('_id').lean()).map((item) => String(item._id)));
        const tenantNames = new Map((await Tenant.find({}).select('_id name').lean())
            .map((item) => [String(item._id), item.name]));
        const sections = await Section.find({}).select('_id name classId tenantId').lean();

        console.log(`Sections in total: ${sections.length}`);
        console.log(`Classes in total:  ${classIds.size}`);
        console.log('');

        const removable = [];
        const heldBack = [];

        for (const section of sections) {
            if (classIds.has(String(section.classId))) continue;

            const attached = {};
            for (const [modelName, label] of SECTION_REFERENCES) {
                let Model;
                try { Model = require('../models/' + modelName); } catch (error) { continue; }
                const count = await Model.countDocuments({ sectionId: section._id });
                if (count > 0) attached[label] = count;
            }

            const where = tenantNames.get(String(section.tenantId)) || 'unknown school';
            if (Object.keys(attached).length) {
                heldBack.push({ section, where, attached });
            } else {
                removable.push({ section, where });
            }
        }

        if (heldBack.length) {
            console.log(`Sections whose class is gone but which still hold records: ${heldBack.length}`);
            console.log('These are NOT deleted. Move the records first, or recreate the class.');
            heldBack.forEach(({ section, where, attached }) => {
                const what = Object.entries(attached).map(([label, count]) => `${count} ${label}`).join(', ');
                console.log(`  ${where} / section "${section.name}" - holds ${what}`);
            });
            console.log('');
        }

        if (!removable.length) {
            console.log('Nothing to remove. Every section either has a class or holds records.');
            return;
        }

        console.log(`Sections with no class and no records: ${removable.length}`);
        removable.forEach(({ section, where }) => {
            console.log(`  ${where} / section "${section.name}"  (was in class ${section.classId})`);
        });
        console.log('');

        if (!isFixMode) {
            console.log('Report only. Run again with --fix to delete the sections listed above.');
            return;
        }

        const result = await Section.deleteMany({ _id: { $in: removable.map(({ section }) => section._id) } });
        console.log(`Deleted ${result.deletedCount} section${result.deletedCount === 1 ? '' : 's'}.`);
    } finally {
        await mongoose.disconnect();
    }
};

run().catch((error) => {
    console.error('Failed: ' + error.message);
    process.exit(1);
});
