const User = require('../models/User');
const Student = require('../models/Student');
const Tenant = require('../models/Tenant');
const jwt = require('jsonwebtoken');
const { normalizeRole } = require('../utils/rolePolicy');
const { getEffectivePermissions } = require('../utils/permissions');
const Plan = require('../models/Plan');
const PlatformSetting = require('../models/PlatformSetting');
const { limitsFromPlan } = require('../services/planLimitService');
const { linkUserToRole, seedRolesForTenant } = require('../scripts/seedSystemRoles');
const { resolveTenantStatus } = require('../services/tenantStatusService');
const { logActivity } = require('../utils/logger');
const fs = require('fs/promises');
const path = require('path');
const { clearAuthCookie, getJwtExpiresIn, setAuthCookie } = require('../utils/authCookies');

const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, ver: user.security?.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: getJwtExpiresIn() }
    );
};

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

const isAccountLocked = (user) => user.security?.lockedUntil && user.security.lockedUntil > new Date();

const recordFailedLogin = async (user) => {
    if (!user || typeof user.save !== 'function') return;
    user.security = user.security || {};
    user.security.failedLoginAttempts = (user.security.failedLoginAttempts || 0) + 1;
    if (user.security.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.security.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
        user.security.failedLoginAttempts = 0;
    }
    await user.save({ validateBeforeSave: false });
};

const recordSuccessfulLogin = async (user, req) => {
    if (!user || typeof user.save !== 'function') return;
    user.security = user.security || {};
    user.security.failedLoginAttempts = 0;
    user.security.lockedUntil = undefined;
    user.security.lastLoginAt = new Date();
    user.security.lastLoginIp = req.ip;
    await user.save({ validateBeforeSave: false });
};

const findTenantByDomain = async (tenantDomain) => {
    if (!tenantDomain) return null;
    return Tenant.findOne({ domain: String(tenantDomain).trim().toLowerCase() });
};

const buildSessionPayload = (user, tenant = null) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    // The school's own name for the role ("Finance Officer"), shown in place of the key.
    roleName: (user.roleId && typeof user.roleId === 'object' && user.roleId.name) || null,
    scope: user.scope,
    tenantId: user.tenantId,
    branchId: user.branchId,
    authorizedBranchIds: user.authorizedBranchIds || [],
    students: user.students || [],
    avatarUrl: user.avatarUrl || '',
    mustChangePassword: Boolean(user.mustChangePassword),
    permissions: getEffectivePermissions(user, user.roleId || null),
    billing: tenant ? {
        billingCycle: tenant.subscription?.billingCycle || 'monthly',
        subscriptionStatus: tenant.subscription?.status || 'pending',
        currentPeriodEnd: tenant.subscription?.currentPeriodEnd || null,
        nextBillingDate: tenant.subscription?.nextBillingDate || null,
        gracePeriodEndsAt: tenant.subscription?.gracePeriodEndsAt || null
    } : null,
    branding: tenant ? {
        tenantName: tenant.name,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
        logoUrl: tenant.logoUrl
    } : null
});

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const buildOwnProfilePayload = (user) => ({
    _id: user._id,
    name: user.name,
    email: user.email || '',
    username: user.username || '',
    phone: user.phone || '',
    address: user.address || '',
    dateOfBirth: user.dateOfBirth || null,
    gender: user.gender || '',
    avatarUrl: user.avatarUrl || '',
    employeeId: user.employeeId || '',
    role: user.role,
    scope: user.scope,
    tenantId: user.tenantId || null,
    branchId: user.branchId || null,
    emergencyContact: {
        name: user.emergencyContact?.name || '',
        relationship: user.emergencyContact?.relationship || '',
        phone: user.emergencyContact?.phone || '',
        email: user.emergencyContact?.email || ''
    },
    lastLoginAt: user.security?.lastLoginAt || null,
    createdAt: user.createdAt
});

const buildOwnProfileWithOfficialIdentity = async (user) => {
    const profile = buildOwnProfilePayload(user);
    if (user.role !== 'student' || !user.studentId || !user.tenantId) return profile;

    const student = await Student.findOne({
        _id: user.studentId,
        tenantId: user.tenantId
    }).select('firstName middleName lastName DOB gender');

    if (!student) return profile;
    profile.name = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
    profile.dateOfBirth = student.DOB || null;
    profile.gender = student.gender || '';
    return profile;
};

const findAuthenticatedUser = (req) => {
    const query = { _id: req.user._id };
    if (req.tenantId) query.tenantId = req.tenantId;
    else query.role = 'platform_owner';
    return User.findOne(query);
};

