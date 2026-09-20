import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Layers, 
  Check, 
  X, 
  Settings2, 
  ShieldCheck,
  Zap,
  Star,
  Crown,
  Trash2,
  Save,
  Palette
} from 'lucide-react';
import platformService from '../../services/platformService';

const iconMap = { Zap, Star, Crown, ShieldCheck };

const Plans = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    price: '',
    monthlyPrice: '',
    yearlyPrice: '',
    maxBranches: '',
    maxStudents: '',
    maxUsers: '',
    storage: '',
    hasPrioritySupport: false,
    icon: 'Zap',
    color: 'text-blue-600',
    bg: 'bg-blue-50'
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const response = await platformService.getPlans();
      const enrichedPlans = response.data.map(plan => ({
        ...plan,
        iconComponent: iconMap[plan.icon] || Zap
      }));
      setPlans(enrichedPlans);
    } catch (error) {
       console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (plan = null) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        slug: plan.slug,
        price: plan.price,
        monthlyPrice: plan.monthlyPrice ?? plan.price,
        yearlyPrice: plan.yearlyPrice ?? '',
        maxBranches: plan.maxBranches,
        maxStudents: plan.maxStudents,
        maxUsers: plan.maxUsers,
        storage: plan.storage,
        hasPrioritySupport: plan.hasPrioritySupport,
        icon: plan.icon,
        color: plan.color,
        bg: plan.bg
      });
    } else {
      setEditingPlan(null);
      setFormData({
        name: '', slug: '', price: '', monthlyPrice: '', yearlyPrice: '', maxBranches: '', maxStudents: '', maxUsers: '',
        storage: '5GB', hasPrioritySupport: false, icon: 'Zap', color: 'text-blue-600', bg: 'bg-blue-50'
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPlan) {
        await platformService.updatePlan(editingPlan._id, { ...formData, price: formData.monthlyPrice });
      } else {
        await platformService.createPlan({ ...formData, price: formData.monthlyPrice });
      }
      setShowModal(false);
      fetchPlans();
    } catch (error) {
      alert(error.response?.data?.message || 'Error saving plan');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Deactivate this plan? Existing tenants will keep their plan history, but it cannot be assigned again.')) {
      try {
        await platformService.deletePlan(id);
        fetchPlans();
      } catch (error) {
        alert(error.response?.data?.message || 'Error deleting plan');
      }
    }
  };

  if (loading && plans.length === 0) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Subscription Tiers</h2>
          <p className="text-slate-500 text-xs mt-1">Manage platform resource limits and pricing models.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="h-10 bg-blue-600 text-white px-5 rounded-lg font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-500 transition shadow"
        >
          <Plus size={16} />
          <span>Create New Tier</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan._id} className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col group relative ${plan.isActive === false ? 'opacity-60' : ''}`}>
            <div className={`p-5 ${plan.bg}`}>
              <div className="flex justify-between items-start mb-3">
                <div className={`${plan.color} group-hover:scale-105 transition-transform`}>
                  {plan.iconComponent && <plan.iconComponent size={24} />}
                </div>
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleOpenModal(plan)} className="p-1.5 bg-white/80 rounded-lg hover:bg-white transition shadow-sm text-slate-600">
                    <Settings2 size={14} />
                  </button>
                  <button disabled={plan.isActive === false} onClick={() => handleDelete(plan._id)} className="p-1.5 bg-white/80 rounded-lg hover:bg-red-50 hover:text-red-500 transition shadow-sm text-slate-600 disabled:opacity-30">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">{plan.name}</h3>
              <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${plan.isActive === false ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                {plan.isActive === false ? 'Inactive' : 'Active'}
              </span>
              <div className="mt-2 flex items-baseline gap-0.5">
                <span className="text-2xl font-black text-slate-900 leading-none">
                  {typeof plan.monthlyPrice === 'number' ? `$${plan.monthlyPrice}` : plan.price}
                </span>
                {typeof plan.monthlyPrice === 'number' && <span className="text-slate-500 font-bold text-xs">/mo</span>}
              </div>
              {typeof plan.yearlyPrice === 'number' && <p className="text-xs font-bold text-slate-500 mt-1">${plan.yearlyPrice}/year</p>}
            </div>
            
            <div className="p-5 space-y-3.5 flex-1 bg-white">
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 text-slate-600">
                  <ShieldCheck size={16} className="text-blue-500 opacity-60" />
                  <span className="text-xs font-semibold opacity-70">Branches</span>
                </div>
                <span className="font-bold text-sm text-slate-800">{plan.maxBranches}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 text-slate-600">
                  <Check size={16} className="text-blue-500 opacity-60" />
                  <span className="text-xs font-semibold opacity-70">Students</span>
                </div>
                <span className="font-bold text-sm text-slate-800">{plan.maxStudents}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 text-slate-600">
                  <Layers size={16} className="text-blue-500 opacity-60" />
                  <span className="text-xs font-semibold opacity-70">Storage</span>
                </div>
                <span className="font-bold text-sm text-slate-800">{plan.storage}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 text-slate-600">
                  <Star size={16} className="text-blue-500 opacity-60" />
                  <span className="text-xs font-semibold opacity-70">Support</span>
                </div>
                {plan.hasPrioritySupport ? <Check size={16} className="text-emerald-500" /> : <X size={16} className="text-slate-300" />}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/30">
               <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Slug ID: {plan.slug}</span>
            </div>
          </div>
        ))}

        {/* Empty Placeholder if no plans */}
        {plans.length === 0 && !loading && (
          <div className="col-span-full bg-white border-2 border-dashed border-slate-200 rounded-xl p-10 text-center">
             <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-300">
               <Layers size={28} />
             </div>
             <h3 className="text-lg font-black text-slate-800 mb-1">No tiers defined</h3>
             <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto">Start by creating your first subscription plan to onboard school tenants.</p>
             <button onClick={() => handleOpenModal()} className="h-10 px-6 bg-blue-600 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition shadow">
               INITIALIZE PLANS
             </button>
          </div>
        )}
      </div>

      {/* Modern Modal Interface */}
      {showModal && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <h3 className="text-lg font-black text-slate-900 tracking-tight">{editingPlan ? 'Refine Subscription Tier' : 'Craft New Subscription Tier'}</h3>
               <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition text-slate-400">
                 <X size={20} />
               </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[75vh] custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Plan Name</label>
                  <input 
                    type="text" required
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.name}
                    placeholder="e.g. Professional"
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Identifier Slug</label>
                  <input 
                    type="text" required
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.slug}
                    placeholder="e.g. pro"
                    onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/\s/g, '-')})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Monthly Cost ($)</label>
                  <input 
                    type="number" min="0" step="0.01" required
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.monthlyPrice}
                    placeholder="e.g. 149"
                    onChange={e => setFormData({...formData, monthlyPrice: e.target.value})}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Yearly Cost ($)</label>
                  <input 
                    type="number" min="0" step="0.01" required
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.yearlyPrice}
                    placeholder="e.g. 1490"
                    onChange={e => setFormData({...formData, yearlyPrice: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Storage Allocation</label>
                <input
                  type="text" required
                  className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                  value={formData.storage}
                  placeholder="e.g. 100GB"
                  onChange={e => setFormData({...formData, storage: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Branches</label>
                  <input 
                    type="text" required
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.maxBranches}
                    placeholder="e.g. 5"
                    onChange={e => setFormData({...formData, maxBranches: e.target.value})}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Students</label>
                  <input 
                    type="text" required
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.maxStudents}
                    placeholder="e.g. 2000"
                    onChange={e => setFormData({...formData, maxStudents: e.target.value})}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Users</label>
                  <input 
                    type="text" required
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.maxUsers}
                    placeholder="e.g. 100"
                    onChange={e => setFormData({...formData, maxUsers: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Aesthetic Icon</label>
                  <select 
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.icon}
                    onChange={e => setFormData({...formData, icon: e.target.value})}
                  >
                    <option value="Zap">Zap (Lightning)</option>
                    <option value="Star">Star (Premium)</option>
                    <option value="Crown">Crown (Enterprise)</option>
                    <option value="ShieldCheck">Shield (Secure)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                   <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Color Theme</label>
                   <select 
                    className="h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                    value={formData.color}
                    onChange={e => setFormData({...formData, color: e.target.value, bg: e.target.value.replace('text', 'bg').replace('600', '50')})}
                  >
                    <option value="text-blue-600">Ocean Blue</option>
                    <option value="text-purple-600">Royal Purple</option>
                    <option value="text-amber-600">Golden Amber</option>
                    <option value="text-emerald-600">Nature Emerald</option>
                    <option value="text-rose-600">Rose Red</option>
                  </select>
                </div>
                <div className="flex items-center gap-2.5 pt-4">
                   <input 
                    type="checkbox" id="support" 
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/10 cursor-pointer"
                    checked={formData.hasPrioritySupport}
                    onChange={e => setFormData({...formData, hasPrioritySupport: e.target.checked})}
                   />
                   <label htmlFor="support" className="text-[10px] font-black uppercase tracking-wider text-slate-600 cursor-pointer">Priority Support</label>
                </div>
              </div>

              <div className="pt-4">
                 <button 
                  type="submit" 
                  className="w-full h-10 bg-slate-900 text-white rounded-lg font-black text-xs uppercase tracking-widest shadow hover:bg-slate-800 transition active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Save size={14} />
                  {editingPlan ? 'SAVE CHANGES' : 'LAUNCH NEW PLAN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Plans;
