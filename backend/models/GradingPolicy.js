const mongoose = require('mongoose');

const gradingPolicySchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    name: { type: String, trim: true, default: 'Institution Grading Scale' },
    finalGradeLevel: { type: String, trim: true, default: '12' },
    graduationRequiresPass: { type: Boolean, default: true },
    rules: [{
        min: { type: Number, required: true },
        max: { type: Number, required: true },
        grade: { type: String, required: true }
    }],
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('GradingPolicy', gradingPolicySchema);
