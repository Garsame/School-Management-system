import React, { useCallback, useEffect, useState } from 'react';
import { getRegistrarStats, getCurrentAcademicYear } from '../../services/api/registrar.api';
import { Spinner } from '../../components/ui';
import { Users, BookOpen, UserPlus, Clock, ArrowLeftRight, GraduationCap, CalendarDays } from 'lucide-react';

const MetricCard = ({ label, value, icon, tone }) => {
    const tones = {
        blue: { icon: 'text-[#3874ff]', bg: 'bg-[#eaf0ff]' },
        emerald: { icon: 'text-[#168403]', bg: 'bg-[#e9f7e7]' },
        rose: { icon: 'text-[#e63757]', bg: 'bg-[#fdebef]' },
        amber: { icon: 'text-[#e5780b]', bg: 'bg-[#fff2df]' },
        purple: { icon: 'text-[#8c52ff]', bg: 'bg-[#f3eaff]' },
        slate: { icon: 'text-[#626e82]', bg: 'bg-[#f5f7fa]' }
    };
    const palette = tones[tone] || tones.blue;
    return (
        <article className="phoenix-card flex min-h-[112px] items-center gap-4 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${palette.bg} ${palette.icon}`}>
                {React.createElement(icon, { size: 19 })}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#6e7891]">{label}</p>
                <p className="mt-1 text-xl font-bold text-[#141824]">{value}</p>
            </div>
        </article>
    );
};

const Dashboard = () => {
    const [stats, setStats] = useState({
        totalStudents: 0,
        activeStudents: 0,
        inactiveStudents: 0,
        transferredStudents: 0,
        graduatedStudents: 0,
        newAdmissionsThisMonth: 0,
        currentYearEnrollments: 0
    });
    const [currentYear, setCurrentYear] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [yearResult, statsResult] = await Promise.allSettled([
                getCurrentAcademicYear(),
                getRegistrarStats()
            ]);
            if (statsResult.status === 'rejected') throw statsResult.reason;
            const statsRes = statsResult.value;
            if (yearResult.status === 'fulfilled') {
                const yearRes = yearResult.value;
                setCurrentYear(yearRes.data?.data || yearRes.data);
            } else {
                setCurrentYear(null);
            }

            const s = statsRes.data?.data || statsRes.data || {};
            setStats({
                totalStudents: s.totalStudents || 0,
                activeStudents: s.activeStudents || 0,
                inactiveStudents: s.inactiveStudents || 0,
                transferredStudents: s.transferredStudents || 0,
                graduatedStudents: s.graduatedStudents || 0,
                newAdmissionsThisMonth: s.newAdmissionsThisMonth || 0,
                currentYearEnrollments: s.currentYearEnrollments || 0
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Could not load registrar dashboard data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    if (loading) return <div className="h-96 flex items-center justify-center"><Spinner size="lg" /></div>;

    if (error) return (
        <div className="phoenix-card p-8 text-center">
            <h1 className="text-lg font-bold text-[#141824]">Registrar dashboard unavailable</h1>
            <p className="mt-2 text-sm text-rose-700">{error}</p>
            <button type="button" onClick={loadDashboard} className="phoenix-primary-button mt-5">Retry</button>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Registrar Dashboard</h1>
                    <p className="phoenix-page-subtitle">Overview of branch-level student enrollment and statistics.</p>
                </div>
                <div className="bg-white px-3 py-1.5 rounded border border-[#e3e6ed] flex items-center gap-2 max-w-max text-xs">
                    <CalendarDays size={14} className="text-[#8a94ad]" />
                    <span className="font-bold text-[#6e7891]">Academic Year:</span>
                    <span className="font-black text-[var(--primary)]">{currentYear?.name || currentYear?.data?.name || '...'}</span>
                </div>
            </div>

            {!currentYear && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    No active academic year is configured. Admission and re-enrollment actions are unavailable.
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                 <MetricCard 
                    label="Total Students" 
                    value={stats.totalStudents}
                    icon={Users}
                    tone="blue"
                 />
                 <MetricCard 
                    label="Active Students" 
                    value={stats.activeStudents}
                    icon={BookOpen}
                    tone="emerald"
                 />
                 <MetricCard 
                    label="New Admissions (Month)" 
                    value={stats.newAdmissionsThisMonth}
                    icon={CalendarDays}
                    tone="blue"
                 />
                 <MetricCard 
                    label="Transferred Students" 
                    value={stats.transferredStudents}
                    icon={ArrowLeftRight}
                    tone="amber"
                 />
                 <MetricCard 
                    label="Graduated Students" 
                    value={stats.graduatedStudents}
                    icon={GraduationCap}
                    tone="purple"
                 />
                 <MetricCard 
                    label="Inactive Students" 
                    value={stats.inactiveStudents}
                    icon={Clock}
                    tone="slate"
                 />
            </div>

            <div className="flex gap-4">
                <button 
                    onClick={() => window.location.href='/registrar/admissions'}
                    className="flex-1 p-6 phoenix-card flex flex-col justify-center items-center text-center hover:shadow-lg transition cursor-pointer border border-dashed border-[#cbd0dd] bg-white group animate-fade-in"
                >
                    <div className="h-12 w-12 bg-[var(--primary)]/10 text-[var(--primary)] rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <UserPlus size={24} />
                    </div>
                    <h3 className="font-bold text-lg text-[#141824]">New Admission</h3>
                    <p className="text-sm text-[#6e7891]">Register a new student in the system</p>
                </button>
            </div>
        </div>
    );
};

export default Dashboard;
