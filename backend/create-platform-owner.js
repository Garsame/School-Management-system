const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const connectDB = require('./config/db');

dotenv.config();

const isStrongBootstrapPassword = (password) => (
    String(password || '').length >= (process.env.NODE_ENV === 'production' ? 16 : 12)
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password)
);

const createPlatformOwner = async () => {
    try {
        await connectDB();
        const email = String(process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();
        const password = process.env.PLATFORM_OWNER_PASSWORD;
        const name = process.env.PLATFORM_OWNER_NAME || 'System Admin';
        if (!email) {
            throw new Error('PLATFORM_OWNER_EMAIL is required.');
        }
        if (!password) {
            throw new Error('PLATFORM_OWNER_PASSWORD is required.');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Set PLATFORM_OWNER_EMAIL to a valid private administrator email address.');
        }
        if (process.env.NODE_ENV === 'production' && /@example\.(com|org|net)$/i.test(email)) {
            throw new Error('Do not use an example.com address for the production platform owner.');
        }
        if (!isStrongBootstrapPassword(password)) {
            throw new Error('PLATFORM_OWNER_PASSWORD must meet the production length and complexity requirements.');
        }

        const userExists = await User.findOne({ email, role: 'platform_owner', scope: 'platform' });

        if (userExists) {
            console.log('Platform Owner already exists');
            return;
        }

        const user = await User.create({
            name,
            email,
            passwordHash: password, // Pre-save hook will hash this
            role: 'platform_owner',
            scope: 'platform',
            permissionProfile: 'default_platform_owner',
            isActive: true,
            mustChangePassword: true
            // tenantId is optional for platform_owner now
        });

        console.log(`Platform Owner created: ${user.email}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect().catch(() => {});
    }
};

createPlatformOwner();
