import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getClassResults, getClasses, getSubjects, getCurrentAcademicYear } from '../../services/api/branch.api';
import { Table, Spinner, Badge, Select, Button } from '../../components/ui';
import { FileSearch, Users, Target, Download } from 'lucide-react';

const Results = () => {
    const [searchParams] = useSearchParams();
    const [results, setResults] = useState([]);
    const [categories, setCategories] = useState([]);
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [currentYear, setCurrentYear] = useState(null);
    const [loading, setLoading] = useState(false);
    
    const [filters, setFilters] = useState({
        academicYearId: searchParams.get('academicYearId') || '',
        classId: searchParams.get('classId') || '',
        subjectId: searchParams.get('subjectId') || '',
        term: searchParams.get('term') || ''
    });

    useEffect(() => {
        const loadMeta = async () => {
            try {
                const [classRes, subjectRes, yearRes] = await Promise.all([
                    getClasses(),
                    getSubjects(),
                    getCurrentAcademicYear()
                ]);
                setClasses(classRes?.data || classRes || []);
                setSubjects(subjectRes?.data || subjectRes || []);
                setCurrentYear(yearRes?.data || yearRes || null);
                const yearId = yearRes?.data?._id || yearRes?._id;
                if (yearId) {
                    setFilters(prev => prev.academicYearId ? prev : ({ ...prev, academicYearId: yearId }));
                }
            } catch (err) {
                console.error(err);
            }
        };
        loadMeta();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            if (!filters.classId || !filters.subjectId || !filters.academicYearId) {
                setResults([]);
                setCategories([]);
                return;
            }
            setLoading(true);
            try {
                const resData = await getClassResults(filters);
                const payload = resData?.data || resData;
                setResults(payload.rows || []);
                setCategories(payload.categories || []);
            } catch (err) {
                console.error("Fetch Results Error", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [filters]);

    const subjectOptions = useMemo(() => {
        return subjects;
    }, [subjects]);

    const handleExport = () => {
        if (results.length === 0) return;
        const headers = [
            'Student',
            'Admission Number',
            ...categories.map((category) => category.categoryName || 'Assessment'),
            'Percentage',
            'Total',
            'Status'
        ];
        const rows = results.map((row) => [
            [row.student?.firstName, row.student?.middleName, row.student?.lastName].filter(Boolean).join(' ').trim(),
            row.student?.admissionNumber || '',
            ...(row.categoryMarks || []).map((mark) => mark.marksObtained ?? ''),
            row.percentage ?? '',
            `${row.totalMarks ?? 0}/${row.totalMax ?? 0}`,
            row.status || ''
        ]);
        const csv = [headers, ...rows]
            .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
            .join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'class-results.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Result Analytics</h1>
                    <p className="phoenix-page-subtitle">Comprehensive oversight of institutional academic performance.</p>
                </div>
                <Button
                    onClick={handleExport}
                    disabled={results.length === 0}
                    className="flex items-center gap-2 !h-9 text-xs"
                    variant="primary"
                >
                    <Download size={14} />
                    Export Batch Ledger
                </Button>
            </div>

            {/* Filter Terminal */}
            <article className="phoenix-card p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <Select 
                        label="Academic Year"
                        options={currentYear ? [{ value: currentYear._id, label: currentYear.name }] : []}
                        value={filters.academicYearId}
                        onChange={e => setFilters(prev => ({ ...prev, academicYearId: e.target.value }))}
                        placeholder="Select Year"
                        className="!h-10 text-xs"
                    />

                    <Select 
                        label="Academic Scope (Class)"
                        options={classes.map(c => ({ value: c._id, label: c.name }))}
                        value={filters.classId}
                        onChange={e => setFilters(prev => ({ ...prev, classId: e.target.value }))}
                        placeholder="All Classes"
                        className="!h-10 text-xs"
                    />

                    <Select 
                        label="Subject"
                        options={subjectOptions.map(s => ({ value: s._id, label: s.name }))}
                        value={filters.subjectId}
                        onChange={e => setFilters(prev => ({ ...prev, subjectId: e.target.value }))}
                        placeholder="Select Subject"
                        className="!h-10 text-xs"
                    />
                </div>
            </article>

            {loading ? (
                <div className="flex justify-center p-10"><Spinner /></div>
            ) : (
                <div className="space-y-4">
                    {(filters.classId && filters.subjectId && results.length > 0) ? (
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Learner', ...categories.map(c => `${c.categoryName || 'Category'} (${c.maxScore || 100} pts)`), 'Percentage', 'Total', 'Rank', 'Status']}>
                                    {results.map(row => (
                                        <tr key={row.student?.id || row.student?._id}>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[#141824]">
                                                    {[row.student?.firstName, row.student?.middleName, row.student?.lastName].filter(Boolean).join(' ')}
                                                </div>
                                                <div className="text-[10px] font-semibold text-[#8a94ad] uppercase font-mono mt-0.5">ID: {row.student?.admissionNumber}</div>
                                            </td>
                                            {(row.categoryMarks || []).map((mark, idx) => (
                                                <td key={idx} className="px-4 py-3 font-mono text-[#6e7891]">
                                                    {mark.marksObtained}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 font-mono text-[#525b75]">{row.percentage}%</td>
                                            <td className="px-4 py-3 font-mono text-[#525b75]">{row.totalMarks} / {row.totalMax}</td>
                                            <td className="px-4 py-3 font-bold text-[#141824]">{row.rank || '-'}</td>
                                            <td className="px-4 py-3">
                                                <Badge variant={row.status === 'PASS' ? 'success' : 'danger'}>
                                                    {row.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </Table>
                            </div>
                        </div>
                    ) : (
                        <div className="phoenix-card p-8 text-center border-dashed border border-[#e3e6ed] bg-white">
                            <div className="flex flex-col items-center gap-4 opacity-75">
                                {filters.classId && filters.subjectId ? (
                                    <>
                                        <Users size={32} className="text-[#cbd0dd]" />
                                        <p className="text-sm font-bold text-[#525b75] uppercase tracking-wider">No results for this class/subject.</p>
                                    </>
                                ) : (
                                    <>
                                        <Target size={32} className="text-[#cbd0dd]" />
                                        <p className="text-sm font-bold text-[#525b75] uppercase tracking-wider">Select year, class, and subject parameters to load ledger.</p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Results;
