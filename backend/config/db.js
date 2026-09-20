const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000)
        });
        console.log('MongoDB connected successfully.');
        return conn;
    } catch (error) {
        console.error(`MongoDB connection failed: ${error.message}`);
        throw error;
    }
};

module.exports = connectDB;
