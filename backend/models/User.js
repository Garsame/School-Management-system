const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { getExpectedScope, normalizeRole, normalizeScope } = require('../utils/rolePolicy');

const userSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: function() { return this.role !== 'platform_owner'; } },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: function() { return this.scope === 'branch'; } },
    authorizedBranchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' }, // Nullable for non-students
    name: { type: String, required: true },
    email: { 
        type: String, 
        trim: true,
        lowercase: true,
        required: function() { return this.role !== 'student'; } // Email optional for students
    },
    username: { type: String, trim: true, uppercase: true }, // Used as login identifier for students (studentCode)
    passwordHash: { type: String, required: true, minlength: 8 },
    role: {
        type: String,
        enum: ['super_admin', 'finance_director', 'hr_payroll_manager', 'branch_admin', 'teacher', 'dugsi_teacher', 'cashier', 'registrar', 'platform_owner', 'student', 'parent'],
        required: true
    },
    // The Role record backing `role`. `role` stays the authoritative string so existing
    // queries, indexes, and route guards keep working; roleId is what makes the permission
    // set editable. Null on users created before the Phase 1 migration, which fall back to
    // the built-in defaults for their role.
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    phone: { type: String },
    address: { type: String },
    employeeId: { type: String, trim: true, uppercase: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'] },
    avatarUrl: { type: String, trim: true },
    emergencyContact: {
        name: { type: String, trim: true },
        relationship: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true }
    },
    scope: { type: String, enum: ['tenant', 'branch', 'platform'], required: true },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    employmentInfo: {
        jobTitle: { type: String, trim: true },
        department: { type: String, trim: true },
        employmentType: {
            type: String,
            enum: ['Permanent', 'Contract', 'Part-time', 'Temporary', 'Volunteer']
        },
        hireDate: { type: Date },
        terminationDate: { type: Date },
        terminationReason: { type: String, trim: true },
        specialization: { type: String, trim: true },
        qualifiedSubjects: [{ type: String, trim: true }],
        yearsExperience: { type: Number, min: 0, default: 0 },
        qualifications: [{ type: String, trim: true }],
        basicSalary: { type: Number, default: 0 },
        allowance: { type: Number, default: 0 },
        deductions: { type: Number, default: 0 },
        currency: { type: String, trim: true, uppercase: true, default: 'USD' },
        paymentMethod: { type: String, enum: ['Bank', 'Mobile Money', 'Cash', 'Other'] },
        bankName: { type: String, trim: true },
        accountName: { type: String, trim: true },
        accountNumber: { type: String, trim: true, select: false },
        mobileMoneyNumber: { type: String, trim: true, select: false }
    },
    permissions: {
        allow: [{ type: String, trim: true }],
        deny: [{ type: String, trim: true }]
    },
    permissionProfile: { type: String, trim: true },
    lastPermissionUpdateAt: { type: Date },
    lastPermissionUpdateBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    emailVerifiedAt: { type: Date },
    phoneVerifiedAt: { type: Date },
    security: {
        failedLoginAttempts: { type: Number, default: 0 },
        lockedUntil: { type: Date },
        lastLoginAt: { type: Date },
        lastLoginIp: { type: String },
        passwordChangedAt: { type: Date },
        tokenVersion: { type: Number, default: 0 },
        mfaEnabled: { type: Boolean, default: false }
    },
    deactivatedAt: { type: Date },
    deactivationReason: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

userSchema.pre('validate', function() {
    this.role = normalizeRole(this.role);
    this.scope = normalizeScope(this.scope);

    const expectedScope = getExpectedScope(this.role);
    if (!expectedScope) {
        this.invalidate('role', 'Unsupported user role');
        return;
    }
    if (this.scope !== expectedScope) {
        this.invalidate('scope', `Role ${this.role} requires ${expectedScope} scope`);
    }
    if (expectedScope === 'branch' && !this.branchId) {
        this.invalidate('branchId', `Role ${this.role} requires a branch`);
    }
    if (this.role === 'teacher') {
        const branchIds = [this.branchId, ...(this.authorizedBranchIds || [])]
            .filter(Boolean)
            .map((branchId) => String(branchId));
        this.authorizedBranchIds = [...new Set(branchIds)];
    } else {
        this.authorizedBranchIds = [];
    }
    if (this.role === 'platform_owner' && (this.tenantId || this.branchId)) {
        this.invalidate('tenantId', 'Platform owners cannot belong to a tenant or branch');
    }
    if (!this.permissions) {
        this.permissions = { allow: [], deny: [] };
    }
    this.permissions.allow = [...new Set((this.permissions.allow || []).map((permission) => String(permission || '').trim()).filter(Boolean))];
    this.permissions.deny = [...new Set((this.permissions.deny || []).map((permission) => String(permission || '').trim()).filter(Boolean))];
    if (!this.security) this.security = {};
});

// Enforce uniqueness
userSchema.index({ tenantId: 1, email: 1 }, { 
    unique: true, 
    partialFilterExpression: { email: { $type: 'string' } } 
});
// A school administrator email identifies one tenant across the platform.
userSchema.index(
    { email: 1 },
    { unique: true, partialFilterExpression: { role: 'super_admin', email: { $type: 'string' } } }
);
userSchema.index({ tenantId: 1, username: 1 }, { 
    unique: true, 
    partialFilterExpression: { username: { $type: 'string' } } 
});
userSchema.index({ tenantId: 1, employeeId: 1 }, {
    unique: true,
    partialFilterExpression: { employeeId: { $type: 'string' } }
});
userSchema.index({ tenantId: 1, branchId: 1, role: 1, isActive: 1 });

// Password hashing middleware
userSchema.pre('save', async function() {
    if (!this.isModified('passwordHash')) return;
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    this.security = this.security || {};
    this.security.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
