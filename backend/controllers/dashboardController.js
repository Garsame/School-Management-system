const Student = require('../models/Student');
const Invoice = require('../models/Invoice');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');

const getOverviewStats = async (req, res) => {
    try {
        const query = { tenantId: req.tenantId };
        if (req.scope === 'branch') query.branchId = req.branchId;

        const schoolSessions = await AttendanceSession.find({
            ...query,
            sessionType: { $ne: 'DUGSI' }
        }).select('_id').lean();
        const schoolSessionIds = schoolSessions.map((s) => s._id);

        const [studentCount, invoices, totalAttendance, presentAttendance] = await Promise.all([
            Student.countDocuments(query),
            Invoice.find(query),
            AttendanceRecord.countDocuments({ ...query, sessionId: { $in: schoolSessionIds } }),
            AttendanceRecord.countDocuments({ ...query, sessionId: { $in: schoolSessionIds }, status: 'PRESENT' })
        ]);

        const totalRevenue = invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
        const outstanding = invoices.reduce((acc, inv) => acc + inv.balance, 0);

        res.json({
            studentCount,
            totalRevenue,
            outstanding,
            attendance: totalAttendance > 0
                ? `${((presentAttendance / totalAttendance) * 100).toFixed(1)}%`
                : 'N/A'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getOverviewStats };
