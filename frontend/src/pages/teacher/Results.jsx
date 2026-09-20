import React, { useEffect, useMemo, useState } from 'react';
import { getClassResults, getExam, getTeacherAssignments } from '../../services/api/teacher.api';
import { Card, Select, Button, Table, Badge, Spinner } from '../../components/ui';
import { Search, Filter } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

const ResultsViewer = () => {
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [categories, setCategories] = useState([]);
    const [assignments, setAssignments] = useState([]);

    const [filters, setFilters] = useState({
        classId: searchParams.get('classId') || '',
        subjectId: searchParams.get('subjectId') || '',
        academicYearId: searchParams.get('academicYearId') || '',
        term: searchParams.get('term') || ''
    });

    const examId = searchParams.get('examId');

    useEffect(() => {
        const init = async () => {
            const assignmentData = await getTeacherAssignments();
            setAssignments(assignmentData?.data || assignmentData || []);
        };
        init();
    }, []);

    useEffect(() => {
        const hydrateFromExam = async () => {
            if (!examId) return;
            try {
                const examRes = await getExam(examId);
                const exam = examRes?.data || examRes;
                if (exam) {
                    setFilters({
                        classId: exam.classId?._id || exam.classId,
                        subjectId: exam.subjectId?._id || exam.subjectId,
                        academicYearId: exam.academicYearId?._id || exam.academicYearId,
                        term: exam.termId?._id || exam.termId || ''
                    });
                }
            } catch (error) {
                console.error(error);
            }
        };
        hydrateFromExam();
    }, [examId]);

    useEffect(() => {
        const shouldFetch = filters.classId && filters.subjectId && filters.academicYearId;
        if (!shouldFetch) {
            setRows([]);
            setCategories([]);
            return;
        }
        const fetchResults = async () => {
            setLoading(true);
            try {
                const data = await getClassResults(filters);
                const payload = data?.data || data || {};
                setCategories(payload.categories || []);
                setRows(payload.rows || []);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchResults();
    }, [filters]);

    const classOptions = useMemo(() => {
        const unique = new Map();
        (assignments || []).forEach(item => {
            if (item.classId?._id) unique.set(item.classId._id, item.classId);
        });
        return Array.from(unique.values()).map(c => ({ value: c?._id, label: `${c?.name || ''} (${c?.gradeLevel || ''})` }));
    }, [assignments]);

    const subjectOptions = useMemo(() => {
        return (assignments || [])
            .filter(a => !filters.classId || a.classId?._id === filters.classId)
            .map(a => ({ value: a.subjectId?._id, label: `${a.subjectId?.name || ''}` }));
    }, [assignments, filters.classId]);

    const yearOptions = useMemo(() => {
        const unique = new Map();
        (assignments || []).forEach(item => {
            if (item.academicYearId?._id) unique.set(item.academicYearId._id, item.academicYearId);
        });
        return Array.from(unique.values()).map(y => ({ value: y?._id, label: y?.name || '' }));
    }, [assignments]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Results Viewer</h1>
                    <p className="phoenix-page-subtitle">View results by class and subject</p>
                </div>
            </div>

            <div className="phoenix-card">
                <div className="phoenix-card-body">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <Select 
                            label="Academic Year"
                            options={yearOptions}
                            value={filters.academicYearId}
                            onChange={(e) => setFilters(prev => ({ ...prev, academicYearId: e.target.value }))}
                            placeholder="Select Year"
                        />
                        <Select 
                            label="Class"
                            options={classOptions}
                            value={filters.classId}
                            onChange={(e) => setFilters(prev => ({ ...prev, classId: e.target.value, subjectId: '' }))}
                            placeholder="Select Class"
                        />
                        <Select 
                            label="Subject"
                            options={subjectOptions}
                            value={filters.subjectId}
                            onChange={(e) => setFilters(prev => ({ ...prev, subjectId: e.target.value }))}
                            placeholder="Select Subject"
                        />
                        <div className="flex gap-2">
                            <Button variant="outline" className="w-full" onClick={() => setFilters({ ...filters })}>
                                <Search size={16} /> <span>Filter</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {!filters.classId || !filters.subjectId || !filters.academicYearId ? (
                <div className="phoenix-card">
                    <div className="phoenix-card-body text-center py-12">
                        <p className="text-slate-500 text-sm">Select academic year, class, and subject to view results.</p>
                    </div>
                </div>
            ) : loading ? (
                <div className="phoenix-card p-12 flex justify-center">
                    <Spinner size="lg" />
                </div>
            ) : (
                <div className="phoenix-card">
                    <div className="phoenix-card-body">
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table 
                                    headers={[
                                        'Student',
                                        ...(categories || []).map(c => `${c.categoryName || 'Category'} / ${c.maxScore || 100}`),
                                        'Percentage',
                                        'Total',
                                        'Grade'
                                    ]}
                                >
                                    {(rows || []).map((row) => (
                                        <tr key={row.student?.id} className="hover:bg-slate-50 transition-colors border-b border-[#e3e6ed]">
                                            <td className="px-4 py-3 font-semibold text-slate-700 text-sm">
                                                {row.student?.firstName} {row.student?.lastName}
                                                <div className="text-xs text-slate-400 font-mono font-normal">{row.student?.admissionNumber}</div>
                                            </td>
                                            {(row.categoryMarks || []).map((mark, idx) => (
                                                <td key={`${row.student?.id}-${idx}`} className="px-4 py-3 text-center font-mono text-slate-600 text-sm">
                                                    {mark.marksObtained}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 text-center font-mono text-slate-500 text-sm">
                                                {row.percentage}%
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono text-slate-600 text-sm">
                                                {row.totalMarks} / {row.totalMax}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant={row.status === 'PASS' ? 'success' : 'danger'}>
                                                    {row.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                    {(rows || []).length === 0 && (
                                        <tr>
                                            <td colSpan={(categories || []).length + 4} className="px-4 py-8 text-center text-slate-400 italic text-sm">
                                                No results found for this class/subject/year.
                                            </td>
                                        </tr>
                                    )}
                                </Table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResultsViewer;
