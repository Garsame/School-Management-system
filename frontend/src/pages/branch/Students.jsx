import React, { useCallback, useEffect, useState } from 'react';
import { getStudents, getClasses, getAcademicYears, getSections } from '../../services/api/branch.api';
import { Table, Spinner, Toast, Badge, Select, Input } from '../../components/ui';
import { Eye, Info, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

const Students = () => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [classes, setClasses] = useState([]);
    const [years, setYears] = useState([]);
    const [sections, setSections] = useState([]);
    const [filters, setFilters] = useState({ classId: '', sectionId: '', academicYearId: '', status: '', q: '' });
    const [toast, setToast] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [studentRes, classRes, yearRes] = await Promise.all([
                getStudents(filters),
                getClasses(),
                getAcademicYears()
            ]);
            setStudents(studentRes?.data || studentRes || []);
            setClasses(classRes?.data || classRes || []);
            setYears(yearRes?.data || yearRes || []);
        } catch {
            setToast({ type: 'error', message: 'Failed to load data' });
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        if (!filters.classId) {
            setSections([]);
            return;
        }
        getSections(filters.classId).then((response) => setSections(response?.data || response || [])).catch(() => setSections([]));
    }, [filters.classId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]); // Re-fetch when filters change

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value, ...(key === 'classId' ? { sectionId: '' } : {}) }));
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Student Directory</h1>
                    <p className="phoenix-page-subtitle">Browse student rosters, classes, and registration status.</p>
                </div>
            </div>

            <div className="p-3 bg-[#eaf0ff] rounded border border-[#cbd0dd] flex gap-2.5 items-start">
                <Info className="text-[#3874ff] mt-0.5 shrink-0" size={16} />
                <p className="text-xs font-semibold text-[#141824] leading-relaxed uppercase tracking-wider">
                    Student admission and profile editing are handled by the Registrar.
                </p>
            </div>

            <article className="phoenix-card p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-end">
                    <Select 
                        label="Filter by Class"
                        options={classes.map(c => ({ value: c._id, label: c.name }))}
                        value={filters.classId}
                        onChange={e => handleFilterChange('classId', e.target.value)}
                        placeholder="All Classes"
                        className="!h-10 text-xs"
                    />

                    <Select label="Section" options={sections.map(s => ({ value: s._id, label: s.name }))} value={filters.sectionId} onChange={e => handleFilterChange('sectionId', e.target.value)} placeholder="All Sections" disabled={!filters.classId} className="!h-10 text-xs" />

                    <Select label="Academic Year" options={years.map(y => ({ value: y._id, label: y.name }))} value={filters.academicYearId} onChange={e => handleFilterChange('academicYearId', e.target.value)} placeholder="All Academic Years" className="!h-10 text-xs" />
                    
                    <Select 
                        label="Status"
                        options={[
                            { value: 'Active', label: 'Active' },
                            { value: 'Inactive', label: 'Inactive' },
                            { value: 'Transferred', label: 'Transferred' },
                            { value: 'Graduated', label: 'Graduated' },
                            { value: 'Left', label: 'Left the school' }
                        ]}
                        value={filters.status}
                        onChange={e => handleFilterChange('status', e.target.value)}
                        placeholder="All Statuses"
                        className="!h-10 text-xs"
                    />

                    <Input
                        label="Search"
                        placeholder="Student, parent, or admission number..."
                        value={filters.q}
                        onChange={e => handleFilterChange('q', e.target.value)}
                        icon={<Search size={16} />}
                        className="!h-10 text-xs"
                    />
                </div>
            </article>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {loading ? <Spinner /> : (
                <div className="phoenix-table-shell">
                    <div className="overflow-x-auto">
                        <Table headers={['Adm. No.', 'Name', 'Current class', 'Academic year', 'Status', 'Guardian', 'Phone', '']}>
                            {students.map(std => {
                                const enrollment = std.currentEnrollment || std.latestEnrollment;
                                return (
                                <tr key={std._id}>
                                    <td className="px-4 py-3 font-mono text-xs font-bold text-[#6e7891]">{std.admissionNumber}</td>
                                    <td className="px-4 py-3 font-bold text-[#141824]">{std.firstName} {std.lastName}</td>
                                    <td className="px-4 py-3 text-[#525b75]">{enrollment?.classId?.name || '-'}{enrollment?.sectionId?.name ? ` · ${enrollment.sectionId.name}` : ''}</td>
                                    <td className="px-4 py-3 text-[#525b75]">{enrollment?.academicYearId?.name || '-'}</td>
                                    <td className="px-4 py-3">
                                        <Badge variant={std.status === 'Active' ? 'success' : 'default'}>
                                            {std.status}
                                        </Badge>
                                    </td>
                                     <td className="px-4 py-3 text-[#525b75]">{std.guardianInfo?.name || '-'}</td>
                                     <td className="px-4 py-3 text-[#525b75] font-mono text-xs">{std.guardianInfo?.phone || '-'}</td>
                                     <td className="px-4 py-3 text-right">
                                        <Link title="View student history" to={`/branch/students/${std._id}`} className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#cbd0dd] text-[#6e7891] hover:border-[var(--primary)] hover:text-[var(--primary)]">
                                            <Eye size={15} />
                                        </Link>
                                     </td>
                                </tr>
                            );})}
                            {students.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="text-center py-6 text-[#8a94ad]">No student records found.</td>
                                </tr>
                            )}
                        </Table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Students;
