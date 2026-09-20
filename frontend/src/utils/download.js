export const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

export const dateStamp = () => new Date().toISOString().slice(0, 10);

export const parseCsvText = (text) => {
    const rows = [];
    let current = '';
    let row = [];
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && quoted && next === '"') {
            current += '"';
            i += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === ',' && !quoted) {
            row.push(current);
            current = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && next === '\n') i += 1;
            row.push(current);
            if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
            row = [];
            current = '';
        } else {
            current += char;
        }
    }

    row.push(current);
    if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
    if (rows.length === 0) return [];

    const headers = rows[0].map((header) => String(header || '').trim());
    return rows.slice(1).map((values) => {
        const record = {};
        headers.forEach((header, index) => {
            record[header] = String(values[index] || '').trim();
        });
        return record;
    });
};
