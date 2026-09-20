const mongoose = require('mongoose');

const timetableSlotSchema = new mongoose.Schema(
    {
        tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
        sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', index: true },
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
        teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        dayOfWeek: {
            type: String,
            enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
            required: true,
            index: true
        },
        startTime: { type: String, required: true }, // HH:mm
        endTime: { type: String, required: true }, // HH:mm
        room: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
        createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

timetableSlotSchema.index({ tenantId: 1, branchId: 1, academicYearId: 1, classId: 1, dayOfWeek: 1, startTime: 1 });
timetableSlotSchema.index({ tenantId: 1, branchId: 1, academicYearId: 1, classId: 1, sectionId: 1, dayOfWeek: 1, startTime: 1 });
timetableSlotSchema.index({ tenantId: 1, branchId: 1, academicYearId: 1, teacherUserId: 1, dayOfWeek: 1, startTime: 1 });

module.exports = mongoose.model('TimetableSlot', timetableSlotSchema);
