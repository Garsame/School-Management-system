const zlib = require('zlib');

/**
 * A small reader for the files a school actually has: .xlsx straight from Excel, or .csv.
 *
 * Schools keep their student lists in Excel. Asking them to "Save As CSV" first is a step
 * where things go wrong — the wrong sheet, a comma inside an address, a lost leading zero on
 * a phone number. So the app reads the workbook itself.
 *
 * This is the reading half of `xlsxWriter.js`, written the same way and for the same reason:
 * the server does not need a spreadsheet library to do a simple job. It reads the first
 * sheet as a table. No formulas, no merged cells, no charts.
 */

// ---------------------------------------------------------------- zip

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/**
 * An .xlsx is a zip. Read its entries without a zip library: find the end-of-central-
 * directory record, walk the central directory, then inflate each file we care about.
 */
const readZipEntries = (buffer) => {
    // The record sits at the end, after a comment of unknown length, so scan backwards.
    let eocd = -1;
    for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66000; i -= 1) {
        if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
    }
    if (eocd === -1) throw new Error('This file is not a readable Excel workbook.');

    const count = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);
    const entries = new Map();

    for (let i = 0; i < count; i += 1) {
        if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

        // The local header repeats the name and has its own extra field, whose length
        // often differs from the central one, so the data start must be read from there.
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const data = buffer.subarray(dataStart, dataStart + compressedSize);

        entries.set(name, method === 0 ? data : zlib.inflateRawSync(data));
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
};

// ---------------------------------------------------------------- xml

const decodeXmlText = (value) => String(value)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');

/** Every <t> inside one element, joined. Excel splits styled text into several runs. */
const textOf = (xml) => {
    const parts = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
    return decodeXmlText(parts.map((part) => part.replace(/<[^>]+>/g, '')).join(''));
};

// ---------------------------------------------------------------- dates

// Excel keeps a date as a day count. Whether a cell is a date lives in its format, not its
// value, so the format table has to be read or every birthday arrives as a number.
const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57, 58]);

const looksLikeDateFormat = (code = '') => {
    // Strip quoted literals and colour or condition blocks before looking for date letters,
    // so a currency format such as [Red]"m"#,##0 is not mistaken for a month.
    const bare = String(code).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
    return /[dy]/i.test(bare) || /m{3,}/i.test(bare);
};

const readDateStyles = (stylesXml) => {
    const dateStyleIndexes = new Set();
    if (!stylesXml) return dateStyleIndexes;

    const customDateFormats = new Set();
    for (const match of stylesXml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
        if (looksLikeDateFormat(decodeXmlText(match[2]))) customDateFormats.add(Number(match[1]));
    }

    const cellXfs = stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/);
    if (!cellXfs) return dateStyleIndexes;

    const formats = [...cellXfs[0].matchAll(/<xf[^>]*numFmtId="(\d+)"[^>]*\/?>/g)];
    formats.forEach((match, index) => {
        const id = Number(match[1]);
        if (BUILT_IN_DATE_FORMATS.has(id) || customDateFormats.has(id)) dateStyleIndexes.add(index);
    });
    return dateStyleIndexes;
};

