const mongoose = require('mongoose');

const financePolicySchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    autoInvoiceMode: { 
        type: String, 
        enum: ["ON_ENROLLMENT", "ON_YEAR_START", "MANUAL"], 
        default: "MANUAL" 
    },
    isEnabled: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('FinancePolicy', financePolicySchema);
