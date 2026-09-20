const mongoose = require('mongoose');
require('dotenv').config();

const { reconcileSubscriptionStatuses } = require('../services/subscriptionBillingService');

const run = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';
    console.log(`Connecting to MongoDB at: ${mongoUri}`);

    try {
        await mongoose.connect(mongoUri);
        console.log('MongoDB Connected successfully.');

        const result = await reconcileSubscriptionStatuses();
        console.log('--- SUBSCRIPTION BILLING RECONCILIATION ---');
        console.log(`Checked tenants: ${result.checked}`);
        console.log(`Active: ${result.active}`);
        console.log(`Past due: ${result.pastDue}`);
        console.log(`Suspended: ${result.suspended}`);
        console.log(`Errors: ${result.errors.length}`);
        if (result.errors.length) {
            console.log(JSON.stringify(result.errors, null, 2));
        }
        console.log('-------------------------------------------');
        process.exit(result.errors.length ? 1 : 0);
    } catch (error) {
        console.error('Subscription billing reconciliation failed:', error);
        process.exit(1);
    }
};

run();
