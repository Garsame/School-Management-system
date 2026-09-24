import axios from 'axios';
import { clearStoredUser, getStoredTeacherBranchId, getStoredUser } from '../utils/storage';

const browserOrigin = typeof window === 'undefined' ? '' : window.location.origin;
export const API_ORIGIN = String(import.meta.env.VITE_API_ORIGIN || browserOrigin).replace(/\/+$/, '');
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

const getLoginPathForRole = (role = '', path = '') => {
    const normalizedRole = String(role).toLowerCase();
    if (normalizedRole === 'teacher') return '/teacher/login';
    if (normalizedRole === 'dugsi_teacher') return '/login';
    if (normalizedRole === 'student') return '/student/login';
    if (normalizedRole === 'registrar') return '/registrar/login';
    if (normalizedRole === 'cashier') return '/cashier/login';
    if (normalizedRole === 'finance_director') return '/login';
    if (normalizedRole === 'super_admin') return '/tenant/login';
    if (normalizedRole === 'branch_admin') return '/branch/login';
    if (normalizedRole === 'platform_owner') return '/platform/login';
    if (normalizedRole === 'parent') return '/login';

    if (path.startsWith('/teacher')) return '/teacher/login';
    if (path.startsWith('/dugsi')) return '/login';
    if (path.startsWith('/student')) return '/student/login';
    if (path.startsWith('/registrar')) return '/registrar/login';
    if (path.startsWith('/cashier')) return '/cashier/login';
    if (path.startsWith('/finance')) return '/login';
    if (path.startsWith('/tenant')) return '/tenant/login';
    if (path.startsWith('/platform')) return '/platform/login';
    if (path.startsWith('/parent')) return '/login';
    return '/branch/login';
};

api.interceptors.request.use(
    (config) => {
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
            delete config.headers['Content-Type'];
        }
        const user = getStoredUser();
        if (user?.role === 'teacher' && config.url !== '/auth/me') {
            config.headers['X-Branch-Id'] = getStoredTeacherBranchId() || user.branchId;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            const user = getStoredUser();
            const path = window.location.pathname;
            clearStoredUser();
            window.location.href = getLoginPathForRole(user?.role, path);
        }
        return Promise.reject(error);
    }
);

export default api;
