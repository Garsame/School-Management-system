import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Users, GraduationCap, Calendar, CreditCard, ChevronRight, Bell, AlertTriangle, AlertCircle, RefreshCw
} from 'lucide-react';
import api from '../../services/api';

const ParentDashboard = () => {
    const [children, setChildren] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const fetchDashboard = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/parent/dashboard');
            if (res.data?.success) {
                setChildren(res.data.data || []);
            } else {
                setError('Failed to fetch dashboard data.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error loading parent dashboard.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboard();
    }, []);

    if (loading) {
        return (
            <div className="h-96 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Parent Dashboard</h1>
                    <p className="phoenix-page-subtitle">Monitor your children's educational progress and financial accounts.</p>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-900 animate-fade-in">
                    <AlertCircle className="text-rose-500 flex-shrink-0" size={20} />
                    <div className="text-sm font-semibold flex-1">{error}</div>
                    <button 
                        onClick={fetchDashboard} 
                        className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    >
                        <RefreshCw size={12} />
                        Retry
                    </button>
                </div>
            )}

            {/* Late fees: a bill is past its due date and not fully paid. */}
            {(children || []).filter((child) => child.lateFees > 0).map((child) => (
                <div key={`late-${child.student._id}`} role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 sm:flex-row sm:items-center">
                    <AlertTriangle className="shrink-0 text-rose-600" size={20} />
                    <div className="flex-1">
                        <p className="text-sm font-bold">{child.student.firstName}&apos;s school fees are late: ${Number(child.lateFees).toLocaleString()}</p>
                        <p className="text-xs">{(child.lateMonths || []).join(', ')} {child.lateMonths?.length === 1 ? 'was' : 'were'} due and not fully paid. Please pay at the school office.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate(`/parent/invoices?studentId=${child.student._id}`)}
                        className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700"
                    >
                        See fees
                    </button>
                </div>
            ))}

            {(children || []).length === 0 ? (
                <div className="phoenix-card p-6 text-center max-w-md mx-auto">
                    <AlertTriangle className="mx-auto text-amber-500 mb-4" size={36} />
                    <h3 className="text-lg font-bold text-slate-800 mb-1">No Linked Students</h3>
                    <p className="text-slate-500 text-sm">
                        There are currently no student accounts linked to your parent account. Please contact the school administration to bind your children's profiles.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(children || []).map(({ student, className, academicYear, outstandingFees, attendanceRate, attendedPeriods, missedPeriods, totalPeriods }) => (
                        <div 
                            key={student._id} 
                            className="phoenix-card p-5 group overflow-hidden relative flex flex-col justify-between"
                        >
                            {/* Decorative accent */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--primary)] opacity-[0.02] rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
                            
                            <div>
                                <div className="flex justify-between items-start mb-6 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-[var(--primary)] group-hover:text-white transition-all shadow-inner">
                                            <GraduationCap size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-slate-800 group-hover:text-[var(--primary)] transition-colors">
                                                {student.firstName} {student.lastName}
                                            </h3>
                                            <p className="text-xs font-semibold text-[#8a94ad]">
                                                Code: {student.studentCode} | Admission: {student.admissionNumber}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Class and Academic Info */}
                                <div className="grid grid-cols-2 gap-4 border-t border-[#f0f2f5] pt-4 mb-4">
                                    <div className="space-y-1">
                                        <span className="text-xs font-semibold text-[#8a94ad]">Class Section</span>
                                        <p className="font-bold text-slate-850">{className}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs font-semibold text-[#8a94ad]">School Year</span>
                                        <p className="font-semibold text-slate-550">{academicYear}</p>
                                    </div>
                                </div>

                                {/* Attendance and Fees info */}
                                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#f0f2f5] mb-6">
                                    <div className="space-y-1">
                                        <span className="text-xs font-semibold text-[#8a94ad]">Attendance</span>
                                        <p className="text-base font-bold text-emerald-500">{attendanceRate} <span className="text-[10px] font-semibold text-slate-400">of periods</span></p>
                                        <p className="mt-1 text-[10px] font-semibold text-slate-500">{attendedPeriods || 0} attended · {missedPeriods || 0} missed · {totalPeriods || 0} recorded</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs font-semibold text-[#8a94ad]">Outstanding Fees</span>
                                        <p className={`text-base font-bold ${outstandingFees > 0 ? 'text-rose-500' : 'text-[#141824]'}`}>
                                            ${(outstandingFees || 0).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Navigation triggers */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[#f0f2f5]">
                                <button 
                                    onClick={() => navigate(`/parent/grades?studentId=${student._id}`)}
                                    className="flex-1 h-9 bg-[#f5f7fa] border border-[#cbd0dd] hover:bg-[var(--primary)] text-[#525b75] hover:text-white rounded-lg transition-all font-semibold text-xs flex items-center justify-center gap-1.5"
                                >
                                    <span>View Grades</span>
                                    <ChevronRight size={12} />
                                </button>
                                <button 
                                    onClick={() => navigate(`/parent/attendance?studentId=${student._id}`)}
                                    className="flex-1 h-9 bg-[#f5f7fa] border border-[#cbd0dd] hover:bg-[var(--primary)] text-[#525b75] hover:text-white rounded-lg transition-all font-semibold text-xs flex items-center justify-center gap-1.5"
                                >
                                    <span>View Attendance</span>
                                    <ChevronRight size={12} />
                                </button>
                                <button 
                                    onClick={() => navigate(`/parent/invoices?studentId=${student._id}`)}
                                    className="flex-1 h-9 bg-[#f5f7fa] border border-[#cbd0dd] hover:bg-[var(--primary)] text-[#525b75] hover:text-white rounded-lg transition-all font-semibold text-xs flex items-center justify-center gap-1.5"
                                >
                                    <span>Fees Details</span>
                                    <ChevronRight size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ParentDashboard;
