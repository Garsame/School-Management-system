const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['Grade', 'Attendance', 'Invoice', 'General'], 
        default: 'General' 
    },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ tenantId: 1, recipientId: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
