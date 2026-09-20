import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, GraduationCap, ShieldCheck } from 'lucide-react';
import platformService from '../../services/platformService';
import { API_ORIGIN } from '../../services/api';

const NAVY = '#15233d';
const BLUE = '#4477f5';
const PUBLIC_THEME_KEY = 'madrasahub-landing-theme';

const getInitialPublicTheme = () => {
    if (typeof window === 'undefined') return 'light';
    const documentTheme = document.documentElement.dataset.publicTheme;
    if (documentTheme === 'light' || documentTheme === 'dark') return documentTheme;
    try {
        const savedTheme = window.localStorage.getItem(PUBLIC_THEME_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch {
        // Storage may be unavailable in restricted browsing contexts.
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const AuthLayout = ({
    title,
    subtitle,
    children,
    backTo = '/',
    backLabel = 'Back to Home',
    wide = false,
}) => {
    const [settings, setSettings] = useState(null);
    const [theme, setTheme] = useState(getInitialPublicTheme);

    useEffect(() => {
        platformService.getPublicSettings()
            .then(response => setSettings(response.data))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const handleStorage = (event) => {
            if (event.key === PUBLIC_THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
                setTheme(event.newValue);
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    useEffect(() => {
        document.documentElement.dataset.publicTheme = theme;
    }, [theme]);

    const platformName = settings?.platformName || 'MadrasaHub';
    const logoSrc = settings?.logoUrl
        ? (settings.logoUrl.startsWith('http') ? settings.logoUrl : `${API_ORIGIN}${settings.logoUrl}`)
        : null;
    const isDark = theme === 'dark';

    return (
        <div
            className={`landing-theme auth-theme auth-shell public-page relative min-h-screen overflow-hidden bg-[#f4f7fb] ${isDark ? 'landing-dark auth-dark' : 'landing-light auth-light'}`}
            data-public-theme={theme}
            style={{
                '--primary': settings?.primaryColor || NAVY,
                '--primary-dark': settings?.primaryColor || NAVY,
                '--landing-primary': settings?.primaryColor || NAVY,
                '--landing-secondary': settings?.secondaryColor || BLUE,
            }}
        >
            <div className="auth-top-band absolute inset-x-0 top-0 h-60 bg-[#15233d]" aria-hidden="true" />

            <div className="relative flex min-h-screen flex-col">
                <header className="mx-auto flex w-full max-w-6xl items-center justify-center px-5 pb-5 pt-8 sm:px-6 sm:pt-10">
                    <Link to="/" className="flex min-w-0 items-center gap-3 text-white">
                        {logoSrc ? (
                            <img src={logoSrc} alt={platformName} className="h-10 max-w-44 object-contain" />
                        ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#4477f5] text-white">
                                <GraduationCap size={20} />
                            </span>
                        )}
                        <span className="truncate text-xl font-semibold">{platformName}</span>
                    </Link>
                </header>

                <main className="flex flex-1 items-start justify-center px-4 pb-8 sm:px-6">
                    <div className={`w-full ${wide ? 'max-w-[800px]' : 'max-w-[520px]'}`}>
                        <Link
                            to={backTo}
                            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-white/72 transition hover:text-white"
                        >
                            <ArrowLeft size={15} />
                            {backLabel}
                        </Link>

                        <section className="auth-card overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <header className="border-b border-slate-200 px-6 py-6 text-center sm:px-8 sm:py-7">
                                <p className="text-xs font-semibold uppercase text-[#4477f5]">Secure account access</p>
                                <h1 className="mt-2 text-2xl font-semibold text-[#15233d] sm:text-[1.75rem]">{title}</h1>
                                <p className="mx-auto mt-2 max-w-xl text-sm font-normal leading-6 text-slate-500">{subtitle}</p>
                            </header>

                            <div className="px-5 py-6 sm:px-8 sm:py-7">
                                {children}
                            </div>
                        </section>

                        <div className="auth-support-note mt-5 flex items-center justify-center gap-2 text-center text-xs font-medium text-slate-500">
                            <ShieldCheck size={14} className="text-[#4477f5]" />
                            <span>Your account is protected by role and school access controls.</span>
                        </div>
                    </div>
                </main>

                <footer className="px-5 pb-6 text-center text-xs font-medium text-slate-500 sm:px-6">
                    Copyright {new Date().getFullYear()} {platformName}. All Rights Reserved.
                </footer>
            </div>
        </div>
    );
};

export default AuthLayout;
