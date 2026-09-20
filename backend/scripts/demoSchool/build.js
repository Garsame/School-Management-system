/**
 * Build the demo school from nothing.
 *
 *   node scripts/demoSchool/build.js
 *
 * Step 1 wipes the database and bootstraps the platform directly, because there is no API
 * to call before a platform owner exists. Every step after that goes through the real
 * endpoints as the role that owns the work, so a permission the configuration failed to
 * grant shows up as a refusal here rather than being quietly seeded around.
 *
 * The server must already be running.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const here = __dirname;

const runNode = (file) => {
    execFileSync(process.execPath, [path.join(here, file)], { stdio: 'inherit' });
};

const main = async () => {
    console.log('=== Nuur Al-Ilm Academy — building from scratch ===');

    runNode('01-bootstrap.js');
    console.log('\n!! restart the server now so it picks up the fresh database, then re-run with --skip-bootstrap');
};

const buildOnLiveServer = async () => {
    const school = require('./02-school-and-roles');
    const users = require('./03-users');
    const academics = require('./04-academics');
    const students = require('./05-students');
    const operations = require('./06-operations');
    const { loginTenant, unwrap } = require('./lib');

    await school.run();
    await users.run();
    const { yearId } = await academics.run();

    const admissions = await loginTenant('admissions', 'admissions@nuur-al-ilm.school');
    const sections = unwrap(await admissions.get('/branch/sections'));
    const classes = unwrap(await admissions.get('/branch/classes')).map((klass) => ({
        ...klass,
        sections: sections.filter((section) => String(section.classId?._id || section.classId) === String(klass._id))
    }));

    await students.run({ classes, yearId, total: Number(process.env.DEMO_STUDENTS) || 120 });
    await operations.run();

    console.log('\n=== Build complete ===');
};

if (require.main === module) {
    const skipBootstrap = process.argv.includes('--skip-bootstrap');
    const task = skipBootstrap ? buildOnLiveServer() : main();
    Promise.resolve(task).catch((error) => {
        console.error('\nBUILD FAILED:', error.message);
        process.exit(1);
    });
}

module.exports = { buildOnLiveServer };
