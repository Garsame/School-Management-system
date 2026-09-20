import React, { useEffect, useState } from 'react';
import { Badge, Spinner } from '../../components/ui';
import { apiGetStudentRank, apiGetStudentAcademicYears, apiGetStudentExams } from '../../services/api/student.api';
import { Trophy, AlertCircle } from 'lucide-react';

const StudentRank = () => {
    const [loading, setLoading] = useState(true);
    const [rankData, setRankData] = useState(null);
    const [academicYears, setAcademicYears] = useState([]);
    const [selectedYearId, setSelectedYearId] = useState('');
    const [exams, setExams] = useState([]);
    const [selectedExamId, setSelectedExamId] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchYears = async () => {
            try {
                const yearsRes = await apiGetStudentAcademicYears();
                const yearsPayload = yearsRes.data || yearsRes || [];
                setAcademicYears(yearsPayload);
                if (yearsPayload.length) {
                    const current = yearsPayload.find(y => y.isCurrent);
                    setSelectedYearId((current || yearsPayload[0])._id);
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load academic years.');
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
        const fetchRank = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await apiGetStudentRank({ schoolYearId: selectedYearId, examId: selectedExamId || undefined });
                setRankData(res.data || res);
            } catch (err) {
                console.error(err);
                setError(err.response?.data?.message || 'Failed to load rank. Please try again.');
                setRankData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchRank();
    }, [selectedYearId, selectedExamId]);

    if (loading) return <div className="h-64 flex items-center justify-center"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Class Rank</h1>
                    <p className="phoenix-page-subtitle">Your standing among classmates</p>
                </div>
                {(academicYears || []).length > 0 && (
                    <div className="flex items-center gap-2">
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
                        <select aria-label="Filter rank by exam" className="rounded-lg border border-[#cbd0dd] bg-white px-3 py-1.5 text-xs font-bold text-[#525b75] outline-none" value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}><option value="">All exams</option>{exams.map(exam => <option key={exam._id} value={exam._id}>{exam.name || exam.examCategoryId?.name || 'Exam'} — {exam.subjectId?.name}</option>)}</select>
                    </div>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-lg">
                    <AlertCircle size={20} className="shrink-0" />
                    <span className="text-sm font-semibold">{error}</span>
                </div>
            )}

            {!error && !rankData && (
                <div className="p-12 text-center bg-white rounded-lg border border-[#cbd0dd] phoenix-card">
                    <div className="phoenix-card-body flex flex-col items-center">
                        <Trophy size={48} className="mx-auto text-slate-200 mb-4" />
                        <h3 className="text-lg font-bold text-[#141824]">Rank not available</h3>
                        <p className="text-sm text-[#8a94ad] mt-1">Ranking will appear once results are entered for this academic year.</p>
                    </div>
                </div>
            )}

            {!error && rankData && (
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center gap-6">
                        <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                            <Trophy size={24} />
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-[#8a94ad]">Rank</p>
                            <h3 className="text-2xl font-bold text-[#141824] mt-1">
                                {rankData.rank || '—'} <span className="text-[#8a94ad] text-sm">/ {rankData.classSize}</span>
                            </h3>
                            <div className="mt-2 flex items-center gap-3">
                                <Badge variant={rankData.overallStatus === 'PASS' ? 'success' : 'danger'}>
                                    {rankData.overallStatus === 'PASS' ? 'Pass' : 'Fail'}
                                </Badge>
                                <span className="text-[#525b75] text-xs font-medium">Total marks: {rankData.totalMarks}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentRank;
