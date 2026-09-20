const normalizeGradeLevel = (value) => {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return null;
    const numeric = text.match(/^(?:grade|class|form|level)?\s*[-:]?\s*(\d+(?:\.\d+)?)$/);
    if (numeric) return `number:${Number(numeric[1])}`;
    return `text:${text.replace(/\s+/g, ' ')}`;
};

const isSameGradeLevel = (sourceGradeLevel, destinationGradeLevel) => {
    const source = normalizeGradeLevel(sourceGradeLevel);
    const destination = normalizeGradeLevel(destinationGradeLevel);
    return Boolean(source && destination && source === destination);
};

module.exports = { isSameGradeLevel, normalizeGradeLevel };
