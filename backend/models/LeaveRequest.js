const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { 
        type: String, 
        enum: ['Sick', 'Casual', 'Annual'], 
        required: true 
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['Pending', 'Approved', 'Rejected'], 
        default: 'Pending' 
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewRemarks: { type: String },
    createdAt: { type: Date, default: Date.now }
});

leaveRequestSchema.index({ tenantId: 1, branchId: 1, userId: 1 });
leaveRequestSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
