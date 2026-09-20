import React, { useCallback, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchInvoices } from '../../services/api/cashier.api';
import { Card, Button, Input, Table, Badge, Spinner } from '../../components/ui';

const Invoices = () => {
    const [searchParams] = useSearchParams();
    const [scriteria, setScriteria] = useState({
        invoiceId: '',
        admissionNumber: '',
        studentId: ''
    });
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const navigate = useNavigate();

    const handleSearch = useCallback(async (criteria) => {
        if (!criteria.invoiceId && !criteria.admissionNumber && !criteria.studentId) return;
        
        setLoading(true);
        setSearched(true);
        try {
            // Filter out empty keys
            const params = {};
            if(criteria.invoiceId) params.invoiceId = criteria.invoiceId;
            if(criteria.admissionNumber) params.admissionNumber = criteria.admissionNumber;
            if(criteria.studentId) params.studentId = criteria.studentId;
            
            const res = await searchInvoices(params);
            setResults(res.data || []);
        } catch (err) {
            console.error(err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const q = searchParams.get('q');
        if (q) {
            if (q.length > 10 && !q.includes('-')) {
                 handleSearch({ invoiceId: q });
                 setScriteria(prev => ({ ...prev, invoiceId: q }));
            } else {
                 handleSearch({ admissionNumber: q });
                 setScriteria(prev => ({ ...prev, admissionNumber: q }));
            }
        }
    }, [handleSearch, searchParams]);

    const onFormSubmit = (e) => {
        e.preventDefault();
        handleSearch(scriteria);
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Invoice Lookup</h1>
                    <p className="phoenix-page-subtitle">Search and look up school invoices by admission number or invoice ID.</p>
                </div>
            </div>

            <article className="phoenix-card p-6">
                <form onSubmit={onFormSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <Input 
                        label="Admission Number" 
                        value={scriteria.admissionNumber} 
                        onChange={(e) => setScriteria({ ...scriteria, admissionNumber: e.target.value, invoiceId: '' })} 
                        placeholder="e.g. A-2024-001"
                    />
                    <Input 
                        label="Invoice ID" 
                        value={scriteria.invoiceId} 
                        onChange={(e) => setScriteria({ ...scriteria, invoiceId: e.target.value, admissionNumber: '' })} 
                        placeholder="Specific Invoice ID"
                    />
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Searching...' : 'Search'}
                    </Button>
                </form>
            </article>

            {searched && (
                <article className="phoenix-card overflow-hidden">
                    <div className="phoenix-card-header">Search Results</div>
                    <div className="phoenix-card-body p-0">
                        {(results || []).length === 0 ? (
                            <div className="p-8 text-center text-slate-500">No invoices found matching criteria.</div>
                        ) : (
                            <div className="phoenix-table-shell">
                                <div className="overflow-x-auto">
                                    <Table headers={['Invoice ID', 'Student', 'Academic Year', 'Total', 'Paid', 'Balance', 'Status', 'Action']}>
                                        {(results || []).map(inv => (
                                            <tr key={inv._id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-mono text-xs">{inv._id}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium">{inv.studentId?.firstName} {inv.studentId?.lastName}</div>
                                                    <div className="text-xs text-slate-500">{inv.studentId?.admissionNumber}</div>
                                                </td>
                                                <td className="px-4 py-3">{inv.academicYearId?.name}</td>
                                                <td className="px-4 py-3 font-bold">${inv.totalAmount}</td>
                                                <td className="px-4 py-3 text-green-600">${inv.paidAmount}</td>
                                                <td className="px-4 py-3 text-red-600 font-bold">${inv.balance}</td>
                                                <td className="px-4 py-3">
                                                    <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>
                                                        {inv.status === 'PAID' ? 'Paid' : inv.status === 'PARTIALLY_PAID' ? 'Partially paid' : 'Unpaid'}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-2">
                                                        {inv.balance > 0 && inv.status !== 'VOID' && <Button size="sm" onClick={() => navigate(`/cashier/payments/new?invoiceId=${inv._id}`)}>Receive payment</Button>}
                                                        <Button size="sm" variant="outline" onClick={() => navigate(`/cashier/invoices/${inv._id}`)}>View</Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Table>
                                </div>
                            </div>
                        )}
                    </div>
                </article>
            )}
        </div>
    );
};

export default Invoices;
