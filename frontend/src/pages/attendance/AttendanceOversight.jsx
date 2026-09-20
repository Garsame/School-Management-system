import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ClipboardList, Lock, Plus, RefreshCw, Users } from 'lucide-react';
import {
    closeAttendanceSession,
    getAttendanceSessions,
    getAttendanceSummary,
    getSessionRegister,
    openAttendanceSession,
    submitAttendanceRecords
} from '../../services/api/attendance.api';
import { getClasses, getCurrentAcademicYear } from '../../services/api/branch.api';
import { Badge, Button, Modal, Select, Spinner, Table } from '../../components/ui';
import { confirmAction, notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

const STATUS_VARIANT = {
    PRESENT: 'success',
    ABSENT: 'danger',
    LATE: 'warning',
    EXCUSED: 'secondary'
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const AttendanceOversight = () => {
    const { user } = useAuth();
    const canManage = hasPermission(user, 'attendance.oversight.manage');

    const [range, setRange] = useState({ from: daysAgo(30), to: today() });
    const [summary, setSummary] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [classes, setClasses] = useState([]);
    const [academicYear, setAcademicYear] = useState(null);
    const [loading, setLoading] = useState(true);

    const [openForm, setOpenForm] = useState({ show: false, classId: '', date: today(), period: '', saving: false });
    const [register, setRegister] = useState({ show: false, session: null, rows: [], saving: false });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [summaryRes, sessionsRes] = await Promise.all([
                getAttendanceSummary(range),
                getAttendanceSessions({ ...range, limit: 100 })
            ]);
            setSummary(summaryRes.data);
            setSessions(sessionsRes.data || []);
        } catch (error) {
            notify(error.response?.data?.message || 'Attendance could not be loaded.', 'error');
        } finally {
            setLoading(false);
        }
    }, [range]);

    useEffect(() => { load(); }, [load]);

    // Only needed for opening a session, so a view-only user never triggers these calls.
    useEffect(() => {
        if (!canManage) return;
        (async () => {
            try {
                const [classRes, yearRes] = await Promise.all([getClasses(), getCurrentAcademicYear()]);
                setClasses(classRes.data || classRes || []);
                setAcademicYear(yearRes.data || yearRes || null);
            } catch {
                // Non-fatal: the page still shows attendance, the open form just stays empty.
            }
        })();
    }, [canManage]);

    const classOptions = useMemo(() => (classes || []).map((item) => ({
        value: item._id,
        label: item.name + (item.gradeLevel ? ` (Grade ${item.gradeLevel})` : '')
    })), [classes]);

    const handleOpenSession = async (event) => {
        event.preventDefault();
        if (!openForm.classId || !openForm.date) {
            notify('Pick a class and a date first.', 'error');
            return;
        }
        const yearId = academicYear?._id || academicYear?.id;
        if (!yearId) {
            notify('No current academic year is set, so attendance cannot be opened.', 'error');
            return;
        }
        setOpenForm((current) => ({ ...current, saving: true }));
        try {
            const response = await openAttendanceSession({
                classId: openForm.classId,
                academicYearId: yearId,
                date: openForm.date,
                period: openForm.period || undefined
            });
            notify(response.message || 'Attendance opened.', 'success');
            setOpenForm({ show: false, classId: '', date: today(), period: '', saving: false });
            await load();
        } catch (error) {
            notify(error.response?.data?.message || 'Attendance could not be opened.', 'error');
            setOpenForm((current) => ({ ...current, saving: false }));
        }
    };

    const openRegister = async (session) => {
        try {
            const response = await getSessionRegister(session._id);
            const { register: rows, session: full } = response.data;
            setRegister({
                show: true,
                session: full,
                // Default unmarked students to present: on a normal day most are, and the
                // marker only has to change the exceptions.
                rows: rows.map((row) => ({ ...row, status: row.status || 'PRESENT' })),
                saving: false
            });
        } catch (error) {
            notify(error.response?.data?.message || 'The register could not be loaded.', 'error');
        }
    };

    const setRowStatus = (studentId, status) => setRegister((current) => ({
        ...current,
        rows: current.rows.map((row) => (row.studentId === studentId ? { ...row, status } : row))
    }));

    const markAll = (status) => setRegister((current) => ({
        ...current,
        rows: current.rows.map((row) => ({ ...row, status }))
    }));

    const saveRegister = async () => {
        setRegister((current) => ({ ...current, saving: true }));
        try {
            await submitAttendanceRecords(
                register.session._id,
                register.rows.map((row) => ({ studentId: row.studentId, status: row.status }))
            );
            notify('Attendance saved.', 'success');
            setRegister({ show: false, session: null, rows: [], saving: false });
            await load();
        } catch (error) {
            notify(error.response?.data?.message || 'Attendance could not be saved.', 'error');
            setRegister((current) => ({ ...current, saving: false }));
        }
    };

    const handleClose = async (session) => {
        const confirmed = await confirmAction(
            'Close this register? It cannot be edited afterwards.',
            { title: 'Close attendance', confirmLabel: 'Close register' }
        );
        if (!confirmed) return;
        try {
            await closeAttendanceSession(session._id);
            notify('Register closed.', 'success');
            await load();
        } catch (error) {
            notify(error.response?.data?.message || 'The register could not be closed.', 'error');
        }
    };

    const totals = summary?.totals;
    const registerCounts = useMemo(() => register.rows.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
    }, {}), [register.rows]);

    return (
        <div className="space-y-5">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Attendance</h1>
                    <p className="phoenix-page-subtitle">
                        Attendance across every class, and the register for any of them.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="date"
                        value={range.from}
                        max={range.to}
                        onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
                        className="phoenix-control !h-9 !w-auto text-xs"
                        aria-label="From date"
                    />
                    <input
                        type="date"
                        value={range.to}
                        min={range.from}
                        onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
                        className="phoenix-control !h-9 !w-auto text-xs"
                        aria-label="To date"
                    />
                    <Button variant="outline" size="sm" onClick={load} className="gap-2">
                        <RefreshCw size={14} /> Refresh
                    </Button>
                    {canManage && (
                        <Button size="sm" onClick={() => setOpenForm((current) => ({ ...current, show: true }))} className="gap-2">
                            <Plus size={14} /> Take attendance
                        </Button>
                    )}
                </div>
            </div>

            {loading ? <Spinner size="lg" /> : (
                <>
                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            [CalendarCheck, 'Attendance rate', totals?.attendanceRate === null || totals?.attendanceRate === undefined ? '—' : `${totals.attendanceRate}%`],
                            [Users, 'Students marked', totals?.marked ?? 0],
                            [ClipboardList, 'Registers taken', totals?.sessions ?? 0],
                            [Lock, 'Still open', totals?.openSessions ?? 0]
                        ].map(([Icon, label, value]) => (
                            <article key={label} className="phoenix-card flex items-center gap-4 p-4">
                                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
                                    <Icon size={18} />
                                </span>
                                <div>
                                    <p className="text-xs font-semibold text-[#6e7891]">{label}</p>
                                    <p className="mt-1 text-lg font-bold text-[#141824]">{value}</p>
                                </div>
                            </article>
                        ))}
                    </section>

                    <section className="phoenix-card p-0">
                        <div className="border-b border-[var(--border)] px-5 py-4">
                            <h2 className="font-bold text-slate-800">By class</h2>
                        </div>
                        {(summary?.classes || []).length === 0 ? (
                            <p className="p-6 text-sm text-slate-500">No attendance has been taken in this period.</p>
                        ) : (
                            <Table headers={['Class', 'Registers', 'Present', 'Absent', 'Late', 'Excused', 'Rate']}>
                                {summary.classes.map((row) => (
                                    <tr key={row.className} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-semibold text-slate-800">{row.className}</td>
                                        <td className="px-4 py-3 text-slate-600">{row.sessions}</td>
                                        <td className="px-4 py-3 text-emerald-700">{row.present}</td>
                                        <td className="px-4 py-3 text-rose-700">{row.absent}</td>
                                        <td className="px-4 py-3 text-amber-700">{row.late}</td>
                                        <td className="px-4 py-3 text-slate-600">{row.excused}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">
                                            {row.attendanceRate === null ? '—' : `${row.attendanceRate}%`}
                                        </td>
                                    </tr>
                                ))}
                            </Table>
                        )}
                    </section>

                    <section className="phoenix-card p-0">
                        <div className="border-b border-[var(--border)] px-5 py-4">
                            <h2 className="font-bold text-slate-800">Registers</h2>
                        </div>
                        {sessions.length === 0 ? (
                            <p className="p-6 text-sm text-slate-500">
                                No registers in this period. {canManage && 'Use "Take attendance" to start one.'}
                            </p>
                        ) : (
                            <Table headers={['Date', 'Class', 'Period', 'Taken by', 'Marked', 'Status', '']}>
                                {sessions.map((session) => {
                                    const tally = session.tally || {};
                                    const marked = STATUSES.reduce((sum, status) => sum + (tally[status] || 0), 0);
                                    return (
                                        <tr key={session._id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{session.date}</td>
                                            <td className="px-4 py-3 text-slate-700">{session.classId?.name || '—'}</td>
                                            <td className="px-4 py-3 text-slate-500">{session.period || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">{session.teacherUserId?.name || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {marked === 0 ? <span className="text-amber-700">Not marked</span> : marked}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={session.status === 'OPEN' ? 'warning' : 'slate'}>{session.status}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" variant="outline" onClick={() => openRegister(session)}>
                                                        {canManage && session.status === 'OPEN' ? 'Mark' : 'View'}
                                                    </Button>
                                                    {canManage && session.status === 'OPEN' && (
                                                        <Button size="sm" variant="ghost" onClick={() => handleClose(session)}>Close</Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </Table>
                        )}
                    </section>
                </>
            )}

            <Modal
                isOpen={openForm.show}
                onClose={() => setOpenForm((current) => ({ ...current, show: false }))}
                title="Take attendance"
            >
                <form onSubmit={handleOpenSession} className="space-y-4">
                    <Select
                        label="Class"
                        options={classOptions}
                        value={openForm.classId}
                        onChange={(event) => setOpenForm((current) => ({ ...current, classId: event.target.value }))}
                        placeholder="Choose a class"
                    />
                    <div className="space-y-1.5">
                        <label className="text-[13px] font-semibold text-slate-700">Date</label>
                        <input
                            type="date"
                            value={openForm.date}
                            max={today()}
                            onChange={(event) => setOpenForm((current) => ({ ...current, date: event.target.value }))}
                            className="phoenix-control w-full"
                        />
                    </div>
                    <Select
                        label="Period (optional)"
                        options={['Morning', 'Afternoon', 'Period 1', 'Period 2', 'Period 3'].map((value) => ({ value, label: value }))}
                        value={openForm.period}
                        onChange={(event) => setOpenForm((current) => ({ ...current, period: event.target.value }))}
                        placeholder="Whole day"
                    />
                    <p className="text-xs text-slate-500">
                        One register per class, date and period. Opening a second for the same slot is refused.
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" onClick={() => setOpenForm((current) => ({ ...current, show: false }))}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={openForm.saving}>Open register</Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={register.show}
                onClose={() => setRegister({ show: false, session: null, rows: [], saving: false })}
                title={register.session ? `${register.session.classId?.name || 'Register'} · ${register.session.date}` : 'Register'}
                maxWidth="3xl"
            >
                {register.rows.length === 0 ? (
                    <p className="text-sm text-slate-500">No students are enrolled in this class for the session's academic year.</p>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2 text-xs">
                                {STATUSES.map((status) => (
                                    <Badge key={status} variant={STATUS_VARIANT[status]}>
                                        {status} {registerCounts[status] || 0}
                                    </Badge>
                                ))}
                            </div>
                            {canManage && register.session?.status === 'OPEN' && (
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => markAll('PRESENT')}>All present</Button>
                                    <Button size="sm" variant="outline" onClick={() => markAll('ABSENT')}>All absent</Button>
                                </div>
                            )}
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-[var(--border)]">
                            {register.rows.map((row) => (
                                <div key={row.studentId} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]/70 px-4 py-3 last:border-b-0">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">{row.name}</p>
                                        <p className="text-xs text-slate-500">{row.admissionNumber}</p>
                                    </div>
                                    {canManage && register.session?.status === 'OPEN' ? (
                                        <div className="flex gap-1.5">
                                            {STATUSES.map((status) => (
                                                <button
                                                    key={status}
                                                    type="button"
                                                    onClick={() => setRowStatus(row.studentId, status)}
                                                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                                                        row.status === status
                                                            ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                                                            : 'border-[var(--border)] text-slate-500 hover:border-slate-400'
                                                    }`}
                                                >
                                                    {status.charAt(0) + status.slice(1).toLowerCase()}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <Badge variant={STATUS_VARIANT[row.status] || 'slate'}>{row.status || 'Not marked'}</Badge>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setRegister({ show: false, session: null, rows: [], saving: false })}>
                                Close
                            </Button>
                            {canManage && register.session?.status === 'OPEN' && (
                                <Button onClick={saveRegister} loading={register.saving}>Save attendance</Button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default AttendanceOversight;
