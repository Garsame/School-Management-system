import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Eye, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import tenantService from '../../services/tenantService';
import { Input, Select, Spinner, Table } from '../../components/ui';

const TenantStudents = () => {
    const [students, setStudents] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ branchId: '', status: '', q: '' });

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [studentsResponse, branchesResponse] = await Promise.all([
                tenantService.getStudents(filters),
                tenantService.getBranches()
            ]);
            setStudents(studentsResponse.data || []);
            setBranches(branchesResponse.data || []);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to load students.');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        const timer = setTimeout(load, 300);
        return () => clearTimeout(timer);
    }, [load]);

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header"><div><h1 className="phoenix-page-title">Students</h1><p className="phoenix-page-subtitle">Current placement and complete class history across branches.</p></div></div>
            <section className="phoenix-card p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Select label="Branch" placeholder="All branches" value={filters.branchId} onChange={(event) => setFilters((current) => ({ ...current, branchId: event.target.value }))} options={branches.map((branch) => ({ value: branch._id, label: branch.name }))} />
                    <Select label="Status" placeholder="All statuses" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} options={['Active', 'Graduated', 'Inactive', 'Transferred'].map((status) => ({ value: status, label: status }))} />
                    <Input label="Search" icon={<Search size={16} />} value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Name or admission number" />
                </div>
            </section>
            {error && <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"><AlertCircle size={17} />{error}</div>}
            {loading ? <Spinner /> : !error && (
                <div className="phoenix-table-shell overflow-x-auto">
                    <Table headers={['Admission', 'Student', 'Status', 'Branch', 'Current class', 'Year', '']}>
                        {students.map((student) => {
                            const placement = student.currentEnrollment || student.latestEnrollment;
                            return <tr key={student._id}>
                                <td className="px-4 py-3 font-mono text-xs font-bold">{student.admissionNumber}</td>
                                <td className="px-4 py-3 text-sm font-bold">{student.firstName} {student.lastName}</td>
                                <td className="px-4 py-3 text-sm"><span className={`phoenix-status ${student.status === 'Graduated' ? 'phoenix-status-success' : student.status === 'Active' ? 'phoenix-status-info' : 'phoenix-status-muted'}`}>{student.status || 'Active'}</span></td>
                                <td className="px-4 py-3 text-sm">{placement?.branchId?.name || '-'}</td>
                                <td className="px-4 py-3 text-sm">{placement?.classId?.name || '-'}</td>
                                <td className="px-4 py-3 text-sm">
                                    <span>{placement?.academicYearId?.name || '-'}</span>
                                    {!student.currentEnrollment && placement && <span className="mt-0.5 block text-[11px] text-[#8a94ad]">Last academic year</span>}
                                </td>
                                <td className="px-4 py-3 text-right"><Link title="View student history" to={`/tenant/students/${student._id}`} className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#cbd0dd] text-[#6e7891] hover:border-[var(--primary)] hover:text-[var(--primary)]"><Eye size={15} /></Link></td>
                            </tr>;
                        })}
                    </Table>
                </div>
            )}
        </div>
    );
};

export default TenantStudents;
