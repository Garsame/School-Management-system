const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true }, // e.g., 'basic', 'pro', 'enterprise'
  description: { type: String, default: '' },
  price: { type: mongoose.Schema.Types.Mixed, default: 0 }, // can be number or 'Custom'
  monthlyPrice: { type: Number, min: 0 },
  yearlyPrice: { type: Number, min: 0 },
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'custom'], default: 'monthly' },
  maxBranches: { type: mongoose.Schema.Types.Mixed, default: 1 }, // number or 'Unlimited'
  maxStudents: { type: mongoose.Schema.Types.Mixed, default: 100 },
  maxUsers: { type: mongoose.Schema.Types.Mixed, default: 50 },
  storage: { type: String, default: '5GB' },
  storageLimit: { type: String, default: '5GB' },
  features: [{ type: String, trim: true }],
  hasPrioritySupport: { type: Boolean, default: false },
  icon: { type: String, default: 'Zap' }, // Lucide icon name
  color: { type: String, default: 'text-blue-600' },
  bg: { type: String, default: 'bg-blue-50' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

planSchema.pre('validate', function() {
  this.slug = String(this.slug || '').trim().toLowerCase();
  const legacyPrice = Number(this.price);
  if (this.monthlyPrice === undefined && Number.isFinite(legacyPrice)) this.monthlyPrice = legacyPrice;
  if (this.yearlyPrice === undefined && Number.isFinite(this.monthlyPrice)) this.yearlyPrice = this.monthlyPrice * 12;
  if (this.isModified('storage') && !this.isModified('storageLimit')) this.storageLimit = this.storage;
  if (this.isModified('storageLimit') && !this.isModified('storage')) this.storage = this.storageLimit;
});

module.exports = mongoose.model('Plan', planSchema);
