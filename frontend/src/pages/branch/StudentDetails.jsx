import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, GraduationCap, Phone, User } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { getStudent, getClasses, getSections, transferStudentClass } from '../../services/api/branch.api';
import { Spinner, Button, Modal, Toast } from '../../components/ui';
import EnrollmentHistory from '../../components/students/EnrollmentHistory';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const BranchStudentDetails = () => {
    const { user } = useAuth();
    const { studentId } = useParams();
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);

    // Modal state
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferClasses, setTransferClasses] = useState([]);
    const [transferSections, setTransferSections] = useState([]);
    const [selectedTransferClass, setSelectedTransferClass] = useState('');
    const [selectedTransferSection, setSelectedTransferSection] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [transferring, setTransferring] = useState(false);
    const [sectionsLoading, setSectionsLoading] = useState(false);

    const loadStudentData = () => {
        getStudent(studentId)
            .then((response) => setStudent(response?.data || response))
            .catch((requestError) => setError(requestError.response?.data?.message || 'Student details could not be loaded.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadStudentData();
    }, [studentId]);

    const openTransferModal = async () => {
        setIsTransferModalOpen(true);
        setSelectedTransferClass('');
        setSelectedTransferSection('');
        setTransferReason('');
        setTransferSections([]);
        try {
            const res = await getClasses();
            setTransferClasses(res?.data || res || []);
        } catch (err) {
            console.error('Failed to load classes for transfer:', err);
            setToast({ type: 'error', message: 'Could not load classes for transfer.' });
        }
    };

    const handleTransferClassChange = async (classId) => {
        setSelectedTransferClass(classId);
        setSelectedTransferSection('');
        setTransferSections([]);
        if (!classId) return;
        setSectionsLoading(true);
        try {
            const res = await getSections(classId);
            setTransferSections(res?.data || res || []);
        } catch (err) {
            console.error('Failed to load sections:', err);
        } finally {
            setSectionsLoading(false);
        }
    };

    const handleConfirmClassTransfer = async (e) => {
        if (e) e.preventDefault();
        if (!selectedTransferClass) {
            setToast({ type: 'warning', message: 'Please select a destination class.' });
            return;
        }
        setTransferring(true);
        try {
            await transferStudentClass({
                studentId,
                newClassId: selectedTransferClass,
                newSectionId: selectedTransferSection || undefined,
                reason: transferReason || 'Class transfer from branch student profile'
            });
            setToast({ type: 'success', message: 'Student transferred to new class successfully.' });
            setIsTransferModalOpen(false);
            loadStudentData();
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: err.response?.data?.message || 'Class transfer failed.' });
        } finally {
            setTransferring(false);
        }
    };

    if (loading) return <div className="flex h-72 items-center justify-center"><Spinner /></div>;
    if (!student) return <div className="phoenix-card p-6 text-sm text-rose-700">{error || 'Student not found.'}</div>;

    const current = (student.enrollments || []).find((item) => ['Current', 'Active', 'active'].includes(item.status));

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="phoenix-page-header">
                <div>
                    <Link to="/branch/students" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#6e7891] hover:text-[var(--primary)]">
                        <ArrowLeft size={14} /> Students
                    </Link>
                    <h1 className="phoenix-page-title">{student.firstName} {student.lastName}</h1>
                    <p className="phoenix-page-subtitle">{student.admissionNumber}</p>
                </div>
                {current && (hasPermission(user, 'branch.transfers.run') || hasPermission(user, 'enrollments.create')) && (
                    <Button
                        variant="outline"
                        className="flex items-center gap-2 text-xs h-10 px-4 border border-[var(--border)] text-blue-700 hover:bg-blue-50"
                        onClick={openTransferModal}
                    >
                        <ArrowRightLeft size={14} />
                        Transfer Class
                    </Button>
                )}
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <section className="phoenix-card p-5 lg:col-span-2">
                    <h2 className="phoenix-section-title">Student record</h2>
                    <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div className="flex items-center gap-3"><User size={17} className="text-[#8a94ad]" /><div><p className="text-xs text-[#8a94ad]">Status</p><p className="text-sm font-bold">{student.status}</p></div></div>
                        <div className="flex items-center gap-3"><GraduationCap size={17} className="text-[#8a94ad]" /><div><p className="text-xs text-[#8a94ad]">Current class</p><p className="text-sm font-bold">{current?.classId?.name || 'Not enrolled'}</p></div></div>
                        <div className="flex items-center gap-3"><User size={17} className="text-[#8a94ad]" /><div><p className="text-xs text-[#8a94ad]">Guardian</p><p className="text-sm font-bold">{student.guardianInfo?.name || 'Not recorded'}</p></div></div>
                        <div className="flex items-center gap-3"><Phone size={17} className="text-[#8a94ad]" /><div><p className="text-xs text-[#8a94ad]">Guardian phone</p><p className="text-sm font-bold">{student.guardianInfo?.phone || 'Not recorded'}</p></div></div>
                    </div>
                </section>
                <section className="phoenix-card p-5">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="phoenix-section-title">Enrollment history</h2>
                        {current && (hasPermission(user, 'branch.transfers.run') || hasPermission(user, 'enrollments.create')) && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2 text-blue-700 hover:bg-blue-50"
                                onClick={openTransferModal}
                            >
                                <ArrowRightLeft size={11} className="mr-1" />
                                Transfer
                            </Button>
                        )}
                    </div>
                    <div className="mt-4"><EnrollmentHistory enrollments={student.enrollments || []} /></div>
                </section>
            </div>

            {/* Class Transfer Modal */}
            <Modal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                title={`Transfer Class: ${student.firstName} ${student.lastName}`}
                maxWidth="lg"
            >
                <form onSubmit={handleConfirmClassTransfer} className="space-y-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-900 space-y-1">
                        <p><strong>Current Active Placement:</strong> {current?.classId?.name || 'Not Enrolled'}</p>
                        <p className="text-slate-500 font-mono">Admission #: {student.admissionNumber}</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[13px] font-semibold text-slate-700">Destination Class</label>
                        <select
                            className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                            value={selectedTransferClass}
                            onChange={(e) => handleTransferClassChange(e.target.value)}
                            required
                        >
                            <option value="">-- Choose New Class --</option>
                            {transferClasses.map((cls) => (
                                <option key={cls._id} value={cls._id}>
                                    {cls.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[13px] font-semibold text-slate-700">Destination Section</label>
                        <select
                            className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                            value={selectedTransferSection}
                            onChange={(e) => setSelectedTransferSection(e.target.value)}
                            disabled={!selectedTransferClass || sectionsLoading}
                        >
                            <option value="">
                                {sectionsLoading
                                    ? 'Loading sections...'
                                    : transferSections.length
                                        ? '-- Choose Section --'
                                        : 'No sections configured'}
                            </option>
                            {transferSections.map((sec) => (
                                <option key={sec._id} value={sec._id}>
                                    {sec.name} {sec.capacity ? `(Cap: ${sec.capacity})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[13px] font-semibold text-slate-700">Reason for transfer</label>
                        <input
                            className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                            placeholder="Reason for class transfer"
                            value={transferReason}
                            onChange={(e) => setTransferReason(e.target.value)}
                        />
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <strong>Transfer effect:</strong> Current enrollment is closed as <em>Transferred</em>, and the student is placed into the new class. All previous bills, marks, and attendance remain preserved.
                    </div>

                    <div className="pt-3 border-t border-[var(--border)] flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsTransferModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={transferring} disabled={!selectedTransferClass}>
                            <ArrowRightLeft size={14} className="mr-1.5" />
                            Confirm Transfer
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default BranchStudentDetails;
