/**
 * Step 1 — wipe the database and bootstrap the platform.
 *
 * Only this step writes to MongoDB directly, and only because there is no API to reach
 * before a platform owner exists. Everything after it goes through the real endpoints, so
 * if a role cannot do something the build fails loudly instead of quietly seeding past it.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const PLANS = [
    {
        name: 'Foundation', slug: 'foundation', description: 'A single campus getting started.',
        monthlyPrice: 49, yearlyPrice: 490, billingCycle: 'monthly',
        maxBranches: 2, maxUsers: 60, maxStudents: 500, storage: '10GB', storageLimit: '10GB',
        features: ['Admissions', 'Fees and invoicing', 'Attendance', 'Exams and results'],
        icon: 'Zap', isActive: true
    },
    {
        name: 'Growth', slug: 'growth', description: 'Several campuses under one school.',
        monthlyPrice: 149, yearlyPrice: 1490, billingCycle: 'monthly',
        maxBranches: 5, maxUsers: 200, maxStudents: 2500, storage: '50GB', storageLimit: '50GB',
        features: ['Everything in Foundation', 'Multi-branch', 'Payroll', 'Custom roles'],
        icon: 'TrendingUp', hasPrioritySupport: true, isActive: true
    },
    {
        name: 'Excellence', slug: 'excellence', description: 'Large groups with many campuses.',
        monthlyPrice: 349, yearlyPrice: 3490, billingCycle: 'monthly',
        maxBranches: 15, maxUsers: 800, maxStudents: 10000, storage: '250GB', storageLimit: '250GB',
        features: ['Everything in Growth', 'Priority support', 'Advanced reporting'],
        icon: 'Crown', hasPrioritySupport: true, isActive: true
    }
];

const run = async () => {
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    console.log(`Database: ${db.databaseName}`);

    const collections = await db.collections();
    let dropped = 0;
    let documents = 0;
    for (const collection of collections) {
        documents += await collection.countDocuments();
        await collection.drop().catch(() => {});
        dropped += 1;
    }
    console.log(`Wiped ${dropped} collections holding ${documents} documents.`);

    const Plan = require('../../models/Plan');
    const PlatformSetting = require('../../models/PlatformSetting');
    const User = require('../../models/User');

    await Plan.insertMany(PLANS);
    console.log(`Seeded ${PLANS.length} plans.`);

    await PlatformSetting.create({
        platformName: 'MadrasaHub',
        supportEmail: 'support@madrasahub.com',
        defaultCurrency: 'USD',
        defaultPlan: 'foundation',
        isRegistrationEnabled: true
    });

    // The password hook only runs on save(), and we need a known password to log in with.
    const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD || 'Demo#Passw0rd', 10);
    await User.collection.insertOne({
        name: 'Platform Owner',
        email: 'owner@madrasahub.com',
        passwordHash,
        role: 'platform_owner',
        scope: 'platform',
        isActive: true,
        mustChangePassword: false,
        permissions: { allow: [], deny: [] },
        security: { failedLoginAttempts: 0, tokenVersion: 0, mfaEnabled: false },
        createdAt: new Date(),
        updatedAt: new Date()
    });
    console.log('Created platform owner: owner@madrasahub.com');

    // Seed the system roles so the school starts with something to configure.
    const { seedSystemRoles } = require('../seedSystemRoles');
    const stats = await seedSystemRoles({});
    console.log(`Seeded ${stats.rolesCreated} platform-level role(s).`);

    await mongoose.disconnect();
    console.log('Bootstrap complete.');
};

run().catch((error) => {
    console.error('Bootstrap failed:', error.message);
    process.exit(1);
});