const validateOwnProfile = (body = {}, role = '') => {
    const protectedIdentityFields = ['name', 'dateOfBirth', 'gender'];
    if (!['super_admin', 'branch_admin', 'registrar'].includes(role) && protectedIdentityFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
        return { statusCode: 403, error: 'Name, date of birth, and gender are protected official records.' };
    }
    const emergencyContact = body.emergencyContact && typeof body.emergencyContact === 'object'
        ? {
            name: cleanText(body.emergencyContact.name, 120),
            relationship: cleanText(body.emergencyContact.relationship, 80),
            phone: cleanText(body.emergencyContact.phone, 30),
            email: cleanText(body.emergencyContact.email, 160).toLowerCase()
        }
        : { name: '', relationship: '', phone: '', email: '' };

    if (emergencyContact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emergencyContact.email)) {
        return { error: 'Enter a valid emergency contact email.' };
    }

    return {
        value: {
            name: cleanText(body.name, 160),
            email: cleanText(body.email, 160).toLowerCase(),
            dateOfBirth: body.dateOfBirth || null,
            gender: cleanText(body.gender, 30),
            phone: cleanText(body.phone, 30),
            address: cleanText(body.address, 300),
            emergencyContact
        }
    };
};

const removeLocalAvatar = async (avatarUrl) => {
    const normalized = String(avatarUrl || '').replace(/\\/g, '/');
    if (!normalized.startsWith('/uploads/avatars/')) return;
    const filename = path.basename(normalized);
    const avatarDir = path.resolve(__dirname, '..', 'uploads', 'avatars');
    const filePath = path.resolve(avatarDir, filename);
    if (path.dirname(filePath) !== avatarDir) return;
    await fs.unlink(filePath).catch((error) => {
        if (error.code !== 'ENOENT') console.warn(`[PROFILE] Could not remove old avatar: ${error.message}`);
    });
};

// @desc    Register a new Tenant and its Super Admin
// @route   POST /api/auth/register-tenant
// @access  Public
const registerTenant = async (req, res) => {
    const { schoolName, domain, adminName, email, password } = req.body;
    let tenant;
    let user;

    try {
        if (!schoolName || !domain || !adminName || !email || !password) {
            return res.status(400).json({ message: 'All registration fields are required' });
        }
        if (String(password).length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const settings = await PlatformSetting.findOne().lean();
        if (settings?.isRegistrationEnabled === false) {
            return res.status(403).json({
                message: 'School registration is currently disabled. Please contact platform support.',
                code: 'REGISTRATION_DISABLED'
            });
        }

        const normalizedDomain = String(domain).trim().toLowerCase();
        const normalizedEmail = String(email).trim().toLowerCase();
        const requestedPlan = String(req.body.plan || settings?.defaultPlan || 'basic').trim().toLowerCase();
        const plan = await Plan.findOne({ slug: requestedPlan, isActive: true }).lean();
        if (!plan) return res.status(400).json({ message: 'Selected subscription plan is not active or available' });

        // 1. Check if tenant domain exists
        const tenantExists = await Tenant.findOne({ domain: normalizedDomain });
        if (tenantExists) return res.status(400).json({ message: 'Domain already registered' });
        const adminEmailExists = await User.exists({ email: normalizedEmail, role: 'super_admin' });
        if (adminEmailExists) {
            return res.status(409).json({ message: 'A school administrator already uses this email address' });
        }

        // 2. Create Tenant
        tenant = await Tenant.create({
            name: schoolName,
            domain: normalizedDomain,
            plan: plan.slug,
            status: 'pending',
            isActive: false,
            isApproved: false,
            subscriptionLimits: limitsFromPlan(plan),
            billingContactEmail: normalizedEmail,
            subscription: {
                billingCycle: ['monthly', 'yearly'].includes(req.body.billingCycle)
                    ? req.body.billingCycle
                    : (['monthly', 'yearly'].includes(plan.billingCycle) ? plan.billingCycle : 'monthly'),
                status: 'pending'
            },
            statusHistory: [{ status: 'pending', reason: 'Public school registration submitted' }]
        });

        // A school registering itself needs its roles too, or it has nothing to configure.
        await seedRolesForTenant(tenant._id);

        // 3. Create Super Admin User. The Main Branch is created when the platform approves the tenant.
        user = await User.create({
            tenantId: tenant._id,
            name: adminName,
            email: normalizedEmail,
            passwordHash: password, // Will be hashed by pre-save hook
            role: 'super_admin',
            scope: 'tenant',
            permissionProfile: 'default_super_admin',
            isActive: true
        });
        await linkUserToRole(user);

        await logActivity({
            action: 'TENANT_REGISTRATION_SUBMITTED',
            entityType: 'Tenant',
            entityId: tenant._id.toString(),
            scope: 'platform',
            userId: user._id,
            role: user.role,
            user: user.name,
            actorEmail: user.email,
            after: { name: tenant.name, domain: tenant.domain, plan: tenant.plan, status: tenant.status },
            req
        });

        // Send email asynchronously
        const { sendPlatformEmail } = require('../utils/emailHelper');
        sendPlatformEmail('registration_pending', tenant, user).catch(err => console.error(`[SMTP Email Helper] Pending registration email failed: ${err.message}`));

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: tenant._id,
            pending: true,
            message: 'Registration submitted. Your school is pending platform approval.'
        });
    } catch (error) {
        await Promise.allSettled([
            user ? User.deleteOne({ _id: user._id }) : Promise.resolve(),
            tenant ? Tenant.deleteOne({ _id: tenant._id }) : Promise.resolve()
        ]);

        if (error?.code === 11000) {
            return res.status(409).json({ message: 'Domain or administrator account already exists' });
        }
        res.status(500).json({ message: 'Registration could not be completed. Please try again.' });
    }
};

