import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Table, Button, Spinner, Badge, Toast } from '../../components/ui';
import { getExam, getResults, getResultsSummary } from '../../services/api/teacher.api';
import { 
    Users, 
    Plus, 
    ArrowLeft,
    TrendingUp,
    Award
} from 'lucide-react';

const ExamDetails = () => {
    const { examId } = useParams();
    const [exam, setExam] = useState(null);
    const [results, setResults] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [examRes, resultsRes, summaryRes] = await Promise.all([
                    getExam(examId),
                    getResults({ examId }),
                    getResultsSummary({ examId })
                ]);
                setExam(examRes.data);
                setResults(resultsRes.data);
                setSummary(summaryRes.data);
            } catch {
                setToast('Failed to load exam details');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [examId]);

    if (loading) {
        return (
            <div className="flex min-h-[320px] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }
    if (!exam) return <div className="text-center py-20 font-bold text-slate-400">Exam not found.</div>;

    const termName = exam.termId?.name || (typeof exam.termId === 'string' ? exam.termId : '') || exam.term || "Term not specified";
    const classNameVal = exam.classId?.name || (typeof exam.classId === 'string' ? exam.classId : '') || exam.className || "Class not specified";

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="phoenix-page-header">
                <div className="flex items-center gap-3">
                    <Link to="/teacher/exams" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <ArrowLeft size={20} className="text-slate-400" />
                    </Link>
                    <div>
                        <h1 className="phoenix-page-title">{exam.name}</h1>
                        <p className="phoenix-page-subtitle">
                            {termName} • Class: {classNameVal}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Link to={`/teacher/results/entry?examId=${examId}`}>
                        <Button className="flex items-center gap-2">
                            <Plus size={16} />
                            <span>Add Result</span>
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="phoenix-card bg-[var(--primary)] text-white border-none shadow-sm">
                        <div className="phoenix-card-body">
                            <p className="text-xs font-semibold opacity-80">Average score</p>
                            <h3 className="text-2xl font-bold mt-1">{summary.averageScore}%</h3>
                            <div className="mt-3 flex items-center gap-1 text-[10px] opacity-95 font-semibold">
                                <TrendingUp size={12} /> <span>Branch average</span>
                            </div>
                        </div>
                    </div>
                    <div className="phoenix-card bg-slate-900 text-white border-none shadow-sm">
                        <div className="phoenix-card-body">
                            <p className="text-xs font-semibold opacity-80">Pass rate</p>
                            <h3 className="text-2xl font-bold mt-1 text-[var(--secondary)]">{summary.passRate}</h3>
                            <div className="mt-3 flex items-center gap-1 text-[10px] opacity-80 font-semibold">
                                <Award size={12} /> <span>Successful students</span>
                            </div>
                        </div>
                    </div>
                    <div className="phoenix-card">
                        <div className="phoenix-card-body">
                            <p className="text-xs font-semibold text-slate-500">Total entries</p>
                            <h3 className="text-2xl font-bold mt-1 text-slate-800">{summary.totalStudents}</h3>
                            <div className="mt-3 flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                                <Users size={12} /> <span>Students graded</span>
                            </div>
                        </div>
                    </div>
                    <div className="phoenix-card">
                        <div className="phoenix-card-body">
                            <p className="text-xs font-semibold text-slate-500">Status</p>
                            <h3 className="text-2xl font-bold mt-1 flex items-center gap-2">
                                 <Badge variant={exam.status === 'OPEN' ? 'success' : 'warning'} className="text-xs px-2.5">{exam.status || 'Active'}</Badge>
                            </h3>
                            <div className="mt-3 flex items-center gap-1 text-[10px] text-slate-500 font-medium italic">
                                {exam.status === 'OPEN' ? 'Accepting results' : 'Results locked'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Table */}
            <div className="phoenix-card">
                <div className="phoenix-card-body">
                    <h2 className="text-base font-bold text-[#141824] mb-3">Student Performance List</h2>
                    <div className="phoenix-table-shell">
                        <div className="overflow-x-auto">
                            <Table headers={['Student', 'Admission #', 'Score (Max)', 'Grade/Status', 'Action']}>
                                {(results || []).map((res) => (
                                    <tr key={res._id} className="hover:bg-slate-50 transition-colors border-b border-[#e3e6ed]">
                                        <td className="px-4 py-3 font-semibold text-slate-800 text-sm">
                                            {res.studentId?.firstName} {res.studentId?.lastName}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-500">
                                            {res.studentId?.admissionNumber}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-[var(--primary)] text-sm">
                                            {res.marksObtained ?? 0} / {res.maxScore ?? exam.maxScore ?? '—'} ({res.percentage ?? 0}%)
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge 
                                                variant={res.status === 'PASS' || res.grade === 'A' || res.grade === 'B' ? 'success' : (res.status === 'FAIL' || res.grade === 'F' ? 'danger' : 'warning')}
                                            >
                                                {res.grade || res.status || '—'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link to={`/teacher/results/entry?edit=${res._id}`}>
                                                <Button variant="ghost" size="sm" className="font-semibold"><span>Edit Scores</span></Button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {(results || []).length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-8 text-center text-slate-400 italic text-sm">
                                            No results recorded for this exam yet.
                                        </td>
                                    </tr>
                                )}
                            </Table>
                        </div>
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast} onClose={() => setToast('')} />}
        </div>
    );
};

export default ExamDetails;
