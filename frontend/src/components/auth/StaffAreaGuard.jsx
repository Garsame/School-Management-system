import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homePathForRole, isStaffRole } from '../../config/staffMenu';

const PORTAL_HOME = { platform_owner: '/platform', student: '/student', parent: '/parent' };

/**
 * Lets any staff member into an area whose pages work at their scope. Which pages they can
 * then open is decided per page by PermissionRouteGuard, from their role's permissions, not
 * by the role's name. A school-wide account cannot use branch pages (the server needs a
 * branch) and the reverse; anyone sent to an area they cannot use goes to their own home.
 */
const StaffAreaGuard = ({ scope = null, children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[var(--primary)]" />
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;
    if (!isStaffRole(user.role) || (scope && user.scope !== scope)) {
        return <Navigate to={homePathForRole(user.role) || PORTAL_HOME[user.role] || '/login'} replace />;
    }

    return children || <Outlet />;
};

export default StaffAreaGuard;
