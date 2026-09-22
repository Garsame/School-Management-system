import React, { useState, useEffect } from 'react';
import { fetchFeeStructures, createFeeStructure, deleteFeeStructure, updateFeeStructure } from '../../services/api/finance.api';
import { getBranches, getAcademicYears, getClasses, getClassCategories } from '../../services/api/tenant.api';
import { Button, Input, Select, Badge } from '../../components/ui';
import { Trash2, Plus, CreditCard, X, Loader2, Pencil } from 'lucide-react';
import { confirmAction, notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { isOpen, money, monthlyTotal, needsMonthlyAmount } from '../../utils/feeStructures';

const unwrapList = (response) => {
    const payload = response?.data?.data ?? response?.data ?? response;
    return Array.isArray(payload) ? payload : [];
};

const EMPTY_FORM = {
    name: '',
    branchId: '',
    gradeLevel: '1',
    classId: '',
    categoryId: '',
    targetType: 'SCHOOL_GRADE',
    academicYearId: '',
    feeItems: []
};

const sumItems = (items) => items.reduce((sum, item) => sum + Math.round(Number(item.amount || 0) * 100), 0) / 100;

/**
 * The monthly items editor used by both "new" and "edit": a name and an amount per line,
 * where every amount is what a student pays each month.
 */
const MonthlyItemsEditor = ({ items, onChange }) => {
    const [draft, setDraft] = useState({ name: '', amount: '' });

    const add = () => {
        const amount = Number(draft.amount);
        if (!draft.name.trim() || draft.amount === '' || !Number.isFinite(amount) || amount < 0) return;
        onChange([...items, { name: draft.name.trim(), amount }]);
        setDraft({ name: '', amount: '' });
    };

    return (
        <div className="border-t border-slate-100 pt-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly fee</label>
            <p className="mb-3 text-xs text-slate-500">What one student pays every month. Each month&apos;s invoice charges these items in full.</p>
            <div className="mb-4 flex gap-2">
                <Input
                    placeholder="Item, for example Tuition"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), add())}
                    className="flex-1 !h-10 text-xs"
                />
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Per month"
                    value={draft.amount}
                    onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                    onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), add())}
                    className="w-32 !h-10 text-xs"
                />
                <Button type="button" onClick={add} className="!h-10 px-4" aria-label="Add item"><Plus size={16} /></Button>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-4">
                {items.length === 0 && <p className="text-xs italic text-slate-400">No items added yet</p>}
                {items.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="flex items-center justify-between rounded border border-slate-100 bg-white p-2 text-sm shadow-sm">
                        <span className="font-semibold text-slate-700">{item.name}</span>
                        <div className="flex items-center gap-4">
                            <span className="font-bold text-slate-900">{money(item.amount)}</span>
                            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} className="text-red-400 hover:text-red-600" aria-label={`Remove ${item.name}`}><X size={14} /></button>
                        </div>
                    </div>
                ))}
                {items.length > 0 && (
                    <div className="mt-2 flex items-center justify-between border-t pt-2">
                        <span className="text-xs font-bold text-slate-500">Total per month</span>
                        <span className="text-lg font-black text-[var(--primary)]">{money(sumItems(items))}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const FeeStructures = () => {
    const { user } = useAuth();
    const [structures, setStructures] = useState([]);
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [classes, setClasses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);

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

    const hasTarget = formData.targetType === 'SCHOOL_GRADE'
        ? formData.gradeLevel
        : (formData.branchId && (formData.targetType === 'CATEGORY' ? formData.categoryId : formData.classId));
    const canCreate = Boolean(formData.name && hasTarget && formData.academicYearId && formData.feeItems.length > 0);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canCreate) return;
        setSaving(true);
        try {
            await createFeeStructure(formData);
            setStructures(unwrapList(await fetchFeeStructures()));
            setIsCreating(false);
            setFormData(EMPTY_FORM);
            notify('Monthly fee saved', 'success');
        } catch (e) {
            notify(e.response?.data?.message || 'Failed to create fee structure', 'error');
        } finally {
            setSaving(false);
        }
    };

    const saveEdit = async () => {
        if (!editing.name.trim() || editing.feeItems.length === 0) return;
        setSaving(true);
        try {
            const updated = await updateFeeStructure(editing._id, { name: editing.name.trim(), feeItems: editing.feeItems });
            setStructures((current) => current.map((item) => (item._id === editing._id ? { ...item, ...updated, branchId: item.branchId, classId: item.classId, categoryId: item.categoryId, academicYearId: item.academicYearId } : item)));
            setEditing(null);
            notify('Monthly fee updated. The next invoices you generate use it.', 'success');
        } catch (e) {
            notify(e.response?.data?.message || 'Failed to update fee structure', 'error');
        } finally {
            setSaving(false);
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
                        <h1 className="phoenix-page-title">New monthly fee</h1>
                        <p className="phoenix-page-subtitle">Set what students of a class or grade pay each month.</p>
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
                            label="Name (for example Grade 3 monthly fee)"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="!h-10 text-xs"
                        />

                        <MonthlyItemsEditor items={formData.feeItems} onChange={(feeItems) => setFormData({ ...formData, feeItems })} />

                        <div className="flex justify-end pt-4 border-t border-slate-100">
                            <Button onClick={handleSubmit} disabled={!canCreate || saving} className="!h-10 text-xs">
                                {saving ? 'Saving...' : 'Save monthly fee'}
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
                    <p className="phoenix-page-subtitle">The monthly fee for each class or grade. Invoices read from here.</p>
                </div>
                {hasPermission(user, 'finance.feeStructures.create') && <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2 !h-9 text-xs" variant="primary">
                    <Plus size={16} /> New monthly fee
                </Button>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {structures.map(structure => {
                    const legacy = needsMonthlyAmount(structure);
                    const open = isOpen(structure);
                    return (
                        <article key={structure._id} className={`phoenix-card relative group flex flex-col justify-between ${open ? '' : 'opacity-75'}`}>
                            <div className="absolute top-3 right-3 flex gap-1 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                                {hasPermission(user, 'finance.feeStructures.update') && <button type="button" onClick={() => setEditing({ _id: structure._id, name: structure.name || '', feeItems: legacy ? [] : (structure.feeItems || []).map(({ name, amount }) => ({ name, amount })), legacy })} className="p-1.5 text-slate-400 hover:text-[var(--primary)] rounded hover:bg-slate-100 transition-colors" aria-label={`Edit ${structure.name}`}>
                                    <Pencil size={16} />
                                </button>}
                                {hasPermission(user, 'finance.feeStructures.delete') && <button type="button" onClick={() => handleDelete(structure._id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 transition-colors" aria-label={`Delete ${structure.name}`}>
                                    <Trash2 size={16} />
                                </button>}
                            </div>
                            <div className="p-4 flex-1">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-[var(--primary)] bg-opacity-10 text-[var(--primary)] shrink-0">
                                        <CreditCard size={18} />
                                    </div>
                                    <div className="min-w-0 pr-14">
                                        <h3 className="font-bold text-slate-800 text-sm truncate">{structure.name || 'Standard Fee Structure'}</h3>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            <Badge variant="default" className="text-[9px] px-1.5 py-0">{structure.targetType === 'SCHOOL_GRADE' ? 'All campuses' : (structure.branchId?.name || branches.find(b => b.value === structure.branchId)?.label || 'Campus')}</Badge>
                                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{structure.targetType === 'SCHOOL_GRADE' ? `Grade ${structure.gradeLevel}` : structure.targetType === 'CATEGORY' ? `${structure.categoryId?.name || 'Category'} level` : structure.classId?.name || 'Class'}</Badge>
                                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{structure.academicYearId?.name || years.find(y => y.value === structure.academicYearId)?.label || 'Year'}</Badge>
                                            <Badge variant={open ? 'success' : 'outline'} className="text-[9px] px-1.5 py-0">{open ? 'Open' : 'Closed'}</Badge>
                                        </div>
                                    </div>
                                </div>

                                {legacy ? (
                                    <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                                        Made before monthly billing, so it holds a yearly amount and is not billed. Edit it to set the monthly fee.
                                    </p>
                                ) : (
                                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                                        {structure.feeItems?.slice(0, 3).map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-xs">
                                                <span className="text-slate-500 font-medium">{item.name}</span>
                                                <span className="font-semibold text-slate-800">{money(item.amount)}</span>
                                            </div>
                                        ))}
                                        {structure.feeItems?.length > 3 && (
                                            <p className="text-[10px] text-center text-slate-400 mt-2">+{structure.feeItems.length - 3} more items</p>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 rounded-b-lg flex justify-between items-center shrink-0">
                                <span className="text-xs font-semibold text-slate-500">{legacy ? 'Old yearly total' : 'Per month'}</span>
                                <span className="text-base font-black text-[var(--primary)]">{money(monthlyTotal(structure))}</span>
                            </div>
                        </article>
                    );
                })}
            </div>
            {!loading && structures.length === 0 && (
                <div className="phoenix-empty-state">
                    <CreditCard size={28} />
                    <p>No fee structures yet. Add the monthly fee for each class or grade.</p>
                </div>
            )}

            {editing && (
                <div className="phoenix-modal-backdrop">
                    <div className="phoenix-modal-scrim" onClick={() => !saving && setEditing(null)} />
                    <div className="phoenix-modal-panel max-w-xl">
                        <div className="phoenix-modal-header">
                            <div>
                                <h2 className="phoenix-section-title">Edit monthly fee</h2>
                                <p className="phoenix-section-copy">Invoices already made keep their amount. The next month you generate uses this.</p>
                            </div>
                            <button type="button" className="phoenix-icon-button" onClick={() => setEditing(null)} disabled={saving} aria-label="Close"><X size={18} /></button>
                        </div>
                        <div className="phoenix-modal-body space-y-4">
                            {editing.legacy && (
                                <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                                    This one held a yearly amount. Enter what a student pays each month.
                                </p>
                            )}
                            <Input label="Name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="!h-10 text-xs" />
                            <MonthlyItemsEditor items={editing.feeItems} onChange={(feeItems) => setEditing({ ...editing, feeItems })} />
                        </div>
                        <div className="phoenix-modal-footer">
                            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
                            <Button onClick={saveEdit} disabled={saving || !editing.name.trim() || editing.feeItems.length === 0}>{saving ? 'Saving...' : 'Save'}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FeeStructures;
