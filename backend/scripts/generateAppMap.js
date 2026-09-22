#!/usr/bin/env node
/**
 * Writes APP_MAP.md at the repository root: a map of the whole app read straight from the
 * code, so it can never drift from what the app really does.
 *
 *   npm run map                         from the repository root or backend/
 *   node scripts/generateAppMap.js --check
 *
 * The map lists every API endpoint with the permission it needs, every screen with its
 * route guard, the staff menu and what each role sees in it by default, the permission
 * catalog, every data model with its fields and unique indexes, the backend and frontend
 * files, the commands, the environment variable names, the tests and the documents.
 *
 * With --check it also fails when AGENTS.md names a file that does not exist, so the AI
 * briefing and the code cannot silently disagree.
 *
 * Nothing here connects to a database or reads secrets: only .env.example names are listed.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const SRC = path.join(FRONTEND, 'src');
const OUTPUT = path.join(ROOT, 'APP_MAP.md');
const CHECK = process.argv.includes('--check');

const rel = (file) => path.relative(ROOT, file).replace(/\\/g, '/');
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const exists = (file) => fs.existsSync(file);
const listFiles = (dir, pattern = /\.(js|jsx)$/) => (exists(dir)
    ? fs.readdirSync(dir).filter((name) => pattern.test(name)).sort()
    : []);
const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (value) => (value ? `\`${value}\`` : '');

// --- Source scanning helpers ------------------------------------------------------------

/** The source with comments blanked out, so commented-out code is never mapped. */
const stripComments = (text) => {
    let out = '';
    let quote = null;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        const next = text[i + 1];
        if (quote) {
            out += c;
            if (c === '\\') { out += next || ''; i += 1; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '/' && next === '/') {
            const end = text.indexOf('\n', i);
            i = end < 0 ? text.length : end - 1;
            continue;
        }
        if (c === '/' && next === '*') {
            const end = text.indexOf('*/', i + 2);
            const skipped = text.slice(i, end < 0 ? text.length : end + 2);
            out += skipped.replace(/[^\n]/g, ' ');
            i = end < 0 ? text.length : end + 1;
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') quote = c;
        out += c;
    }
    return out;
};

/** The text between a "(" at openIndex and its matching ")". */
const balancedArgs = (text, openIndex) => {
    let depth = 0;
    let quote = null;
    for (let i = openIndex; i < text.length; i += 1) {
        const c = text[i];
        if (quote) {
            if (c === '\\') { i += 1; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
        if ('([{'.includes(c)) depth += 1;
        if (')]}'.includes(c)) {
            depth -= 1;
            if (depth === 0) return text.slice(openIndex + 1, i);
        }
    }
    return null;
};

/** Split "a, f(b, c), [d]" on its top-level commas. */
const splitTopLevel = (text) => {
    const parts = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        if (quote) {
            if (c === '\\') { i += 1; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
        if ('([{'.includes(c)) depth += 1;
        if (')]}'.includes(c)) depth -= 1;
        if (c === ',' && depth === 0) {
            parts.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    const last = text.slice(start).trim();
    if (last) parts.push(last);
    return parts;
};

const stringsIn = (text) => [...String(text).matchAll(/['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);

/** The first sentence of a file's leading doc comment, or of its first line comment. */
const firstComment = (source) => {
    const block = source.match(/\/\*\*([\s\S]*?)\*\//);
    const line = source.match(/^\s*\/\/\s?(.+)$/m);
    const raw = block && (!line || block.index < line.index)
        ? block[1].split('\n').map((text) => text.replace(/^\s*\*\s?/, '')).join(' ')
        : line ? line[1] : '';
    const text = raw.replace(/\s+/g, ' ').trim();
    const sentence = text.match(/^(.+?[.!?])(\s|$)/);
    return (sentence ? sentence[1] : text).slice(0, 160);
};

const exportedNames = (source) => {
    const names = new Set();
    const block = source.match(/module\.exports\s*=\s*\{([\s\S]*?)\};?/);
    if (block) {
        splitTopLevel(block[1]).forEach((part) => {
            const name = part.split(':')[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
        });
    }
    for (const match of source.matchAll(/exports\.(\w+)\s*=/g)) names.add(match[1]);
    for (const match of source.matchAll(/^export (?:const|function|default function) (\w+)/gm)) names.add(match[1]);
    if (/^export default \w+/m.test(source)) names.add(source.match(/^export default (\w+)/m)[1]);
    return [...names];
};

// --- 1. API endpoints -------------------------------------------------------------------

const describeMiddleware = (arg, aliases) => {
    const text = arg.trim();
    if (aliases.has(text)) return aliases.get(text);
    let match;
    if ((match = text.match(/^requirePermission\(\s*['"]([^'"]+)['"]\s*\)$/))) return { needs: match[1] };
    if ((match = text.match(/^requireAnyPermission\(\s*\[([\s\S]*)\]\s*\)$/))) return { needs: `any of ${stringsIn(match[1]).join(', ')}` };
    if ((match = text.match(/^requireAllPermissions\(\s*\[([\s\S]*)\]\s*\)$/))) return { needs: `all of ${stringsIn(match[1]).join(', ')}` };
    if ((match = text.match(/^requireScope\(\s*['"]([^'"]+)['"]\s*\)$/))) return { guard: `scope ${match[1]}` };
    if ((match = text.match(/^authorize\(([\s\S]*)\)$/))) return { guard: `role ${stringsIn(match[1]).join('/')}` };
    if ((match = text.match(/^enforcePlanLimit\(\s*['"]([^'"]+)['"]\s*\)$/))) return { guard: `plan limit: ${match[1]}` };
    if ((match = text.match(/require\(['"][^'"]+['"]\)\.(\w+)$/))) return { name: match[1] };
    if (/=>|^function\b|^async\b/.test(text)) return { inline: true };
    if (/^[A-Za-z_$][\w$.]*$/.test(text)) return { name: text };
    return { name: text.replace(/\s+/g, ' ').slice(0, 50) };
};

const GUARD_NAMES = new Set(['protect', 'tenantGuard', 'branchGuard', 'teacherAssignmentGuard', 'financeRateLimiter', 'apiRateLimiter']);

const readMounts = () => {
    const server = stripComments(read(path.join(BACKEND, 'server.js')));
    const variables = new Map();
    for (const match of server.matchAll(/const (\w+) = require\(['"]\.\/routes\/(\w+)['"]\)/g)) variables.set(match[1], match[2]);
    const mounts = new Map();
    for (const match of server.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(?:require\(['"]\.\/routes\/(\w+)['"]\)|(\w+))\s*\)/g)) {
        const file = match[2] || variables.get(match[3]);
        if (file) mounts.set(`${file}.js`, match[1]);
    }
    return mounts;
};

const mapApi = () => {
    const mounts = readMounts();
    const files = listFiles(path.join(BACKEND, 'routes'));
    const sections = [];
    let total = 0;

    for (const file of files) {
        const source = stripComments(read(path.join(BACKEND, 'routes', file)));
        const prefix = mounts.get(file) || '(not mounted in server.js)';
        const aliases = new Map();
        for (const match of source.matchAll(/const (\w+) = (require(?:Any|All)?Permissions?\(\s*[\s\S]*?\)\s*);/g)) {
            aliases.set(match[1], describeMiddleware(match[2], new Map()));
        }

        const events = [];
        const pattern = /router\.(use|get|post|put|patch|delete)\s*\(/g;
        let match;
        while ((match = pattern.exec(source))) {
            const args = balancedArgs(source, match.index + match[0].length - 1);
            if (args === null) continue;
            events.push({ method: match[1], args: splitTopLevel(args) });
        }

        const fileWide = [];
        const routes = [];
        for (const event of events) {
            if (event.method === 'use') {
                event.args.forEach((arg) => {
                    const item = describeMiddleware(arg, aliases);
                    if (item.needs) fileWide.push(`needs ${item.needs}`);
                    else if (item.guard) fileWide.push(item.guard);
                    else if (item.inline) fileWide.push('inline handler for every request');
                    else if (item.name) fileWide.push(item.name);
                });
                continue;
            }
            const [first, ...rest] = event.args;
            const routePath = stringsIn(first)[0] ?? first;
            const described = rest.map((arg) => describeMiddleware(arg, aliases));
            const handler = described.length ? described[described.length - 1] : {};
            const needs = described.filter((item) => item.needs).map((item) => item.needs);
            const guards = described.filter((item) => item.guard).map((item) => item.guard)
                .concat(described.slice(0, -1).filter((item) => item.name && GUARD_NAMES.has(item.name)).map((item) => item.name));
            const inherited = fileWide.filter((item) => item.startsWith('scope') || item.startsWith('role') || item.startsWith('needs'));
            routes.push({
                method: event.method.toUpperCase(),
                path: `${prefix === '(not mounted in server.js)' ? '' : prefix}${routePath === '/' ? '' : routePath}` || prefix,
                needs: needs.join('; ') || (inherited.some((item) => item.startsWith('needs')) ? '(file-wide)' : '—'),
                guards: [...new Set([...inherited.filter((item) => !item.startsWith('needs')), ...guards])].join(', '),
                handler: handler.inline ? '(inline)' : handler.name || '—'
            });
        }
        total += routes.length;
        sections.push({ file, prefix, fileWide: [...new Set(fileWide)], routes });
    }

    const lines = [
        `${total} endpoints in ${files.length} route files. "Needs" is the permission the request must carry;`,
        '"Guards" are scope or role locks. Guards applied with `router.use` hold for the routes defined',
        'after them in that file, so they are listed per file as well.',
        ''
    ];
    for (const section of sections) {
        lines.push(`### \`${section.prefix}\` — \`backend/routes/${section.file}\``, '');
        if (section.fileWide.length) lines.push(`File-wide, in order: ${section.fileWide.map(code).join(' → ')}`, '');
        if (!section.routes.length) {
            lines.push('_No endpoints; see the file-wide handler._', '');
            continue;
        }
        lines.push('| Method | Path | Needs | Guards | Handler |', '| --- | --- | --- | --- | --- |');
        section.routes.forEach((route) => lines.push(
            `| ${route.method} | \`${cell(route.path)}\` | ${cell(route.needs)} | ${cell(route.guards)} | ${code(route.handler)} |`
        ));
        lines.push('');
    }
    return { lines, total };
};

// --- 2. Frontend routes -----------------------------------------------------------------

const readTag = (text, start) => {
    let depth = 0;
    let quote = null;
    for (let i = start; i < text.length; i += 1) {
        const c = text[i];
        if (quote) {
            if (c === quote) quote = null;
            continue;
        }
        if (depth === 0 && (c === '"' || c === '\'')) { quote = c; continue; }
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '>' && depth === 0) return text.slice(start, i + 1);
    }
    return text.slice(start);
};

const outsideBraces = (tag) => {
    let depth = 0;
    let out = '';
    for (const c of tag) {
        if (c === '{') depth += 1;
        if (depth === 0) out += c;
        if (c === '}') depth -= 1;
    }
    return out;
};

const describeElement = (element) => {
    if (!element) return { guards: [] };
    const components = [...element.matchAll(/<([A-Z]\w*)([^>]*)>/g)].map((match) => ({ name: match[1], attrs: match[2] }));
    const guards = [];
    let page = null;
    let redirect = null;
    for (const component of components) {
        const role = component.attrs.match(/role="([^"]+)"/);
        const scope = component.attrs.match(/scope="([^"]+)"/);
        if (component.name === 'Navigate') redirect = (component.attrs.match(/to="([^"]+)"/) || [])[1];
        else if (component.name === 'StaffArea') guards.push(`StaffArea(${scope ? scope[1] : 'any scope'})`);
        else if (component.name === 'RoleScopeGuard') guards.push(`role ${role ? role[1].toLowerCase() : '?'}`);
        else if (/Guard$/.test(component.name)) guards.push(component.name);
        else if (/Layout$|Wrapper$/.test(component.name)) guards.push(component.name);
        else if (!['BrandingProvider', 'Outlet', 'Suspense'].includes(component.name) && !page) page = component.name;
    }
    return { page, redirect, guards };
};

const joinPath = (base, segment) => {
    if (!segment) return base || '/';
    if (segment.startsWith('/')) return segment;
    return `${(base || '').replace(/\/$/, '')}/${segment}`;
};

const mapScreens = async () => {
    const appFile = path.join(SRC, 'App.jsx');
    const source = stripComments(read(appFile));
    const imports = new Map();
    for (const match of source.matchAll(/const (\w+) = lazy\(\(\) => import\(['"]([^'"]+)['"]\)\)/g)) imports.set(match[1], match[2]);
    for (const match of source.matchAll(/^import (\w+) from ['"](\.\/[^'"]+)['"]/gm)) imports.set(match[1], match[2]);
    const fileFor = (name) => {
        const target = imports.get(name);
        if (!target) return '';
        const base = path.join(SRC, target);
        const found = ['.jsx', '.js', '/index.jsx'].map((ext) => base + ext).find(exists);
        return found ? rel(found) : rel(base);
    };

    let getRequiredPermissionForPath = () => null;
    try {
        ({ getRequiredPermissionForPath } = await import(pathToFileURL(path.join(SRC, 'utils', 'routePermissions.js')).href));
    } catch (error) {
        console.warn(`   could not load routePermissions.js: ${error.message}`);
    }

    const stack = [];
    const screens = [];
    const pattern = /<Route\b|<\/Route>/g;
    let match;
    while ((match = pattern.exec(source))) {
        if (match[0] === '</Route>') {
            stack.pop();
            continue;
        }
        const tag = readTag(source, match.index);
        pattern.lastIndex = match.index + tag.length;
        const outer = outsideBraces(tag);
        const own = (outer.match(/\bpath="([^"]*)"/) || [])[1];
        const isIndex = /\bindex\b/.test(outer);
        const elementText = (tag.match(/element=\{([\s\S]*)\}\s*\/?>$/) || [])[1];
        const element = describeElement(elementText);
        const parent = stack[stack.length - 1];
        const full = isIndex ? (parent?.full || '/') : joinPath(parent?.full || '', own);
        const guards = [...(parent?.guards || []), ...element.guards];
        const selfClosing = tag.endsWith('/>');
        if (element.page || element.redirect) {
            screens.push({
                path: full,
                page: element.page,
                file: element.page ? fileFor(element.page) : '',
                redirect: element.redirect,
                guards: [...new Set(guards)],
                permission: element.page ? getRequiredPermissionForPath(full.replace(/:\w+/g, 'x')) : null
            });
        }
        if (!selfClosing) stack.push({ full, guards });
    }

    const lines = [
        `${screens.filter((item) => item.page).length} screens and ${screens.filter((item) => item.redirect).length} redirects, read from \`frontend/src/App.jsx\`.`,
        '"Needs" comes from `frontend/src/utils/routePermissions.js` and is checked by `PermissionRouteGuard`;',
        '`StaffArea(scope)` is the staff frame (`StaffAreaGuard` + `StaffLayout`), and `role x` marks a portal still bound to one role.',
        '',
        '| Path | Screen | File | Needs | Guards |',
        '| --- | --- | --- | --- | --- |'
    ];
    screens.filter((item) => item.page).forEach((item) => lines.push(
        `| \`${cell(item.path)}\` | ${code(item.page)} | ${item.file ? `\`${item.file}\`` : ''} | ${code(item.permission) || '—'} | ${cell(item.guards.join(', '))} |`
    ));
    lines.push('', 'Redirects: ' + screens.filter((item) => item.redirect).map((item) => `\`${item.path}\` → \`${item.redirect}\``).join(' · '), '');
    return { lines, count: screens.length };
};

// --- 3. Staff menu and roles ------------------------------------------------------------

const loadStaffMenu = () => {
    const esbuildPath = path.join(FRONTEND, 'node_modules', 'esbuild');
    if (!exists(esbuildPath)) return null;
    const esbuild = require(esbuildPath);
    const result = esbuild.buildSync({
        entryPoints: [path.join(SRC, 'config', 'staffMenu.js')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        logLevel: 'silent'
    });
    const module = { exports: {} };
    new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
    return module.exports;
};

const mapRolesAndMenu = () => {
    const { PERMISSION_CATALOG, getDefaultPermissionsForRole } = require(path.join(BACKEND, 'utils', 'permissions'));
    const { ROLE_SCOPE } = require(path.join(BACKEND, 'utils', 'rolePolicy'));
    const roles = Object.keys(ROLE_SCOPE);
    const defaults = new Map(roles.map((role) => [role, new Set(getDefaultPermissionsForRole(role))]));

    const roleLines = [
        '| Role key | Scope | Default permissions |',
        '| --- | --- | --- |',
        ...roles.map((role) => `| \`${role}\` | ${ROLE_SCOPE[role]} | ${defaults.get(role).size} |`),
        '',
        'Roles are fixed keys. Each school has its own `Role` record per key (name, permissions, on/off),',
        'seeded from these defaults and edited on **Roles & Features** (`frontend/src/pages/tenant/Roles.jsx`).',
        ''
    ];

    const groups = new Map();
    PERMISSION_CATALOG.forEach((permission) => {
        groups.set(permission.group, [...(groups.get(permission.group) || []), permission]);
    });
    const catalogLines = [
        `${PERMISSION_CATALOG.length} permissions (${PERMISSION_CATALOG.filter((item) => item.requiredScope !== 'platform').length} usable by schools). Source: \`backend/utils/permissions.js\`.`,
        '"Scope" is where a permission works: a role can only hold permissions whose scope fits its own.',
        ''
    ];
    for (const [group, permissions] of groups) {
        catalogLines.push(`#### ${group}`, '', '| Key | Label | Scope | Default roles |', '| --- | --- | --- | --- |');
        permissions.forEach((permission) => {
            const holders = roles.filter((role) => defaults.get(role).has(permission.key));
            catalogLines.push(`| \`${permission.key}\` | ${cell(permission.label)} | ${permission.requiredScope} | ${holders.join(', ') || '—'} |`);
        });
        catalogLines.push('');
    }

    let menuLines = ['_esbuild is not installed in frontend/node_modules, so the menu could not be read. Run `npm run install:all`._', ''];
    try {
        const menu = loadStaffMenu();
        if (menu) {
            menuLines = [
                'Read from `frontend/src/config/staffMenu.js`. A person\'s menu is their home area first, then every page',
                'from another area they hold the permission for (`buildStaffMenu`).',
                ''
            ];
            for (const area of menu.STAFF_AREAS) {
                menuLines.push(`#### ${area.label} — home \`${area.home}\`, scope ${area.scope}${area.roles ? `, only for ${area.roles.join(', ')}` : ''}`, '');
                const flat = area.items.flatMap((item) => (item.children ? item.children.map((child) => ({ ...child, label: `${item.label} › ${child.label}` })) : [item]));
                flat.forEach((item) => {
                    const needs = item.permission || (item.anyPermission ? `any of ${item.anyPermission.join(', ')}` : 'none');
                    const notes = [item.feature && `feature ${item.feature}`, item.homeOnly && 'home area only', item.quietFor && `hidden for ${item.quietFor.roles.join('/')}${item.quietFor.unless ? ' unless they manage it' : ''}`].filter(Boolean);
                    menuLines.push(`- ${item.label} — \`${item.path}\` — needs \`${needs}\`${notes.length ? ` (${notes.join('; ')})` : ''}`);
                });
                menuLines.push('');
            }
            menuLines.push('#### What each role sees by default (before a school edits its roles)', '');
            for (const role of Object.keys(menu.HOME_AREA_BY_ROLE)) {
                const built = menu.buildStaffMenu({ role, scope: ROLE_SCOPE[role], permissions: [...defaults.get(role)] });
                const groupsText = built.groups.map((group) => `**${group.label}**: ${group.items.flatMap((item) => item.children || [item]).map((item) => item.label).join(', ')}`).join(' · ');
                menuLines.push(`- \`${role}\` → ${groupsText || '(nothing)'}`);
            }
            menuLines.push('');
        }
    } catch (error) {
        menuLines = [`_Could not read the staff menu: ${error.message}_`, ''];
    }

    return { roleLines, catalogLines, menuLines, permissionCount: PERMISSION_CATALOG.length };
};

// --- 4. Data models ---------------------------------------------------------------------

const describePath = (schemaType) => {
    const options = schemaType.options || {};
    let type = schemaType.instance;
    const ref = options.ref || schemaType.caster?.options?.ref || (Array.isArray(options.type) && options.type[0]?.ref);
    if (type === 'Array') type = schemaType.schema ? '[subdocument]' : `[${schemaType.caster?.instance || 'Mixed'}]`;
    const enumValues = schemaType.enumValues?.length ? schemaType.enumValues : (schemaType.caster?.enumValues || []);
    return [
        type,
        ref ? `→${ref}` : '',
        schemaType.isRequired ? ' required' : '',
        enumValues.length ? ` {${enumValues.join('|')}}` : '',
        options.default !== undefined && typeof options.default !== 'function' && typeof options.default !== 'object' ? ` default ${JSON.stringify(options.default)}` : ''
    ].join('');
};

const mapModels = () => {
    const lines = ['Read from the Mongoose schemas in `backend/models/`. Every school-owned record carries `tenantId`.', ''];
    const files = listFiles(path.join(BACKEND, 'models'), /\.js$/);
    for (const file of files) {
        let Model;
        try {
            Model = require(path.join(BACKEND, 'models', file));
        } catch (error) {
            lines.push(`### ${file}`, '', `_Could not load: ${error.message}_`, '');
            continue;
        }
        if (!Model?.schema) continue;
        const fields = [];
        Model.schema.eachPath((name, schemaType) => {
            if (['_id', '__v'].includes(name)) return;
            fields.push(`\`${name}\` ${describePath(schemaType)}`);
            if (schemaType.schema) {
                schemaType.schema.eachPath((child, childType) => {
                    if (!['_id', '__v'].includes(child)) fields.push(`\`${name}[].${child}\` ${describePath(childType)}`);
                });
            }
        });
        const unique = Model.schema.indexes()
            .filter(([, options]) => options?.unique)
            .map(([keys, options]) => `unique (${Object.keys(keys).join(', ')})${options.partialFilterExpression ? ` where ${JSON.stringify(options.partialFilterExpression)}` : ''}`);
        lines.push(`### ${Model.modelName} — \`backend/models/${file}\``, '');
        lines.push(fields.join(' · '), '');
        if (unique.length) lines.push(`Unique: ${unique.join('; ')}`, '');
    }
    return { lines, count: files.length };
};

// --- 5. Files, commands, environment, tests, documents ----------------------------------

const mapBackendFiles = () => {
    const lines = [];
    for (const folder of ['controllers', 'services', 'utils', 'middleware', 'config', 'scripts', 'scripts/demoSchool']) {
        const dir = path.join(BACKEND, folder);
        const files = listFiles(dir, /\.js$/);
        if (!files.length) continue;
        lines.push(`#### \`backend/${folder}/\``, '');
        files.forEach((file) => {
            const source = read(path.join(dir, file));
            const summary = firstComment(source);
            const names = exportedNames(source);
            lines.push(`- \`${file}\`${summary ? ` — ${summary}` : ''}${names.length ? ` Exports: ${names.slice(0, 14).map(code).join(', ')}${names.length > 14 ? ` +${names.length - 14}` : ''}` : ''}`);
        });
        lines.push('');
    }
    return lines;
};

const mapFrontendFiles = () => {
    const lines = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : (/\.(js|jsx)$/.test(entry.name) ? [full] : []);
    });
    const byFolder = new Map();
    walk(SRC).forEach((file) => {
        const folder = rel(path.dirname(file));
        byFolder.set(folder, [...(byFolder.get(folder) || []), path.basename(file)]);
    });
    [...byFolder.keys()].sort().forEach((folder) => {
        lines.push(`- \`${folder}/\` — ${byFolder.get(folder).sort().join(', ')}`);
    });
    lines.push('');
    return lines;
};

const mapCommands = () => {
    const lines = [];
    for (const [label, file] of [['Repository root', 'package.json'], ['Backend', 'backend/package.json'], ['Frontend', 'frontend/package.json']]) {
        const full = path.join(ROOT, file);
        if (!exists(full)) continue;
        const scripts = JSON.parse(read(full)).scripts || {};
        lines.push(`#### ${label} — \`${file}\``, '', '| Command | Runs |', '| --- | --- |');
        Object.entries(scripts).forEach(([name, command]) => lines.push(`| \`npm run ${name}\` | \`${cell(command)}\` |`));
        lines.push('');
    }
    return lines;
};

const mapEnvironment = () => {
    const lines = [];
    for (const file of ['backend/.env.example', 'frontend/.env.example']) {
        const full = path.join(ROOT, file);
        if (!exists(full)) continue;
        const names = read(full).split('\n').map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=/)).filter(Boolean).map((match) => match[1]);
        lines.push(`- \`${file}\`: ${names.map(code).join(', ')}`);
    }
    lines.push('', 'Only variable names are listed. Real values live in `.env` files, which are never committed.', '');
    return lines;
};

const mapTests = () => {
    const lines = [];
    let total = 0;
    for (const file of listFiles(path.join(BACKEND, 'tests'), /\.test\.js$/)) {
        const names = [...read(path.join(BACKEND, 'tests', file)).matchAll(/^test\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gm)].map((match) => match[2]);
        total += names.length;
        lines.push(`<details><summary><code>backend/tests/${file}</code> — ${names.length} tests</summary>`, '');
        names.forEach((name) => lines.push(`- ${name}`));
        lines.push('', '</details>', '');
    }
    return { lines, total };
};

const mapDocuments = () => {
    const lines = [];
    listFiles(ROOT, /\.md$/).forEach((file) => {
        const heading = (read(path.join(ROOT, file)).match(/^#\s+(.+)$/m) || [])[1] || '';
        lines.push(`- [\`${file}\`](${file}) — ${heading}`);
    });
    lines.push('');
    return lines;
};

const mapGit = () => {
    try {
        const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
        const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
        const log = git('log', '--oneline', '-15').split('\n');
        const changed = git('status', '--short').split('\n').filter(Boolean).length;
        return [`Branch \`${branch}\` · ${changed} uncommitted file change(s) when this map was made.`, '', ...log.map((line) => `- \`${line.slice(0, 7)}\` ${line.slice(8)}`), ''];
    } catch {
        return ['_git is not available here._', ''];
    }
};

// --- 6. AGENTS.md consistency -----------------------------------------------------------

const checkBriefing = () => {
    const briefing = path.join(ROOT, 'AGENTS.md');
    if (!exists(briefing)) return ['AGENTS.md is missing.'];
    const missing = [];
    for (const match of read(briefing).matchAll(/`([^`\s]+)`/g)) {
        const candidate = match[1].replace(/[:#].*$/, '').replace(/\/$/, '');
        if (!/\//.test(candidate) || !/^[\w.-]+(\/[\w.[\]-]+)+(\.\w+)?$/.test(candidate)) continue;
        if (candidate.startsWith('/') || candidate.startsWith('http')) continue;
        if (!exists(path.join(ROOT, candidate))) missing.push(candidate);
    }
    return [...new Set(missing)];
};

// --- Assemble ---------------------------------------------------------------------------

const main = async () => {
    console.log('Mapping the app...');
    const api = mapApi();
    console.log(`   ${api.total} API endpoints`);
    const screens = await mapScreens();
    console.log(`   ${screens.count} frontend routes`);
    const roles = mapRolesAndMenu();
    console.log(`   ${roles.permissionCount} permissions`);
    const models = mapModels();
    console.log(`   ${models.count} models`);
    const tests = mapTests();
    console.log(`   ${tests.total} tests`);

    const toc = [
        ['1', 'Documents', 'documents'], ['2', 'Commands', 'commands'], ['3', 'Environment variables', 'environment-variables'],
        ['4', 'Roles', 'roles'], ['5', 'Staff menu', 'staff-menu'], ['6', 'Screens (frontend routes)', 'screens-frontend-routes'],
        ['7', 'API endpoints', 'api-endpoints'], ['8', 'Permission catalog', 'permission-catalog'], ['9', 'Data models', 'data-models'],
        ['10', 'Backend files', 'backend-files'], ['11', 'Frontend files', 'frontend-files'], ['12', 'Tests', 'tests'], ['13', 'Recent commits', 'recent-commits']
    ];

    const content = [
        '# App Map',
        '',
        `> Generated by \`backend/scripts/generateAppMap.js\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. **Do not edit by hand**: run \`npm run map\` from the repository root.`,
        '> Read [AGENTS.md](AGENTS.md) first for how the app works; this file is the reference it points to.',
        '',
        `**At a glance:** ${api.total} API endpoints · ${screens.count} frontend routes · ${roles.permissionCount} permissions · ${models.count} data models · ${tests.total} backend tests.`,
        '',
        ...toc.map(([number, title, anchor]) => `${number}. [${title}](#${anchor})`),
        '',
        '## Documents', '', ...mapDocuments(),
        '## Commands', '', ...mapCommands(),
        '## Environment variables', '', ...mapEnvironment(),
        '## Roles', '', ...roles.roleLines,
        '## Staff menu', '', ...roles.menuLines,
        '## Screens (frontend routes)', '', ...screens.lines,
        '## API endpoints', '', ...api.lines,
        '## Permission catalog', '', ...roles.catalogLines,
        '## Data models', '', ...models.lines,
        '## Backend files', '', ...mapBackendFiles(),
        '## Frontend files', '', ...mapFrontendFiles(),
        '## Tests', '', `${tests.total} tests. Run them with \`npm test\`; they mock the models and need no database.`, '', ...tests.lines,
        '## Recent commits', '', ...mapGit()
    ].join('\n');

    fs.writeFileSync(OUTPUT, content.replace(/\n{3,}/g, '\n\n'));
    console.log(`Wrote ${rel(OUTPUT)} (${content.split('\n').length} lines)`);

    const missing = checkBriefing();
    if (missing.length) {
        console.warn(`AGENTS.md names ${missing.length} path(s) that do not exist:`);
        missing.forEach((item) => console.warn(`   - ${item}`));
        if (CHECK) process.exit(1);
    } else {
        console.log('AGENTS.md: every file path it names exists.');
    }
    process.exit(0);
};

main().catch((error) => {
    console.error('Map failed:', error);
    process.exit(1);
});
