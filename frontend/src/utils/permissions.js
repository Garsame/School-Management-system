export const hasPermission = (user, permission) => {
    if (!permission) return true;
    if (!user) return false;
    if (!Array.isArray(user.permissions)) return false;
    return user.permissions.includes(permission);
};

export const hasAnyPermission = (user, permissions = []) => {
    if (!permissions.length) return true;
    return permissions.some((permission) => hasPermission(user, permission));
};

export const hasAllPermissions = (user, permissions = []) => {
    if (!permissions.length) return true;
    return permissions.every((permission) => hasPermission(user, permission));
};

export const filterMenuByPermission = (user, items = []) => (
    items.filter((item) => {
        if (item.permission) return hasPermission(user, item.permission);
        if (item.anyPermission) return hasAnyPermission(user, item.anyPermission);
        if (item.allPermissions) return hasAllPermissions(user, item.allPermissions);
        return true;
    })
);