// @desc    Authenticate User
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
    const { email, username, password, requiredRoles, tenantDomain } = req.body;

    try {
        if (!password) return res.status(400).json({ message: 'Password is required' });

        const query = {};
        if (email) query.email = String(email).trim().toLowerCase();
        else if (username) query.username = String(username).trim().toUpperCase();
        else return res.status(400).json({ message: 'Email or Username is required' });

        if (requiredRoles && Array.isArray(requiredRoles)) {
            query.role = { $in: requiredRoles.map(normalizeRole) };
        }

        if (tenantDomain) {
            const tenant = await findTenantByDomain(tenantDomain);
            if (!tenant) return res.status(401).json({ message: 'Invalid credentials or institution domain' });
            query.tenantId = tenant._id;
        }

        // Populate the role so the session payload reports the permissions the API will
        // actually enforce. Without it login returns the built-in defaults and the sidebar
        // disagrees with the backend about what this user can do.
        const candidates = await User.find(query).populate('roleId');
        const matches = [];
        for (const candidate of candidates) {
            if (!isAccountLocked(candidate) && await candidate.comparePassword(password)) matches.push(candidate);
        }

        if (matches.length > 1) {
            return res.status(409).json({
                message: 'Multiple accounts match these credentials. Enter your institution domain and try again.',
                code: 'TENANT_DOMAIN_REQUIRED'
            });
        }

        const user = matches[0];

        if (user) {
            if (!user.isActive) return res.status(403).json({ message: 'Account is inactive' });

            const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;
            if (user.role !== 'platform_owner' && !tenant) {
                return res.status(403).json({ message: 'Account institution is unavailable' });
            }
            if (tenant && resolveTenantStatus(tenant) !== 'active') {
                const status = resolveTenantStatus(tenant);
                const statusMessages = {
                    pending: 'Your school registration is pending platform approval.',
                    rejected: 'Your school registration was rejected. Contact platform support.',
                    suspended: 'Your school account is suspended. Contact platform support.'
                };
                return res.status(403).json({
                    message: statusMessages[status] || 'Your school account is suspended. Contact platform support.',
                    code: `TENANT_${status.toUpperCase()}`
                });
            }

            await recordSuccessfulLogin(user, req);

            const token = generateToken(user);
            setAuthCookie(res, token);

            return res.json(buildSessionPayload(user, tenant));
        }

        if (candidates.length === 1 && isAccountLocked(candidates[0])) {
            return res.status(423).json({
                message: 'Account temporarily locked after repeated failed sign-in attempts. Try again later.',
                code: 'ACCOUNT_TEMPORARILY_LOCKED'
            });
        }

        if (candidates.length === 1) await recordFailedLogin(candidates[0]);

        return res.status(401).json({ message: 'Invalid email or password.' });
    } catch (error) {
        console.error(`[AUTH] Login failed: ${error.message}`);
        res.status(500).json({ message: 'Authentication could not be completed' });
    }
};

// @desc    Refresh the authenticated user's session and effective permissions
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
    try {
        const tenant = req.user.tenantId
            ? await Tenant.findById(req.user.tenantId).select('name primaryColor secondaryColor logoUrl')
            : null;

        return res.json(buildSessionPayload(req.user, tenant));
    } catch (error) {
        return res.status(500).json({ message: 'Could not refresh the authenticated session' });
    }
};

// @desc    Get the authenticated user's editable account profile
// @route   GET /api/auth/profile
// @access  Private
const getOwnProfile = async (req, res) => {
    try {
        const user = await findAuthenticatedUser(req);
        if (!user) return res.status(404).json({ message: 'Profile not found' });
        return res.json(await buildOwnProfileWithOfficialIdentity(user));
    } catch (_error) {
        return res.status(500).json({ message: 'Profile could not be loaded' });
    }
};

