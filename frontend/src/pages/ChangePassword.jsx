import React, { useState } from 'react';
import { KeyRound, LockKeyhole } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { changeOwnPassword } from '../services/api/auth.api';
import { useAuth } from '../context/AuthContext';

const homeForRole = {
    platform_owner: '/platform',
    super_admin: '/tenant',
    finance_director: '/finance',
    hr_payroll_manager: '/hr',
    branch_admin: '/branch',
    registrar: '/registrar',
    cashier: '/cashier',
    teacher: '/teacher',
    dugsi_teacher: '/dugsi/students',
    student: '/student',
    parent: '/parent'
};

const ChangePassword = () => {
    const { user, updateSession } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    if (!user) return <Navigate to="/login" replace />;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        if (form.newPassword !== form.confirmPassword) {
            setError('New password and confirmation do not match.');
            return;
        }
        setSaving(true);
        try {
            const session = await changeOwnPassword(form.currentPassword, form.newPassword);
            updateSession(session);
            navigate(homeForRole[session.role] || '/', { replace: true });
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Password could not be changed.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <main className="login-shell flex min-h-screen items-center justify-center bg-[#f7f8fb] p-4">
            <section className="w-full max-w-md rounded-lg border border-[#e3e6ed] bg-white p-6 sm:p-8">
                <div className="mb-6 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                        <KeyRound size={19} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-[#141824]">Set a private password</h1>
                        <p className="mt-1 text-sm text-[#6e7891]">Replace the temporary password before continuing.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {[
                        ['currentPassword', 'Current password'],
                        ['newPassword', 'New password'],
                        ['confirmPassword', 'Confirm new password']
                    ].map(([name, label]) => (
                        <label key={name} className="block space-y-1.5">
                            <span className="text-xs font-semibold text-[#525b75]">{label}</span>
                            <div className="relative">
                                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a94ad]" size={15} />
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    placeholder={`Enter ${label.toLowerCase()}...`}
                                    className="h-11 w-full rounded-md border border-[#cbd0dd] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--primary)]"
                                    value={form[name]}
                                    onChange={(event) => setForm({ ...form, [name]: event.target.value })}
                                />
                            </div>
                        </label>
                    ))}

                    {error && <p className="rounded-md border border-[#f3a7b6] bg-[#fff0f3] px-3 py-2 text-sm text-[#b4233f]">{error}</p>}

                    <button type="submit" disabled={saving} className="phoenix-primary-button w-full disabled:opacity-50">
                        {saving ? 'Updating...' : 'Continue securely'}
                    </button>
                </form>
            </section>
        </main>
    );
};

export default ChangePassword;
