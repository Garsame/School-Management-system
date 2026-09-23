import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';

const NAVY = '#1b2a4a';

const Login = () => {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [tenantDomain, setTenantDomain] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!identifier.trim() || !password) {
            setError('Enter your email or student ID and password.');
            return;
        }
        setLoading(true);
        try {
            const user = await login(identifier, password, tenantDomain);
            const role = String(user?.role).toLowerCase();

            if (role === 'platform_owner')      navigate('/platform');
            else if (role === 'super_admin')    navigate('/tenant');
            else if (role === 'finance_director') navigate('/finance');
            else if (role === 'hr_payroll_manager') navigate('/hr');
            else if (role === 'branch_admin')   navigate('/branch');
            else if (role === 'registrar')      navigate('/registrar');
            else if (role === 'cashier')        navigate('/cashier');
            else if (role === 'teacher')        navigate('/teacher');
            else if (role === 'dugsi_teacher')  navigate('/dugsi/students');
            else if (role === 'student')        navigate('/student');
            else if (role === 'parent')         navigate('/parent');
            else                                navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome Back!"
            subtitle="Sign in to continue to your dashboard."
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

                <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Email or Student ID</span>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="name@school.com or STD-001"
                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                            />
                        </div>
                    </label>

                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">
                            Institution Domain
                        </span>
                        <input
                            type="text"
                            placeholder="Required for student IDs"
                            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#4477f5]"
                            value={tenantDomain}
                            onChange={(e) => setTenantDomain(e.target.value)}
                        />
                    </label>
                </div>

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
                        <button type="button" onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </label>

                <div className="flex items-center gap-2">
                    <input id="remember-main" type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-[#1b2a4a]" />
                    <label htmlFor="remember-main" className="text-sm font-medium text-slate-600 cursor-pointer">Remember me</label>
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
                    ) : 'Sign In'}
                </button>

                <p className="text-center text-sm text-slate-500 pt-1">
                    Don't have an account?{' '}
                    <Link to="/register" className="font-semibold hover:underline" style={{ color: NAVY }}>
                        Register your school
                    </Link>
                </p>

            </form>
        </AuthLayout>
    );
};

export default Login;
