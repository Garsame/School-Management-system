import React, { useState, useEffect } from 'react';
import { generateInvoices, fetchFeeStructures } from '../../services/api/finance.api';
import { getBranches, getAcademicYears, getClasses } from '../../services/api/tenant.api';
import { Button, Input, Select } from '../../components/ui';
import { ArrowLeft, User, Users, CheckCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notify } from '../../components/feedback/notificationService';

const unwrapList = (response) => {
    const payload = response?.data?.data ?? response?.data ?? response;
    return Array.isArray(payload) ? payload : [];
};

const periodConfig = {
    YEARLY: { count: 1, label: 'Annual' },
    MONTHLY: { count: 12, label: 'Month' },
    EVERY_TWO_MONTHS: { count: 6, label: 'Two-month period' },
    QUARTERLY: { count: 4, label: 'Quarter' },
    TERM: { count: 3, label: 'Term' }
};

const getStructurePeriods = (structure) => {
    if (!structure) return [];
    const frequency = structure.billingFrequency || 'YEARLY';
    if (frequency === 'CUSTOM') {
        return (structure.billingPeriods || []).map((period, index) => ({
            label: `${period.label} ($${Number(period.amount || 0).toLocaleString()})`,
            value: period.key || `CUSTOM_${index + 1}`
        }));
    }
    const config = periodConfig[frequency] || periodConfig.YEARLY;
    const totalCents = Math.round(Number(structure.totalAmount || 0) * 100);
    const base = Math.floor(totalCents / config.count);
    const remainder = totalCents - (base * config.count);
    return Array.from({ length: config.count }, (_, index) => {
        const amount = (base + (index < remainder ? 1 : 0)) / 100;
        const label = frequency === 'YEARLY' ? config.label : `${config.label} ${index + 1}`;
        return {
            label: `${label} ($${amount.toLocaleString()})`,
            value: frequency === 'YEARLY' ? 'YEARLY' : `${frequency}_${index + 1}`
        };
    });
};

