/**
 * Phase 1 migration — turn the ten built-in roles into Role records.
 *
 * For every tenant it seeds one Role per built-in role, holding exactly the permissions
 * DEFAULT_ROLE_PERMISSIONS already grants, then backfills User.roleId. Because the
 * permission sets are identical, nothing changes for any user; what changes is that a
 * school can now edit them.
 *
 * Safe to re-run: roles are upserted by (tenantId, key) and only users missing a roleId
 * are touched. Re-running never overwrites a name or permission set a school has edited.
 *
 *   node scripts/seedSystemRoles.js           apply
 *   node scripts/seedSystemRoles.js --dry-run report only, change nothing
 */
const mongoose = require('mongoose');
require('dotenv').config();

const { DEFAULT_ROLE_PERMISSIONS } = require('../utils/permissions');
const { ROLE_SCOPE } = require('../utils/rolePolicy');

// How the seeded roles present themselves to a school. Keys must match ROLE_SCOPE.
const ROLE_PRESENTATION = {
    platform_owner: { name: 'Platform Owner', description: 'Operates the platform and manages every school.' },
    super_admin: { name: 'Super Admin', description: 'School owner. Full access, manages users and access.' },
    finance_director: { name: 'Finance Director', description: 'Fees, invoices, payments, and finance policy.' },
    hr_payroll_manager: { name: 'HR & Payroll Manager', description: 'Employees, compensation, leaves, and payroll.' },
    branch_admin: { name: 'Branch Admin', description: 'Runs a branch: staff, classes, timetable, and exams.' },
    registrar: { name: 'Registrar', description: 'Admissions, enrollment, and student records.' },
    cashier: { name: 'Cashier', description: 'Records payments and issues receipts.' },
    teacher: { name: 'Teacher', description: 'Teaching schedule, attendance, and results.' },
    dugsi_teacher: { name: 'Dugsi Teacher', description: 'Quran study circles, Dugsi attendance, and memorization progress.' },
    student: { name: 'Student', description: 'Student portal access.' },
    parent: { name: 'Parent', description: 'Parent portal access for linked children.' }
};

// Which branches each seeded role may act in, matching today's behaviour. Teachers are the
// only role that already reads authorizedBranchIds; everyone else is single-branch or
// school-wide. Generalising this is Phase 4 work.
const dataScopeFor = (roleKey) => {
    const scope = ROLE_SCOPE[roleKey];
    if (scope === 'platform') return { branches: 'all', records: 'all', fieldMasks: [] };
    if (scope === 'tenant') return { branches: 'all', records: 'all', fieldMasks: [] };
    if (roleKey === 'teacher' || roleKey === 'dugsi_teacher') return { branches: 'assigned', records: 'assigned', fieldMasks: [] };
    if (roleKey === 'student') return { branches: 'own', records: 'own', fieldMasks: [] };
    return { branches: 'own', records: 'all', fieldMasks: [] };
};

// Every role a school gets. platform_owner belongs to no school.
const TENANT_ROLE_KEYS = Object.keys(ROLE_SCOPE).filter((key) => ROLE_SCOPE[key] !== 'platform');

/**
 * Give one school its starting set of roles.
 *
 * Called when a tenant is created, so a new school has something to configure from day one.
 * The migration below is for schools that predate roles being data at all. Safe to re-run:
 * a role that already exists is left exactly as the school edited it.
 */
const seedRolesForTenant = async (tenantId) => {
    const Role = require('../models/Role');
    const created = [];
    for (const key of TENANT_ROLE_KEYS) {
        const existing = await Role.findOne({ tenantId, key }).select('_id').lean();
        if (existing) continue;
        created.push(await Role.create({
            tenantId,
            key,
            name: ROLE_PRESENTATION[key].name,
            description: ROLE_PRESENTATION[key].description,
            scope: ROLE_SCOPE[key],
            permissions: DEFAULT_ROLE_PERMISSIONS[key] || [],
            dataScope: dataScopeFor(key),
            isSystem: true,
            isActive: true
        }));
    }
    return created;
};

/** Point a user at their school's role record, so permissions resolve from it. */
const linkUserToRole = async (user) => {
    const Role = require('../models/Role');
    if (!user || user.roleId) return null;
    const query = user.tenantId ? { tenantId: user.tenantId, key: user.role } : { key: user.role, scope: 'platform' };
    const role = await Role.findOne(query).select('_id').lean();
    if (!role) return null;
    const User = require('../models/User');
    await User.updateOne({ _id: user._id }, { $set: { roleId: role._id } });
    return role._id;
};

