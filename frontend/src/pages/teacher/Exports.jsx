import React, { useState, useEffect } from 'react';
import { Card, Button, Select, Spinner, Toast } from '../../components/ui';
import { getExams, exportResults } from '../../services/api/teacher.api';
import { Download, FileText, FileSpreadsheet, Sparkles, CheckCircle2 } from 'lucide-react';

const Exports = () => {
    const [exams, setExams] = useState([]);
    const [examId, setExamId] = useState('');
    const [format, setFormat] = useState('csv');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        getExams().then(res => {
            const list = res?.data || res || [];
            setExams(list);
            if (list.length > 0) setExamId(list[0]._id);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const handleExport = async () => {
        if (!examId) return;
        setExporting(true);
        try {
            const data = await exportResults(examId, format);
            
            // Trigger download
            const url = window.URL.createObjectURL(new Blob([data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `results_${examId}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            setToast('Export successful! Check your downloads.');
        } catch {
            setToast('Failed to export. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Export Data</h1>
                    <p className="phoenix-page-subtitle">Generate official result sheets for administrative review.</p>
                </div>
            </div>

            <div className="phoenix-card">
                <div className="phoenix-card-body space-y-6">
                    <Select 
                        label="Select Examination" 
                        options={(exams || []).map(e => ({ label: `${e.name} (${e.term})`, value: e._id }))}
                        value={examId}
                        onChange={(e) => setExamId(e.target.value)}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button 
                            type="button"
                            onClick={() => setFormat('csv')}
                            className={`p-6 rounded-2xl border transition-all text-left flex flex-col gap-3 group
                                ${format === 'csv' 
                                    ? 'border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm' 
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                                }`}
                        >
                            <div className={`${format === 'csv' ? 'text-[var(--primary)]' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                <FileSpreadsheet size={32} />
                            </div>
                            <div>
                                <h4 className={`font-bold ${format === 'csv' ? 'text-slate-800' : 'text-slate-500'}`}>CSV Spreadsheet</h4>
                                <p className="text-xs text-slate-400 font-medium">Standard for Excel/Sheets</p>
                            </div>
                        </button>

                        <button 
                            type="button"
                            onClick={() => setFormat('json')}
                            className={`p-6 rounded-2xl border transition-all text-left flex flex-col gap-3 group
                                ${format === 'json' 
                                    ? 'border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm' 
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                                }`}
                        >
                            <div className={`${format === 'json' ? 'text-[var(--primary)]' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                <FileText size={32} />
                            </div>
                            <div>
                                <h4 className={`font-bold ${format === 'json' ? 'text-slate-800' : 'text-slate-500'}`}>JSON Data</h4>
                                <p className="text-xs text-slate-400 font-medium">Structured raw data</p>
                            </div>
                        </button>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
                         <h5 className="text-xs font-bold text-slate-500">What's included in the export:</h5>
                         <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <IncludedItem text="Student admission numbers" />
                            <IncludedItem text="Full names and descriptions" />
                            <IncludedItem text="Broken down subject scores" />
                            <IncludedItem text="Computed totals and final grades" />
                         </ul>
                    </div>

                    <Button 
                        className="w-full py-3 text-base font-semibold shadow-sm disabled:opacity-50"
                        onClick={handleExport}
                        disabled={exporting || !examId}
                    >
                        <div className="flex items-center justify-center gap-2">
                            {exporting ? (
                                <>
                                    <Spinner size="sm" /> 
                                    <span>Compiling Records...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={18} />
                                    <span>Generate Official Export</span>
                                </>
                            )}
                        </div>
                    </Button>
                </div>
            </div>

            {toast && <Toast message={toast} onClose={() => setToast('')} />}
        </div>
    );
};

const IncludedItem = ({ text }) => (
    <li className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <CheckCircle2 size={14} className="text-green-500 shrink-0" />
        <span>{text}</span>
    </li>
);

export default Exports;