// @desc    Update the authenticated user's personal account fields
// @route   PUT /api/auth/profile
// @access  Private
const updateOwnProfile = async (req, res) => {
    try {
        const validation = validateOwnProfile(req.body, req.user.role);
        if (validation.error) return res.status(validation.statusCode || 400).json({ message: validation.error });

        const user = await findAuthenticatedUser(req);
        if (!user) return res.status(404).json({ message: 'Profile not found' });

        const before = await buildOwnProfileWithOfficialIdentity(user);
        const profile = validation.value;
        if (['super_admin', 'branch_admin', 'registrar'].includes(user.role)) {
            if (!profile.name) return res.status(400).json({ message: 'Full name is required.' });
            if (!profile.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return res.status(400).json({ message: 'Enter a valid email address.' });
            if (profile.gender && !['Male', 'Female', 'Other', 'Prefer not to say'].includes(profile.gender)) return res.status(400).json({ message: 'Gender value is invalid.' });
            if (profile.dateOfBirth && Number.isNaN(new Date(profile.dateOfBirth).getTime())) return res.status(400).json({ message: 'Date of birth is invalid.' });
            const duplicate = await User.exists({ tenantId: user.tenantId, email: profile.email, _id: { $ne: user._id } });
            if (duplicate) return res.status(409).json({ message: 'Email is already used by another account.' });
            user.name = profile.name;
            user.email = profile.email;
            user.dateOfBirth = profile.dateOfBirth || undefined;
            user.gender = profile.gender || undefined;
        }
        user.phone = profile.phone || undefined;
        user.address = profile.address || undefined;
        user.emergencyContact = profile.emergencyContact;
        await user.save();

        const updatedProfile = await buildOwnProfileWithOfficialIdentity(user);
        await logActivity({
            req,
            action: 'USER_PROFILE_UPDATED',
            entityType: 'User',
            entityId: String(user._id),
            before: {
                name: before.name,
                email: before.email,
                phone: before.phone,
                address: before.address,
                emergencyContact: before.emergencyContact
            },
            after: {
                name: updatedProfile.name,
                email: updatedProfile.email,
                phone: updatedProfile.phone,
                address: updatedProfile.address,
                emergencyContact: updatedProfile.emergencyContact
            }
        });

        return res.json({ message: 'Profile updated successfully', profile: updatedProfile });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'Email is already used by another account.' });
        return res.status(500).json({ message: 'Profile could not be updated' });
    }
};

// @desc    Replace the authenticated user's profile image
// @route   PUT /api/auth/profile/avatar
// @access  Private
const updateOwnAvatar = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Choose a profile image to upload.' });

    const uploadedPath = req.file.path;
    try {
        const user = await findAuthenticatedUser(req);
        if (!user) {
            await fs.unlink(uploadedPath).catch(() => {});
            return res.status(404).json({ message: 'Profile not found' });
        }

        const previousAvatarUrl = user.avatarUrl || '';
        user.avatarUrl = `/uploads/avatars/${req.file.filename}`;
        await user.save();
        await removeLocalAvatar(previousAvatarUrl);

        await logActivity({
            req,
            action: 'USER_AVATAR_UPDATED',
            entityType: 'User',
            entityId: String(user._id),
            before: { avatarUrl: previousAvatarUrl },
            after: { avatarUrl: user.avatarUrl }
        });

        return res.json({
            message: 'Profile image updated successfully',
            avatarUrl: user.avatarUrl,
            profile: await buildOwnProfileWithOfficialIdentity(user)
        });
    } catch (error) {
        await fs.unlink(uploadedPath).catch(() => {});
        console.error(`[PROFILE] Avatar update failed for ${req.user?._id || 'unknown user'}: ${error.message}`);
        return res.status(500).json({ message: 'Profile image could not be updated' });
    }
};

const changeOwnPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required' });
        }
        if (String(newPassword).length < 8) {
            return res.status(400).json({ message: 'New password must be at least 8 characters' });
        }
        if (currentPassword === newPassword) {
            return res.status(400).json({ message: 'New password must be different from the current password' });
        }

        const user = await User.findById(req.user._id).populate('roleId');
        if (!user || !await user.comparePassword(currentPassword)) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        user.passwordHash = newPassword;
        user.mustChangePassword = false;
        user.security = user.security || {};
        user.security.tokenVersion = (user.security.tokenVersion || 0) + 1;
        await user.save();

        const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;
        const token = generateToken(user);
        setAuthCookie(res, token);

        return res.json(buildSessionPayload(user, tenant));
    } catch (error) {
        console.error(`[PROFILE] Password change failed for ${req.user?._id || 'unknown user'}: ${error.message}`);
        return res.status(500).json({ message: 'Password could not be changed' });
    }
};

const logout = async (req, res) => {
    clearAuthCookie(res);
    return res.json({ message: 'Signed out successfully' });
};

module.exports = {
    registerTenant,
    login,
    logout,
    getMe,
    getOwnProfile,
    updateOwnProfile,
    updateOwnAvatar,
    changeOwnPassword
};
