import React from 'react';
import { ArrowLeft, Home, SearchX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const HOME_BY_ROLE = {
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

const NotFound = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const home = HOME_BY_ROLE[user?.role] || '/';

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
            <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <SearchX size={34} />
                </div>
                <p className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-blue-500">404 Page Not Found</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">This page does not exist</h1>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                    The address may be wrong, or the page may have been moved.
                </p>
                <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 text-xs font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-50"
                    >
                        <ArrowLeft size={16} />
                        Go Back
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate(home, { replace: true })}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-slate-800"
                    >
                        <Home size={16} />
                        Portal Home
                    </button>
                </div>
            </section>
        </main>
    );
};

export default NotFound;
