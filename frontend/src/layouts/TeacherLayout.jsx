import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TeacherSidebar from '../components/layout/TeacherSidebar';
import TeacherTopbar from '../components/layout/TeacherTopbar';

const TeacherLayout = () => {
    const { user, loading } = useAuth();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center font-semibold text-[var(--primary)]">
                Loading...
            </div>
        );
    }

    if (!user || user.role !== 'teacher' || user.scope !== 'branch') {
        return <Navigate to="/teacher/login" state={{ from: location }} replace />;
    }

    return (
        <div className="phoenix-app-shell">
            <TeacherTopbar
                onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
                sidebarOpen={sidebarOpen}
            />

            {sidebarOpen && (
                <div
                    className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/35 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <TeacherSidebar
                className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:translate-x-0 ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
                onNavigate={() => setSidebarOpen(false)}
            />

            <main className="phoenix-app-main">
                <div className="phoenix-app-page animate-fade-in">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default TeacherLayout;
