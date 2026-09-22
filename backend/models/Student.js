const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    admissionNumber: { type: String, required: true },
    studentCode: { type: String, required: true }, // Incremental ID like STD-001
    firstName: { type: String, required: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true },
    preferredName: { type: String, trim: true },
    DOB: { type: Date, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    admissionDate: { type: Date, default: Date.now },
    nationality: { type: String, trim: true },
    placeOfBirth: { type: String, trim: true },
    primaryLanguage: { type: String, trim: true },
    previousSchool: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
    guardianInfo: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
        email: { type: String },
        relationship: { type: String }
    },
    guardians: [{
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        email: { type: String, trim: true, lowercase: true },
        address: { type: String, trim: true },
        relationship: { type: String, trim: true },
        isPrimary: { type: Boolean, default: false },
        isEmergencyContact: { type: Boolean, default: false },
        isBillingContact: { type: Boolean, default: false },
        pickupAuthorized: { type: Boolean, default: false }
    }],
    emergencyContact: {
        name: { type: String, trim: true },
        relationship: { type: String, trim: true },
        phone: { type: String, trim: true }
    },
    medicalInfo: {
        bloodType: { type: String, trim: true },
        allergies: [{ type: String, trim: true }],
        conditions: [{ type: String, trim: true }],
        medications: [{ type: String, trim: true }],
        doctorName: { type: String, trim: true },
        doctorPhone: { type: String, trim: true },
        notes: { type: String, trim: true }
    },
    learningSupport: {
        hasSpecialNeeds: { type: Boolean, default: false },
        details: { type: String, trim: true },
        accommodations: [{ type: String, trim: true }]
    },
    documents: [{
        type: { type: String, trim: true },
        name: { type: String, trim: true },
        url: { type: String, trim: true },
        uploadedAt: { type: Date, default: Date.now }
    }],
    notes: { type: String, trim: true },
    // Left: the student has left the school. They are never billed again; what they already
    // owe stays on their record. withdrawalDate and withdrawalReason say when and why.
    status: { type: String, enum: ['Active', 'Inactive', 'Transferred', 'Graduated', 'Left'], default: 'Active' },
    graduationDate: { type: Date },
    withdrawalDate: { type: Date },
    withdrawalReason: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

studentSchema.pre('validate', function() {
    if ((!this.guardians || this.guardians.length === 0) && this.guardianInfo?.name) {
        this.guardians = [{
            name: this.guardianInfo.name,
            phone: this.guardianInfo.phone,
            email: this.guardianInfo.email,
            address: this.guardianInfo.address,
            relationship: this.guardianInfo.relationship || 'Guardian',
            isPrimary: true,
            isEmergencyContact: true,
            isBillingContact: true,
            pickupAuthorized: true
        }];
    }
});

// Enforce uniqueness
studentSchema.index({ tenantId: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ tenantId: 1, branchId: 1, studentCode: 1 }, { unique: true });
studentSchema.index({ tenantId: 1, branchId: 1 });

module.exports = mongoose.model('Student', studentSchema);
