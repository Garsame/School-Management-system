import React, { useState, useEffect } from 'react';
import { Spinner, Badge, Table, Button } from '../../components/ui';
import { FileText, AlertCircle, Printer } from 'lucide-react';
import { apiGetStudentAcademicYears, apiGetStudentExams, apiGetStudentResultsBy } from '../../services/api/student.api';
import { documentHeader, downloadHtmlDocument, escapeHtml, formatPrintDate, printHtmlDocument, signatureBlock } from '../../utils/printDocument';
import { useBranding } from '../../context/BrandingContext';

const statusVariant = (status) => {
    if (status === 'PASS') return 'success';
    if (status === 'FAIL') return 'danger';
    return 'default';
};

const StudentResults = () => {
    const [loading, setLoading] = useState(true);
    const [subjects, setSubjects] = useState([]);
    const [overall, setOverall] = useState(null);
    const [academicYears, setAcademicYears] = useState([]);
    const [selectedYearId, setSelectedYearId] = useState('');
    const [exams, setExams] = useState([]);
    const [selectedExamId, setSelectedExamId] = useState('');
    const [error, setError] = useState('');
    const { branding } = useBranding();

    useEffect(() => {
        const fetchYears = async () => {
            try {
                const yearsRes = await apiGetStudentAcademicYears();
                const yearsPayload = yearsRes.data || yearsRes || [];
                setAcademicYears(yearsPayload);
                if (yearsPayload.length) {
                    const current = yearsPayload.find((year) => year.isCurrent);
                    setSelectedYearId((current || yearsPayload[0])._id);
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                setError(err.response?.data?.message || 'Failed to load academic years.');
                setLoading(false);
            }
        };
        fetchYears();
    }, []);

    useEffect(() => {
        if (!selectedYearId) return;
        apiGetStudentExams({ schoolYearId: selectedYearId }).then(res => setExams(res.data || res || [])).catch(() => setExams([]));
        setSelectedExamId('');
    }, [selectedYearId]);

    useEffect(() => {
        if (!selectedYearId) return;
        const fetchResults = async () => {
            try {
                setLoading(true);
                setError('');
                const data = await apiGetStudentResultsBy({ schoolYearId: selectedYearId, examId: selectedExamId || undefined });
                const payload = data.data || data;
                setSubjects(payload.subjects || []);
                setOverall(payload.overall || null);
            } catch (err) {
                console.error(err);
                setError(err.response?.data?.message || 'Failed to load results. Please try again.');
                setSubjects([]);
                setOverall(null);
            } finally {
                setLoading(false);
            }
        };
        fetchResults();
    }, [selectedYearId, selectedExamId]);

    const gradedSubjects = (subjects || []).filter(s => s.status !== 'NOT_GRADED');

    const categoryHeaders = (() => {
        const map = new Map();
        (gradedSubjects || []).forEach(subject => {
            (subject.categories || []).forEach(cat => {
                const key = cat.categoryId?.toString() || cat.categoryName;
                if (key && !map.has(key)) {
                    map.set(key, {
                        id: key,
                        name: cat.categoryName || 'Category',
                        maxScore: cat.maxScore || 0
                    });
                }
            });
        });
        return Array.from(map.values());
    })();

    const buildReportCardBody = () => {
        const selectedYear = academicYears.find((year) => year._id === selectedYearId);
        const rows = gradedSubjects.map((subject) => `
            <tr>
                <td>${escapeHtml(subject.subjectName)}</td>
                ${(categoryHeaders || []).map((header) => {
                    const match = (subject.categories || []).find(cat => (cat.categoryId?.toString() || cat.categoryName) === header.id);
                    return `<td>${escapeHtml(match ? match.marksObtained : 0)}</td>`;
                }).join('')}
                <td>${escapeHtml(`${subject.percentage}%`)}</td>
                <td>${escapeHtml(`${subject.totalMarks} / ${subject.totalMax}`)}</td>
                <td>${escapeHtml(subject.status)}</td>
            </tr>
        `).join('');
        return `
            <div class="doc">
                ${documentHeader({
                    schoolName: branding?.tenantName || branding?.name || 'School',
                    logoUrl: branding?.logoUrl,
                    title: 'Student Report Card',
                    subtitle: selectedYear?.name || ''
                })}
                <div class="summary">
                    <div class="box"><div class="label">Total</div><div class="value">${escapeHtml(`${overall?.totalMarks ?? 0} / ${overall?.totalMax ?? 0}`)}</div></div>
                    <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(overall?.overallStatus || 'N/A')}</div></div>
                    <div class="box"><div class="label">Academic Year</div><div class="value">${escapeHtml(selectedYear?.name || 'N/A')}</div></div>
                    <div class="box"><div class="label">Printed</div><div class="value">${escapeHtml(formatPrintDate(new Date()))}</div></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Subject</th>
                            ${(categoryHeaders || []).map(h => `<th>${escapeHtml(h.name)} / ${escapeHtml(h.maxScore)}</th>`).join('')}
                            <th>Percentage</th>
                            <th>Total</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                ${signatureBlock()}
                <div class="footer"><span>Generated from the student portal.</span><span>${escapeHtml(formatPrintDate(new Date()))}</span></div>
            </div>`;
    };

    const handlePrint = () => {
        printHtmlDocument({
            title: 'Student Report Card',
            body: buildReportCardBody(),
            primaryColor: branding?.primaryColor,
            secondaryColor: branding?.secondaryColor
        });
    };

    const handleDownload = () => {
        downloadHtmlDocument({
            title: 'Student Report Card',
            filename: 'student-report-card',
            body: buildReportCardBody(),
            primaryColor: branding?.primaryColor,
            secondaryColor: branding?.secondaryColor
        });
    };

    if (loading) return <div className="h-64 flex items-center justify-center"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Results</h1>
                    <p className="phoenix-page-subtitle">Subject-wise performance summary</p>
                </div>
                {(academicYears || []).length > 0 && (
                    <div className="flex items-center gap-2">
                        {gradedSubjects.length > 0 && (
                            <Button variant="outline" size="sm" className="!h-9 text-xs" onClick={handlePrint}>
                                <Printer size={14} />
                                Print
                            </Button>
                        )}
                        {gradedSubjects.length > 0 && (
                            <Button variant="outline" size="sm" className="!h-9 text-xs" onClick={handleDownload}>
                                Download
                            </Button>
                        )}
                        <select
                            className="rounded-lg border border-[#cbd0dd] bg-white px-3 py-1.5 text-xs font-bold text-[#525b75] outline-none"
                            value={selectedYearId}
                            onChange={(e) => setSelectedYearId(e.target.value)}
                        >
                            {(academicYears || []).map((year) => (
                                <option key={year._id} value={year._id}>
                                    {year.name}
                                </option>
                            ))}
                        </select>
                        <select aria-label="Filter by exam" className="rounded-lg border border-[#cbd0dd] bg-white px-3 py-1.5 text-xs font-bold text-[#525b75] outline-none" value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}>
                            <option value="">All exams</option>{exams.map(exam => <option key={exam._id} value={exam._id}>{exam.name || exam.examCategoryId?.name || 'Exam'} — {exam.subjectId?.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-lg">
                    <AlertCircle size={20} className="shrink-0" />
                    <span className="text-sm font-semibold">{error}</span>
                    <button
                        className="ml-auto text-xs underline font-bold"
                        onClick={() => setSelectedYearId(prev => prev)}
                    >
                        Retry
                    </button>
                </div>
            )}

            {!error && (subjects || []).length === 0 ? (
                <div className="p-12 text-center bg-white rounded-lg border border-[#cbd0dd] phoenix-card">
                    <div className="phoenix-card-body flex flex-col items-center">
                        <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                        <h3 className="text-lg font-bold text-[#141824]">No results yet</h3>
                        <p className="text-sm text-[#8a94ad] mt-1">Your results will appear here after grading.</p>
                    </div>
                </div>
            ) : !error && (
                <>
                    {gradedSubjects.length > 0 && overall && (
                        <div className="phoenix-card">
                            <div className="phoenix-card-body flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold text-[#8a94ad]">Graded total</p>
                                    <h3 className="text-xl font-bold text-[#141824] mt-1">
                                        {overall.totalMarks ?? 0} / {overall.totalMax ?? 0}
                                    </h3>
                                </div>
                                <Badge variant={overall.overallStatus === 'PASS' ? 'success' : 'danger'}>
                                    {overall.overallStatus === 'PASS' ? 'Pass' : 'Fail'}
                                </Badge>
                            </div>
                        </div>
                    )}

                    {gradedSubjects.length > 0 && (
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table
                                    headers={[
                                        'Subject',
                                        ...(categoryHeaders || []).map(h => `${h.name} / ${h.maxScore}`),
                                        'Percentage',
                                        'Total',
                                        'Grade'
                                    ]}
                                >
                                    {(gradedSubjects || []).map((subject) => (
                                        <tr key={subject.subjectId} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-slate-700">{subject.subjectName}</td>
                                            {(categoryHeaders || []).map(header => {
                                                const match = (subject.categories || []).find(cat => (cat.categoryId?.toString() || cat.categoryName) === header.id);
                                                const value = match ? match.marksObtained : 0;
                                                return (
                                                    <td key={header.id} className="px-4 py-3 text-center font-mono text-slate-600">
                                                        {value}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-3 text-center font-mono text-slate-500">
                                                {subject.percentage}%
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono text-slate-600">
                                                {subject.totalMarks} / {subject.totalMax}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant={statusVariant(subject.status)}>
                                                    {subject.status === 'PASS' ? 'Pass' : subject.status === 'FAIL' ? 'Fail' : 'Not Graded'}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </Table>
                            </div>
                        </div>
                    )}

                    {(subjects || []).filter(s => s.status === 'NOT_GRADED').length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-slate-500">Not yet graded</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(subjects || []).filter(s => s.status === 'NOT_GRADED').map(subject => (
                                    <div key={subject.subjectId} className="flex items-center justify-between border border-dashed border-[#cbd0dd] rounded-lg px-4 py-3 bg-white opacity-70">
                                        <p className="font-semibold text-[#525b75] text-sm">{subject.subjectName}</p>
                                        <span className="text-xs font-semibold text-[#8a94ad] bg-slate-100 px-2 py-0.5 rounded">Not graded</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            <p className="text-xs text-slate-400 text-center">
                Tip: To filter by term, contact your school administrator.
            </p>
        </div>
    );
};

export default StudentResults;
