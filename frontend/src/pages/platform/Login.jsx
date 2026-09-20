import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';

const NAVY = '#1b2a4a';
const BLUE = '#4477f5';
const BLUE_LITE = '#e8f0fe';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PlatformLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { platformLogin } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !password) {
            setError('Enter your platform email and password.');
            return;
        }
        if (!EMAIL_PATTERN.test(email.trim())) {
            setError('Enter a valid platform email address.');
            return;
        }
        setLoading(true);
        try {
            await platformLogin(email, password);
            navigate('/platform');
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid credentials or access denied.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Platform Console"
            subtitle="Sign in to access the MadrasaHub operator dashboard."
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

                {/* Admin badge */}
                <div className="flex items-center gap-2 rounded-md border px-4 py-3"
                    style={{ background: BLUE_LITE, borderColor: '#c7d9fd' }}>
                    <ShieldCheck size={16} style={{ color: BLUE, flexShrink: 0 }} />
                    <p className="text-[12px] font-semibold" style={{ color: NAVY }}>
                        Platform administrator access only
                    </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Email Address</span>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="email"
                                placeholder="admin@madrasahub.com"
                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </label>

                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Password</span>
                        <div className="relative">
                            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Enter your password"
                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </label>
                </div>

                <div className="flex items-center gap-2">
                    <input id="remember-platform" type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-[#1b2a4a]" />
                    <label htmlFor="remember-platform" className="text-sm font-medium text-slate-600 cursor-pointer">Remember me</label>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="h-11 w-full rounded-md text-sm font-semibold text-white transition-colors hover:bg-[#4477f5] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: NAVY }}
                >
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Signing In...
                        </span>
                    ) : 'Sign In to Console'}
                </button>

                <p className="text-center text-sm text-slate-500 pt-1">
                    Need initial setup?{' '}
                    <Link to="/platform/register" className="font-semibold hover:underline" style={{ color: NAVY }}>
                        Register Platform Admin
                    </Link>
                </p>
            </form>
        </AuthLayout>
    );
};

export default PlatformLogin;
