import React from 'react';
import { Menu, Search, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Topbar = ({ title = 'Dashboard', onToggleSidebar }) => {
    const { user, logout } = useAuth();

    return (
        <header className="dashboard-topbar flex items-center justify-between gap-3 px-4 md:px-6">
            <div className="flex items-center gap-3">
                <button
                    onClick={onToggleSidebar}
                    className="rounded-lg border border-[var(--border)] bg-white p-2 text-slate-600 lg:hidden"
                >
                    <Menu size={18} />
                </button>

                <div className="hidden items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 md:flex">
                    <Search size={16} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-48 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                </div>

                <h1 className="text-lg font-bold text-slate-800">{title}</h1>
            </div>

            <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">{user?.role?.replace('_', ' ')}</p>
                </div>

                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-slate-100 text-slate-600">
                    <UserIcon size={18} />
                </div>

                <button
                    onClick={logout}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Logout"
                >
                    <LogOut size={18} />
                </button>
            </div>
        </header>
    );
};

export default Topbar;
