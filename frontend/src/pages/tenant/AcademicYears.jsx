import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Plus, 
  CheckCircle2, 
  Clock, 
  MoreVertical, 
  Loader2, 
  X,
  AlertCircle
} from 'lucide-react';
import tenantService from '../../services/tenantService';
import { confirmAction, notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const validateYearRange = (startValue, endValue) => {
    if (!startValue || !endValue) return 'Choose both a start date and an end date.';
    const start = new Date(`${startValue}T00:00:00Z`);
    const end = new Date(`${endValue}T00:00:00Z`);
    if (end <= start) return 'End date must be after the start date.';
    const minimumEnd = new Date(start);
    minimumEnd.setUTCMonth(minimumEnd.getUTCMonth() + 9);
    const maximumEnd = new Date(start);
    maximumEnd.setUTCMonth(maximumEnd.getUTCMonth() + 12);
    if (end < minimumEnd || end > maximumEnd) return 'Academic year duration must be between 9 and 12 months.';
    return '';
};

const AcademicYears = () => {
    const { user } = useAuth();
    const [years, setYears] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [activatingYearId, setActivatingYearId] = useState('');
    const [dateError, setDateError] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        startDate: '',
        endDate: '',
        isCurrent: false
    });
    const [activeDropdownYearId, setActiveDropdownYearId] = useState(null);
    const [editModal, setEditModal] = useState({ open: false, year: null, name: '', startDate: '', endDate: '' });

    useEffect(() => {
        fetchYears();
    }, []);

    useEffect(() => {
        if (!activeDropdownYearId) return undefined;
        const closeMenu = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type === 'pointerdown' && event.target.closest('[data-academic-year-menu]')) return;
            setActiveDropdownYearId(null);
        };
        document.addEventListener('pointerdown', closeMenu);
        document.addEventListener('keydown', closeMenu);
        return () => {
            document.removeEventListener('pointerdown', closeMenu);
            document.removeEventListener('keydown', closeMenu);
        };
    }, [activeDropdownYearId]);

    const fetchYears = async () => {
        try {
            const response = await tenantService.getAcademicYears();
            setYears(response.data);
        } catch (error) {
            console.error('Failed to load academic years:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const validationError = validateYearRange(formData.startDate, formData.endDate);
        setDateError(validationError);
        if (validationError) return;
        setSubmitting(true);
        try {
            await tenantService.createAcademicYear(formData);
            await fetchYears();
            setIsModalOpen(false);
            setFormData({ name: '', startDate: '', endDate: '', isCurrent: false });
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to create academic year', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSetCurrent = async (year) => {
        const confirmed = await confirmAction(
            `Set “${year.name}” as the current academic year? The existing current year will become historical.`,
            { title: 'Change current academic year', confirmLabel: 'Set as current', tone: 'info' }
        );
        if (!confirmed) return;
        const id = year._id;
        setActivatingYearId(id);
        try {
            await tenantService.setCurrentYear(id);
            await fetchYears();
            notify('Current academic year updated.', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to update current year', 'error');
        } finally {
            setActivatingYearId('');
        }
    };

    const handleClearCurrent = async (year) => {
        const confirmed = await confirmAction(
            `Remove ${year.name} as the current academic year? The school will have no current year until another one is selected.`,
            { title: 'Remove current status', confirmLabel: 'Remove current status', tone: 'danger' }
        );
        if (!confirmed) return;
        setActivatingYearId(year._id);
        try {
            const response = await tenantService.clearCurrentYear(year._id);
            await fetchYears();
            notify(response.data?.message || 'Current status removed successfully.', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to remove current status.', 'error');
        } finally {
            setActivatingYearId('');
        }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        const validationError = validateYearRange(editModal.startDate, editModal.endDate);
        setDateError(validationError);
        if (validationError) return;
        setSubmitting(true);
        try {
            await tenantService.updateAcademicYear(editModal.year._id, {
                name: editModal.name,
                startDate: editModal.startDate,
                endDate: editModal.endDate
            });
            await fetchYears();
            setEditModal({ open: false, year: null, name: '', startDate: '', endDate: '' });
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to update academic year', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (year) => {
        if (!(await confirmAction(
            `Delete ${year.name}? This is only allowed when the academic year has no linked school records.`,
            { title: 'Delete academic year', confirmLabel: 'Delete academic year', tone: 'danger' }
        ))) return;
        try {
            const res = await tenantService.deleteAcademicYear(year._id);
            notify(res.data.message || 'Academic year deleted successfully', 'success');
            fetchYears();
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to delete academic year', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                     <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Academic Timeline</h1>
                     <p className="text-slate-400 font-medium text-xs">Configure institutional sessions and the primary operational cycle.</p>
                </div>
                {hasPermission(user, 'tenant.academicYears.create') && <button 
                  onClick={() => { setDateError(''); setIsModalOpen(true); }}
                  className="h-10 px-4 bg-[var(--primary)] text-white rounded-lg font-semibold tracking-wider text-xs flex items-center gap-2 hover:bg-[var(--primary-dark)] transition-all active:scale-95 shadow-sm"
                >
                    <Plus size={16} />
                    INITIALIZE SESSION
                </button>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full h-64 flex items-center justify-center">
                        <Loader2 className="animate-spin text-[var(--primary)]" size={32} />
                    </div>
                ) : (
                    years.map((year) => (
                        <div key={year._id} className={`bg-white rounded-xl border p-5 shadow-sm transition-all group relative ${year.isCurrent ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/5' : 'border-slate-200 hover:border-slate-350'}`}>
                            {year.isCurrent && (
                                <div className="absolute top-0 right-0 py-1.5 px-4 bg-[var(--primary)] text-white text-[9px] font-semibold uppercase tracking-wider rounded-bl-xl">
                                    CURRENT SESSION
                                </div>
                            )}

                            <div className="relative z-10 space-y-4">
                                <div className="flex items-center gap-4">
                                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${year.isCurrent ? 'bg-[var(--primary)] text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-slate-105'}`}>
                                         <Calendar size={18} />
                                     </div>
                                     <div>
                                         <h3 className="text-lg font-bold text-slate-800 tracking-tight">{year.name}</h3>
                                         <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Academic Term</p>
                                     </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                        <Clock size={14} className="text-slate-400" />
                                        <div className="flex-1">
                                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Duration Range</p>
                                            <p className="text-xs font-semibold text-slate-700">
                                                {new Date(year.startDate).toLocaleDateString()} &rarr; {new Date(year.endDate).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                     {year.isCurrent ? (
                                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                              <CheckCircle2 size={12} />
                                              System Primary
                                          </div>
                                     ) : (
                                          hasPermission(user, 'tenant.academicYears.setCurrent') && <button 
                                              onClick={() => handleSetCurrent(year)}
                                              disabled={Boolean(activatingYearId)}
                                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--primary)] px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:cursor-wait disabled:opacity-60"
                                          >
                                              {activatingYearId === year._id ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle2 size={13} />}
                                              {activatingYearId === year._id ? 'Activating...' : 'Set as current'}
                                          </button>
                                     )}
                                     <div className="relative" data-academic-year-menu>
                                         <button 
                                             type="button"
                                             onClick={() => setActiveDropdownYearId(activeDropdownYearId === year._id ? null : year._id)}
                                             className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                                             aria-label={`Actions for ${year.name}`}
                                             aria-haspopup="menu"
                                             aria-expanded={activeDropdownYearId === year._id}
                                         >
                                             <MoreVertical size={16} />
                                         </button>
                                         {activeDropdownYearId === year._id && (
                                             <div role="menu" className="absolute right-0 z-50 mt-1 w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                                                 <button
                                                     onClick={() => {
                                                         setActiveDropdownYearId(null);
                                                         setDateError('');
                                                         setEditModal({
                                                             open: true,
                                                             year,
                                                             name: year.name,
                                                             startDate: year.startDate ? new Date(year.startDate).toISOString().split('T')[0] : '',
                                                             endDate: year.endDate ? new Date(year.endDate).toISOString().split('T')[0] : ''
                                                         });
                                                     }}
                                                     role="menuitem"
                                                     className="block min-h-10 w-full whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                                 >
                                                     Edit Details
                                                 </button>
                                                 {year.isCurrent && (
                                                     <button
                                                         onClick={() => {
                                                             setActiveDropdownYearId(null);
                                                             handleClearCurrent(year);
                                                         }}
                                                         role="menuitem"
                                                         className="block min-h-10 w-full whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                                                     >
                                                         Remove current status
                                                     </button>
                                                 )}
                                                 {!year.isCurrent && (
                                                     <button
                                                         onClick={() => {
                                                             setActiveDropdownYearId(null);
                                                             handleDelete(year);
                                                         }}
                                                         role="menuitem"
                                                         className="block min-h-10 w-full whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                                                     >
                                                         Delete
                                                     </button>
                                                 )}
                                             </div>
                                         )}
                                     </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-xl relative z-10 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-205 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-805">Initialize Academic Session</h3>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Calendar Configuration Hub</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-200 rounded-lg transition-all shadow-sm">
                                <X size={16} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreate} className="p-5 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session Display Name</label>
                                <input 
                                    required
                                    type="text" 
                                    placeholder="2023-2024 Academic Year"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Date</label>
                                    <input 
                                        required
                                        type="date" 
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                        value={formData.startDate}
                                        onChange={(e) => { setDateError(''); setFormData({...formData, startDate: e.target.value}); }}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">End Date</label>
                                    <input 
                                        required
                                        type="date" 
                                        min={formData.startDate || undefined}
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                        value={formData.endDate}
                                        onChange={(e) => { setDateError(''); setFormData({...formData, endDate: e.target.value}); }}
                                    />
                                </div>
                            </div>

                            <p className={`text-xs ${dateError ? 'font-semibold text-rose-600' : 'text-slate-500'}`} role={dateError ? 'alert' : undefined}>
                                {dateError || 'Academic years must run for at least 9 months and no longer than 12 months.'}
                            </p>

                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                                <div className="flex gap-3">
                                    <Clock className="text-[var(--primary)] mt-0.5" size={16} />
                                    <div>
                                        <p className="text-xs font-semibold text-slate-800">Immediate Activation</p>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Set as system primary current year</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={formData.isCurrent}
                                    aria-label="Set as current academic year"
                                    onClick={() => setFormData({...formData, isCurrent: !formData.isCurrent})}
                                    className={`h-7 w-12 rounded-full p-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${formData.isCurrent ? 'bg-[var(--primary)]' : 'bg-slate-300'}`}
                                >
                                    <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${formData.isCurrent ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 flex gap-3 text-rose-800">
                                <AlertCircle className="shrink-0 mt-0.5" size={16} />
                                <p className="text-[10px] leading-relaxed font-semibold uppercase tracking-wider">Activating a new session will set all previously active years to historical status. This affects global reports and current enrollments.</p>
                            </div>

                            <div className="pt-2 flex justify-end gap-3">
                                 <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 font-semibold text-xs tracking-wider uppercase text-slate-400 hover:text-slate-650 transition-colors"
                                 >
                                    Discard
                                 </button>
                                 <button 
                                    type="submit"
                                    disabled={submitting}
                                    className="h-10 px-4 bg-[var(--primary)] text-white rounded-lg font-semibold tracking-wider text-xs flex items-center gap-2 hover:bg-[var(--primary-dark)] transition-all disabled:opacity-50"
                                 >
                                    {submitting ? <Loader2 className="animate-spin" size={14} /> : 'CONFIRM TIMELINE'}
                                 </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditModal({ open: false, year: null, name: '', startDate: '', endDate: '' })} />
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-xl relative z-10 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-205 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-805">Edit Academic Session</h3>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Calendar Configuration Hub</p>
                            </div>
                            <button onClick={() => setEditModal({ open: false, year: null, name: '', startDate: '', endDate: '' })} className="p-1.5 hover:bg-slate-200 rounded-lg transition-all shadow-sm">
                                <X size={16} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session Display Name</label>
                                <input 
                                    required
                                    type="text" 
                                    placeholder="e.g. 2026-2027"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-905 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                    value={editModal.name}
                                    onChange={(e) => setEditModal({...editModal, name: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Date</label>
                                    <input 
                                        required
                                        type="date" 
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-905 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                        value={editModal.startDate}
                                        onChange={(e) => { setDateError(''); setEditModal({...editModal, startDate: e.target.value}); }}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">End Date</label>
                                    <input 
                                        required
                                        type="date" 
                                        min={editModal.startDate || undefined}
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-905 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                        value={editModal.endDate}
                                        onChange={(e) => { setDateError(''); setEditModal({...editModal, endDate: e.target.value}); }}
                                    />
                                </div>
                            </div>

                            <p className={`text-xs ${dateError ? 'font-semibold text-rose-600' : 'text-slate-500'}`} role={dateError ? 'alert' : undefined}>
                                {dateError || 'Academic years must run for at least 9 months and no longer than 12 months.'}
                            </p>

                            <div className="pt-2 flex justify-end gap-3">
                                 <button 
                                    type="button" 
                                    onClick={() => setEditModal({ open: false, year: null, name: '', startDate: '', endDate: '' })}
                                    className="px-4 font-semibold text-xs tracking-wider uppercase text-slate-400 hover:text-slate-650 transition-colors"
                                 >
                                    Discard
                                 </button>
                                 <button 
                                    type="submit"
                                    disabled={submitting}
                                    className="h-10 px-4 bg-[var(--primary)] text-white rounded-lg font-semibold tracking-wider text-xs flex items-center gap-2 hover:bg-[var(--primary-dark)] transition-all disabled:opacity-50"
                                 >
                                    {submitting ? <Loader2 className="animate-spin" size={14} /> : 'SAVE CHANGES'}
                                 </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AcademicYears;


