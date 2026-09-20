import React, { useState, useEffect, useRef } from 'react';
import {
    Mail, Palette, Save,
    ShieldCheck, Globe, Loader2, CheckCircle2,
    Smartphone, Pencil, X, Eye, EyeOff
} from 'lucide-react';
import platformService from '../../services/platformService';
import { API_ORIGIN } from '../../services/api';
import { notify } from '../../components/feedback/notificationService';

const NAVY  = '#1b2a4a';
const BLUE  = '#4477f5';
const BLUE_LITE = '#e8f0fe';
const EMPTY_SETTINGS = {
    platformName: '', officialWebsite: '',
    primaryColor: '#1b2a4a', secondaryColor: '#4477f5',
    supportEmail: '', contactPhone: '', defaultCurrency: 'USD', defaultPlan: 'basic',
    isRegistrationEnabled: true, smtpHost: '', smtpPort: '', smtpUser: '',
    smtpPass: '', senderEmail: '',
};

/* ─── Tab definitions ────────────────────────────────────────── */
const tabs = [
    { id: 'branding',  label: 'Branding',     icon: Palette },
    { id: 'smtp',      label: 'Email (SMTP)',  icon: Mail },
];

const tabDesc = {
    branding : 'Customise the platform name, website and brand colours.',
    smtp     : 'Configure outgoing email delivery for the platform.',
};

/* ─── Read-only row ──────────────────────────────────────────── */
const InfoRow = ({ label, value, mono = false }) => (
    <div className="rounded-xl border border-[#dbe6fb] bg-[#f8fbff] px-4 py-3.5">
        <span className="block text-[12px] font-semibold text-[#526587]">
            {label}
        </span>
        <span className={`mt-1 block text-[15px] font-semibold text-[#14223d] break-all ${mono ? 'font-mono' : ''}`}>
            {value || <span className="text-[#8da0c0] font-medium italic">Not set</span>}
        </span>
    </div>
);

/* ─── Form field ─────────────────────────────────────────────── */
const Field = ({ label, children }) => (
    <div className="grid grid-cols-[160px_1fr] items-start gap-4">
        <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-400 pt-3 leading-none">
            {label}
        </label>
        <div>{children}</div>
    </div>
);

