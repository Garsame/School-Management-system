import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { hasAllPermissions, hasAnyPermission, hasPermission } from '../../utils/permissions';

const Can = ({ permission, anyPermission, allPermissions, fallback = null, children }) => {
    const { user } = useAuth();

    const allowed = permission
        ? hasPermission(user, permission)
        : anyPermission
            ? hasAnyPermission(user, anyPermission)
            : allPermissions
                ? hasAllPermissions(user, allPermissions)
                : true;

    return allowed ? children : fallback;
};

export default Can;
