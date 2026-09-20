import React, { useState, useEffect } from 'react';
import { Card, Table, Spinner, Select, Badge } from '../../components/ui';
import { getExams, getResultsSummary } from '../../services/api/teacher.api';
import { BarChart3, TrendingUp, Users, PieChart, Activity } from 'lucide-react';

const Reports = () => {
    const [exams, setExams] = useState([]);
    const [examId, setExamId] = useState('');
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetching, setFetching] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const examsRes = await getExams();
                const list = examsRes?.data || examsRes || [];
                setExams(list);
                if (list.length > 0) {
                    setExamId(list[0]._id);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        if (examId) {
            setFetching(true);
            getResultsSummary({ examId })
                .then(res => setSummary(res?.data || res))
                .catch(err => console.error(err))
                .finally(() => setFetching(false));
        }
    }, [examId]);

    if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Performance Analytics</h1>
                    <p className="phoenix-page-subtitle">Statistical insights into branch examination performance.</p>
                </div>
                <div className="w-full md:w-72 mt-3 md:mt-0">
                    <Select 
                        label="Select Exam to Analyze" 
                        options={(exams || []).map(e => ({ label: e.name, value: e._id }))}
                        value={examId}
                        onChange={(e) => setExamId(e.target.value)}
                    />
                </div>
            </div>

            {fetching ? (
                <div className="flex min-h-[260px] items-center justify-center">
                    <Spinner size="lg" />
                </div>
            ) : summary ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Performance Stats */}
                    <div className="phoenix-card lg:col-span-1">
                        <div className="phoenix-card-body h-full flex flex-col justify-between space-y-6">
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><TrendingUp size={20} /></div>
                                    <h3 className="font-bold text-slate-800 text-sm">Key Statistics</h3>
                                </div>
                                
                                <div className="space-y-4">
                                    <StatRow label="Average Score" value={`${summary.averageScore}%`} />
                                    <StatRow label="Pass Rate" value={summary.passRate} color="text-green-500" />
                                    <StatRow label="Highest Score" value={summary.highestScore} />
                                    <StatRow label="Lowest Score" value={summary.lowestScore} />
                                    <StatRow label="Sample Size" value={summary.totalStudents} sub="Students" />
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-2xl p-6 text-white text-center mt-4">
                                <p className="text-[10px] font-semibold text-slate-500 mb-1">Performance Index</p>
                                <h2 className="text-3xl font-bold text-[var(--secondary)]">
                                    {Number(summary.passRate?.replace('%', '')) > 70 ? 'Optimal' : 'Needs Review'}
                                </h2>
                            </div>
                        </div>
                    </div>

                    {/* Chart Visualization */}
                    <div className="phoenix-card lg:col-span-2">
                        <div className="phoenix-card-body p-0 relative overflow-hidden flex flex-col justify-center">
                            <div className="pt-6 px-6 flex items-center gap-2">
                                 <Activity size={20} className="text-[var(--primary)]" />
                                 <h3 className="font-bold text-slate-800 text-sm">Performance Distribution</h3>
                            </div>

                            <div className="flex items-end justify-around h-64 mt-12 px-6">
                                 <Bar value={summary.averageScore} label="Class Avg" color="bg-[var(--primary)]" />
                                 <Bar value={summary.highestScore} label="Peak" color="bg-[var(--secondary)]" />
                                 <Bar value={60} label="Target" color="bg-slate-200" dotted />
                            </div>

                            <div className="mt-8 p-6 bg-slate-50 border-t rounded-b-xl flex items-start gap-4">
                                 <PieChart className="text-slate-400 mt-1" size={24} />
                                 <div>
                                     <h4 className="font-bold text-slate-700 text-sm">Distribution Insights</h4>
                                     <p className="text-sm text-slate-500 leading-relaxed mt-1">
                                         The majority of students are performing within the <span className="font-bold text-slate-800">Class Average</span> range. 
                                         The pass rate of <span className="font-bold text-green-600">{summary.passRate}</span> suggests consistent teaching methodology 
                                         across this term's curriculum.
                                     </p>
                                 </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="phoenix-card">
                    <div className="phoenix-card-body text-center py-20">
                        <BarChart3 size={48} className="mx-auto mb-4 opacity-20 text-slate-400" />
                        <p className="font-bold text-lg text-slate-400">Select an exam to view analysis</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatRow = ({ label, value, color = 'text-slate-800', sub }) => (
    <div className="flex items-center justify-between group">
        <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-600 transition-colors">{label}</span>
        <div className="text-right">
            <span className={`text-base font-bold ${color}`}>{value}</span>
            {sub && <p className="text-[10px] font-semibold text-slate-400 -mt-1">{sub}</p>}
        </div>
    </div>
);

const Bar = ({ value, label, color, dotted }) => (
    <div className="flex flex-col items-center gap-2 flex-1">
        <div className="relative w-12 h-48 bg-slate-100 rounded-full flex items-end">
            <div 
                className={`w-full rounded-full transition-all duration-1000 ${color} ${dotted ? 'opacity-30' : 'shadow-lg'}`}
                style={{ height: `${value}%` }}
            ></div>
            <span className={`absolute -top-6 left-0 right-0 text-center font-bold text-xs ${dotted ? 'text-slate-400' : 'text-slate-800'}`}>
                {value}%
            </span>
        </div>
        <span className="text-[10px] font-semibold text-slate-400">{label}</span>
    </div>
);

export default Reports;
