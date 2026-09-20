import React, { useState, useEffect } from 'react';
import {
    ArrowLeft, School, Globe, Layers, Mail, User,
    CheckCircle2, ChevronRight, ShieldCheck, Lock,
    ExternalLink, Loader2, Palette, Eye, EyeOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import platformService from '../../services/platformService';

const NAVY = '#1b2a4a';
const BLUE = '#4477f5';
const BLUE_LITE = '#e8f0fe';

const FieldLabel = ({ children }) => (
    <label className="block text-[12px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5 ml-0.5">
        {children}
    </label>
);

const InputField = ({ icon: Icon, ...props }) => (
    <div className="relative">
        {Icon && <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />}
        <input
            className={`w-full h-11 ${Icon ? 'pl-10' : 'pl-4'} pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition`}
            {...props}
        />
    </div>
);

const StepBadge = ({ num, active, done }) => (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-sm flex-shrink-0 transition-all ${
        done   ? 'text-white' :
        active ? 'text-white' : 'bg-slate-100 text-slate-400'
    }`} style={done ? { background: '#10b981' } : active ? { background: NAVY } : {}}>
        {done ? <CheckCircle2 size={18} /> : num}
    </div>
);

const NewTenant = () => {
    const navigate = useNavigate();
    const [plans, setPlans] = useState([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        domain: '',
        plan: 'basic',
        billingCycle: 'monthly',
        adminEmail: '',
        adminName: '',
        adminPassword: '',
        primaryColor: '#1b2a4a',
        secondaryColor: '#4477f5',
    });

    useEffect(() => {
        platformService.getPlans()
            .then(res => {
                setPlans(res.data);
                if (res.data.length > 0) setFormData(p => ({ ...p, plan: res.data[0].slug }));
            })
            .catch(() => {})
            .finally(() => setPlansLoading(false));
    }, []);

    const set = (key, val) => setFormData(p => ({ ...p, [key]: val }));

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const data = new FormData();
            Object.keys(formData).forEach(k => data.append(k, formData[k]));
            if (logoFile) data.append('logo', logoFile);
            await platformService.createTenant(data);
            setStep(3);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create school. Please check your data.');
        } finally {
            setLoading(false);
        }
    };

    if (plansLoading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-[#4477f5] rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto pb-20">
            {/* Back */}
            <button
                onClick={() => navigate('/platform/tenants')}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition mb-6"
            >
                <ArrowLeft size={16} /> Back to Tenants
            </button>

            {/* Page title */}
            <div className="mb-8">
                <h2 className="text-2xl font-extrabold text-slate-900">Add New School</h2>
                <p className="text-slate-500 text-sm mt-1">Onboard a new school onto the MadrasaHub platform.</p>
            </div>

            {/* Step progress */}
            <div className="flex items-center gap-3 mb-8">
                <StepBadge num={1} active={step === 1} done={step > 1} />
                <div className="flex-1 h-1 rounded-full" style={{ background: step > 1 ? '#10b981' : '#e2e8f0' }} />
                <StepBadge num={2} active={step === 2} done={step > 2} />
                <div className="flex-1 h-1 rounded-full" style={{ background: step > 2 ? '#10b981' : '#e2e8f0' }} />
                <StepBadge num={3} active={step === 3} done={false} />
            </div>

            {/* Step labels */}
            <div className="flex justify-between text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-8 px-1">
                <span style={step >= 1 ? { color: NAVY } : {}}>School Info</span>
                <span style={step >= 2 ? { color: NAVY } : {}}>Admin Account</span>
                <span style={step >= 3 ? { color: '#10b981' } : {}}>Complete</span>
            </div>

            {/* Error */}
            {error && (
                <div className="mb-5 flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-semibold">
                    <ShieldCheck size={16} className="flex-shrink-0 mt-0.5" />
                    {error}
                </div>
            )}

            {/* ── Step 1: School Info ── */}
            {step === 1 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100">
                        <h3 className="font-extrabold text-slate-800">School Information</h3>
                        <p className="text-sm text-slate-400 font-medium mt-0.5">Basic details about the school</p>
                    </div>
                    <div className="p-6 space-y-5">
                        {/* Name + Domain */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <FieldLabel>School Name</FieldLabel>
                                <InputField icon={School} type="text" placeholder="e.g. Al-Nuur Academy"
                                    value={formData.name} onChange={e => set('name', e.target.value)} />
                            </div>
                            <div>
                                <FieldLabel>Domain Slug</FieldLabel>
                                <div className="flex">
                                    <div className="relative flex-1">
                                        <Globe size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input type="text" placeholder="al-nuur"
                                            className="w-full h-11 pl-10 pr-3 bg-slate-50 border border-slate-200 border-r-0 rounded-l-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition"
                                            value={formData.domain}
                                            onChange={e => set('domain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
                                    </div>
                                    <div className="h-11 px-3 flex items-center bg-slate-100 border border-slate-200 rounded-r-xl text-xs font-bold text-slate-500 whitespace-nowrap">
                                        .schoolapp.com
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Plan selection */}
                        <div>
                            <FieldLabel>Subscription Plan</FieldLabel>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {plans.map(p => (
                                    <button key={p._id} type="button"
                                        onClick={() => set('plan', p.slug)}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                                            formData.plan === p.slug
                                                ? 'border-[#1b2a4a] bg-white shadow-md'
                                                : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                        }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`text-[10px] font-extrabold uppercase tracking-widest ${formData.plan === p.slug ? 'text-slate-900' : 'text-slate-400'}`}>
                                                {p.slug}
                                            </span>
                                            {formData.plan === p.slug && <CheckCircle2 size={15} style={{ color: NAVY }} />}
                                        </div>
                                        <p className="font-extrabold text-sm text-slate-900">{p.name}</p>
                                        <div className="mt-2 space-y-0.5">
                                            <p className="text-[10px] font-bold text-slate-400">{p.maxBranches} Branches</p>
                                            <p className="text-[10px] font-bold text-slate-400">{p.maxStudents} Students</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <FieldLabel>Billing Cycle</FieldLabel>
                            <select value={formData.billingCycle} onChange={e => set('billingCycle', e.target.value)}
                                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition">
                                <option value="monthly">Monthly billing</option>
                                <option value="yearly">Yearly billing</option>
                            </select>
                        </div>

                        {/* Branding */}
                        <div>
                            <FieldLabel>School Branding</FieldLabel>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <p className="text-[11px] font-bold text-slate-500 mb-1.5">Primary Color</p>
                                    <div className="flex gap-2">
                                        <input type="color" className="w-11 h-11 rounded-xl cursor-pointer border border-slate-200 p-0.5 bg-white"
                                            value={formData.primaryColor} onChange={e => set('primaryColor', e.target.value)} />
                                        <input type="text" className="flex-1 h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition"
                                            value={formData.primaryColor} onChange={e => set('primaryColor', e.target.value)} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-500 mb-1.5">Secondary Color</p>
                                    <div className="flex gap-2">
                                        <input type="color" className="w-11 h-11 rounded-xl cursor-pointer border border-slate-200 p-0.5 bg-white"
                                            value={formData.secondaryColor} onChange={e => set('secondaryColor', e.target.value)} />
                                        <input type="text" className="flex-1 h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition"
                                            value={formData.secondaryColor} onChange={e => set('secondaryColor', e.target.value)} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-500 mb-1.5">School Logo</p>
                                    <label className="relative flex items-center gap-3 h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-white hover:border-slate-300 transition">
                                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                            {logoPreview
                                                ? <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                                                : <Palette size={14} className="text-slate-400" />
                                            }
                                        </div>
                                        <span className="text-xs font-semibold text-slate-500">{logoFile ? logoFile.name.slice(0, 14) + '…' : 'Upload logo'}</span>
                                        <input type="file" accept="image/*" onChange={handleLogoChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setStep(2)}
                                disabled={!formData.name || !formData.domain}
                                className="flex items-center gap-2 px-6 h-11 rounded-xl font-bold text-sm text-white hover:opacity-90 transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ background: NAVY }}
                            >
                                Continue to Admin Setup <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Step 2: Admin Account ── */}
            {step === 2 && (
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100">
                        <h3 className="font-extrabold text-slate-800">Admin Account</h3>
                        <p className="text-sm text-slate-400 font-medium mt-0.5">Credentials for the school's Super Admin</p>
                    </div>
                    <div className="p-6 space-y-5">
                        <div>
                            <FieldLabel>Admin Full Name</FieldLabel>
                            <InputField icon={User} type="text" placeholder="e.g. Ahmed Hassan"
                                value={formData.adminName} onChange={e => set('adminName', e.target.value)} required />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <FieldLabel>Admin Email</FieldLabel>
                                <InputField icon={Mail} type="email" placeholder="admin@school.com"
                                    value={formData.adminEmail} onChange={e => set('adminEmail', e.target.value)} required />
                            </div>
                            <div>
                                <FieldLabel>Password</FieldLabel>
                                <div className="relative">
                                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters"
                                        className="w-full h-11 pl-10 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition"
                                        value={formData.adminPassword} onChange={e => set('adminPassword', e.target.value)}
                                        required minLength={8} />
                                    <button type="button" onClick={() => setShowPassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Info box */}
                        <div className="flex items-start gap-3 p-4 rounded-xl border" style={{ background: BLUE_LITE, borderColor: '#c7d9fd' }}>
                            <ShieldCheck size={16} className="flex-shrink-0 mt-0.5" style={{ color: BLUE }} />
                            <p className="text-[12px] font-semibold" style={{ color: '#2a4a8c' }}>
                                This admin will have full control over the school — branches, students, teachers, and finances.
                            </p>
                        </div>

                        <div className="flex justify-between pt-2">
                            <button type="button" onClick={() => setStep(1)}
                                className="px-5 h-11 rounded-xl font-bold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition">
                                ← Go Back
                            </button>
                            <button type="submit" disabled={loading}
                                className="flex items-center gap-2 px-6 h-11 rounded-xl font-bold text-sm text-white hover:opacity-90 transition shadow-md disabled:opacity-50"
                                style={{ background: NAVY }}>
                                {loading ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : <><CheckCircle2 size={16} /> Create School</>}
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* ── Step 3: Success ── */}
            {step === 3 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 text-white"
                        style={{ background: '#10b981' }}>
                        <CheckCircle2 size={32} />
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-900 mb-2">School Created!</h2>
                    <p className="text-slate-500 text-sm mb-2 max-w-sm mx-auto leading-relaxed">
                        <span className="font-bold text-slate-800">"{formData.name}"</span> has been successfully onboarded to MadrasaHub.
                    </p>
                    <p className="text-sm font-bold mb-8" style={{ color: BLUE }}>
                        {formData.domain}.schoolapp.com
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={() => navigate('/platform/tenants')}
                            className="px-6 h-11 rounded-xl font-bold text-sm text-white hover:opacity-90 transition shadow-md"
                            style={{ background: NAVY }}>
                            View All Schools
                        </button>
                        <a href={`https://${formData.domain}.schoolapp.com`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-xl font-bold text-sm border-2 hover:bg-slate-50 transition"
                            style={{ borderColor: NAVY, color: NAVY }}>
                            <ExternalLink size={15} /> Visit Domain
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NewTenant;
