import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Mail, School, User, Eye, EyeOff, Clock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import platformService from '../services/platformService';

const NAVY      = '#1b2a4a';
const BLUE      = '#4477f5';
const BLUE_LITE = '#e8f0fe';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RegisterTenant = () => {
    const [formData, setFormData] = useState({
        schoolName: '',
        domain: '',
        adminName: '',
        email: '',
        password: '',
        confirmPassword: '',
        plan: '',
        billingCycle: 'monthly'
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingData, setPendingData] = useState(null);
    const [registrationEnabled, setRegistrationEnabled] = useState(true);
    const [plans, setPlans] = useState([]);
    const [checkingRegistration, setCheckingRegistration] = useState(true);
    const { registerTenant } = useAuth();

    useEffect(() => {
        Promise.all([platformService.getPublicSettings(), platformService.getPublicPlans()])
            .then(([settingsResponse, plansResponse]) => {
                const settings = settingsResponse.data || {};
                const activePlans = plansResponse.data || [];
                setRegistrationEnabled(settings.isRegistrationEnabled !== false);
                setPlans(activePlans);
                setFormData(current => ({
                    ...current,
                    plan: current.plan || settings.defaultPlan || activePlans[0]?.slug || ''
                }));
            })
            .catch(() => setError('Could not load platform registration settings. Please try again.'))
            .finally(() => setCheckingRegistration(false));
    }, []);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.schoolName.trim() || !formData.domain.trim() || !formData.adminName.trim() || !formData.email.trim() || !formData.password || !formData.confirmPassword) {
            setError('Please complete all required registration fields.');
            return;
        }
        if (!EMAIL_PATTERN.test(formData.email.trim())) {
            setError('Enter a valid admin email address.');
            return;
        }
        if (formData.password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Password and confirm password do not match.');
            return;
        }

        setLoading(true);
        try {
            const registrationPayload = { ...formData };
            delete registrationPayload.confirmPassword;
            await registerTenant(registrationPayload);
            setPendingData({ schoolName: formData.schoolName, email: formData.email });
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Pending approval screen
    if (pendingData) {
        return (
            <AuthLayout
                title="Registration Submitted"
                subtitle="Your school account is waiting for platform approval."
                backTo="/"
                backLabel="Back to Home"
            >
                <div className="space-y-5">
                    <div className="flex items-center justify-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-[#e8f0fe] text-[#4477f5]">
                            <Clock size={24} />
                        </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase text-slate-500">School</p>
                            <p className="mt-1 truncate text-sm font-semibold text-[#15233d]">{pendingData.schoolName}</p>
                        </div>
                        <div className="border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase text-slate-500">Email</p>
                            <p className="mt-1 truncate text-sm font-medium text-slate-700">{pendingData.email}</p>
                        </div>
                    </div>

                    <div className="border-t border-slate-200 pt-5">
                        <p className="mb-4 text-xs font-semibold uppercase text-slate-500">What happens next</p>
                        <div className="space-y-3">
                            {[
                                { done: true, text: 'Your registration has been received' },
                                { done: false, text: 'Platform admin will review your application' },
                                { done: false, text: 'You will receive an email once approved' },
                                { done: false, text: 'Sign in using the credentials you created' },
                            ].map(({ done, text }, index) => (
                                <div key={text} className="flex items-start gap-3">
                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${done ? 'bg-[#4477f5] text-white' : 'bg-[#e8f0fe] text-[#15233d]'}`}>
                                        {done ? <CheckCircle2 size={13} /> : index + 1}
                                    </span>
                                    <p className="text-sm font-normal leading-6 text-slate-600">{text}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Link to="/login" className="flex h-11 w-full items-center justify-center rounded-md bg-[#15233d] px-5 text-sm font-semibold text-white transition hover:bg-[#4477f5]">
                        Go to Sign In
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    // Registration form
    if (checkingRegistration) {
        return <div className="min-h-screen flex items-center justify-center text-sm font-semibold text-slate-500">Checking registration availability...</div>;
    }

    if (!registrationEnabled) {
        return (
            <AuthLayout title="Registration Unavailable" subtitle="New school registration is currently disabled." backTo="/" backLabel="Back to Home">
                <div className="rounded-md border border-[#c7d9fd] bg-[#e8f0fe] px-5 py-4 text-sm font-medium text-[#15233d]">
                    School registration is currently disabled. Please contact platform support or try again later.
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Register Your School"
            subtitle="Create your school account and admin profile in one step."
            backTo="/"
            backLabel="Back to Home"
            wide
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {error && (
                    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                        {error}
                    </div>
                )}

                <div className="flex items-start gap-3 rounded-md border p-3 text-[12px] font-medium"
                    style={{ background: BLUE_LITE, borderColor: '#c7d9fd', color: NAVY }}>
                    <Clock size={14} className="mt-0.5 flex-shrink-0" style={{ color: BLUE }} />
                    <span>After registration, your account must be approved by the platform admin before you can sign in.</span>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">School Name</span>
                        <div className="relative">
                            <School size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input name="schoolName" type="text" placeholder="e.g. Al-Nuur Academy"
                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                                value={formData.schoolName} onChange={handleChange} required />
                        </div>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Domain Slug</span>
                        <input name="domain" type="text" placeholder="e.g. al-nuur"
                            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                            value={formData.domain} onChange={handleChange} required />
                    </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Admin Name</span>
                        <div className="relative">
                            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input name="adminName" type="text" placeholder="Your full name"
                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                                value={formData.adminName} onChange={handleChange} required />
                        </div>
                    </label>

                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Admin Email</span>
                        <div className="relative">
                            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input name="email" type="email" placeholder="admin@yourschool.com"
                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                                value={formData.email} onChange={handleChange} required />
                        </div>
                    </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    {plans.length > 0 && (
                        <label className="block">
                            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Subscription Plan</span>
                            <select name="plan" value={formData.plan} onChange={handleChange} required
                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-[#4477f5]">
                                {plans.map(plan => (
                                    <option key={plan._id || plan.slug} value={plan.slug}>
                                        {plan.name} - {typeof plan.price === 'number' ? `$${plan.price}/${plan.billingCycle || 'month'}` : plan.price}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Billing Cycle</span>
                        <select name="billingCycle" value={formData.billingCycle} onChange={handleChange} required
                            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-[#4477f5]">
                            <option value="monthly">Monthly billing</option>
                            <option value="yearly">Yearly billing</option>
                        </select>
                    </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Password</span>
                        <div className="relative">
                            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input name="password" type={showPassword ? 'text' : 'password'} placeholder="Create a strong password"
                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                                value={formData.password} onChange={handleChange} required minLength={8} autoComplete="new-password" />
                            <button type="button" onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </label>

                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Confirm Password</span>
                        <div className="relative">
                            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} placeholder="Repeat your password"
                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                                value={formData.confirmPassword} onChange={handleChange} required minLength={8} autoComplete="new-password" />
                            <button type="button" onClick={() => setShowConfirmPassword(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                                {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </label>
                </div>

                <button type="submit" disabled={loading}
                    className="mt-2 h-11 w-full rounded-md text-sm font-semibold text-white transition-colors hover:bg-[#4477f5] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: NAVY }}>
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Creating Account...
                        </span>
                    ) : 'Register School'}
                </button>

                <p className="text-center text-sm text-slate-500 pt-1">
                    Already have an account?{' '}
                    <Link to="/login" className="font-semibold hover:underline" style={{ color: NAVY }}>Sign In</Link>
                </p>
            </form>
        </AuthLayout>
    );
};

export default RegisterTenant;
