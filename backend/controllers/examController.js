// Legacy exam controller disabled. Safe Quarantine.
const failClosed = (req, res) => {
    return res.status(410).json({ message: 'Legacy exam controller disabled. Use role-specific exam endpoints.' });
};

module.exports = {
    createExam: failClosed,
    submitResult: failClosed,
    getExams: failClosed,
    getResultsByExam: failClosed
};
