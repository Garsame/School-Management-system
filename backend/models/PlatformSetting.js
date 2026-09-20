const mongoose = require('mongoose');

const platformSettingSchema = new mongoose.Schema({
  platformName: { type: String, default: 'MadrasaHub' },
  officialWebsite: { type: String, default: 'https://madrasahub.com' },
  primaryColor: { type: String, default: '#1b2a4a' },
  secondaryColor: { type: String, default: '#4477f5' },
  logoUrl: { type: String },
  supportEmail: { type: String, default: 'support@madrasahub.com' },
  contactPhone: { type: String, default: '' },
  defaultCurrency: { type: String, default: 'USD' },
  defaultPlan: { type: String, default: 'basic' },
  smtpHost: { type: String, default: 'smtp.sendgrid.net' },
  smtpPort: { type: String, default: '587' },
  smtpUser: { type: String },
  smtpPass: { type: String },
  senderEmail: { type: String, default: 'noreply@madrasahub.com' },
  isRegistrationEnabled: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