/** Excel day 1 is 1 January 1900, and it wrongly believes 1900 was a leap year. */
const serialToDate = (serial) => {
    const days = Math.floor(serial);
    if (days <= 0) return '';
    // Because Excel counts a 29 February 1900 that never existed, every serial from 61 up
    // sits one day ahead of a true day count, which a 30 December epoch absorbs. The few
    // below that phantom day need the day back.
    const epoch = Date.UTC(1899, 11, days < 60 ? 31 : 30);
    return new Date(epoch + (days * 86400000)).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- sheet

const columnIndex = (reference = '') => {
    const letters = String(reference).replace(/\d+/g, '');
    let index = 0;
    for (const letter of letters) index = (index * 26) + (letter.charCodeAt(0) - 64);
    return index - 1;
};

const readSheetRows = (sheetXml, sharedStrings = [], dateStyles = new Set()) => {
    const rows = [];
    for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = [];
        // An empty cell is written self-closing, as <c r="O2"/>. Matching the open-tag form
        // first let that swallow the following cell, so values shifted left and whole
        // columns came back blank. Deciding on the ending keeps each cell its own.
        for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
            const attributes = cellMatch[1] || '';
            const body = cellMatch[3] || '';
            const at = columnIndex((attributes.match(/r="([A-Z]+\d+)"/) || [])[1] || '');
            const type = (attributes.match(/t="(\w+)"/) || [])[1];
            const style = Number((attributes.match(/s="(\d+)"/) || [])[1]);
            const raw = (body.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1];

            let value = '';
            if (type === 's') value = sharedStrings[Number(raw)] ?? '';
            else if (type === 'inlineStr') value = textOf(body);
            else if (type === 'str') value = decodeXmlText(raw || '');
            else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
            else if (raw !== undefined) {
                value = Number.isFinite(style) && dateStyles.has(style)
                    ? serialToDate(Number(raw))
                    : String(raw);
            }
            if (at >= 0) cells[at] = String(value ?? '').trim();
        }
        rows.push(cells);
    }
    return rows;
};

const readWorkbook = (buffer) => {
    const entries = readZipEntries(buffer);
    const decode = (name) => (entries.has(name) ? entries.get(name).toString('utf8') : '');

    const sharedStrings = [...decode('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
        .map((match) => textOf(match[1]));
    const dateStyles = readDateStyles(decode('xl/styles.xml'));

    // The first sheet in the workbook, which is the one a school means by "the list".
    const workbook = decode('xl/workbook.xml');
    const firstSheetId = (workbook.match(/<sheet[^>]*r:id="(rId\d+)"/) || [])[1];
    const relationships = decode('xl/_rels/workbook.xml.rels');
    const target = firstSheetId
        ? (relationships.match(new RegExp(`Id="${firstSheetId}"[^>]*Target="([^"]+)"`)) || [])[1]
        : null;
    const sheetName = target
        ? `xl/${String(target).replace(/^\/?xl\//, '')}`
        : [...entries.keys()].find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));

    if (!sheetName || !entries.has(sheetName)) {
        throw new Error('This workbook has no readable sheet.');
    }
    return readSheetRows(decode(sheetName), sharedStrings, dateStyles);
};

// ---------------------------------------------------------------- csv

const readCsv = (text) => {
    const rows = [];
    let cell = '';
    let row = [];
    let quoted = false;
    // Excel writes a byte-order mark that would otherwise become part of the first heading.
    const body = text.replace(/^﻿/, '');

    for (let i = 0; i < body.length; i += 1) {
        const character = body[i];
        const next = body[i + 1];
        if (character === '"' && quoted && next === '"') { cell += '"'; i += 1; }
        else if (character === '"') quoted = !quoted;
        else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
        else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && next === '\n') i += 1;
            row.push(cell);
            if (row.some((value) => String(value).trim() !== '')) rows.push(row.map((value) => value.trim()));
            row = [];
            cell = '';
        } else cell += character;
    }
    row.push(cell);
    if (row.some((value) => String(value).trim() !== '')) rows.push(row.map((value) => value.trim()));
    return rows;
};

// ---------------------------------------------------------------- public

const isExcel = (buffer) => Buffer.isBuffer(buffer)
    && buffer.length > 4
    && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;

/**
 * Read a .xlsx or .csv into rows of cells. The first row is the heading row; callers decide
 * what the headings mean.
 */
const readTable = (buffer) => {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw new Error('The uploaded file is empty.');
    }
    const rows = isExcel(buffer) ? readWorkbook(buffer) : readCsv(buffer.toString('utf8'));
    return rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
};

// readSheetRows is exported so the cell-by-cell behaviour can be tested on its own: an
// empty cell arrives self-closing, and getting that wrong silently blanks whole columns.
module.exports = { isExcel, readTable, readCsv, readSheetRows, serialToDate, looksLikeDateFormat };
