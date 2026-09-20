const requiredSecret = (name) => {
    const value = String(process.env[name] || '');
    if (value.length < 16) {
        throw new Error(`${name} must be provided and contain at least 16 characters.`);
    }
    return value;
};

const adminPassword = requiredSecret('MONGO_ADMIN_PASSWORD');
const appPassword = requiredSecret('MONGO_APP_PASSWORD');
const adminDb = db.getSiblingDB('admin');
const appDb = db.getSiblingDB('school_management');

if (!adminDb.getUser('admin')) {
    adminDb.createUser({
        user: 'admin',
        pwd: adminPassword,
        roles: [{ role: 'root', db: 'admin' }]
    });
    print('Created MongoDB administrative user.');
} else {
    print('MongoDB administrative user already exists; password was not changed.');
}

if (!appDb.getUser('school_app')) {
    appDb.createUser({
        user: 'school_app',
        pwd: appPassword,
        roles: [{ role: 'readWrite', db: 'school_management' }]
    });
    print('Created restricted school application database user.');
} else {
    print('School application database user already exists; password was not changed.');
}
