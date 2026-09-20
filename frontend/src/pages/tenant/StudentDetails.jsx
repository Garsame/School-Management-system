import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import tenantService from '../../services/tenantService';
import EnrollmentHistory from '../../components/students/EnrollmentHistory';
import { Spinner } from '../../components/ui';

const TenantStudentDetails = () => {
    const { studentId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        tenantService.getStudent(studentId)
            .then((response) => setData(response.data))
            .catch((requestError) => setError(requestError.response?.data?.message || 'Student details could not be loaded.'))
            .finally(() => setLoading(false));
    }, [studentId]);

    if (loading) return <div className="flex h-72 items-center justify-center"><Spinner /></div>;
    if (!data?.student) return <div className="phoenix-card p-6 text-sm text-rose-700">{error || 'Student not found.'}</div>;
    const { student, enrollment, enrollments = [] } = data;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header"><div><Link to="/tenant/students" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#6e7891] hover:text-[var(--primary)]"><ArrowLeft size={14} /> Students</Link><h1 className="phoenix-page-title">{student.firstName} {student.lastName}</h1><p className="phoenix-page-subtitle">{student.admissionNumber} - {enrollment?.classId?.name || 'Not currently enrolled'}</p></div></div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <section className="phoenix-card p-5 lg:col-span-2"><h2 className="phoenix-section-title">Student record</h2><dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2"><div><dt className="text-xs text-[#8a94ad]">Status</dt><dd className="text-sm font-bold">{student.status}</dd></div><div><dt className="text-xs text-[#8a94ad]">Current branch</dt><dd className="text-sm font-bold">{enrollment?.branchId?.name || '-'}</dd></div><div><dt className="text-xs text-[#8a94ad]">Guardian</dt><dd className="text-sm font-bold">{student.guardianInfo?.name || '-'}</dd></div><div><dt className="text-xs text-[#8a94ad]">Guardian phone</dt><dd className="text-sm font-bold">{student.guardianInfo?.phone || '-'}</dd></div></dl></section>
                <section className="phoenix-card p-5"><h2 className="phoenix-section-title">Enrollment history</h2><div className="mt-4"><EnrollmentHistory enrollments={enrollments} /></div></section>
            </div>
        </div>
    );
};

export default TenantStudentDetails;
