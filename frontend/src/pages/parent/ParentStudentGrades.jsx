import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award, AlertTriangle, AlertCircle, Printer, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { documentHeader, downloadHtmlDocument, escapeHtml, formatPrintDate, printHtmlDocument, signatureBlock } from '../../utils/printDocument';
import { useBranding } from '../../context/BrandingContext';

const ParentStudentGrades = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [children, setChildren] = useState([]);
    const [years, setYears] = useState([]);
    const [selectedYearId, setSelectedYearId] = useState('');
    const [grades, setGrades] = useState([]);
    const [rankData, setRankData] = useState(null);
    const [selectedExamId, setSelectedExamId] = useState('');

    const [loadingChildren, setLoadingChildren] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [error, setError] = useState('');
    const { branding } = useBranding();

    const activeStudentId = searchParams.get('studentId') || '';

    // Fetch children list
    useEffect(() => {
        const fetchChildren = async () => {
            try {
                const res = await api.get('/parent/dashboard');
                if (res.data?.success) {
                    setChildren(res.data.data);
                    if (!activeStudentId && res.data.data.length > 0) {
                        setSearchParams({ studentId: res.data.data[0].student._id });
                    }
                } else {
                    setError('Failed to retrieve children list.');
                }
            } catch (err) {
                setError(err.response?.data?.message || 'Error loading student profiles.');
            } finally {
                setLoadingChildren(false);
            }
        };
        fetchChildren();
    }, [activeStudentId, setSearchParams]);

    // Fetch academic years when child changes
    useEffect(() => {
        if (!activeStudentId) return;

        const fetchYears = async () => {
            setError('');
            try {
                const res = await api.get(`/parent/students/${activeStudentId}/academic-years`);
                if (res.data?.success) {
                    const yearList = res.data.data || [];
                    setYears(yearList);
                    
                    const currentYear = yearList.find(y => y.isCurrent) || yearList[0];
                    if (currentYear) {
                        setSelectedYearId(currentYear._id);
                    } else {
                        setSelectedYearId('');
                    }
                }
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to load academic years.');
            }
        };
        fetchYears();
    }, [activeStudentId]);

    // Fetch grades and rank when student or year changes
    const fetchGradesAndRank = useCallback(async () => {
        if (!activeStudentId) return;
        setLoadingData(true);
        setError('');
        try {
            const params = { ...(selectedYearId ? { schoolYearId: selectedYearId } : {}), ...(selectedExamId ? { examId: selectedExamId } : {}) };
            const [gradesRes, rankRes] = await Promise.all([
                api.get(`/parent/students/${activeStudentId}/grades`, { params: selectedYearId ? { schoolYearId: selectedYearId } : {} }),
                api.get(`/parent/students/${activeStudentId}/rank`, { params })
            ]);

            if (gradesRes.data?.success) {
                setGrades(gradesRes.data.data || []);
            }
            if (rankRes.data?.success) {
                setRankData(rankRes.data.data);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error loading academic results or ranking.');
        } finally {
            setLoadingData(false);
        }
    }, [activeStudentId, selectedYearId, selectedExamId]);

    useEffect(() => {
        fetchGradesAndRank();
    }, [fetchGradesAndRank]);

    const activeChild = children.find(c => c.student._id === activeStudentId);
    const examOptions = Array.from(new Map(grades.filter(grade => grade.examId?._id).map(grade => [grade.examId._id, grade.examId])).values());
    const filteredGrades = selectedExamId ? grades.filter(grade => grade.examId?._id === selectedExamId) : grades;

    const buildReportCardBody = () => {
        const selectedYear = years.find((year) => year._id === selectedYearId);
        const rows = (filteredGrades || []).map((grade) => `
            <tr>
                <td>${escapeHtml(grade.examId?.name || 'Assessment')}</td>
                <td>${escapeHtml(grade.examId?.subjectId?.name || 'General')}</td>
                <td>${escapeHtml(grade.examId?.examCategoryId?.name || 'Class Exam')}</td>
                <td>${escapeHtml(grade.marksObtained)} / ${escapeHtml(grade.maxScore)} (${escapeHtml(grade.percentage)}%)</td>
                <td>${escapeHtml(grade.status)}</td>
                <td>${escapeHtml(grade.remarks || '')}</td>
            </tr>
        `).join('');
        return `
            <div class="doc">
                ${documentHeader({
                    schoolName: branding?.tenantName || branding?.name || 'School',
                    logoUrl: branding?.logoUrl,
                    title: 'Parent Copy Report Card',
                    subtitle: selectedYear?.name || ''
                })}
                <h2>Student Profile</h2>
                <div class="grid">
                    <div><div class="label">Student</div><div class="value">${escapeHtml(`${activeChild?.student?.firstName || ''} ${activeChild?.student?.lastName || ''}`.trim())}</div></div>
                    <div><div class="label">Academic Year</div><div class="value">${escapeHtml(selectedYear?.name || 'N/A')}</div></div>
                    <div><div class="label">Class</div><div class="value">${escapeHtml(rankData?.className || activeChild?.className || 'N/A')}</div></div>
                    <div><div class="label">Rank</div><div class="value">${escapeHtml(rankData?.rank ? `${rankData.rank} / ${rankData.classSize}` : 'Not available')}</div></div>
                </div>
                <div class="summary">
                    <div class="box"><div class="label">Total Marks</div><div class="value">${escapeHtml(rankData?.totalMarks ?? 'N/A')}</div></div>
                    <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(rankData?.overallStatus || 'N/A')}</div></div>
                    <div class="box"><div class="label">Class</div><div class="value">${escapeHtml(rankData?.className || activeChild?.className || 'N/A')}</div></div>
                    <div class="box"><div class="label">Printed</div><div class="value">${escapeHtml(formatPrintDate(new Date()))}</div></div>
                </div>
                <table>
                    <thead>
                        <tr><th>Exam</th><th>Subject</th><th>Category</th><th>Score</th><th>Status</th><th>Remarks</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                ${signatureBlock()}
                <div class="footer"><span>Generated from the parent portal.</span><span>${escapeHtml(formatPrintDate(new Date()))}</span></div>
            </div>`;
    };

    const handlePrintReportCard = () => {
        printHtmlDocument({
            title: 'Student Report Card',
            body: buildReportCardBody(),
            primaryColor: branding?.primaryColor,
            secondaryColor: branding?.secondaryColor
        });
    };

    const handleDownloadReportCard = () => {
        downloadHtmlDocument({
            title: 'Student Report Card',
            filename: `parent-report-card-${activeChild?.student?.firstName || 'student'}`,
            body: buildReportCardBody(),
            primaryColor: branding?.primaryColor,
            secondaryColor: branding?.secondaryColor
        });
    };

    if (loadingChildren) {
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
                    <h1 className="phoenix-page-title">
                        Grades & Results
                    </h1>
                    <p className="phoenix-page-subtitle">Review report cards, exam scores, and academic standings.</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    {(filteredGrades || []).length > 0 && (
                        <>
                            <button
                                type="button"
                                onClick={handlePrintReportCard}
                                className="h-10 inline-flex items-center gap-2 rounded-xl border border-[#cbd0dd] bg-white px-3 text-xs font-bold text-slate-800 hover:border-[var(--primary)] hover:text-[var(--primary)]"
                            >
                                <Printer size={14} />
                                Print
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadReportCard}
                                className="h-10 inline-flex items-center gap-2 rounded-xl border border-[#cbd0dd] bg-white px-3 text-xs font-bold text-slate-800 hover:border-[var(--primary)] hover:text-[var(--primary)]"
                            >
                                Download
                            </button>
                        </>
                    )}
                    {/* Child Selector */}
                    {(children || []).length > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#8a94ad]">Student:</span>
                            <select 
                                value={activeStudentId} 
                                onChange={(e) => {
                                    setSearchParams({ studentId: e.target.value });
                                    setYears([]);
                                    setSelectedYearId('');
                                    setGrades([]);
                                    setRankData(null);
                                    setSelectedExamId('');
                                }}
                                className="h-10 bg-white border border-[#cbd0dd] rounded-xl px-3 font-bold text-slate-800 outline-none shadow-sm focus:ring-4 focus:ring-[var(--primary)]/5 text-xs"
                            >
                                {(children || []).map(c => (
                                    <option key={c.student._id} value={c.student._id}>
                                        {c.student.firstName} {c.student.lastName}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Academic Year Selector */}
                    {(years || []).length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#8a94ad]">Academic Year:</span>
                            <select 
                                value={selectedYearId} 
                                onChange={(e) => { setSelectedYearId(e.target.value); setSelectedExamId(''); }}
                                className="h-10 bg-white border border-[#cbd0dd] rounded-xl px-3 font-bold text-slate-800 outline-none shadow-sm focus:ring-4 focus:ring-[var(--primary)]/5 text-xs"
                            >
                                {(years || []).map(y => (
                                    <option key={y._id} value={y._id}>
                                        {y.name} {y.isCurrent ? '(Current)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {examOptions.length > 0 && <div className="flex items-center gap-2"><span className="text-xs font-semibold text-[#8a94ad]">Exam:</span><select aria-label="Filter by exam" value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)} className="h-10 rounded-xl border border-[#cbd0dd] bg-white px-3 text-xs font-bold text-slate-800"><option value="">All exams</option>{examOptions.map(exam => <option key={exam._id} value={exam._id}>{exam.name || exam.examCategoryId?.name || 'Exam'} — {exam.subjectId?.name}</option>)}</select></div>}
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-900 animate-fade-in">
                    <AlertCircle className="text-rose-500 flex-shrink-0" size={20} />
                    <div className="text-sm font-semibold flex-1">{error}</div>
                    <button 
                        onClick={fetchGradesAndRank} 
                        className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    >
                        <RefreshCw size={12} />
                        Retry
                    </button>
                </div>
            )}

            {!activeStudentId ? (
                <div className="phoenix-card p-6 text-center max-w-md mx-auto">
                    <AlertTriangle className="mx-auto text-amber-500 mb-4" size={36} />
                    <p className="text-slate-500 text-sm font-semibold">No student selected or linked.</p>
                </div>
            ) : loadingData ? (
                <div className="h-64 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : (years || []).length === 0 ? (
                <div className="phoenix-card p-6 text-center max-w-md mx-auto">
                    <AlertTriangle className="mx-auto text-amber-500 mb-4" size={36} />
                    <p className="text-slate-500 text-sm font-semibold">No academic year records found for this child.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Rank Summary Stats Card */}
                    {rankData && rankData.rank !== null && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="phoenix-card p-4 text-center">
                                <span className="text-xs font-semibold text-[#8a94ad]">Class Rank</span>
                                <p className="text-xl font-bold text-[var(--primary)] mt-1">{rankData.rank} / {rankData.classSize}</p>
                            </div>
                            <div className="phoenix-card p-4 text-center">
                                <span className="text-xs font-semibold text-[#8a94ad]">Total Marks</span>
                                <p className="text-xl font-bold text-slate-800 mt-1">{rankData.totalMarks}</p>
                            </div>
                            <div className="phoenix-card p-4 text-center">
                                <span className="text-xs font-semibold text-[#8a94ad]">Status</span>
                                <p className={`text-xl font-bold mt-1 ${rankData.overallStatus === 'PASS' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {rankData.overallStatus}
                                </p>
                            </div>
                            <div className="phoenix-card p-4 text-center">
                                <span className="text-xs font-semibold text-[#8a94ad]">Academic Context</span>
                                <p className="text-sm font-bold text-slate-500 mt-1 truncate">
                                    {rankData.className} ({rankData.academicYearName})
                                </p>
                            </div>
                        </div>
                    )}

                    {(filteredGrades || []).length === 0 ? (
                        <div className="phoenix-card p-6 text-center max-w-md mx-auto">
                            <Award className="mx-auto text-slate-300 mb-4" size={36} />
                            <h3 className="text-lg font-bold text-slate-800 mb-1">No Grade Records</h3>
                            <p className="text-slate-500 text-sm">
                                There are currently no published exam results for {activeChild?.student?.firstName || 'this student'} in the selected year.
                            </p>
                        </div>
                    ) : (
                        <div className="phoenix-card overflow-hidden">
                            <div className="p-5 border-b border-[#f0f2f5] bg-[#f5f7fa]">
                                <h3 className="text-base font-bold text-[#141824]">
                                    Exam Report Card for {activeChild?.student?.firstName} {activeChild?.student?.lastName}
                                </h3>
                                <p className="text-xs font-semibold text-[#8a94ad] mt-0.5">
                                    Class Section: {rankData?.className || activeChild?.className} | Academic Year: {(years || []).find(y => y._id === selectedYearId)?.name}
                                </p>
                            </div>

                            <div className="phoenix-table-shell">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-[#f0f2f5] text-xs font-semibold text-[#8a94ad] bg-[#f5f7fa]/50">
                                                <th className="px-4 py-3">Exam Name</th>
                                                <th className="px-4 py-3">Subject</th>
                                                <th className="px-4 py-3">Category</th>
                                                <th className="px-4 py-3">Class/Enrollment</th>
                                                <th className="px-4 py-3">Score Obtained</th>
                                                <th className="px-4 py-3">Grade / Status</th>
                                                <th className="px-4 py-3">Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(filteredGrades || []).map(grade => {
                                                const examClass = grade.examId?.classId?.name || rankData?.className || activeChild?.className || 'N/A';
                                                return (
                                                    <tr key={grade._id} className="border-b border-[#f0f2f5] hover:bg-slate-50/30 transition-colors">
                                                        <td className="px-4 py-3 font-semibold text-[#141824]">
                                                            {grade.examId?.name || 'Assessment'}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-slate-600 font-semibold">
                                                            {grade.examId?.subjectId?.name || 'General'}
                                                        </td>
                                                        <td className="px-4 py-3 text-xs text-[#525b75] font-semibold">
                                                            {grade.examId?.examCategoryId?.name || 'Class Exam'}
                                                        </td>
                                                        <td className="px-4 py-3 text-xs text-[#8a94ad] font-semibold">
                                                            {examClass}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-[#141824] text-sm">{grade.marksObtained}</span>
                                                                <span className="text-slate-400 text-xs">/ {grade.maxScore}</span>
                                                                <span className="text-slate-400 text-xs">({grade.percentage}%)</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                                                grade.status === 'PASS' 
                                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                                                    : 'bg-rose-50 text-rose-600 border-rose-100'
                                                            }`}>
                                                                {grade.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-[#525b75] font-semibold italic">
                                                            {grade.remarks || 'No remarks added'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ParentStudentGrades;
