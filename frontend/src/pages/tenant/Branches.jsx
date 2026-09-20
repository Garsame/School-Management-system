import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  MapPin, 
  Plus, 
  Search, 
  Phone, 
  Package, 
  Loader2,
  Pencil,
  X,
  ChevronDown,
} from 'lucide-react';
import tenantService from '../../services/tenantService';
import { notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const EMPTY_BRANCH_FORM = {
    name: '',
    code: '',
    address: '',
    phone: '',
    email: '',
    logoUrl: '',
    receiptFooter: ''
};

const Branches = () => {
    const { user } = useAuth();
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [formData, setFormData] = useState(EMPTY_BRANCH_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [branchAdmins, setBranchAdmins] = useState([]);
    const [assignedAdminId, setAssignedAdminId] = useState('');

    const filteredBranches = branches.filter((branch) => {
        const matchesSearch = `${branch.name} ${branch.code}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'active' ? branch.isActive : !branch.isActive);
        return matchesSearch && matchesStatus;
    });

    useEffect(() => {
        fetchBranches();
        fetchBranchAdmins();
    }, []);

    const fetchBranchAdmins = async () => {
        try {
            const response = await tenantService.getUsers({ role: 'branch_admin' });
            setBranchAdmins(response.data || []);
        } catch (error) {
            console.error('Failed to load branch admin options:', error);
        }
    };

    const fetchBranches = async () => {
        try {
            const response = await tenantService.getBranches();
            setBranches(response.data);
        } catch (error) {
            console.error('Failed to load branches:', error);
            const msg = error.response?.data?.message || 'Connection interrupted while loading campuses';
            notify(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setAssignedAdminId('');
        setEditingBranch(null);
        setFormData(EMPTY_BRANCH_FORM);
    };

    const openCreateModal = () => {
        setEditingBranch(null);
        setFormData(EMPTY_BRANCH_FORM);
        setIsModalOpen(true);
    };

    const openEditModal = (branch) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name || '',
            code: branch.code || '',
            address: branch.address || '',
            phone: branch.phone || '',
            email: branch.email || '',
            logoUrl: branch.logoUrl || '',
            receiptFooter: branch.receiptFooter || ''
        });
        const currentAdmin = branchAdmins.find(admin => admin.branchId === branch._id);
        setAssignedAdminId(currentAdmin ? currentAdmin._id : '');
        setIsModalOpen(true);
    };

    const handleSaveBranch = async (e) => {
        e?.preventDefault?.();
        setSubmitting(true);
        try {
            let branchId = editingBranch?._id;
            if (branchId) {
                await tenantService.updateBranch(branchId, formData);
            } else {
                const res = await tenantService.createBranch(formData);
                branchId = res.data._id;
            }
            if (assignedAdminId) {
                await tenantService.assignBranchAdmin(branchId, assignedAdminId);
            }
            await fetchBranches();
            await fetchBranchAdmins();
            closeModal();
        } catch (error) {
            notify(error.response?.data?.message || `Failed to ${editingBranch ? 'update' : 'create'} branch`, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleStatus = async (id, currentStatus) => {
        try {
            await tenantService.updateBranchStatus(id, !currentStatus);
            fetchBranches();
        } catch {
            notify('Failed to update branch status', 'error');
        }
    };

    return (
        <div className="phoenix-resource-page">
            {/* Header Area */}
            <div className="phoenix-page-header">
                <div>
                     <h1 className="phoenix-page-title">Branches</h1>
                     <p className="phoenix-page-subtitle">Manage school locations, contact details, and branch administrators.</p>
                </div>
                {hasPermission(user, 'tenant.branches.create') && <button 
                  onClick={openCreateModal}
                  className="phoenix-primary-button"
                >
                    <Plus size={16} />
                    Add branch
                </button>}
            </div>

            {/* Filter Bar */}
            <div className="phoenix-resource-toolbar">
                <div className="flex-1 relative group">
                    <Search className="phoenix-input-icon" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search branches by name or code"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="phoenix-control phoenix-control-with-icon"
                    />
                </div>
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="phoenix-control phoenix-control-select min-w-40 appearance-none"
                    >
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <ChevronDown className="phoenix-select-icon" size={14} />
                </div>
                <span className="phoenix-toolbar-count">{filteredBranches.length} of {branches.length} branches</span>
            </div>

            {/* Grid */}
            <div className="phoenix-record-grid">
                {loading ? (
                    <div className="phoenix-loading-state">
                        <Loader2 className="animate-spin text-[var(--primary)]" size={28} />
                    </div>
                ) : filteredBranches.length === 0 ? (
                    <div className="phoenix-empty-state">
                        <Building2 size={28} />
                        <p>No branches match the current filters.</p>
                    </div>
                ) : (
                    filteredBranches.map((branch) => (
                        <article key={branch._id} className="phoenix-record-card">
                            <div className="flex justify-between items-start gap-4">
                                <div className="phoenix-record-logo">
                                    {branch.logoUrl ? (
                                        <img src={branch.logoUrl} alt={`${branch.name} logo`} className="w-full h-full object-contain" />
                                    ) : (
                                        <Building2 size={20} />
                                    )}
                                </div>
                                <span className={`phoenix-status ${branch.isActive ? 'phoenix-status-success' : 'phoenix-status-muted'}`}>
                                    {branch.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>

                            <div className="mt-4">
                                <h2 className="phoenix-record-title">{branch.name}</h2>
                                <div className="phoenix-record-meta mt-1.5">
                                    <Package size={14} />
                                    <span>Code {branch.code}</span>
                                </div>
                            </div>

                            <div className="phoenix-record-details">
                                <div className="phoenix-record-meta">
                                    <MapPin size={14} className="shrink-0" />
                                    <span className="truncate">{branch.address || 'Address not set'}</span>
                                </div>
                                <div className="phoenix-record-meta">
                                    <Phone size={14} className="shrink-0" />
                                    <span>{branch.phone || 'No phone'}</span>
                                </div>
                            </div>

                            <div className="phoenix-record-actions">
                                {hasPermission(user, 'tenant.branches.update') && <button
                                    onClick={() => openEditModal(branch)}
                                    className="phoenix-text-action"
                                >
                                    <Pencil size={14} /> Edit details
                                </button>}
                                {hasPermission(user, 'tenant.branches.deactivate') && <button
                                   onClick={() => toggleStatus(branch._id, branch.isActive)}
                                   className={`phoenix-text-action ${branch.isActive ? 'text-rose-600' : 'text-emerald-700'}`}
                                >
                                   {branch.isActive ? 'Deactivate' : 'Activate'}
                                </button>}
                            </div>

                        </article>
                    ))
                )}
            </div>

            {/* Create/Edit Branch Modal */}
            {isModalOpen && (
                <div className="phoenix-modal-backdrop">
                    <div className="phoenix-modal-scrim" onClick={closeModal} />
                    <div className="phoenix-modal-panel max-w-xl">
                        <div className="phoenix-modal-header">
                            <div>
                                <h3 className="phoenix-section-title">
                                    {editingBranch ? 'Edit branch' : 'Add branch'}
                                </h3>
                                <p className="phoenix-section-copy">
                                    {editingBranch ? 'Update this branch profile and assignment.' : 'Create a new operational school location.'}
                                </p>
                            </div>
                            <button onClick={closeModal} className="phoenix-icon-button" aria-label="Close dialog">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form id="branch-form" onSubmit={handleSaveBranch} className="phoenix-modal-body space-y-6 custom-scrollbar">
                            <div className="space-y-4">
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Branch Identity Name</label>
                                        <input 
                                            required
                                            type="text" 
                                            placeholder="Oxford Highlands Campus"
                                            className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm"
                                            value={formData.name}
                                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">System Identifier Code</label>
                                        <input 
                                            required
                                            type="text" 
                                            placeholder="OXF-001"
                                            className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all uppercase text-sm"
                                            value={formData.code}
                                            onChange={(e) => setFormData({...formData, code: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Physical Address</label>
                                    <input 
                                        type="text" 
                                        placeholder="45 Educational Ave, Sector 4"
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm"
                                        value={formData.address}
                                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                     <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Contact Phone</label>
                                        <input 
                                            type="text" 
                                            placeholder="+1 234 567"
                                            className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                        />
                                     </div>
                                     <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Official Email</label>
                                        <input 
                                            type="email" 
                                            placeholder="oxf1@school.com"
                                            className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm"
                                            value={formData.email}
                                            onChange={(e) => setFormData({...formData, email: e.target.value})}

                                        />
                                     </div>
                                </div>
                            </div>

                            <div className="space-y-4 border-t border-slate-200 pt-5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Receipt Customization Footer</label>
                                    <textarea 
                                        placeholder="Thank you for choosing Oxford Highlands Education."
                                        className="w-full h-24 bg-white border border-slate-200 rounded-lg p-3 font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary)]/10 transition-all resize-none text-sm"
                                        value={formData.receiptFooter}
                                        onChange={(e) => setFormData({...formData, receiptFooter: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5 border-t border-slate-100 pt-4">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1 font-bold">Assign Branch Admin</label>
                                <div className="relative">
                                    <select
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all outline-none appearance-none text-sm cursor-pointer"
                                        value={assignedAdminId}
                                        onChange={(e) => setAssignedAdminId(e.target.value)}
                                    >
                                        <option value="">No branch admin assigned</option>
                                        {branchAdmins.map(admin => (
                                            <option key={admin._id} value={admin._id}>
                                                {admin.name} ({admin.email})
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="phoenix-select-icon" size={14} />
                                </div>
                            </div>
                        </form>

                        <div className="phoenix-modal-footer">
                             <button 
                                onClick={closeModal}
                                className="phoenix-secondary-button"
                             >
                                Cancel
                             </button>
                             <button 
                                type="submit"
                                form="branch-form"
                                disabled={submitting}
                                className="phoenix-primary-button disabled:opacity-50"
                             >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editingBranch ? 'Save changes' : 'Create branch'}
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Branches;


