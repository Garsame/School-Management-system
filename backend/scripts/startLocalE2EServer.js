const { app } = require('../server');
const connectDB = require('../config/db');
const { validateRuntimeEnv } = require('../config/env');

const start = async () => {
    validateRuntimeEnv();
    await connectDB();
    const port = Number(process.env.PORT || 5055);
    const server = app.listen(port, '127.0.0.1', () => {
        console.log(`Local E2E server running at http://127.0.0.1:${port}`);
    });

    const shutdown = async () => {
        server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
};

start().catch((error) => {
    console.error(`Local E2E server startup failed: ${error.message}`);
    process.exit(1);
});
