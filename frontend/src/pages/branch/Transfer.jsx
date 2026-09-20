import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, Search } from 'lucide-react';
import {
    getCurrentAcademicYear,
    getStudents,
    getTransferBranches,
    getTransferClasses,
    getTransferSections,
    transferStudent
} from '../../services/api/branch.api';
import { Button, Spinner, Toast } from '../../components/ui';
import { confirmAction } from '../../components/feedback/notificationService';

const listFrom = (payload) => payload?.data || payload || [];

const Transfer = () => {
    const [year, setYear] = useState(null);
    const [branches, setBranches] = useState([]);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [query, setQuery] = useState('');
    const [form, setForm] = useState({ newBranchId: '', newClassId: '', newSectionId: '', reason: '' });
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [complete, setComplete] = useState(false);
    const [receipt, setReceipt] = useState(null);
    const [classesLoading, setClassesLoading] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [yearResponse, branchResponse] = await Promise.all([
                    getCurrentAcademicYear(),
                    getTransferBranches()
                ]);
                setYear(yearResponse?.data || yearResponse || null);
                setBranches(listFrom(branchResponse));
            } catch (error) {
                setToast({ type: 'error', message: error.response?.data?.message || 'Could not load transfer requirements.' });
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const selectBranch = async (newBranchId) => {
        setForm((current) => ({ ...current, newBranchId, newClassId: '', newSectionId: '' }));
        setClasses([]);
        setSections([]);
        if (!newBranchId) return;
        if (!selectedStudent) {
            setToast({ type: 'warning', message: 'Select a student before choosing the destination branch.' });
            return;
        }
        setClassesLoading(true);
        try {
            const response = await getTransferClasses(newBranchId, selectedStudent?._id);
            setClasses(listFrom(response));
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Could not load destination classes.' });
        } finally {
            setClassesLoading(false);
        }
    };

    const selectClass = async (newClassId) => {
        setForm((current) => ({ ...current, newClassId, newSectionId: '' }));
        setSections([]);
        if (!newClassId || !form.newBranchId) return;
        try {
            const response = await getTransferSections(form.newBranchId, newClassId);
            setSections(listFrom(response));
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Could not load destination sections.' });
        }
    };

    const searchStudents = async (event) => {
        event.preventDefault();
        if (!query.trim()) return;
        setSearching(true);
        setStudents([]);
        try {
            const response = await getStudents({ q: query.trim(), status: 'Active' });
            setStudents(listFrom(response));
            setSelectedStudent(null);
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Student search failed.' });
        } finally {
            setSearching(false);
        }
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!selectedStudent || !year?._id) return;
        const confirmed = await confirmAction(
            `Transfer ${selectedStudent.firstName} ${selectedStudent.lastName} to the selected branch? Their current enrollment and portal branch will change.`,
            { title: 'Confirm branch transfer', confirmLabel: 'Transfer student' }
        );
        if (!confirmed) return;
        setSaving(true);
        try {
            const response = await transferStudent({
                studentId: selectedStudent._id,
                newBranchId: form.newBranchId,
                newClassId: form.newClassId,
                newSectionId: form.newSectionId || undefined,
                newAcademicYearId: year._id,
                reason: form.reason
            });
            setReceipt(response?.data || response);
            setComplete(true);
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Transfer failed.' });
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        setComplete(false);
        setReceipt(null);
        setSelectedStudent(null);
        setStudents([]);
        setQuery('');
        setClasses([]);
        setSections([]);
        setForm({ newBranchId: '', newClassId: '', newSectionId: '', reason: '' });
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Branch Transfer</h1>
                    <p className="phoenix-page-subtitle">Move a student from your branch while preserving academic and financial history.</p>
                </div>
                <div className="rounded border border-[#e3e6ed] bg-white px-3 py-2 text-xs font-semibold text-[#525b75]">
                    Academic Year: <span className="font-bold text-[var(--primary)]">{year?.name || 'Not active'}</span>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {!year && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    No active academic year is configured. A transfer cannot be processed.
                </div>
            )}

            {complete ? (
                <div className="phoenix-card p-10 text-center">
                    <CheckCircle2 className="mx-auto text-emerald-600" size={42} />
                    <h2 className="mt-3 text-xl font-bold text-[#141824]">Transfer complete</h2>
                    <p className="mt-1 text-sm text-[#6e7891]">The student now belongs to the destination branch.</p>
                    <div className="mx-auto mt-5 max-w-lg rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-left text-sm text-emerald-900">
                        <p><strong>Student:</strong> {selectedStudent?.firstName} {selectedStudent?.lastName} ({selectedStudent?.admissionNumber})</p>
                        <p className="mt-1"><strong>New enrollment ID:</strong> <span className="font-mono text-xs">{receipt?._id || 'Created'}</span></p>
                        <p className="mt-1"><strong>Academic year:</strong> {year?.name}</p>
                    </div>
                    <Button className="mt-5" onClick={reset}>Start another transfer</Button>
                </div>
            ) : (
                <form onSubmit={submit} className="phoenix-card p-5">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="space-y-4">
                            <label className="block space-y-1.5">
                                <span className="phoenix-field-label">Find student</span>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-3 text-[#8a94ad]" size={16} />
                                        <input
                                            className="phoenix-control pl-9"
                                            placeholder="Student, parent, or admission number"
                                            value={query}
                                            onChange={(event) => setQuery(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') searchStudents(event);
                                            }}
                                        />
                                    </div>
                                    <Button type="button" loading={searching} onClick={searchStudents}>Search</Button>
                                </div>
                            </label>
                            {!selectedStudent && students.length > 0 && (
                                <div className="max-h-52 overflow-y-auto rounded-lg border border-[#e3e6ed]">
                                    {students.map((student) => (
                                        <button key={student._id} type="button" onClick={() => { setSelectedStudent(student); setClasses([]); setSections([]); setForm((current) => ({ ...current, newBranchId: '', newClassId: '', newSectionId: '' })); }} className="flex w-full justify-between border-b border-[#e3e6ed] px-3 py-2 text-left hover:bg-[#f5f7fa]">
                                            <span className="font-semibold">{student.firstName} {student.lastName}</span>
                                            <span className="font-mono text-xs text-[#6e7891]">{student.admissionNumber}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {!searching && query.trim() && students.length === 0 && <p className="rounded border border-[#e3e6ed] p-3 text-xs text-[#6e7891]">No active student matched that name or admission number.</p>}
                            {selectedStudent && (
                                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">
                                    <div><p className="font-bold">{selectedStudent.firstName} {selectedStudent.lastName}</p><p className="text-xs text-[#525b75]">{selectedStudent.admissionNumber}</p></div>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedStudent(null); setClasses([]); setSections([]); setForm((current) => ({ ...current, newBranchId: '', newClassId: '', newSectionId: '' })); }}>Change</Button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:border-l lg:border-[#e3e6ed] lg:pl-6">
                            <label className="space-y-1.5"><span className="phoenix-field-label">Destination branch</span><select className="phoenix-control" value={form.newBranchId} onChange={(event) => selectBranch(event.target.value)} required><option value="">Select branch</option>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></label>
                            <label className="space-y-1.5"><span className="phoenix-field-label">Destination class (same grade)</span><select className="phoenix-control" value={form.newClassId} onChange={(event) => selectClass(event.target.value)} required disabled={!form.newBranchId || classesLoading}><option value="">{classesLoading ? 'Loading matching classes...' : form.newBranchId && classes.length === 0 ? 'No matching grade configured' : 'Select class'}</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
                            <label className="space-y-1.5"><span className="phoenix-field-label">Destination section</span><select className="phoenix-control" value={form.newSectionId} onChange={(event) => setForm({ ...form, newSectionId: event.target.value })} disabled={!form.newClassId} required={sections.length > 0}><option value="">{sections.length ? 'Select section' : 'No sections configured'}</option>{sections.map((section) => <option key={section._id} value={section._id}>{section.name}</option>)}</select></label>
                            <label className="space-y-1.5"><span className="phoenix-field-label">Reason</span><input className="phoenix-control" placeholder="Reason for transfer" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></label>
                            <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                                <strong>Transfer effect:</strong> current enrollment becomes Transferred, a destination enrollment is created, and the student portal moves to the destination branch.
                            </div>
                            <Button className="md:col-span-2" type="submit" loading={saving} disabled={!year || !selectedStudent || !form.newBranchId || !form.newClassId}>
                                <ArrowRightLeft size={15} /> Transfer student
                            </Button>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
};

export default Transfer;
