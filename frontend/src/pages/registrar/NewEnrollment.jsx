import React, { useEffect, useState } from 'react';
import { getStudents, getCurrentAcademicYear, createEnrollment } from '../../services/api/registrar.api';
import { getClasses, getSections } from '../../services/api/branch.api';
import { Button, Toast } from '../../components/ui';

const normalizeList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    return [];
};

const normalizeAcademicYear = (payload) => payload?.data?.data || payload?.data || payload || null;

const NewEnrollment = () => {
    const [students, setStudents] = useState([]);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [year, setYear] = useState(null);
    const [searchQ, setSearchQ] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [sectionsLoading, setSectionsLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [receipt, setReceipt] = useState(null);

    // Initial Load
    useEffect(() => {
        const init = async () => {
            const [yearResult, classResult] = await Promise.allSettled([getCurrentAcademicYear(), getClasses()]);
            if (yearResult.status === 'fulfilled') setYear(normalizeAcademicYear(yearResult.value));
            else setLoadError(yearResult.reason?.response?.data?.message || 'No active academic year is configured.');
            if (classResult.status === 'fulfilled') setClasses(normalizeList(classResult.value));
            else setLoadError(classResult.reason?.response?.data?.message || 'Classes could not be loaded.');
            try {
                if (yearResult.status === 'fulfilled' && classResult.status === 'fulfilled') setLoadError('');
            } finally {
                setLoadingInitial(false);
            }
        };
        init();
    }, []);

    const handleClassChange = async (classId) => {
        setSelectedClass(classId);
        setSelectedSection(''); // Reset selected sectionId when class changes
        if (!classId) {
            setSections([]);
            return;
        }
        setSectionsLoading(true);
        try {
            const res = await getSections(classId);
            setSections(res.data || res || []);
        } catch (err) {
            console.error('Failed to load sections:', err);
            setSections([]);
            setToast({ type: 'error', message: err.response?.data?.message || 'Sections could not be loaded.' });
        } finally {
            setSectionsLoading(false);
        }
    };

    // Search Students
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQ.trim()) {
            setToast({ type: 'warning', message: 'Enter a student name or admission number.' });
            return;
        }
        setLoading(true);
        setStudents([]);
        setReceipt(null);
        try {
            const res = await getStudents({
                q: searchQ.trim(),
                includeEnrollment: true,
                enrollmentYearId: year?._id,
                limit: 50
            });
            setStudents(normalizeList(res));
            setSelectedStudent(null);
        } catch (err) {
            setToast({ type: 'error', message: err.response?.data?.message || 'Student search failed.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!selectedStudent || !selectedClass || !year) return;
        if (sections.length > 0 && !selectedSection) {
            setToast({ type: 'warning', message: 'Select a section for this class.' });
            return;
        }
        setSubmitting(true);
        try {
            const response = await createEnrollment({
                studentId: selectedStudent._id,
                classId: selectedClass,
                sectionId: selectedSection || undefined,
                academicYearId: year._id,
                status: 'Current'
            });
            setReceipt({ enrollment: response.data?.data, previousEnrollmentsClosed: response.data?.previousEnrollmentsClosed || 0, student: selectedStudent, className: classes.find(item => item._id === selectedClass)?.name, sectionName: sections.find(item => item._id === selectedSection)?.name });
            setToast({ type: 'success', message: response.data?.message || 'Student re-enrolled successfully.' });
            setSelectedStudent(null);
            setSelectedClass('');
            setSelectedSection('');
            setSections([]);
            setStudents([]); 
            setSearchQ('');
        } catch (err) {
            setToast({ type: 'error', message: err.response?.data?.message || 'Enrollment Failed' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Re-Enrollment</h1>
                    <p className="phoenix-page-subtitle">Enroll an existing student into a class for the active academic year.</p>
                </div>
                <div className="bg-white px-3 py-1.5 rounded border border-[#e3e6ed] flex items-center gap-2 max-w-max text-xs">
                    <span className="font-bold text-[#6e7891]">Academic Year:</span>
                    <span className="font-black text-[var(--primary)]">{year?.name || 'Loading...'}</span>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {!loadingInitial && !year && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    No active academic year is configured. Re-enrollment is unavailable until the Super Admin activates one.
                </div>
            )}

            <div className="phoenix-card p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column: Find Student */}
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">1. Find Student</label>
                            <form onSubmit={handleSearch} className="flex gap-2">
                                <input 
                                    className="flex-1 h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                                    placeholder="Enter Name or Admission #"
                                    value={searchQ}
                                    onChange={e => setSearchQ(e.target.value)}
                                />
                                <Button type="submit" disabled={loading} className="h-11 px-5">Search</Button>
                            </form>
                        </div>

                        {(students || []).length > 0 && !selectedStudent && (
                            <div className="border border-[var(--border)] rounded-xl max-h-48 overflow-y-auto bg-white shadow-sm divide-y divide-[#e3e6ed]">
                                {(students || []).map(s => (
                                    <button 
                                        key={s._id} 
                                        type="button"
                                        className="w-full text-left p-3 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
                                        onClick={() => setSelectedStudent(s)}
                                        disabled={Boolean(s.currentEnrollment) || ['Graduated', 'Transferred'].includes(s.status)}
                                    >
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm">{s.firstName} {s.lastName}</div>
                                            <div className="text-xs text-slate-500">{s.admissionNumber}</div>
                                        </div>
                                        <span className={`text-xs font-bold ${s.currentEnrollment ? 'text-amber-700' : 'text-[var(--primary)]'}`}>
                                            {s.currentEnrollment ? `Already enrolled · ${s.currentEnrollment.classId?.name || ''}` : ['Graduated', 'Transferred'].includes(s.status) ? s.status : 'Select'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {!loading && searchQ.trim() && students.length === 0 && <div className="rounded-xl border border-[#e3e6ed] p-4 text-sm text-[#6e7891]">No matching student was found in this branch.</div>}

                        {selectedStudent && (
                            <div className="p-4 bg-[#eaf0ff] border border-[#cbd0dd] rounded-xl flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-[#141824] text-sm">{selectedStudent.firstName} {selectedStudent.lastName}</div>
                                    <div className="text-xs text-[#525b75]">{selectedStudent.admissionNumber}</div>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => setSelectedStudent(null)} className="text-xs">Change</Button>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Selection details and Submit */}
                    <div className="space-y-6 lg:border-l lg:border-slate-200 lg:pl-6">
                        <div>
                            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">2. Select Class</label>
                            <select 
                                className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 disabled:bg-[#f5f7fa] disabled:text-[#8a94ad] text-sm"
                                value={selectedClass}
                                onChange={e => handleClassChange(e.target.value)}
                                disabled={loadingInitial || !selectedStudent || (classes || []).length === 0}
                            >
                                <option value="">
                                    {loadingInitial
                                        ? 'Loading classes...'
                                        : (classes || []).length === 0
                                            ? '-- No classes found for this branch --'
                                            : '-- Choose Class --'}
                                </option>
                                {(classes || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                            {!loadingInitial && (classes || []).length === 0 && (
                                <p className="mt-2 text-xs font-semibold text-rose-600">
                                    No classes are available in this registrar branch. Ask the branch admin to create classes first.
                                </p>
                            )}
                        </div>

                        {selectedClass && (
                            <div>
                                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Select Section</label>
                                {sectionsLoading ? (
                                    <div className="text-sm text-slate-500">Loading sections...</div>
                                ) : (sections || []).length > 0 ? (
                                    <select
                                        className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                                        value={selectedSection}
                                        onChange={e => setSelectedSection(e.target.value)}
                                    >
                                        <option value="">-- Choose Section --</option>
                                        {(sections || []).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                                    </select>
                                ) : (
                                    <div className="p-3 bg-amber-50 border border-amber-250 text-amber-900 text-xs rounded-xl font-medium">
                                        No sections configured for this class.
                                    </div>
                                )}
                            </div>
                        )}

                        {loadError && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                                {loadError}
                            </div>
                        )}

                        <div className="pt-4 border-t border-[#e3e6ed]">
                            <Button 
                                className="w-full h-11" 
                                type="button"
                                disabled={submitting || !selectedStudent || !selectedClass || !year || (sections.length > 0 && !selectedSection)}
                                onClick={handleSubmit}
                            >
                                {submitting ? 'Enrolling...' : 'Confirm Enrollment'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
            {receipt && <section className="phoenix-card border-emerald-200 p-5" aria-live="polite"><h2 className="font-bold text-emerald-800">Re-enrollment complete</h2><dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-[#8a94ad]">Student</dt><dd className="font-semibold">{receipt.student.firstName} {receipt.student.lastName} ({receipt.student.admissionNumber})</dd></div><div><dt className="text-[#8a94ad]">Placement</dt><dd className="font-semibold">{receipt.className}{receipt.sectionName ? ` · ${receipt.sectionName}` : ''}</dd></div><div><dt className="text-[#8a94ad]">Enrollment ID</dt><dd className="font-mono text-xs">{receipt.enrollment?._id}</dd></div><div><dt className="text-[#8a94ad]">Previous records closed</dt><dd className="font-semibold">{receipt.previousEnrollmentsClosed}</dd></div></dl></section>}
        </div>
    );
};

export default NewEnrollment;
