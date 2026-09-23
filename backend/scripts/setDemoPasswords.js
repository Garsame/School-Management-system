const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const run = async () => {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';
    await mongoose.connect(uri);
    const hash = await bcrypt.hash('Demo#Passw0rd', 10);
    const result = await mongoose.connection.db.collection('users').updateMany(
        { email: { $regex: '@nuur-al-ilm\\.school$' } },
        { $set: { passwordHash: hash, mustChangePassword: false, isActive: true } }
    );
    console.log('Updated passwords to Demo#Passw0rd for Nuur Al-Ilm users. Count:', result.modifiedCount);
    process.exit(0);
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
