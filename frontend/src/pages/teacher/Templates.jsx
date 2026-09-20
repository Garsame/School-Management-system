import React, { useEffect, useState } from 'react';
import { Card, Table, Badge, Spinner, Toast } from '../../components/ui';
import { getExamTemplates } from '../../services/api/teacher.api';

const Templates = () => {
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState([]);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const res = await getExamTemplates();
                setTemplates(res?.data || res || []);
            } catch {
                setToast({ type: 'error', message: 'Failed to load exam templates' });
            } finally {
                setLoading(false);
            }
        };
        fetchTemplates();
    }, []);

    if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Exam Templates</h1>
                    <p className="phoenix-page-subtitle">Read-only scoring templates (max score fixed at 100)</p>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="phoenix-card">
                <div className="phoenix-card-body">
                    <div className="phoenix-table-shell">
                        <div className="overflow-x-auto">
                            <Table headers={['Template', 'Max Score', 'Description', 'Status']}>
                                {(templates || []).map((template) => (
                                    <tr key={template._id} className="hover:bg-slate-50/60 transition-colors border-b border-[#e3e6ed]">
                                        <td className="px-4 py-3 font-semibold text-slate-700 text-sm">{template.name}</td>
                                        <td className="px-4 py-3 font-mono text-slate-600 text-center text-sm">100</td>
                                        <td className="px-4 py-3 text-slate-500 text-sm">{template.description || '—'}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant={template.isActive ? 'success' : 'default'}>
                                                {template.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                                {(templates || []).length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-4 py-8 text-center text-slate-400 italic text-sm">No templates found.</td>
                                    </tr>
                                )}
                            </Table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Templates;