const Input = ({ icon: Icon, className = '', ...props }) => (
    <div className="relative">
        {Icon && <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
        <input
            className={`w-full h-11 ${Icon ? 'pl-10' : 'pl-4'} pr-4 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition ${className}`}
            {...props}
        />
    </div>
);

/* ═══════════════════════════════════════════════════════════════ */
const Settings = () => {
    const [activeTab,  setActiveTab]  = useState('branding');
    const [editing,    setEditing]    = useState(false);
    const [loading,    setLoading]    = useState(false);
    const [fetching,   setFetching]   = useState(true);
    const [success,    setSuccess]    = useState(false);
    const [showPass,   setShowPass]   = useState(false);
    const [logoFile,   setLogoFile]   = useState(null);
    const [logoPreview,setLogoPreview]= useState(null);
    const fileRef = useRef();

    const [settings,  setSettings]  = useState(EMPTY_SETTINGS);
    const [original,  setOriginal]  = useState(EMPTY_SETTINGS); // snapshot for cancel

    const getPreviewUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `${API_ORIGIN}${url}`;
    };

    useEffect(() => {
        platformService.getSettings()
            .then(res => { 
                const data = res.data || EMPTY_SETTINGS;
                setSettings(data); 
                setOriginal(data); 
                if (data.logoUrl) {
                    setLogoPreview(getPreviewUrl(data.logoUrl));
                }
            })
            .catch(() => {})
            .finally(() => setFetching(false));
    }, []);

    const set = (k, v) => setSettings(p => ({ ...p, [k]: v }));

    const handleEdit = () => { setOriginal({ ...settings }); setEditing(true); };
    const handleCancel = () => { 
        setSettings({ ...original }); 
        setEditing(false); 
        setLogoFile(null); 
        setLogoPreview(original.logoUrl ? getPreviewUrl(original.logoUrl) : null); 
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            let payload;
            if (logoFile) {
                payload = new FormData();
                Object.keys(settings).forEach(key => {
                    if (settings[key] !== undefined && settings[key] !== null) {
                        payload.append(key, settings[key]);
                    }
                });
                payload.append('logo', logoFile);
            } else {
                payload = settings;
            }

            const res = await platformService.updateSettings(payload);
            const savedData = res.data?.settings || res.data || settings;
            setSettings(savedData);
            setOriginal(savedData);
            if (savedData.logoUrl) {
                setLogoPreview(getPreviewUrl(savedData.logoUrl));
            }
            setSuccess(true);
            setEditing(false);
            setLogoFile(null);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            console.error(err);
            notify('Failed to save settings. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleTestSmtp = async () => {
        setLoading(true);
        try {
            const res = await platformService.testEmail(settings);
            notify(res.data.message + (res.data.details ? ` ${res.data.details}` : ''), 'success');
        } catch (err) {
            notify(err.response?.data?.message || 'SMTP test failed. Check your credentials.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
    };

    /* switch tab → always exit edit mode */
    const switchTab = (id) => { setActiveTab(id); setEditing(false); };

    if (fetching) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-[#4477f5] rounded-full animate-spin" />
        </div>
    );

    const activeTabMeta = tabs.find(t => t.id === activeTab);
    const isEditable = activeTab === 'branding' || activeTab === 'smtp';

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h2 className="text-2xl font-extrabold text-slate-900">Platform Settings</h2>
                <p className="text-slate-500 text-sm mt-1">Configure global settings for the MadrasaHub platform.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* ── Tab sidebar ───────────────────────────────── */}
                <div className="md:w-52 flex-shrink-0">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 space-y-0.5">
                        {tabs.map(tab => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => switchTab(tab.id)}
                                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all text-left"
                                    style={active
                                        ? { background: NAVY, color: '#fff' }
                                        : { color: '#64748b', background: 'transparent' }
                                    }
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f8fafc'; }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <tab.icon size={16} className="flex-shrink-0" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Settings panel ────────────────────────────── */}
                <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {/* Panel header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                                style={{ background: BLUE }}>
                                {activeTabMeta && <activeTabMeta.icon size={17} />}
                            </div>
                            <div>
                                <h3 className="font-extrabold text-slate-800 text-[0.95rem]">{activeTabMeta?.label}</h3>
                                <p className="text-[11px] text-slate-400 font-medium mt-0.5 leading-none">{tabDesc[activeTab]}</p>
                            </div>
                        </div>

                        {/* Action buttons — top-right of panel */}
                        {isEditable && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {!editing ? (
                                    <button
                                        onClick={handleEdit}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
                                    >
                                        <Pencil size={15} /> Edit
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleCancel}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
                                        >
                                            <X size={15} /> Cancel
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={loading}
                                            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 transition disabled:opacity-60"
                                            style={{ background: success ? '#10b981' : NAVY }}
                                        >
                                            {loading  ? <><Loader2 size={15} className="animate-spin" /> Saving...</> :
                                             success  ? <><CheckCircle2 size={15} /> Saved!</> :
                                                        <><Save size={15} /> Save Changes</>}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Panel body ────────────────────────────── */}
                    <div className="p-6">

                        {/* ════════ BRANDING ════════ */}
                        {activeTab === 'branding' && !editing && (
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                <InfoRow label="Platform Name"    value={settings.platformName} />
                                <InfoRow label="Official Website" value={settings.officialWebsite} />
                                <InfoRow label="Support Email"    value={settings.supportEmail} />
                                <InfoRow label="Contact Phone"    value={settings.contactPhone} />
                                <InfoRow label="Default Currency" value={settings.defaultCurrency} />
                                <InfoRow label="Default Plan" value={settings.defaultPlan} />
                                <InfoRow label="Public Registration" value={settings.isRegistrationEnabled === false ? 'Disabled' : 'Enabled'} />
                                <div className="rounded-xl border border-[#dbe6fb] bg-[#f8fbff] px-4 py-3.5">
                                    <span className="block text-[12px] font-semibold text-[#526587]">
                                        Primary Colour
                                    </span>
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg border border-slate-200 flex-shrink-0"
                                            style={{ background: settings.primaryColor || '#1b2a4a' }} />
                                        <span className="text-sm font-mono font-semibold text-[#14223d]">
                                            {settings.primaryColor || '#1b2a4a'}
                                        </span>
                                    </div>
                                </div>
                                <div className="rounded-xl border border-[#dbe6fb] bg-[#f8fbff] px-4 py-3.5">
                                    <span className="block text-[12px] font-semibold text-[#526587]">
                                        Secondary Colour
                                    </span>
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg border border-slate-200 flex-shrink-0"
                                            style={{ background: settings.secondaryColor || '#4477f5' }} />
                                        <span className="text-sm font-mono font-semibold text-[#14223d]">
                                            {settings.secondaryColor || '#4477f5'}
                                        </span>
                                    </div>
                                </div>
                                <div className="rounded-xl border border-[#dbe6fb] bg-[#f8fbff] px-4 py-3.5">
                                    <span className="block text-[12px] font-semibold text-[#526587]">
                                        Logo
                                    </span>
                                    {settings.logoUrl ? (
                                        <div className="mt-2 w-14 h-14 bg-white rounded-xl border border-[#dbe6fb] overflow-hidden flex items-center justify-center p-1">
                                            <img src={getPreviewUrl(settings.logoUrl)} alt="Platform Logo" className="w-full h-full object-contain" />
                                        </div>
                                    ) : (
                                        <span className="mt-1 block text-sm font-medium text-[#8da0c0] italic">Not uploaded</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'branding' && editing && (
                            <div className="space-y-5">
                                <Field label="Platform Name">
                                    <Input type="text" placeholder="MadrasaHub"
                                        value={settings.platformName || ''}
                                        onChange={e => set('platformName', e.target.value)} />
                                </Field>
                                <Field label="Official Website">
                                    <Input icon={Globe} type="text" placeholder="https://madrasahub.com"
                                        value={settings.officialWebsite || ''}
                                        onChange={e => set('officialWebsite', e.target.value)} />
                                </Field>
                                <Field label="Support Email">
                                    <Input icon={Mail} type="email" placeholder="support@madrasahub.com"
                                        value={settings.supportEmail || ''}
                                        onChange={e => set('supportEmail', e.target.value)} />
                                </Field>
                                <Field label="Contact Phone">
                                    <Input type="text" placeholder="+1 555 0100"
                                        value={settings.contactPhone || ''}
                                        onChange={e => set('contactPhone', e.target.value)} />
                                </Field>
                                <Field label="Default Currency">
                                    <Input type="text" placeholder="USD"
                                        value={settings.defaultCurrency || ''}
                                        onChange={e => set('defaultCurrency', e.target.value.toUpperCase())} />
                                </Field>
                                <Field label="Default Plan">
                                    <Input type="text" placeholder="basic"
                                        value={settings.defaultPlan || ''}
                                        onChange={e => set('defaultPlan', e.target.value.toLowerCase())} />
                                </Field>
                                <Field label="Public Registration">
                                    <label className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                                        <input type="checkbox" checked={settings.isRegistrationEnabled !== false}
                                            onChange={e => set('isRegistrationEnabled', e.target.checked)} />
                                        Allow schools to submit registrations
                                    </label>
                                </Field>
                                <Field label="Primary Colour">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl border border-slate-200 overflow-hidden flex-shrink-0">
                                            <input type="color"
                                                className="w-full h-full cursor-pointer border-0 p-0.5 bg-transparent"
                                                value={settings.primaryColor || '#1b2a4a'}
                                                onChange={e => set('primaryColor', e.target.value)} />
                                        </div>
                                        <Input type="text" placeholder="#1b2a4a"
                                            className="max-w-[140px]"
                                            value={settings.primaryColor || ''}
                                            onChange={e => set('primaryColor', e.target.value)} />
                                        <div className="w-11 h-11 rounded-xl border-2 border-white shadow-sm flex-shrink-0"
                                            style={{ background: settings.primaryColor || '#1b2a4a' }} />
                                        <span className="text-xs font-semibold text-slate-400">Live preview</span>
                                    </div>
                                </Field>
                                <Field label="Secondary Colour">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl border border-slate-200 overflow-hidden flex-shrink-0">
                                            <input type="color"
                                                className="w-full h-full cursor-pointer border-0 p-0.5 bg-transparent"
                                                value={settings.secondaryColor || '#4477f5'}
                                                onChange={e => set('secondaryColor', e.target.value)} />
                                        </div>
                                        <Input type="text" placeholder="#4477f5"
                                            className="max-w-[140px]"
                                            value={settings.secondaryColor || ''}
                                            onChange={e => set('secondaryColor', e.target.value)} />
                                        <div className="w-11 h-11 rounded-xl border-2 border-white shadow-sm flex-shrink-0"
                                            style={{ background: settings.secondaryColor || '#4477f5' }} />
                                        <span className="text-xs font-semibold text-slate-400">Live preview</span>
                                    </div>
                                </Field>
                                <Field label="Platform Logo">
                                    <label
                                        className="flex items-center gap-4 px-5 py-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-white hover:border-slate-300 transition cursor-pointer"
                                        onClick={() => fileRef.current?.click()}
                                    >
                                        <div className="w-14 h-14 bg-white rounded-xl border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                            {logoPreview
                                                ? <img src={logoPreview} alt="Preview" className="w-full h-full object-cover" />
                                                : <Palette size={22} className="text-slate-300" />
                                            }
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-slate-700">
                                                {logoFile ? logoFile.name : 'Upload Platform Logo'}
                                            </p>
                                            <p className="text-xs text-slate-400 font-medium mt-0.5">SVG or PNG recommended · Max 2 MB</p>
                                            <p className="text-xs font-bold mt-1.5" style={{ color: BLUE }}>Browse file</p>
                                        </div>
                                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                                    </label>
                                </Field>
                            </div>
                        )}

                        {/* ════════ SMTP ════════ */}
                        {activeTab === 'smtp' && !editing && (
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                <InfoRow label="SMTP Host"     value={settings.smtpHost} mono />
                                <InfoRow label="Port"          value={settings.smtpPort} mono />
                                <InfoRow label="Username"      value={settings.smtpUser} />
                                <InfoRow label="Password"      value={settings.smtpPass ? '••••••••' : ''} />
                                <InfoRow label="Sender Email"  value={settings.senderEmail} />
                            </div>
                        )}

                        {activeTab === 'smtp' && editing && (
                            <div className="space-y-5">
                                {/* Info banner */}
                                <div className="flex items-start gap-3 p-4 rounded-xl border" style={{ background: BLUE_LITE, borderColor: '#c7d9fd' }}>
                                    <ShieldCheck size={15} className="flex-shrink-0 mt-0.5" style={{ color: BLUE }} />
                                    <p className="text-[12px] font-semibold leading-relaxed" style={{ color: '#2a4a8c' }}>
                                        This configuration handles all outgoing emails — password resets, invoices, and notifications.
                                    </p>
                                </div>

                                <Field label="SMTP Host">
                                    <Input type="text" placeholder="smtp.gmail.com"
                                        value={settings.smtpHost || ''}
                                        onChange={e => set('smtpHost', e.target.value)} />
                                </Field>
                                <Field label="Port">
                                    <Input type="text" placeholder="587"
                                        className="max-w-[120px]"
                                        value={settings.smtpPort || ''}
                                        onChange={e => set('smtpPort', e.target.value)} />
                                </Field>
                                <Field label="Username">
                                    <Input type="text" placeholder="your@email.com"
                                        value={settings.smtpUser || ''}
                                        onChange={e => set('smtpUser', e.target.value)} />
                                </Field>
                                <Field label="Password">
                                    <div className="relative max-w-sm">
                                        <input
                                            type={showPass ? 'text' : 'password'}
                                            placeholder="SMTP password"
                                            className="w-full h-11 pl-4 pr-11 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition"
                                            value={settings.smtpPass || ''}
                                            onChange={e => set('smtpPass', e.target.value)}
                                        />
                                        <button type="button"
                                            onClick={() => setShowPass(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                                            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </Field>
                                <Field label="Sender Email">
                                    <Input icon={Mail} type="email" placeholder="noreply@madrasahub.com"
                                        value={settings.senderEmail || ''}
                                        onChange={e => set('senderEmail', e.target.value)} />
                                </Field>

                                {/* Divider + test button */}
                                <div className="pt-2 border-t border-slate-100">
                                    <button
                                        onClick={handleTestSmtp}
                                        disabled={loading}
                                        className="inline-flex items-center gap-2 h-10 px-5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />}
                                        Send Test Email
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ════════ COMING SOON ════════ */}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
