const clampPercent = (value) => Math.max(0, Math.min(100, value));

const resolvePassMarkPercent = (curriculum, fallback = 40) => {
    const totalMarks = Number(curriculum?.totalMarks);
    const passMarks = Number(curriculum?.passMarks);

    if (Number.isFinite(totalMarks) && totalMarks > 0 && Number.isFinite(passMarks) && passMarks >= 0) {
        return clampPercent((passMarks / totalMarks) * 100);
    }

    const passMarkPercent = Number(curriculum?.passMarkPercent);
    return Number.isFinite(passMarkPercent) ? clampPercent(passMarkPercent) : fallback;
};

module.exports = {
    resolvePassMarkPercent
};
