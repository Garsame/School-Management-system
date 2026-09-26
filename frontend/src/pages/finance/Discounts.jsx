import React, { useEffect, useMemo, useState } from 'react';
import { Award, Check, Edit2, Loader2, Percent, Plus, Search, Trash2, User, X } from 'lucide-react';
import {
    getDiscountedStudents,
    getStudentDiscountPreview,
    removeStudentDiscount,
    searchBillingStudents,
    setStudentDiscount
} from '../../services/api/finance.api';
import { getBranches } from '../../services/api/tenant.api';
import { Badge, Button, Input, Modal, Select, Spinner } from '../../components/ui';
import { confirmAction, notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { money } from '../../utils/feeStructures';

const asList = (value) => (Array.isArray(value) ? value : []);

const StatCard = ({ label, value, sub, tone = 'text-slate-900' }) => (
    <div className="rounded-lg border border-[#e3e6ed] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
);

const QUICK_REASONS = [
    'Staff Child Discount',
    'Full Merit Scholarship',
    'Financial Hardship Aid',
    'Sibling Concession',
    'Orphan Support',
    'Quran Memorization Award'
];

/**
 * Manage student scholarships and tuition discounts.
 *
 * Invoices automatically apply these rates upon billing generation.
 */
const Discounts = () => {
    const { user } = useAuth();
    const canManage = hasPermission(user, 'finance.discounts.manage');

    const [students, setStudents] = useState([]);
    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState('');
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [studentSearch, setStudentSearch] = useState('');
    const [studentResults, setStudentResults] = useState([]);
    const [searchingStudents, setSearchingStudents] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentPreview, setStudentPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Form inputs
    const [discountType, setDiscountType] = useState('PERCENTAGE');
    const [discountValue, setDiscountValue] = useState(100);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    const loadDiscountedStudents = async () => {
        setLoading(true);
        try {
            const data = await getDiscountedStudents({
                ...(branchId ? { branchId } : {}),
                ...(search.trim() ? { search: search.trim() } : {})
            });
            setStudents(asList(data));
        } catch (error) {
            console.error(error);
            notify(error.response?.data?.message || 'Failed to load discounted students', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        getBranches()
            .then((list) => setBranches(asList(list)))
            .catch(() => setBranches([]));
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadDiscountedStudents();
        }, 250);
        return () => clearTimeout(timer);
    }, [branchId, search]);

    // Debounced student search inside modal
    useEffect(() => {
        if (!isModalOpen || editingStudent || !studentSearch.trim() || studentSearch.length < 2) {
            setStudentResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setSearchingStudents(true);
            try {
                const results = await searchBillingStudents({ q: studentSearch.trim() });
                setStudentResults(asList(results));
            } catch (error) {
                console.error(error);
            } finally {
                setSearchingStudents(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [studentSearch, isModalOpen, editingStudent]);

    const handleOpenCreate = () => {
        setEditingStudent(null);
        setSelectedStudent(null);
        setStudentPreview(null);
        setStudentSearch('');
        setDiscountType('PERCENTAGE');
        setDiscountValue(100);
        setReason('');
        setIsModalOpen(true);
    };

    const handleOpenEdit = async (item) => {
        setEditingStudent(item);
        setSelectedStudent(item);
        setDiscountType(item.discount?.type || 'PERCENTAGE');
        setDiscountValue(item.discount?.value ?? 100);
        setReason(item.discount?.reason || '');
        setIsModalOpen(true);

        setLoadingPreview(true);
        try {
            const preview = await getStudentDiscountPreview(item._id);
            setStudentPreview(preview);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleSelectStudent = async (student) => {
        setSelectedStudent(student);
        setStudentResults([]);
        setStudentSearch('');
        setLoadingPreview(true);
        try {
            const preview = await getStudentDiscountPreview(student._id);
            setStudentPreview(preview);
            if (student.discount?.enabled) {
                setDiscountType(student.discount.type || 'PERCENTAGE');
                setDiscountValue(student.discount.value ?? 100);
                setReason(student.discount.reason || '');
            }
        } catch (error) {
            console.error(error);
            notify(error.response?.data?.message || 'Failed to load student billing details', 'error');
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleSaveDiscount = async (e) => {
        e.preventDefault();
        if (!selectedStudent?._id) return;

        const val = Number(discountValue);
        if (!Number.isFinite(val) || val < 0) {
            notify('Please enter a valid discount amount', 'error');
            return;
        }
        if (discountType === 'PERCENTAGE' && val > 100) {
            notify('Percentage discount cannot exceed 100%', 'error');
            return;
        }

        setSaving(true);
        try {
            await setStudentDiscount(selectedStudent._id, {
                type: discountType,
                value: val,
                reason: reason.trim()
            });
            notify(editingStudent ? 'Student discount updated' : 'Discount granted successfully', 'success');
            setIsModalOpen(false);
            loadDiscountedStudents();
        } catch (error) {
            console.error(error);
            notify(error.response?.data?.message || 'Failed to save discount', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveDiscount = async (student) => {
        const studentName = `${student.firstName} ${student.lastName}`;
        if (!(await confirmAction(`Remove the discount for ${studentName}? Future billing will charge the standard class fee.`, {
            title: 'Remove Discount',
            confirmLabel: 'Remove Discount'
        }))) return;

        try {
            await removeStudentDiscount(student._id);
            notify(`Discount removed for ${studentName}`, 'success');
            loadDiscountedStudents();
        } catch (error) {
            console.error(error);
            notify(error.response?.data?.message || 'Failed to remove discount', 'error');
        }
    };

    // Calculate live preview
    const computedPreview = useMemo(() => {
        const base = studentPreview?.baseMonthlyFee ?? (editingStudent?.baseMonthlyFee || 0);
        const val = Number(discountValue) || 0;
        let deduction = 0;

        if (discountType === 'PERCENTAGE') {
            const pct = Math.min(100, Math.max(0, val));
            deduction = Math.round(base * (pct / 100) * 100) / 100;
        } else {
            deduction = Math.min(base, Math.round(val * 100) / 100);
        }

        const finalAmount = Math.max(0, Math.round((base - deduction) * 100) / 100);
        return {
            base,
            deduction,
            finalAmount
        };
    }, [studentPreview, editingStudent, discountType, discountValue]);

    // Filter students by discount type
    const filteredStudents = useMemo(() => {
        if (!typeFilter) return students;
        if (typeFilter === 'SCHOLARSHIP') {
            return students.filter((s) => s.discount?.type === 'PERCENTAGE' && s.discount?.value >= 100);
        }
        if (typeFilter === 'PERCENTAGE') {
            return students.filter((s) => s.discount?.type === 'PERCENTAGE' && s.discount?.value < 100);
        }
        if (typeFilter === 'FIXED') {
            return students.filter((s) => s.discount?.type === 'FIXED');
        }
        return students;
    }, [students, typeFilter]);

    // Summary statistics
    const stats = useMemo(() => {
        const total = students.length;
        const fullScholarships = students.filter((s) => s.discount?.type === 'PERCENTAGE' && s.discount?.value >= 100).length;
        const partial = total - fullScholarships;
        const totalMonthlyRelief = students.reduce((sum, s) => {
            const base = s.baseMonthlyFee || 0;
            const finalFee = s.discountedMonthlyFee ?? base;
            return sum + Math.max(0, base - finalFee);
        }, 0);

        return {
            total,
            fullScholarships,
            partial,
            totalMonthlyRelief
        };
    }, [students]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Discounts & Scholarships</h1>
                    <p className="phoenix-page-subtitle">Manage tuition discounts and full scholarships for students. Invoices automatically apply these rates.</p>
                </div>
                {canManage && (
                    <Button onClick={handleOpenCreate} variant="primary" className="!h-9 text-xs flex items-center gap-2">
                        <Plus size={16} /> Grant Student Discount
                    </Button>
                )}
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Discounted Students" value={stats.total} sub="Active fee concessions" />
                <StatCard label="100% Full Scholarships" value={stats.fullScholarships} tone="text-emerald-600" sub="Free tuition ($0 bills)" />
                <StatCard label="Partial Discounts" value={stats.partial} tone="text-amber-600" sub="Reduced rate students" />
                <StatCard label="Monthly Concession Value" value={money(stats.totalMonthlyRelief)} tone="text-[var(--primary)]" sub="Total monthly relief" />
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search student name or ID..."
                            className="w-full rounded-md border border-[#cbd0dd] bg-white py-2 pl-9 pr-3 text-xs font-semibold focus:border-[var(--primary)] focus:outline-none"
                        />
                    </div>
                    <select
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        className="h-9 rounded-md border border-[#cbd0dd] bg-white px-3 text-xs font-semibold focus:border-[var(--primary)] focus:outline-none"
                    >
                        <option value="">All Campuses</option>
                        {branches.map((b) => (
                            <option key={b._id} value={b._id}>{b.name}</option>
                        ))}
                    </select>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="h-9 rounded-md border border-[#cbd0dd] bg-white px-3 text-xs font-semibold focus:border-[var(--primary)] focus:outline-none"
                    >
                        <option value="">All Discount Types</option>
                        <option value="SCHOLARSHIP">100% Full Scholarships</option>
                        <option value="PERCENTAGE">Percentage Discounts</option>
                        <option value="FIXED">Fixed Amount Off</option>
                    </select>
                </div>
            </div>

            {/* Students Table */}
            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                </div>
            ) : filteredStudents.length === 0 ? (
                <div className="phoenix-card p-12 text-center bg-white border border-[#e3e6ed] rounded-lg">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                        <Award size={28} />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-slate-800">No discounted students found</h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                        {search || branchId || typeFilter
                            ? 'No students matched your search criteria.'
                            : 'No student discounts or scholarships have been granted yet.'}
                    </p>
                    {canManage && !search && !branchId && !typeFilter && (
                        <Button onClick={handleOpenCreate} variant="primary" className="mt-5 !h-9 text-xs">
                            <Plus size={14} className="mr-1" /> Grant First Discount
                        </Button>
                    )}
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-[#e3e6ed] bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-[#e3e6ed] bg-slate-50 font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Student</th>
                                    <th className="px-4 py-3">Campus & Class</th>
                                    <th className="px-4 py-3">Base Fee</th>
                                    <th className="px-4 py-3">Discount Rate</th>
                                    <th className="px-4 py-3">Billed Monthly</th>
                                    <th className="px-4 py-3">Reason / Concession</th>
                                    {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e3e6ed]">
                                {filteredStudents.map((item) => {
                                    const isFullScholarship = item.discount?.type === 'PERCENTAGE' && item.discount?.value >= 100;
                                    return (
                                        <tr key={item._id} className="hover:bg-slate-50/75 transition-colors">
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)] font-bold text-xs">
                                                        {item.firstName?.[0] || 'S'}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900">
                                                            {item.firstName} {item.middleName ? `${item.middleName} ` : ''}{item.lastName}
                                                        </p>
                                                        <p className="text-[11px] font-mono text-slate-400">{item.admissionNumber || item.studentCode}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <p className="font-semibold text-slate-800">{item.class?.name || 'Class unassigned'}</p>
                                                <p className="text-[11px] text-slate-400">{item.branch?.name || 'Campus'}</p>
                                            </td>
                                            <td className="px-4 py-3.5 font-semibold text-slate-600">
                                                {money(item.baseMonthlyFee || 0)}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {isFullScholarship ? (
                                                    <Badge variant="success" className="font-bold">
                                                        100% Scholarship
                                                    </Badge>
                                                ) : item.discount?.type === 'PERCENTAGE' ? (
                                                    <Badge variant="warning" className="font-bold">
                                                        {item.discount.value}% Off
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="primary" className="font-bold">
                                                        -{money(item.discount?.value || 0)} Off
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`font-bold ${isFullScholarship ? 'text-emerald-600' : 'text-[var(--primary)]'}`}>
                                                    {money(item.discountedMonthlyFee ?? 0)}
                                                </span>
                                                <span className="text-[10px] text-slate-400 ml-1">/ mo</span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className="text-slate-600 font-medium">{item.discount?.reason || 'Standard concession'}</span>
                                            </td>
                                            {canManage && (
                                                <td className="px-4 py-3.5 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenEdit(item)}
                                                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[var(--primary)] transition-colors"
                                                            title="Edit discount"
                                                        >
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveDiscount(item)}
                                                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                                            title="Remove discount"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Grant / Edit Discount Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => !saving && setIsModalOpen(false)}
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                            <Award size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-[#141824]">
                                {editingStudent ? 'Edit Student Discount' : 'Grant Student Discount & Scholarship'}
                            </h3>
                            <p className="text-[11px] text-[#8a94ad]">Set a custom tuition rate or 100% scholarship for this student</p>
                        </div>
                    </div>
                }
                maxWidth="2xl"
            >
                <form onSubmit={handleSaveDiscount} className="space-y-5 py-2">
                    {/* Step 1: Student Lookup (when creating new) */}
                    {!editingStudent && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-700">Search & Select Student</label>
                            {!selectedStudent ? (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                    <input
                                        type="search"
                                        value={studentSearch}
                                        onChange={(e) => setStudentSearch(e.target.value)}
                                        placeholder="Type student name or admission number..."
                                        className="w-full rounded-md border border-[#cbd0dd] bg-white py-2.5 pl-9 pr-3 text-xs font-semibold focus:border-[var(--primary)] focus:outline-none"
                                        autoFocus
                                    />
                                    {searchingStudents && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--primary)]" />
                                    )}

                                    {studentResults.length > 0 && (
                                        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-[#cbd0dd] bg-white py-1 shadow-lg divide-y divide-slate-100">
                                            {studentResults.map((s) => (
                                                <button
                                                    key={s._id}
                                                    type="button"
                                                    onClick={() => handleSelectStudent(s)}
                                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors"
                                                >
                                                    <div>
                                                        <p className="font-bold text-slate-900">{s.name}</p>
                                                        <p className="text-[11px] text-slate-400">{s.className || 'No class'} • {s.admissionNumber}</p>
                                                    </div>
                                                    <span className="text-[11px] font-semibold text-[var(--primary)]">Select →</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center justify-between rounded-lg border border-[#cbd0dd] bg-slate-50 p-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-white font-bold text-xs">
                                            {selectedStudent.name?.[0] || 'S'}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">{selectedStudent.name}</p>
                                            <p className="text-[11px] text-slate-500">
                                                {selectedStudent.className || 'Class assigned'} • {selectedStudent.admissionNumber}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedStudent(null);
                                            setStudentPreview(null);
                                        }}
                                        className="text-xs font-semibold text-red-500 hover:underline"
                                    >
                                        Change Student
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Student Billing Summary Card */}
                    {selectedStudent && (
                        <>
                            {loadingPreview ? (
                                <div className="flex h-24 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                                    <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)] mr-2" />
                                    <span className="text-xs text-slate-500">Loading fee schedule...</span>
                                </div>
                            ) : (
                                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                        <span className="text-xs font-bold text-slate-700">Class Fee Structure</span>
                                        <span className="text-xs font-bold text-slate-900">
                                            {studentPreview?.feeStructure?.name || 'Standard Monthly Fee'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-500 font-medium">Standard Monthly Rate</span>
                                        <span className="font-bold text-slate-800 text-sm">
                                            {money(computedPreview.base)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Discount Type Selector */}
                            <div className="space-y-3">
                                <label className="block text-xs font-bold text-slate-700">Choose Discount Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDiscountType('PERCENTAGE');
                                            setDiscountValue(100);
                                        }}
                                        className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
                                            discountType === 'PERCENTAGE' && Number(discountValue) === 100
                                                ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] font-bold'
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Award size={18} className="mb-1" />
                                        <span className="text-xs">100% Full Scholarship</span>
                                        <span className="text-[10px] text-slate-400 mt-0.5">$0.00 / month</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDiscountType('PERCENTAGE');
                                            if (Number(discountValue) === 100) setDiscountValue(30);
                                        }}
                                        className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
                                            discountType === 'PERCENTAGE' && Number(discountValue) < 100
                                                ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] font-bold'
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Percent size={18} className="mb-1" />
                                        <span className="text-xs">Percentage Off (%)</span>
                                        <span className="text-[10px] text-slate-400 mt-0.5">e.g. 20%, 30%, 50%</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDiscountType('FIXED');
                                            if (Number(discountValue) >= 100) setDiscountValue(20);
                                        }}
                                        className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
                                            discountType === 'FIXED'
                                                ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] font-bold'
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="text-base font-black mb-0.5">$</span>
                                        <span className="text-xs">Fixed Amount Off</span>
                                        <span className="text-[10px] text-slate-400 mt-0.5">Direct dollar deduction</span>
                                    </button>
                                </div>
                            </div>

                            {/* Discount Value Input (when not 100% scholarship) */}
                            {!(discountType === 'PERCENTAGE' && Number(discountValue) === 100) && (
                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-slate-700">
                                        {discountType === 'PERCENTAGE' ? 'Discount Percentage (%)' : 'Fixed Monthly Discount ($)'}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            max={discountType === 'PERCENTAGE' ? 100 : undefined}
                                            step="any"
                                            value={discountValue}
                                            onChange={(e) => setDiscountValue(e.target.value)}
                                            className="w-full rounded-md border border-[#cbd0dd] bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-[var(--primary)] focus:outline-none"
                                            required
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                            {discountType === 'PERCENTAGE' ? '%' : 'USD'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Live Calculation Preview Card */}
                            <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-4">
                                <div className="flex items-center justify-between text-xs text-slate-600 pb-1.5 border-b border-slate-200/60">
                                    <span>Standard Fee</span>
                                    <span className="font-semibold">{money(computedPreview.base)}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-emerald-600 py-1.5 border-b border-slate-200/60 font-semibold">
                                    <span>
                                        Discount Deduction ({discountType === 'PERCENTAGE' ? `${discountValue}%` : 'Fixed'})
                                    </span>
                                    <span>-{money(computedPreview.deduction)}</span>
                                </div>
                                <div className="flex items-center justify-between pt-2">
                                    <span className="text-xs font-bold text-slate-800">New Monthly Bill</span>
                                    <span className="text-lg font-black text-[var(--primary)]">
                                        {money(computedPreview.finalAmount)}
                                        <span className="text-xs font-normal text-slate-500 ml-1">/ month</span>
                                    </span>
                                </div>
                            </div>

                            {/* Reason / Note */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-700">Reason / Scholarship Note</label>
                                <Input
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="e.g. Staff child concession, Academic excellence, Need-based aid..."
                                    className="!h-9 text-xs"
                                    required
                                />
                                <div className="flex flex-wrap gap-1 pt-1">
                                    {QUICK_REASONS.map((r) => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setReason(r)}
                                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] transition-colors"
                                        >
                                            + {r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Modal Footer */}
                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#e3e6ed]">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsModalOpen(false)}
                            disabled={saving}
                            className="!h-9 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={saving || !selectedStudent}
                            className="!h-9 text-xs flex items-center gap-2"
                        >
                            {saving ? <Spinner size="sm" /> : <Check size={16} />}
                            {editingStudent ? 'Update Discount' : 'Save Discount'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Discounts;
