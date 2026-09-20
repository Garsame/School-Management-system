import http from './http';

export const unifiedLogin = async (identifier, password, tenantDomain = '') => {
    const isEmail = String(identifier).includes('@');
    const payload = {
        password,
        [isEmail ? 'email' : 'username']: identifier,
        ...(tenantDomain ? { tenantDomain } : {})
    };
    const response = await http.post('/auth/login', payload);
    return response.data;
};

export const tenantLogin = async (email, password) => {
    const response = await http.post('/auth/login', { 
        email, 
        password,
        requiredRoles: ['super_admin']
    });
    return response.data;
};

export const registerTenant = async (payload) => {
    const response = await http.post('/auth/register-tenant', payload);
    return response.data;
};

export const getMe = async () => {
    const response = await http.get('/auth/me');
    return response.data;
};

export const logoutSession = async () => {
    const response = await http.post('/auth/logout');
    return response.data;
};

export const getOwnProfile = async () => {
    const response = await http.get('/auth/profile');
    return response.data;
};

export const updateOwnProfile = async (payload) => {
    const response = await http.put('/auth/profile', payload);
    return response.data;
};

export const updateOwnAvatar = async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await http.put('/auth/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const changeOwnPassword = async (currentPassword, newPassword) => {
    const response = await http.put('/auth/change-password', { currentPassword, newPassword });
    return response.data;
};

export const platformLogin = async (email, password) => {
    const response = await http.post('/platform/auth/login', { email, password });
    return response.data;
};

export const getBranding = async () => {
    const response = await http.get('/tenant/settings/branding');
    return response.data;
};
