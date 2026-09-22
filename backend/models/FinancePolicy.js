const mongoose = require('mongoose');

const financePolicySchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    // Monthly bills are due on this day of the month they are for. Kept to 28 so it exists
    // in every month.
    dueDay: { type: Number, min: 1, max: 28, default: 10 }
}, { timestamps: true });

module.exports = mongoose.model('FinancePolicy', financePolicySchema);
