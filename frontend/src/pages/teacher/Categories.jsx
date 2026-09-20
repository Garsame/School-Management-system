import React, { useEffect, useState } from 'react';
import { Card, Table, Badge, Spinner, Toast } from '../../components/ui';
import { getExamCategories } from '../../services/api/teacher.api';

const Categories = () => {
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState([]);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await getExamCategories();
                setCategories(res?.data || res || []);
            } catch {
                setToast({ type: 'error', message: 'Failed to load exam categories' });
            } finally {
                setLoading(false);
            }
        };
        fetchCategories();
    }, []);

    if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Exam Categories</h1>
                    <p className="phoenix-page-subtitle">Read-only assessment categories (e.g. Midterm, Final)</p>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="phoenix-card">
                <div className="phoenix-card-body">
                    <div className="phoenix-table-shell">
                        <div className="overflow-x-auto">
                            <Table headers={['Category', 'Description', 'Status']}>
                                {(categories || []).map((category) => (
                                    <tr key={category._id} className="hover:bg-slate-50/60 transition-colors border-b border-[#e3e6ed]">
                                        <td className="px-4 py-3 font-semibold text-slate-700 text-sm">{category.name}</td>
                                        <td className="px-4 py-3 text-slate-500 text-sm">{category.description || '—'}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant={category.isActive ? 'success' : 'default'}>
                                                {category.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                                {(categories || []).length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="px-4 py-8 text-center text-slate-400 italic text-sm">No categories found.</td>
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

export default Categories;