const seedSystemRoles = async ({ dryRun = false } = {}) => {
    const Role = require('../models/Role');
    const Tenant = require('../models/Tenant');
    const User = require('../models/User');

    const tenants = await Tenant.find({}).select('_id name').lean();
    const stats = { tenants: tenants.length, rolesCreated: 0, rolesExisting: 0, usersLinked: 0, usersUnmatched: 0 };

    const tenantRoleKeys = TENANT_ROLE_KEYS;

    for (const tenant of tenants) {
        for (const key of tenantRoleKeys) {
            const existing = await Role.findOne({ tenantId: tenant._id, key }).select('_id').lean();
            if (existing) { stats.rolesExisting += 1; continue; }
            stats.rolesCreated += 1;
            if (dryRun) continue;
            await Role.create({
                tenantId: tenant._id,
                key,
                name: ROLE_PRESENTATION[key].name,
                description: ROLE_PRESENTATION[key].description,
                scope: ROLE_SCOPE[key],
                permissions: DEFAULT_ROLE_PERMISSIONS[key] || [],
                dataScope: dataScopeFor(key),
                isSystem: true,
                isActive: true
            });
        }
    }

    // The platform owner role is global: one record, no tenant.
    const platformExists = await Role.findOne({ key: 'platform_owner', scope: 'platform' }).select('_id').lean();
    if (platformExists) {
        stats.rolesExisting += 1;
    } else {
        stats.rolesCreated += 1;
        if (!dryRun) {
            await Role.create({
                key: 'platform_owner',
                name: ROLE_PRESENTATION.platform_owner.name,
                description: ROLE_PRESENTATION.platform_owner.description,
                scope: 'platform',
                permissions: DEFAULT_ROLE_PERMISSIONS.platform_owner || [],
                dataScope: dataScopeFor('platform_owner'),
                isSystem: true,
                isActive: true
            });
        }
    }

    // Backfill roleId. Only users without one are touched, so a school that has since
    // reassigned someone to a custom role keeps that assignment.
    const roles = await Role.find({}).select('_id tenantId key').lean();
    const roleIdFor = new Map(roles.map((role) => [`${role.tenantId || 'platform'}:${role.key}`, role._id]));

    // On a dry run the roles above were never written, so add the ones that would exist.
    // Without this the report claims every user is unmatched, which reads as a failure.
    if (dryRun) {
        for (const tenant of tenants) {
            for (const key of tenantRoleKeys) {
                const lookup = `${tenant._id}:${key}`;
                if (!roleIdFor.has(lookup)) roleIdFor.set(lookup, '(would be created)');
            }
        }
        if (!roleIdFor.has('platform:platform_owner')) {
            roleIdFor.set('platform:platform_owner', '(would be created)');
        }
    }

    const users = await User.find({ roleId: { $exists: false } }).select('_id tenantId role').lean();
    for (const user of users) {
        const lookup = `${user.tenantId || 'platform'}:${user.role}`;
        const roleId = roleIdFor.get(lookup);
        if (!roleId) { stats.usersUnmatched += 1; continue; }
        stats.usersLinked += 1;
        if (!dryRun) {
            await User.updateOne({ _id: user._id }, { $set: { roleId } });
        }
    }

    return stats;
};

const run = async () => {
    const dryRun = process.argv.includes('--dry-run');
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_management';
    console.log(`${dryRun ? '[DRY RUN] ' : ''}Connecting to ${mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);

    await mongoose.connect(mongoUri);
    try {
        const stats = await seedSystemRoles({ dryRun });
        console.log(`Tenants processed:  ${stats.tenants}`);
        console.log(`Roles created:      ${stats.rolesCreated}`);
        console.log(`Roles already seeded: ${stats.rolesExisting}`);
        console.log(`Users linked:       ${stats.usersLinked}`);
        if (stats.usersUnmatched) {
            console.log(`Users with no matching role: ${stats.usersUnmatched} (left on built-in defaults)`);
        }
        console.log(dryRun ? 'Dry run complete. Nothing was written.' : 'Migration complete.');
    } finally {
        await mongoose.disconnect();
    }
};

if (require.main === module) {
    run().catch((error) => {
        console.error('Migration failed:', error.message);
        process.exit(1);
    });
}

module.exports = {
    ROLE_PRESENTATION,
    TENANT_ROLE_KEYS,
    dataScopeFor,
    linkUserToRole,
    seedRolesForTenant,
    seedSystemRoles
};
