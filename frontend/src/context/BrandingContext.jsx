/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { getBranding } from '../services/api/auth.api';
import { API_ORIGIN } from '../services/api';
import tenantService from '../services/tenantService';
import { useAuth } from './AuthContext';

const BrandingContext = createContext();

const DEFAULT_BRANDING = {
    tenantName: '',
    name: '',
    primaryColor: '#2563eb',
    secondaryColor: '#22c55e',
    logoUrl: '',
    logoSourceUrl: '',
    logoRevision: ''
};

const isSameBranding = (a = {}, b = {}) =>
    a.tenantName === b.tenantName &&
    a.name === b.name &&
    a.primaryColor === b.primaryColor &&
    a.secondaryColor === b.secondaryColor &&
    a.logoUrl === b.logoUrl &&
    a.logoSourceUrl === b.logoSourceUrl &&
    a.logoRevision === b.logoRevision;

const normalizeLogoUrl = (logoUrl) => {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('data:') || logoUrl.startsWith('blob:')) return logoUrl;
    const absoluteUrl = logoUrl.startsWith('http') ? logoUrl : `${API_ORIGIN}${logoUrl}`;
    try {
        const parsed = new URL(absoluteUrl);
        parsed.searchParams.delete('brand');
        return parsed.toString();
    } catch {
        return absoluteUrl;
    }
};

const withLogoRevision = (logoUrl, revision) => {
    if (!logoUrl || !revision || logoUrl.startsWith('data:') || logoUrl.startsWith('blob:')) return logoUrl;
    const separator = logoUrl.includes('?') ? '&' : '?';
    return `${logoUrl}${separator}brand=${encodeURIComponent(String(revision))}`;
};

const normalizeBranding = (raw = {}, previous = DEFAULT_BRANDING) => {
    const has = (key) => Object.prototype.hasOwnProperty.call(raw, key);
    const tenantName = (has('tenantName') ? raw.tenantName : (has('name') ? raw.name : previous.tenantName)) || '';
    const primaryColor = (has('primaryColor') ? raw.primaryColor : previous.primaryColor) || DEFAULT_BRANDING.primaryColor;
    const secondaryColor = (has('secondaryColor') ? raw.secondaryColor : previous.secondaryColor) || DEFAULT_BRANDING.secondaryColor;
    const logoRaw = has('logoUrl') ? raw.logoUrl : (previous.logoSourceUrl || previous.logoUrl);
    const logoSourceUrl = normalizeLogoUrl(logoRaw || '');
    const logoRevision = (has('logoRevision') ? raw.logoRevision : (has('updatedAt') ? raw.updatedAt : previous.logoRevision)) || '';

    return {
        tenantName,
        name: (has('name') ? raw.name : previous.name) || tenantName || '',
        primaryColor,
        secondaryColor,
        logoUrl: withLogoRevision(logoSourceUrl, logoRevision),
        logoSourceUrl,
        logoRevision
    };
};

export const BrandingProvider = ({ children }) => {
    const { user, updateSession } = useAuth();
    const [branding, setBranding] = useState(DEFAULT_BRANDING);
    const brandingRef = useRef(DEFAULT_BRANDING);
    const requestSequence = useRef(0);

    const applyBranding = useCallback((data) => {
        const root = document.documentElement;
        if (data.primaryColor) {
            root.style.setProperty('--primary', data.primaryColor);
            root.style.setProperty('--primary-dark', `color-mix(in srgb, ${data.primaryColor} 84%, #000000)`);
            root.style.setProperty('--primary-soft', `color-mix(in srgb, ${data.primaryColor} 11%, #ffffff)`);
        }
        if (data.secondaryColor) {
            root.style.setProperty('--secondary', data.secondaryColor);
            root.style.setProperty('--secondary-dark', `color-mix(in srgb, ${data.secondaryColor} 72%, #000000)`);
            root.style.setProperty('--secondary-soft', `color-mix(in srgb, ${data.secondaryColor} 12%, #ffffff)`);
        }
    }, []);

    const applyBrandingState = useCallback((raw = {}) => {
        const normalized = normalizeBranding(raw, brandingRef.current);
        brandingRef.current = normalized;
        applyBranding(normalized);
        setBranding((previous) => isSameBranding(previous, normalized) ? previous : normalized);
        return normalized;
    }, [applyBranding]);

    const loadBranding = useCallback(async () => {
        const requestId = ++requestSequence.current;
        try {
            if (user?.branding) {
                applyBrandingState(user.branding);
            }

            const data = await getBranding();
            const brandingData = data?.data || data;
            if (brandingData && requestId === requestSequence.current) {
                applyBrandingState(brandingData);
            }
        } catch (error) {
            console.error('Failed to load branding:', error);
        }
    }, [applyBrandingState, user]);

    useEffect(() => {
        if (!user) return;
        if (
            user.role === 'super_admin' ||
            user.role === 'finance_director' ||
            user.role === 'hr_payroll_manager' ||
            user.role === 'branch_admin' ||
            user.role === 'registrar' ||
            user.role === 'cashier' ||
            user.role === 'teacher' ||
            user.role === 'student' ||
            user.role === 'parent'
        ) {
            loadBranding();
        }
    }, [user, loadBranding]);

    const updateBranding = useCallback(async (payload) => {
        ++requestSequence.current;
        const res = await tenantService.updateBranding(payload);
        const updated = res?.data?.tenant || res?.data || payload;
        const revision = updated?.updatedAt || Date.now();
        const savedBranding = applyBrandingState({ ...updated, logoRevision: revision });
        if (user) {
            updateSession({
                ...user,
                branding: {
                    ...(user.branding || {}),
                    tenantName: updated.name || updated.tenantName || user.branding?.tenantName,
                    primaryColor: updated.primaryColor,
                    secondaryColor: updated.secondaryColor,
                    logoUrl: updated.logoUrl,
                    updatedAt: revision
                }
            });
        }
        return savedBranding;
    }, [applyBrandingState, updateSession, user]);

    return (
        <BrandingContext.Provider value={{ branding, loadBranding, updateBranding }}>
            {children}
        </BrandingContext.Provider>
    );
};

export const useBranding = () => useContext(BrandingContext);