const InvoiceGenerate = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState('class'); // 'class' or 'student'
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [initializing, setInitializing] = useState(true);
    
    // Lookups
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [classes, setClasses] = useState([]);
    const [structures, setStructures] = useState([]);

    // Form
    const [formData, setFormData] = useState({
        branchId: '',
        academicYearId: '',
        targetId: '', // classId or studentId
        feeStructureId: '',
        billingPeriodKey: '',
        dueDate: ''
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            const [b, y, fs] = await Promise.all([
                getBranches(), 
                getAcademicYears(),
                fetchFeeStructures()
            ]);
            setBranches(unwrapList(b).map(i => ({ label: i.name, value: i._id })));
            setYears(unwrapList(y).map(i => ({ label: i.name, value: i._id })));
            setStructures(unwrapList(fs));
        } catch (e) {
            console.error(e);
        } finally {
            setInitializing(false);
        }
    };

    useEffect(() => {
        if (!formData.branchId || !formData.academicYearId || mode !== 'class') {
            setClasses([]);
            return;
        }

        const fetchClassesList = async () => {
            try {
                const data = await getClasses({
                    branchId: formData.branchId,
                    academicYearId: formData.academicYearId
                });
                setClasses(unwrapList(data).map(c => ({ label: c.name, value: c._id, categoryId: c.categoryId?._id || c.categoryId, gradeLevel: String(c.gradeLevel || '') })));
            } catch (e) {
                console.warn('Failed to load branch classes', e);
                setClasses([]);
            }
        };
        fetchClassesList();
    }, [formData.branchId, formData.academicYearId, mode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                branchId: formData.branchId,
                academicYearId: formData.academicYearId,
                dueDate: formData.dueDate,
                feeStructureId: formData.feeStructureId,
                billingPeriodKey: formData.billingPeriodKey
            };
            if (mode === 'class') {
                payload.classId = formData.targetId;
            } else {
                payload.studentId = formData.targetId;
            }

            await generateInvoices(payload);
            setSuccess(true);
        } catch (e) {
            console.error(e);
            notify(`Generation failed: ${e.response?.data?.message || e.message || 'Unknown error'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (initializing) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (success) {
        return (
            <div className="max-w-md mx-auto mt-20 text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle size={32} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Invoices Generated!</h2>
                    <p className="text-xs text-slate-500 mt-1">The system has successfully processed your request.</p>
                </div>
                <div className="flex justify-center gap-3 pt-2">
                    <Button onClick={() => navigate('/finance/invoices')} className="!h-9 text-xs">View Invoices</Button>
                    <Button variant="outline" onClick={() => { setSuccess(false); setFormData({...formData, targetId: ''}); }} className="!h-9 text-xs">Generate More</Button>
                </div>
            </div>
        );
    }

    const selectedClass = classes.find(item => item.value === formData.targetId);
    const filteredStructures = (structures || []).filter(s => 
        (!formData.branchId || s.targetType === 'SCHOOL_GRADE' || s.branchId === formData.branchId || (s.branchId && s.branchId._id === formData.branchId)) &&
        (!formData.academicYearId || s.academicYearId === formData.academicYearId || (s.academicYearId && s.academicYearId._id === formData.academicYearId)) &&
        (mode !== 'class' || !formData.targetId || s.classId === formData.targetId || (s.classId && s.classId._id === formData.targetId) || (s.targetType === 'CATEGORY' && (s.categoryId?._id || s.categoryId) === selectedClass?.categoryId) || (s.targetType === 'SCHOOL_GRADE' && String(s.gradeLevel) === selectedClass?.gradeLevel))
    );
    const structureOptions = filteredStructures.map(s => {
        const total = (s.feeItems || []).reduce((a,c)=>a+(c.amount||0),0);
        return { 
            label: `${s.name || 'Standard Fee Structure'}${s.targetType === 'SCHOOL_GRADE' ? ' (all campuses)' : s.targetType === 'CATEGORY' ? ' (level)' : ''} ($${total.toLocaleString()})`,
            value: s._id 
        };
    });
    const selectedStructure = structures.find(structure => structure._id === formData.feeStructureId);
    const billingPeriodOptions = getStructurePeriods(selectedStructure);

    return (
        <div className="max-w-2xl mx-auto space-y-4">
            <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center gap-2 !h-8 text-xs mb-2">
                <ArrowLeft size={16} /> Cancel
            </Button>
            
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Generate invoices</h1>
                    <p className="phoenix-page-subtitle">Create bulk invoices for classes or individual bills.</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <button 
                    type="button"
                    onClick={() => setMode('class')}
                    className={`p-3.5 border rounded-lg flex items-center justify-center gap-2.5 transition-all text-sm font-bold ${mode === 'class' ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                    <Users size={18} />
                    <span>Bulk Class Invoice</span>
                </button>
                <button 
                    type="button"
                    onClick={() => setMode('student')}
                    className={`p-3.5 border rounded-lg flex items-center justify-center gap-2.5 transition-all text-sm font-bold ${mode === 'student' ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                    <User size={18} />
                    <span>Single Student</span>
                </button>
            </div>

            <article className="phoenix-card">
                <form onSubmit={handleSubmit} className="phoenix-card-body space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Select 
                            label="Branch"
                            options={branches}
                            value={formData.branchId}
                            onChange={e => setFormData({...formData, branchId: e.target.value})}
                            className="!h-10 text-xs"
                            required
                        />
                        <Select 
                            label="Academic Year"
                            options={years}
                            value={formData.academicYearId}
                            onChange={e => setFormData({...formData, academicYearId: e.target.value})}
                            className="!h-10 text-xs"
                            required
                        />
                    </div>

                    {mode === 'class' ? (
                        <Select 
                            label="Target Class"
                            options={classes}
                            value={formData.targetId}
                            onChange={e => setFormData({...formData, targetId: e.target.value})}
                            disabled={classes.length === 0}
                            className="!h-10 text-xs"
                            required
                        />
                    ) : (
                        <Input 
                            label="Student ID (Exact Match)"
                            placeholder="Enter system Student ID..."
                            value={formData.targetId}
                            onChange={e => setFormData({...formData, targetId: e.target.value})}
                            className="!h-10 text-xs"
                            required
                        />
                    )}

                    <Select 
                        label="Fee Structure to Apply"
                        options={structureOptions}
                        value={formData.feeStructureId}
                        onChange={e => {
                            const nextStructure = structures.find(structure => structure._id === e.target.value);
                            const periods = getStructurePeriods(nextStructure);
                            setFormData({
                                ...formData,
                                feeStructureId: e.target.value,
                                billingPeriodKey: periods.length === 1 ? periods[0].value : ''
                            });
                        }}
                        className="!h-10 text-xs"
                        required
                    />

                    <Select
                        label="Billing Period"
                        options={billingPeriodOptions}
                        value={formData.billingPeriodKey}
                        onChange={e => setFormData({ ...formData, billingPeriodKey: e.target.value })}
                        disabled={!formData.feeStructureId}
                        className="!h-10 text-xs"
                        required
                    />

                    <Input 
                        type="date"
                        label="Due Date"
                        value={formData.dueDate}
                        onChange={e => setFormData({...formData, dueDate: e.target.value})}
                        className="!h-10 text-xs"
                        required
                    />

                    <div className="pt-2 border-t border-slate-100">
                        <Button type="submit" className="w-full !h-10 text-xs" disabled={loading || !formData.billingPeriodKey}>
                            {loading ? 'Processing...' : 'Generate Invoices'}
                        </Button>
                    </div>
                </form>
            </article>
        </div>
    );
};

export default InvoiceGenerate;
