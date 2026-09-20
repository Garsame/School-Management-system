import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../components/ui';
import { apiGetStudentProfile } from '../../services/api/student.api';
import { User, Phone, Mail, Calendar, Heart, Shield, GraduationCap, CheckCircle2, Lock } from 'lucide-react';
import EnrollmentHistory from '../../components/students/EnrollmentHistory';

const statusStyle = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'active' || s === 'current') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'transferred') return 'bg-amber-50 text-amber-700 border-amber-250';
    if (s === 'graduated') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'inactive' || s === 'withdrawn') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-slate-50 text-slate-500 border-slate-200';
};

const StudentProfile = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await apiGetStudentProfile();
                setData(res.data || null);
            } catch (err) {
                console.error(err);
                setError(err.response?.data?.message || 'Failed to load profile. Please try again.');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    if (loading) return <div className="flex h-96 items-center justify-center"><Spinner size="lg" /></div>;

    if (error) {
        return (
            <div className="mt-12 text-center space-y-4">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto">
                    <User size={32} />
                </div>
                <h2 className="text-xl font-bold text-[#141824]">Profile unavailable</h2>
                <p className="text-sm text-[#8a94ad]">{error}</p>
            </div>
        );
    }

    const student = data?.student || null;
    const enrollment = data?.enrollment || null;

    if (!student) {
        return (
            <div className="mt-12 text-center space-y-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto">
                    <User size={32} />
                </div>
                <h2 className="text-xl font-bold text-[#141824]">No profile found</h2>
                <p className="text-sm text-[#8a94ad]">Your student record could not be loaded. Please contact the registrar.</p>
            </div>
        );
    }

    const firstName = student.firstName || '';
    const lastName = student.lastName || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Student';
    const avatarLetter = firstName.charAt(0).toUpperCase() || '?';

    const formatStatus = (status) => {
        if (!status) return '';
        return status.charAt(0) + status.slice(1).toLowerCase();
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Personal Profile</h1>
                    <p className="phoenix-page-subtitle">Your personal, academic and guardian information details.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 text-xs font-semibold flex items-center gap-1.5">
                        <Shield size={14} className="text-emerald-600" />
                        Verified student
                    </span>
                    <Link
                        to="/student/change-password"
                        className="px-3 py-1.5 bg-white border border-[#cbd0dd] text-[#525b75] hover:text-[var(--primary)] hover:border-[var(--primary)] rounded text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                        <Lock size={14} />
                        Change password
                    </Link>
                </div>
            </div>

            <div className="phoenix-card overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-[var(--primary)] to-blue-900 relative"></div>

                <div className="px-6 pb-6">
                    <div className="relative flex flex-col md:flex-row items-end gap-6 -mt-12 mb-6">
                        <div className="w-24 h-24 rounded-lg bg-white p-1 shadow relative shrink-0">
                            <div className="w-full h-full rounded bg-slate-100 flex items-center justify-center text-[var(--primary)] text-3xl font-bold border-2 border-white">
                                {avatarLetter}
                            </div>
                            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-white shadow">
                                <CheckCircle2 size={14} />
                            </div>
                        </div>
                        <div className="flex-1 pb-2 text-center md:text-left">
                            <h2 className="text-2xl font-bold text-[#141824]">{fullName}</h2>
                            <p className="text-sm text-[#8a94ad] font-semibold mt-1">
                                {student.studentCode || student.admissionNumber || '—'} • {enrollment?.classId?.name || 'No Class'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-[#e3e6ed]">
                        <section className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <User size={14} /> Personal info
                                </h3>
                                <div className="space-y-4">
                                    <InfoItem
                                        icon={Calendar}
                                        label="Date of birth"
                                        value={student.DOB ? new Date(student.DOB).toLocaleDateString() : '—'}
                                    />
                                    <InfoItem icon={User} label="Gender" value={student.gender || '—'} />
                                    <InfoItem
                                        icon={GraduationCap}
                                        label="Admission date"
                                        value={student.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—'}
                                    />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Heart size={14} /> Guardian details
                                </h3>
                                <div className="space-y-4">
                                    <InfoItem icon={User} label="Guardian name" value={student.guardianInfo?.name || '—'} />
                                    <InfoItem icon={Phone} label="Contact" value={student.guardianInfo?.phone || '—'} />
                                    <InfoItem icon={Mail} label="Email" value={student.guardianInfo?.email || '—'} />
                                </div>
                            </div>
                        </section>

                        <section className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Shield size={14} /> Academic status
                                </h3>
                                <div className="p-6 bg-slate-50 rounded-lg border border-[#e3e6ed] relative overflow-hidden group">
                                    <div className="relative z-10">
                                        <p className="text-[10px] font-semibold text-[#8a94ad] uppercase tracking-wider mb-1">Current enrollment</p>
                                        <p className="text-xl font-bold text-[#141824]">{enrollment?.classId?.name || 'Not enrolled'}</p>
                                        <div className="mt-4 flex items-center gap-2 flex-wrap">
                                            {enrollment?.academicYearId?.name && (
                                                <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-150 text-indigo-700 rounded text-[10px] font-semibold">
                                                    {enrollment.academicYearId.name}
                                                </span>
                                            )}
                                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border ${statusStyle(enrollment?.status)}`}>
                                                {formatStatus(enrollment?.status) || 'No active enrollment'}
                                            </span>
                                        </div>
                                    </div>
                                    <GraduationCap size={96} className="absolute -right-6 -bottom-6 text-slate-200/50 group-hover:scale-105 transition-transform duration-300" />
                                </div>
                            </div>

                            <div className="p-6 bg-[#f5f7fa] border border-[#cbd0dd] rounded-lg">
                                <h4 className="font-bold text-[#141824] mb-1">Need corrections?</h4>
                                <p className="text-xs text-[#525b75] font-medium leading-relaxed mb-4">
                                    If you notice any errors in your profile, please contact the school registrar.
                                </p>
                                <Link
                                    to="/student/change-password"
                                    className="inline-flex items-center gap-1.5 bg-white border border-[#cbd0dd] hover:text-[var(--primary)] hover:border-[var(--primary)] text-[#525b75] text-xs font-bold px-3 py-1.5 rounded transition-colors"
                                >
                                    <Lock size={14} /> Change password
                                </Link>
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            <section className="phoenix-card p-6">
                <h2 className="phoenix-section-title">Class history</h2>
                <p className="mt-1 text-xs text-[#8a94ad]">Current and previous academic-year placements.</p>
                <div className="mt-5">
                    <EnrollmentHistory enrollments={data?.enrollments || []} />
                </div>
            </section>
        </div>
    );
};

const InfoItem = ({ icon, label, value }) => {
    return (
        <div className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded bg-[#f5f7fa] text-[#8a94ad] flex items-center justify-center group-hover:bg-[var(--primary)]/5 group-hover:text-[var(--primary)] transition-all">
                {React.createElement(icon, { size: 16 })}
            </div>
            <div>
                <p className="text-[10px] font-semibold text-[#8a94ad] leading-none mb-1">{label}</p>
                <p className="text-xs font-bold text-[#525b75]">{value || '—'}</p>
            </div>
        </div>
    );
};

export default StudentProfile;
