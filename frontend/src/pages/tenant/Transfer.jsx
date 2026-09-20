import React, { useState, useEffect } from 'react';
import { 
  ArrowRightLeft, 
  Search, 
  MapPin, 
  Building2, 
  ChevronRight, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';
import tenantService from '../../services/tenantService';
import { notify } from '../../components/feedback/notificationService';

const Transfer = () => {
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [students, setStudents] = useState([]);
    const [classes, setClasses] = useState([]);
    const [studentQuery, setStudentQuery] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const [transferData, setTransferData] = useState({
        studentId: '',
        fromBranchId: '',
        toBranchId: '',
        classId: '',
        academicYearId: ''
    });

    useEffect(() => {
        const load = async () => {
            try {
                const [branchesRes, yearsRes] = await Promise.all([
                    tenantService.getBranches(),
                    tenantService.getAcademicYears()
                ]);
                setBranches(branchesRes.data);
                setYears(yearsRes.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (!transferData.toBranchId || !selectedStudent) {
            setClasses([]);
            return;
        }
        tenantService.getBranchClasses(transferData.toBranchId, selectedStudent._id)
            .then((response) => setClasses(response.data || []))
            .catch(() => setClasses([]));
    }, [transferData.toBranchId, selectedStudent]);

    const handleStudentSearch = async (event) => {
        if (event && event.preventDefault) event.preventDefault();
        if (!studentQuery.trim()) return;
        try {
            const response = await tenantService.searchStudents(studentQuery.trim());
            setStudents(response.data || []);
        } catch (error) {
            notify(error.response?.data?.message || 'Student search failed', 'error');
        }
    };

    const chooseStudent = (student) => {
        setSelectedStudent(student);
        setStudents([]);
        setTransferData((current) => ({
            ...current,
            studentId: student._id,
            fromBranchId: student.branchId?._id || student.branchId || '',
            classId: ''
        }));
    };

    const handleTransfer = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await tenantService.transferBranch(transferData);
            setSuccess(true);
        } catch (err) {
            notify(err.response?.data?.message || 'Transfer operation failed', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="phoenix-resource-page text-slate-900 pb-10">
            <div className="phoenix-page-header">
                <div>
                 <h1 className="phoenix-page-title">Branch transfer</h1>
                 <p className="phoenix-page-subtitle">Move a student to another branch while preserving academic and financial history.</p>
                </div>
            </div>

            {success ? (
                <div className="phoenix-success-state">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 size={32} />
                    </div>
                    <div className="space-y-1">
                         <h2 className="text-xl font-bold text-slate-800">Transfer complete</h2>
                         <p className="text-slate-500 text-sm">The student now belongs to the destination branch.</p>
                    </div>
                    <button 
                        onClick={() => setSuccess(false)}
                        className="phoenix-primary-button"
                    >
                        Start another transfer
                    </button>
                </div>
            ) : (
                <form onSubmit={handleTransfer} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="phoenix-card p-5 space-y-6">
                        <div className="space-y-2">
                            <label className="phoenix-field-label">Find student</label>
                            <div className="relative group flex gap-2">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--primary)] transition-colors" size={16} />
                                <input 
                                    required
                                    type="text" 
                                    placeholder="Search by name or admission number"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 font-normal text-sm text-slate-900 outline-none focus:bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 transition-all placeholder:text-slate-400"
                                    value={studentQuery}
                                    onChange={(e) => setStudentQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleStudentSearch(e);
                                        }
                                    }}
                                />
                                <button type="button" onClick={handleStudentSearch} className="phoenix-secondary-button">Search</button>
                            </div>
                            {students.length > 0 && !selectedStudent && (
                                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                                    {students.map((student) => (
                                        <button
                                            type="button"
                                            key={student._id}
                                            onClick={() => chooseStudent(student)}
                                            className="w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-slate-50 text-sm"
                                        >
                                            {student.firstName} {student.lastName} ({student.admissionNumber})
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedStudent && (
                                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-center justify-between text-sm">
                                    <span className="font-semibold">{selectedStudent.firstName} {selectedStudent.lastName}</span>
                                    <button type="button" onClick={() => { setSelectedStudent(null); setClasses([]); setTransferData((current) => ({ ...current, studentId: '', fromBranchId: '', classId: '' })); }} className="text-blue-700 font-semibold">Change</button>
                                </div>
                            )}
                        </div>

                        {/* Migration Path */}
                        <div className="grid md:grid-cols-2 gap-6 relative">
                             {/* Connector Icon */}
                             <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white border border-slate-200 rounded-lg items-center justify-center text-[var(--primary)] shadow-sm z-10">
                                 <ArrowRight size={14} />
                             </div>

                             <div className="space-y-2">
                                <label className="phoenix-field-label">Current branch</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <select 
                                        required
                                        disabled
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-8 font-medium text-sm text-slate-900 outline-none appearance-none focus:bg-white transition-all"
                                        value={transferData.fromBranchId}
                                        onChange={(e) => setTransferData({...transferData, fromBranchId: e.target.value})}
                                    >
                                        <option value="">Source Campus</option>
                                        {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                                    </select>
                                </div>
                             </div>

                             <div className="space-y-2">
                                <label className="phoenix-field-label">Destination branch</label>
                                <div className="relative group">
                                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--primary)]" size={16} />
                                    <select 
                                        required
                                        className="w-full h-10 bg-white border border-[var(--primary)]/30 rounded-lg pl-10 pr-8 font-semibold text-sm text-slate-900 outline-none appearance-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 transition-all"
                                        value={transferData.toBranchId}
                                        onChange={(e) => setTransferData({...transferData, toBranchId: e.target.value, classId: ''})}
                                    >
                                        <option value="">Destination Campus</option>
                                        {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                                    </select>
                                </div>
                             </div>
                        </div>

                        {/* Academic Context */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="phoenix-field-label">Destination class (same grade)</label>
                                <select
                                    required
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-medium text-slate-900 text-sm outline-none focus:bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 transition-all"
                                    value={transferData.classId}
                                    onChange={(e) => setTransferData({...transferData, classId: e.target.value})}
                                >
                                    <option value="">{transferData.toBranchId && classes.length === 0 ? 'No matching grade configured' : 'Select target class'}</option>
                                    {classes.map((classItem) => (
                                        <option key={classItem._id} value={classItem._id}>{classItem.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="phoenix-field-label">Academic year</label>
                                <select 
                                    required
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-medium text-slate-900 text-sm outline-none focus:bg-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 transition-all"
                                    value={transferData.academicYearId}
                                    onChange={(e) => setTransferData({...transferData, academicYearId: e.target.value})}
                                >
                                    <option value="">Select Target Year</option>
                                    {years.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Note Policy */}
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800">
                             <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                             <div>
                                <p className="text-xs font-semibold text-amber-900 mb-0.5">Transfer effect</p>
                                <p className="text-xs leading-relaxed text-amber-700">The current enrollment moves to transferred status and a new enrollment is created at the destination. Invoices and historical grades remain linked to the student.</p>
                             </div>
                        </div>

                        {/* Action Bar */}
                        <div className="pt-2 flex justify-end">
                             <button 
                                type="submit"
                                disabled={submitting || !selectedStudent}
                                className="phoenix-primary-button disabled:opacity-50 group"
                             >
                                {submitting ? <Loader2 className="animate-spin" size={14} /> : (
                                    <>
                                        Transfer student
                                        <ArrowRightLeft className="group-hover:rotate-180 transition-transform duration-500" size={14} />
                                    </>
                                )}
                             </button>
                        </div>
                    </div>
                </form>
            )}

        </div>
    );
};

export default Transfer;


