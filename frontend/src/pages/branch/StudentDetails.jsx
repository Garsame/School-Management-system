import React, { useEffect, useState } from 'react';
import { ArrowLeft, GraduationCap, Phone, User } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { getStudent } from '../../services/api/branch.api';
import { Spinner } from '../../components/ui';
import EnrollmentHistory from '../../components/students/EnrollmentHistory';

const BranchStudentDetails = () => {
    const { studentId } = useParams();
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        getStudent(studentId)
            .then((response) => setStudent(response?.data || response))
            .catch((requestError) => setError(requestError.response?.data?.message || 'Student details could not be loaded.'))
            .finally(() => setLoading(false));
    }, [studentId]);

    if (loading) return <div className="flex h-72 items-center justify-center"><Spinner /></div>;
    if (!student) return <div className="phoenix-card p-6 text-sm text-rose-700">{error || 'Student not found.'}</div>;

    const current = (student.enrollments || []).find((item) => ['Current', 'Active', 'active'].includes(item.status));

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <Link to="/branch/students" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#6e7891] hover:text-[var(--primary)]">
                        <ArrowLeft size={14} /> Students
                    </Link>
                    <h1 className="phoenix-page-title">{student.firstName} {student.lastName}</h1>
                    <p className="phoenix-page-subtitle">{student.admissionNumber}</p>
                </div>
            </div>

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
                    <h2 className="phoenix-section-title">Enrollment history</h2>
                    <div className="mt-4"><EnrollmentHistory enrollments={student.enrollments || []} /></div>
                </section>
            </div>
        </div>
    );
};

export default BranchStudentDetails;
