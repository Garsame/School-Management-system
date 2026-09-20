import React, { useState, useEffect } from 'react';
import { fetchFeeStructures, createFeeStructure, deleteFeeStructure } from '../../services/api/finance.api';
import { getBranches, getAcademicYears, getClasses, getClassCategories } from '../../services/api/tenant.api';
import { Button, Input, Select, Badge } from '../../components/ui';
import { Trash2, Plus, CreditCard, X, Loader2 } from 'lucide-react';
import { confirmAction, notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const unwrapList = (response) => {
    const payload = response?.data?.data ?? response?.data ?? response;
    return Array.isArray(payload) ? payload : [];
};

const billingFrequencyOptions = [
    { label: 'Annual payment', value: 'YEARLY' },
    { label: 'Monthly payments', value: 'MONTHLY' },
    { label: 'Every two months', value: 'EVERY_TWO_MONTHS' },
    { label: 'Quarterly payments', value: 'QUARTERLY' },
    { label: 'Term payments', value: 'TERM' },
    { label: 'Custom schedule', value: 'CUSTOM' }
];

const frequencyLabel = (value) => billingFrequencyOptions.find(option => option.value === value)?.label || 'Annual payment';

const FeeStructures = () => {
    const { user } = useAuth();
    const [structures, setStructures] = useState([]);
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [classes, setClasses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Form State
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        branchId: '',
        gradeLevel: '1',
        classId: '',
        categoryId: '',
        targetType: 'SCHOOL_GRADE',
        academicYearId: '',
        billingFrequency: 'YEARLY',
        billingPeriods: [],
        feeItems: []
    });
    const [newItem, setNewItem] = useState({ name: '', amount: '' });
    const [newPeriod, setNewPeriod] = useState({ label: '', amount: '' });

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            const [fs, b, y] = await Promise.all([
                fetchFeeStructures(),
                getBranches(),
                getAcademicYears()
            ]);
            setStructures(unwrapList(fs));
            setBranches(unwrapList(b).map(i => ({ label: i.name, value: i._id })));
            setYears(unwrapList(y).map(i => ({ label: i.name, value: i._id })));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!formData.branchId) {
            setClasses([]);
            setCategories([]);
            return;
        }

        const loadClasses = async () => {
            try {
                const [response, categoryResponse] = await Promise.all([getClasses({ branchId: formData.branchId }), getClassCategories(formData.branchId)]);
                setClasses(unwrapList(response).map(item => ({ label: item.name, value: item._id })));
                setCategories(unwrapList(categoryResponse).map(item => ({ label: item.name, value: item._id })));
            } catch (error) {
                console.error(error);
                setClasses([]);
            }
        };

        loadClasses();
    }, [formData.branchId]);

    const handleAddItem = () => {
        if (!newItem.name || !newItem.amount) return;
        setFormData(prev => ({
            ...prev,
            feeItems: [...prev.feeItems, { name: newItem.name, amount: parseFloat(newItem.amount) }]
        }));
        setNewItem({ name: '', amount: '' });
    };

    const handleRemoveItem = (idx) => {
        setFormData(prev => ({
            ...prev,
            feeItems: prev.feeItems.filter((_, i) => i !== idx)
        }));
    };

    const handleAddPeriod = () => {
        if (!newPeriod.label || newPeriod.amount === '' || Number(newPeriod.amount) < 0) return;
        setFormData(prev => ({
            ...prev,
            billingPeriods: [...prev.billingPeriods, { label: newPeriod.label, amount: Number(newPeriod.amount) }]
        }));
        setNewPeriod({ label: '', amount: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const hasTarget = formData.targetType === 'SCHOOL_GRADE' ? formData.gradeLevel : (formData.branchId && (formData.targetType === 'CATEGORY' ? formData.categoryId : formData.classId));
        if (!hasTarget || !formData.academicYearId || !formData.name || formData.feeItems.length === 0) return;
        if (formData.billingFrequency === 'CUSTOM' && formData.billingPeriods.length === 0) return;
        
        try {
            await createFeeStructure(formData);
            const updated = await fetchFeeStructures();
            setStructures(unwrapList(updated));
            setIsCreating(false);
            setFormData({ name: '', branchId: '', gradeLevel: '1', targetType: 'SCHOOL_GRADE', categoryId: '', classId: '', academicYearId: '', billingFrequency: 'YEARLY', billingPeriods: [], feeItems: [] });
        } catch (e) {
            console.error(e);
            notify('Failed to create fee structure', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!(await confirmAction('Delete this fee structure? This action cannot be undone.', { title: 'Delete fee structure', confirmLabel: 'Delete' }))) return;
        try {
            await deleteFeeStructure(id);
            setStructures(prev => prev.filter(s => s._id !== id));
            notify('Fee structure deleted', 'success');
        } catch (e) {
            console.error(e);
            notify(e.response?.data?.message || 'Failed to delete fee structure', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (isCreating) {
        return (
            <div className="max-w-2xl mx-auto space-y-4">
                <div className="phoenix-page-header">
                    <div>
                        <h1 className="phoenix-page-title">New fee structure</h1>
                        <p className="phoenix-page-subtitle">Configure billing templates and items.</p>
                    </div>
                    <Button variant="ghost" onClick={() => setIsCreating(false)} className="!h-9 text-xs">
                        Cancel
                    </Button>
                </div>

                <article className="phoenix-card">
                    <div className="phoenix-card-body space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select label="Fee applies to" options={[{ label: 'All campuses by grade', value: 'SCHOOL_GRADE' }, { label: 'Campus level/category override', value: 'CATEGORY' }, { label: 'One class override', value: 'CLASS' }]} value={formData.targetType} onChange={e => setFormData({...formData, targetType: e.target.value, branchId: '', classId: '', categoryId: ''})} className="!h-10 text-xs" required />
                            {formData.targetType === 'SCHOOL_GRADE' ? (
                                <Select label="Grade" options={[{ label: 'All grades 1–12 (same fees)', value: 'ALL' }, ...Array.from({ length: 12 }, (_, index) => ({ label: `Grade ${index + 1}`, value: String(index + 1) }))]} value={formData.gradeLevel} onChange={e => setFormData({...formData, gradeLevel: e.target.value})} className="!h-10 text-xs" required />
                            ) : (
                                <Select label="Campus" options={branches} value={formData.branchId} onChange={e => setFormData({...formData, branchId: e.target.value, classId: '', categoryId: ''})} className="!h-10 text-xs" required />
                            )}
                            {formData.targetType !== 'SCHOOL_GRADE' && <Select label={formData.targetType === 'CATEGORY' ? 'Level / Category' : 'Class'} options={formData.targetType === 'CATEGORY' ? categories : classes} value={formData.targetType === 'CATEGORY' ? formData.categoryId : formData.classId} onChange={e => setFormData({...formData, [formData.targetType === 'CATEGORY' ? 'categoryId' : 'classId']: e.target.value})} disabled={!formData.branchId} className="!h-10 text-xs" required />}
                            <Select 
                                label="Academic Year" 
                                options={years} 
                                value={formData.academicYearId}
                                onChange={e => setFormData({...formData, academicYearId: e.target.value})}
                                className="!h-10 text-xs"
                                required
                            />
                         </div>
                         <Input 
                            label="Structure Name (e.g., Grade 10 Standard)" 
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="!h-10 text-xs"
                         />

                         <Select
                            label="Student Payment Schedule"
                            options={billingFrequencyOptions}
                            value={formData.billingFrequency}
                            onChange={e => setFormData({
                                ...formData,
                                billingFrequency: e.target.value,
                                billingPeriods: e.target.value === 'CUSTOM' ? formData.billingPeriods : []
                            })}
                            className="!h-10 text-xs"
                         />
                         
                         <div className="border-t border-slate-100 pt-4">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Fee Breakdown</label>
                            <div className="flex gap-2 mb-4">
                                <Input 
                                    placeholder="Item Name (e.g., Tuition)" 
                                    value={newItem.name} 
                                    onChange={e => setNewItem({...newItem, name: e.target.value})}
                                    className="flex-1 !h-10 text-xs"
                                />
                                <Input 
                                    type="number" 
                                    placeholder="Amount" 
                                    value={newItem.amount} 
                                    onChange={e => setNewItem({...newItem, amount: e.target.value})}
                                    className="w-32 !h-10 text-xs"
                                />
                                <Button onClick={handleAddItem} className="!h-10 px-4"><Plus size={16} /></Button>
                            </div>

                            <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                {formData.feeItems.length === 0 && <p className="text-slate-400 text-xs italic">No items added yet</p>}
                                {formData.feeItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-sm text-sm">
                                        <span className="font-semibold text-slate-700">{item.name}</span>
                                        <div className="flex items-center gap-4">
                                            <span className="font-bold text-slate-900">${item.amount}</span>
                                            <button onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-600"><X size={14}/></button>
                                        </div>
                                    </div>
                                ))}
                                {formData.feeItems.length > 0 && (
                                    <div className="flex justify-between items-center pt-2 border-t mt-2">
                                        <span className="font-bold text-slate-500 text-xs">Total</span>
                                        <span className="font-black text-lg text-[var(--primary)]">
                                            ${formData.feeItems.reduce((acc, curr) => acc + curr.amount, 0)}
                                        </span>
                                    </div>
                                )}
                            </div>
                         </div>

                         {formData.billingFrequency === 'CUSTOM' && (
                            <div className="border-t border-slate-100 pt-4">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Custom Billing Periods</label>
                                <div className="flex gap-2 mb-4">
                                    <Input
                                        placeholder="Period label"
                                        value={newPeriod.label}
                                        onChange={e => setNewPeriod({ ...newPeriod, label: e.target.value })}
                                        className="flex-1 !h-10 text-xs"
                                    />
                                    <Input
                                        type="number"
                                        min="0"
                                        placeholder="Amount"
                                        value={newPeriod.amount}
                                        onChange={e => setNewPeriod({ ...newPeriod, amount: e.target.value })}
                                        className="w-32 !h-10 text-xs"
                                    />
                                    <Button type="button" onClick={handleAddPeriod} className="!h-10 px-4"><Plus size={16} /></Button>
                                </div>
                                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                    {formData.billingPeriods.length === 0 && <p className="text-slate-400 text-xs italic">Add the periods students will be billed for.</p>}
                                    {formData.billingPeriods.map((period, idx) => (
                                        <div key={`${period.label}-${idx}`} className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 text-sm">
                                            <span className="font-semibold text-slate-700">{period.label}</span>
                                            <div className="flex items-center gap-4">
                                                <span className="font-bold text-slate-900">${period.amount}</span>
                                                <button type="button" onClick={() => setFormData(prev => ({ ...prev, billingPeriods: prev.billingPeriods.filter((_, index) => index !== idx) }))} className="text-red-400 hover:text-red-600" aria-label={`Remove ${period.label}`}>
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {formData.billingPeriods.length > 0 && (
                                        <div className="flex justify-between items-center pt-2 border-t text-sm">
                                            <span className="font-bold text-slate-500">Scheduled Total</span>
                                            <span className="font-black text-slate-900">${formData.billingPeriods.reduce((sum, period) => sum + Number(period.amount || 0), 0)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                         )}

                         <div className="flex justify-end pt-4 border-t border-slate-100">
                             <Button onClick={handleSubmit} disabled={!formData.name || !(formData.targetType === 'SCHOOL_GRADE' ? formData.gradeLevel : (formData.branchId && (formData.targetType === 'CATEGORY' ? formData.categoryId : formData.classId))) || !formData.academicYearId || formData.feeItems.length === 0 || (formData.billingFrequency === 'CUSTOM' && formData.billingPeriods.length === 0)} className="!h-10 text-xs">
                                 Create Structure
                             </Button>
                         </div>
                    </div>
                </article>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Fee structures</h1>
                    <p className="phoenix-page-subtitle">Manage tuition rules and breakdown templates.</p>
                </div>
                {hasPermission(user, 'finance.feeStructures.create') && <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2 !h-9 text-xs" variant="primary">
                    <Plus size={16} /> Create New
                </Button>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {structures.map(structure => {
                    const totalValue = structure.feeItems?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
                    return (
                        <article key={structure._id} className="phoenix-card relative group flex flex-col justify-between">
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                {hasPermission(user, 'finance.feeStructures.delete') && <button onClick={() => handleDelete(structure._id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 transition-colors">
                                    <Trash2 size={16} />
                                </button>}
                            </div>
                            <div className="p-4 flex-1">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-[var(--primary)] bg-opacity-10 text-[var(--primary)] shrink-0">
                                        <CreditCard size={18} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-slate-800 text-sm truncate">{structure.name || 'Standard Fee Structure'}</h3>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            <Badge variant="default" className="text-[9px] px-1.5 py-0">{structure.targetType === 'SCHOOL_GRADE' ? 'All campuses' : (structure.branchId?.name || branches.find(b => b.value === structure.branchId)?.label || 'Campus')}</Badge>
                                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{structure.targetType === 'SCHOOL_GRADE' ? `Grade ${structure.gradeLevel}` : structure.targetType === 'CATEGORY' ? `${structure.categoryId?.name || 'Category'} level` : structure.classId?.name || 'Class'}</Badge>
                                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{structure.academicYearId?.name || years.find(y => y.value === structure.academicYearId)?.label || 'Year'}</Badge>
                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">{frequencyLabel(structure.billingFrequency)}</Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5 border-t border-slate-100 pt-3">
                                    {structure.feeItems?.slice(0, 3).map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-xs">
                                            <span className="text-slate-500 font-medium">{item.name}</span>
                                            <span className="font-semibold text-slate-800">${item.amount}</span>
                                        </div>
                                    ))}
                                    {structure.feeItems?.length > 3 && (
                                        <p className="text-[10px] text-center text-slate-400 mt-2">+{structure.feeItems.length - 3} more items</p>
                                    )}
                                </div>
                            </div>
                            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 rounded-b-lg flex justify-between items-center shrink-0">
                                <span className="text-xs font-semibold text-slate-500">Total Value</span>
                                <span className="text-base font-black text-[var(--primary)]">
                                    ${totalValue.toLocaleString()}
                                </span>
                            </div>
                        </article>
                    );
                })}
            </div>
            {!loading && structures.length === 0 && (
                <div className="phoenix-empty-state">
                    <CreditCard size={28} />
                    <p>No fee structures found. Create one to get started.</p>
                </div>
            )}
        </div>
    );
};

export default FeeStructures;
