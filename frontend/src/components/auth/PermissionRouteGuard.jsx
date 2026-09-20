import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AccessDenied from '../../pages/AccessDenied';
import { hasPermission } from '../../utils/permissions';
import { getRequiredPermissionForPath } from '../../utils/routePermissions';

const PermissionRouteGuard = ({ children }) => {
    const location = useLocation();
    const { user, loading } = useAuth();
    const requiredPermission = getRequiredPermissionForPath(location.pathname);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            </div>
        );
    }

    if (requiredPermission && !hasPermission(user, requiredPermission)) {
        return <AccessDenied requiredPermission={requiredPermission} />;
    }

    return children || <Outlet />;
};

export default PermissionRouteGuard;
