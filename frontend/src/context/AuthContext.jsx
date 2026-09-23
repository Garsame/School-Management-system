/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
    getMe as apiGetMe,
    platformLogin as apiPlatformLogin,
    registerTenant as apiRegisterTenant,
    logoutSession as apiLogoutSession,
    unifiedLogin as apiUnifiedLogin
} from '../services/api/auth.api';
import { branchLogin as apiBranchLogin } from '../services/api/branchAuth.api';
import { apiStudentLogin } from '../services/api/student.api';
import { clearStoredUser, getStoredTeacherBranchId, getStoredUser, setStoredTeacherBranchId, setStoredUser } from '../utils/storage';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => getStoredUser());
    const [loading, setLoading] = useState(() => Boolean(getStoredUser()));

    const storeSession = useCallback((data) => {
        if (data?.role === 'teacher') {
            const authorizedBranchIds = [data.branchId, ...(data.authorizedBranchIds || [])].filter(Boolean).map(String);
            const selectedBranchId = getStoredTeacherBranchId();
            if (!selectedBranchId || !authorizedBranchIds.includes(String(selectedBranchId))) {
                setStoredTeacherBranchId(data.branchId);
            }
        }
        setUser(data);
        setStoredUser(data);
        return data;
    }, []);

    const refreshSession = useCallback(async ({ silent = false } = {}) => {
        const current = getStoredUser();
        if (!current) {
            setUser(null);
            setLoading(false);
            return null;
        }

        if (!silent) setLoading(true);

        try {
            const refreshed = await apiGetMe();
            return storeSession({ ...current, ...refreshed });
        } catch (error) {
            if ([401, 403].includes(error.response?.status)) {
                setUser(null);
                clearStoredUser();
            }
            return null;
        } finally {
            setLoading(false);
        }
    }, [storeSession]);

    useEffect(() => {
        refreshSession();

        const refreshSilently = () => refreshSession({ silent: true });
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshSilently();
        };
        const intervalId = window.setInterval(refreshSilently, 120000);

        window.addEventListener('focus', refreshSilently);
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', refreshSilently);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [refreshSession]);

    const login = async (identifier, password, tenantDomain = '') => {
        const data = await apiUnifiedLogin(identifier, password, tenantDomain);
        return storeSession(data);
    };

    const branchLogin = async (email, password) => {
        const data = await apiBranchLogin(email, password);
        return storeSession(data);
    };

    const registrarLogin = async (email, password) => {
        const data = await apiBranchLogin(email, password);
        if (data.role !== 'registrar') {
            throw { response: { data: { message: 'Access Denied: Registrars only.' } } };
        }
        return storeSession(data);
    };

    const cashierLogin = async (email, password) => {
        const data = await apiBranchLogin(email, password);
        if (data.role !== 'cashier') {
            throw { response: { data: { message: 'Access Denied: Cashiers only.' } } };
        }
        return storeSession(data);
    };

    const teacherLogin = async (email, password) => {
        const data = await apiBranchLogin(email, password);
        if (data.role !== 'teacher') {
            throw { response: { data: { message: 'Access Denied: Teachers only.' } } };
        }
        return storeSession(data);
    };

    const studentLogin = async (studentCode, password) => {
        const data = await apiStudentLogin(studentCode, password);
        if (data.role !== 'student') {
            throw { response: { data: { message: 'Access Denied: Students only.' } } };
        }
        return storeSession(data);
    };

    const platformLogin = async (email, password) => {
        const data = await apiPlatformLogin(email, password);
        if (data.role !== 'platform_owner' || data.scope !== 'platform') {
            throw { response: { data: { message: 'Access denied: platform owner account requires platform scope.' } } };
        }
        return storeSession(data);
    };

    const registerTenant = async (payload) => {
        const data = await apiRegisterTenant(payload);
        // Pending registrations do not create an authenticated session.
        if (!data.pending) storeSession(data);
        return data;
    };

    const logout = () => {
        const role = String(user?.role || '').toLowerCase();
        apiLogoutSession().catch(() => {});
        setUser(null);
        clearStoredUser();

        if (role === 'platform_owner') {
            window.location.href = '/platform/login';
        } else if (role === 'super_admin') {
            window.location.href = '/tenant/login';
        } else if (role === 'finance_director') {
            window.location.href = '/login';
        } else if (role === 'hr_payroll_manager') {
            window.location.href = '/login';
        } else if (role === 'registrar') {
            window.location.href = '/registrar/login';
        } else if (role === 'cashier') {
            window.location.href = '/cashier/login';
        } else if (role === 'teacher') {
            window.location.href = '/teacher/login';
        } else if (role === 'dugsi_teacher') {
            window.location.href = '/login';
        } else if (role === 'student') {
            window.location.href = '/student/login';
        } else {
            window.location.href = '/branch/login';
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            login,
            tenantLogin: login,
            registerTenant,
            branchLogin,
            platformLogin,
            registrarLogin,
            cashierLogin,
            teacherLogin,
            studentLogin,
            updateSession: storeSession,
            refreshSession,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
