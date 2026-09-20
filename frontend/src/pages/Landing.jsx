import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'framer-motion';
import {
    ArrowRight,
    BarChart3,
    BookOpen,
    Building2,
    CalendarCheck,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    Clock,
    Globe,
    GraduationCap,
    Layers3,
    Loader2,
    Mail,
    Menu,
    MessageSquare,
    Moon,
    Quote,
    ReceiptText,
    ShieldCheck,
    Sparkles,
    Sun,
    TrendingUp,
    Users,
    X,
    Zap,
} from 'lucide-react';
import platformService from '../services/platformService';
import { API_ORIGIN } from '../services/api';

const NAVY = '#15233d';
const BLUE = '#4477f5';
const HERO_IMAGE = '/assets/landing-hero-dashboard.png';
const OPERATING_RHYTHM_IMAGE = '/assets/landing-operating-rhythm.png';
const MOTION_EASE = [0.22, 1, 0.36, 1];
const VIEWPORT_ONCE = { once: true, amount: 0.22 };
const LANDING_THEME_KEY = 'madrasahub-landing-theme';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_NAV_ITEMS = [
    ['#features', 'Features'],
    ['#operations', 'Operations'],
    ['#pricing', 'Pricing'],
    ['#faq', 'FAQ'],
    ['#contact', 'Contact'],
];

const TEAM_PERSPECTIVES = [
    {
        role: 'School leadership',
        context: 'Cross-branch oversight',
        quote: 'Branches, enrollment, staffing, and finance stay visible from one place while every team works within its own responsibilities.',
    },
    {
        role: 'Finance teams',
        context: 'Clear financial records',
        quote: 'Invoices, payments, balances, and receipts remain connected, making each student account easier to follow without separate spreadsheets.',
    },
    {
        role: 'Teachers and families',
        context: 'Connected academic history',
        quote: 'Attendance, results, timetables, and earlier academic years remain available through secure portals designed for each user.',
    },
];

const FAQ_GROUPS = [
    {
        title: 'Getting started',
        icon: CircleHelp,
        items: [
            {
                question: 'How does a school start using MadrasaHub?',
                answer: 'A school submits the public registration form. The platform owner reviews the request, approves the tenant, assigns a plan, and the school super admin can then begin setup.',
            },
            {
                question: 'Can one school manage multiple branches?',
                answer: 'Yes. Branch capacity follows the selected subscription plan, and each branch keeps its users and operational records inside the same protected school tenant.',
            },
            {
                question: 'Are monthly and yearly subscriptions available?',
                answer: 'Yes. Plans can carry separate monthly and yearly prices. The platform owner controls which plans are active and manages each school subscription.',
            },
        ],
    },
    {
        title: 'Security and records',
        icon: ShieldCheck,
        items: [
            {
                question: 'How is access separated between school users?',
                answer: 'Role permissions, tenant boundaries, and branch boundaries work together so users only reach the workflows and records assigned to them.',
            },
            {
                question: 'Does student history remain after promotion or transfer?',
                answer: 'Yes. Previous enrollments and academic-year context are preserved while the current enrollment and branch are updated for ongoing work.',
            },
            {
                question: 'What can students and parents see?',
                answer: 'Students can access their own profile, attendance, results, rank, and timetable. Parents can access only linked children and their permitted academic and finance records.',
            },
        ],
    },
];

const getFadeUp = (reducedMotion, y = 18) => ({
    hidden: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y },
    visible: { opacity: 1, y: 0 },
});

const getFadeLeft = (reducedMotion, x = 24) => ({
    hidden: reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x },
    visible: { opacity: 1, x: 0 },
});

const getStagger = (reducedMotion, staggerChildren = 0.08) => ({
    hidden: {},
    visible: {
        transition: reducedMotion ? {} : { staggerChildren, delayChildren: 0.04 },
    },
});

const formatCount = (value, fallback = '--') => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
    return Number(value).toLocaleString();
};

const formatLimit = (value, label) => {
    if (value === 'Unlimited') return `Unlimited ${label}`;
    if (value === null || value === undefined || value === '') return `${label} included`;
    return `${value} ${label}`;
};

const getAssetSrc = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${API_ORIGIN}${url}`;
};

const getLogoSrc = (settings) => getAssetSrc(settings?.logoUrl);

const getInitialTheme = () => {
    if (typeof window === 'undefined') return 'light';
    const documentTheme = document.documentElement.dataset.publicTheme;
    if (documentTheme === 'light' || documentTheme === 'dark') return documentTheme;
    try {
        const savedTheme = window.localStorage.getItem(LANDING_THEME_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch {
        // Storage can be unavailable in private browsing contexts.
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const Landing = () => {
    const reducedMotion = useReducedMotion();
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [activeSection, setActiveSection] = useState('');
    const [stats, setStats] = useState(null);
    const [plans, setPlans] = useState([]);
    const [schools, setSchools] = useState([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [billingPeriod, setBillingPeriod] = useState('monthly');
    const [perspectiveIndex, setPerspectiveIndex] = useState(0);
    const [openFaq, setOpenFaq] = useState('0-0');
    const [theme, setTheme] = useState(getInitialTheme);
    const [contactForm, setContactForm] = useState({
        name: '',
        email: '',
        school: '',
        message: '',
    });
    const [contactError, setContactError] = useState('');
    const [platformSettings, setPlatformSettings] = useState({
        platformName: 'MadrasaHub',
        isRegistrationEnabled: true,
    });

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 16);
            let currentSection = '';
            PUBLIC_NAV_ITEMS.forEach(([href]) => {
                const section = document.querySelector(href);
                if (section && section.getBoundingClientRect().top <= 120) currentSection = href;
            });
            setActiveSection(currentSection);
        };
        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        platformService.getPublicStats()
            .then(res => setStats(res.data))
            .catch(() => {});

        platformService.getPublicPlans()
            .then(res => setPlans(res.data || []))
            .catch(() => setPlans([]))
            .finally(() => setPlansLoading(false));

        platformService.getPublicSchools()
            .then(res => setSchools(Array.isArray(res.data) ? res.data : []))
            .catch(() => setSchools([]));

        platformService.getPublicSettings()
            .then(res => setPlatformSettings(current => ({ ...current, ...(res.data || {}) })))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!menuOpen) return undefined;
        const handleKeydown = (event) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeydown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeydown);
        };
    }, [menuOpen]);

    useEffect(() => {
        document.documentElement.dataset.publicTheme = theme;
    }, [theme]);

    const registrationOpen = platformSettings.isRegistrationEnabled !== false;
    const isDark = theme === 'dark';
    const platformName = platformSettings.platformName || 'MadrasaHub';
    const logoSrc = getLogoSrc(platformSettings);
    const contactEmail = platformSettings.supportEmail || 'support@madrasahub.com';

    const toggleTheme = () => {
        setTheme(current => {
            const nextTheme = current === 'dark' ? 'light' : 'dark';
            try {
                window.localStorage.setItem(LANDING_THEME_KEY, nextTheme);
            } catch {
                // The visual switch still works when storage is unavailable.
            }
            return nextTheme;
        });
    };

    const handleContactChange = (event) => {
        const { name, value } = event.target;
        setContactForm(current => ({ ...current, [name]: value }));
        if (contactError) setContactError('');
    };

    const handleContactSubmit = (event) => {
        event.preventDefault();
        const name = contactForm.name.trim();
        const email = contactForm.email.trim();
        const message = contactForm.message.trim();

        if (!name || !email || !message) {
            setContactError('Please enter your name, email address, and message.');
            return;
        }
        if (!EMAIL_PATTERN.test(email)) {
            setContactError('Enter a valid email address before sending.');
            return;
        }

        const subject = encodeURIComponent(`${platformName} contact request${contactForm.school ? ` - ${contactForm.school}` : ''}`);
        const body = encodeURIComponent([
            `Name: ${name}`,
            `Email: ${email}`,
            `School: ${contactForm.school || 'Not provided'}`,
            '',
            message,
        ].join('\n'));
        window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
    };

    const heroStats = useMemo(() => ([
        { label: 'Schools', value: formatCount(stats?.activeSchools ?? stats?.totalSchools), icon: <Building2 size={16} /> },
        { label: 'Branches', value: formatCount(stats?.totalBranches), icon: <Globe size={16} /> },
        { label: 'Students', value: formatCount(stats?.totalStudents), icon: <GraduationCap size={16} /> },
        { label: 'Plans', value: formatCount(stats?.activePlans), icon: <Layers3 size={16} /> },
    ]), [stats]);
    const schoolShowcase = useMemo(() => {
        return schools
            .map(school => ({
                id: school.id || school._id || school.name,
                name: school.name,
                logoUrl: school.logoUrl || '',
            }))
            .filter(school => school.name && school.logoUrl);
    }, [schools]);
    const marqueeSchools = useMemo(() => [...schoolShowcase, ...schoolShowcase], [schoolShowcase]);
    const fadeUp = useMemo(() => getFadeUp(reducedMotion), [reducedMotion]);
    const fadeSoft = useMemo(() => getFadeUp(reducedMotion, 12), [reducedMotion]);
    const fadeLeft = useMemo(() => getFadeLeft(reducedMotion), [reducedMotion]);
    const stagger = useMemo(() => getStagger(reducedMotion), [reducedMotion]);
    const timelineStagger = useMemo(() => getStagger(reducedMotion, 0.12), [reducedMotion]);

    return (
        <div
            className={`landing-theme public-page min-h-screen overflow-x-hidden ${isDark ? 'landing-dark' : 'landing-light'} bg-white text-slate-900`}
            data-public-theme={theme}
            style={{
                '--landing-primary': platformSettings.primaryColor || NAVY,
                '--landing-secondary': platformSettings.secondaryColor || BLUE,
            }}
        >
            <nav
                className={`fixed top-0 inset-x-0 z-50 border-b transition-all duration-300 ${
                    scrolled
                        ? isDark
                            ? 'border-[#2b313d] bg-[#0b0d12]/95 backdrop-blur'
                            : 'border-slate-200 bg-white/95 shadow-sm backdrop-blur'
                        : 'bg-[#0e1729]/78 border-white/10 backdrop-blur'
                }`}
            >
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
                    <Link to="/" className="flex min-w-0 items-center gap-3">
                        {logoSrc ? (
                            <img src={logoSrc} alt={platformName} className="h-9 w-auto max-w-28 object-contain" />
                        ) : (
                            <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                                style={{ background: scrolled ? NAVY : BLUE }}
                            >
                                <GraduationCap size={18} />
                            </span>
                        )}
                        <span
                            className={`truncate text-lg font-bold ${scrolled ? isDark ? 'text-white' : 'text-slate-950' : 'text-white'}`}
                        >
                            {platformName}
                        </span>
                    </Link>

                    <div className="hidden items-center gap-4 lg:flex">
                        {PUBLIC_NAV_ITEMS.map(([href, label]) => {
                            const isActive = activeSection === href;
                            return (
                                <a
                                    key={href}
                                    href={href}
                                    aria-current={isActive ? 'location' : undefined}
                                    className={`relative py-2 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:bg-[#4477f5] after:transition-transform ${
                                        isActive ? 'after:scale-x-100' : 'after:scale-x-0'
                                    } ${
                                        scrolled
                                            ? isActive ? 'text-[#4477f5]' : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-950'
                                            : isActive ? 'text-white' : 'text-white/72 hover:text-white'
                                    }`}
                                >
                                    {label}
                                </a>
                            );
                        })}
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={isDark ? 'Light mode' : 'Dark mode'}
                            className={`flex h-9 w-9 items-center justify-center transition-colors ${
                                scrolled
                                    ? isDark ? 'text-slate-200 hover:text-[var(--landing-secondary)]' : 'text-slate-600 hover:text-[var(--landing-secondary)]'
                                    : 'text-white hover:text-[var(--landing-secondary)]'
                            }`}
                        >
                            {isDark ? <Sun size={17} /> : <Moon size={17} />}
                        </button>
                        <Link
                            to="/login"
                            className={`text-sm font-bold transition-colors ${
                                scrolled ? isDark ? 'text-white hover:text-[#78a0ff]' : 'text-slate-900 hover:text-[#4477f5]' : 'text-white hover:text-white/80'
                            }`}
                        >
                            Sign In
                        </Link>
                        {registrationOpen && <NavCTA to="/register" label="Start School Setup" dark={!scrolled || isDark} />}
                    </div>

                    <div className="flex items-center gap-1 lg:hidden">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={isDark ? 'Light mode' : 'Dark mode'}
                            className={`flex h-9 w-9 items-center justify-center transition-colors ${
                                scrolled ? isDark ? 'text-white hover:text-[var(--landing-secondary)]' : 'text-slate-900 hover:text-[var(--landing-secondary)]' : 'text-white hover:text-[var(--landing-secondary)]'
                            }`}
                        >
                            {isDark ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button
                            type="button"
                            className={`rounded-md p-2 transition-colors ${
                                scrolled ? isDark ? 'text-white hover:bg-[#1a1f29]' : 'text-slate-900 hover:bg-slate-100' : 'text-white hover:bg-white/10'
                            }`}
                            onClick={() => setMenuOpen(value => !value)}
                            aria-label="Toggle navigation"
                        >
                            {menuOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                    </div>
                </div>

                <AnimatePresence>
                    {menuOpen && (
                        <>
                            <Motion.button
                                type="button"
                                aria-label="Close navigation"
                                className="fixed inset-0 z-[55] bg-slate-950/48 backdrop-blur-[2px] lg:hidden"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.22, ease: MOTION_EASE }}
                                onClick={() => setMenuOpen(false)}
                            />
                            <Motion.aside
                                className="fixed right-0 top-0 z-[60] flex h-dvh w-[min(78vw,350px)] min-w-[280px] flex-col bg-white lg:hidden"
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ duration: 0.34, ease: MOTION_EASE }}
                            >
                                <div className="flex items-center justify-between px-5 py-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                        {logoSrc ? (
                                            <img src={logoSrc} alt={platformName} className="h-10 w-auto max-w-32 object-contain" />
                                        ) : (
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#15233d] text-white">
                                                <GraduationCap size={18} />
                                            </span>
                                        )}
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-slate-950">{platformName}</p>
                                            <p className="text-xs font-semibold text-slate-500">Public navigation</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={toggleTheme}
                                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                                            title={isDark ? 'Light mode' : 'Dark mode'}
                                            className="flex h-9 w-9 items-center justify-center text-slate-600 transition-colors hover:text-[var(--landing-secondary)]"
                                        >
                                            {isDark ? <Sun size={17} /> : <Moon size={17} />}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Close navigation"
                                            className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950"
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto px-4 py-5">
                                    <nav aria-label="Mobile navigation">
                                        {PUBLIC_NAV_ITEMS.map(([href, label]) => {
                                            const isActive = activeSection === href;
                                            return (
                                                <a
                                                    key={href}
                                                    href={href}
                                                    aria-current={isActive ? 'location' : undefined}
                                                    onClick={() => setMenuOpen(false)}
                                                    className={`landing-mobile-link block px-1 py-3.5 text-sm font-semibold transition-colors ${isActive ? 'landing-mobile-link-active' : ''}`}
                                                >
                                                    {label}
                                                </a>
                                            );
                                        })}
                                    </nav>
                                </div>

                                <div className="p-4">
                                    <Link
                                        to="/login"
                                        onClick={() => setMenuOpen(false)}
                                        className="flex h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-[#15233d] transition hover:bg-slate-50"
                                    >
                                        Sign In
                                    </Link>
                                    {registrationOpen ? (
                                        <Link
                                            to="/register"
                                            onClick={() => setMenuOpen(false)}
                                            className="mt-3 flex h-11 items-center justify-center rounded-md bg-[#15233d] px-5 text-sm font-semibold text-white transition hover:bg-[#4477f5]"
                                        >
                                            Start School Setup
                                        </Link>
                                    ) : (
                                        <div className="mt-3 rounded-md border border-[#c7d9fd] bg-[#e8f0fe] px-4 py-3 text-center text-sm font-semibold text-[#15233d]">
                                            School registration is currently closed.
                                        </div>
                                    )}
                                </div>
                            </Motion.aside>
                        </>
                    )}
                </AnimatePresence>
            </nav>

            <section className="relative flex min-h-[calc(100svh-52px)] items-center overflow-hidden bg-[#0e1729] pb-16 pt-24">
                <img
                    src={HERO_IMAGE}
                    alt="Modern school administration dashboard"
                    className="absolute inset-0 h-full w-full object-cover object-[72%_center] brightness-[0.7] sm:object-[64%_center] lg:object-center lg:brightness-[0.82]"
                />
                <div className="absolute inset-0 bg-[rgba(14,23,41,0.44)] lg:bg-[rgba(14,23,41,0.18)]" />

                <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-6">
                    <Motion.div
                        className="max-w-2xl"
                        initial="hidden"
                        animate="visible"
                        variants={stagger}
                    >
                        <Motion.div
                            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/18 bg-[#0e1729]/42 px-4 py-2 text-xs font-semibold text-white/82"
                            variants={fadeUp}
                            transition={{ duration: 0.55, ease: MOTION_EASE }}
                        >
                            <Sparkles size={14} className="text-sky-200" />
                            School operations, connected
                        </Motion.div>

                        <Motion.h1
                            className="max-w-2xl text-4xl font-semibold leading-[1.08] text-white sm:text-5xl lg:text-[3.65rem]"
                            variants={fadeUp}
                            transition={{ duration: 0.62, ease: MOTION_EASE }}
                        >
                            Run every school day from one system.
                        </Motion.h1>
                        <Motion.p
                            className="mt-5 max-w-xl text-base font-normal leading-7 text-white/76"
                            variants={fadeUp}
                            transition={{ duration: 0.55, ease: MOTION_EASE }}
                        >
                            {platformName} connects admissions, fees, attendance, results, staff, students, and families across every branch.
                        </Motion.p>

                        <Motion.div
                            className="mt-7 flex flex-col gap-3 sm:flex-row"
                            variants={fadeUp}
                            transition={{ duration: 0.55, ease: MOTION_EASE }}
                        >
                            {registrationOpen ? (
                                <HeroButton to="/register" primary label="Register Your School" icon={<ArrowRight size={18} />} />
                            ) : (
                                <div className="flex h-12 items-center justify-center rounded-md border border-[#c7d9fd] bg-[#e8f0fe] px-6 text-sm font-semibold text-[#15233d]">
                                    Registration is currently closed
                                </div>
                            )}
                            <HeroButton to="/login" label="Sign In" />
                        </Motion.div>
                    </Motion.div>
                </div>
            </section>

            <section className="border-b border-slate-200 bg-white py-6" aria-label="Platform activity">
                <div className="mx-auto max-w-7xl px-5 sm:px-6">
                    <Motion.div
                        className="grid grid-cols-2 gap-y-6 lg:grid-cols-4"
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={stagger}
                    >
                        {heroStats.map(({ label, value, icon }) => (
                            <Motion.div
                                key={label}
                                className="flex items-center justify-center gap-3 px-3 even:border-l even:border-slate-200 lg:border-l lg:border-slate-200 lg:first:border-l-0"
                                variants={fadeSoft}
                                transition={{ duration: 0.42, ease: MOTION_EASE }}
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#eaf2ff] text-[#4477f5]">
                                    {icon}
                                </span>
                                <span>
                                    <span className="block text-xl font-semibold leading-none text-[#15233d]">{value}</span>
                                    <span className="mt-1 block text-xs font-medium text-slate-500">{label}</span>
                                </span>
                            </Motion.div>
                        ))}
                    </Motion.div>
                </div>
            </section>

            {schoolShowcase.length > 0 && (
                <section id="schools" className="landing-secondary-soft scroll-mt-20 py-16">
                    <div className="mx-auto max-w-7xl px-5 sm:px-6">
                        <Motion.div
                            className="mb-8 text-center"
                            initial="hidden"
                            whileInView="visible"
                            viewport={VIEWPORT_ONCE}
                            variants={fadeUp}
                            transition={{ duration: 0.5, ease: MOTION_EASE }}
                        >
                            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                                Trusted <span className="text-[var(--landing-secondary)] underline decoration-2 underline-offset-4">by</span> growing school communities
                            </h2>
                        </Motion.div>

                        <div className="relative overflow-hidden py-2">
                            {!reducedMotion && (
                                <>
                                    <div className="landing-marquee-fade landing-marquee-fade-left pointer-events-none absolute inset-y-0 left-0 z-10 w-20" />
                                    <div className="landing-marquee-fade landing-marquee-fade-right pointer-events-none absolute inset-y-0 right-0 z-10 w-20" />
                                </>
                            )}
                            <div className={reducedMotion ? 'flex flex-wrap justify-center gap-12 px-5' : 'school-marquee-track flex w-max items-center gap-16 px-6 sm:gap-20'}>
                                {(reducedMotion ? schoolShowcase : marqueeSchools).map((school, index) => (
                                    <SchoolShowcaseChip
                                        key={`${school.id || school.name}-${index}`}
                                        school={school}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            <section id="features" className="scroll-mt-20 bg-white py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-6">
                    <Motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={fadeUp}
                        transition={{ duration: 0.55, ease: MOTION_EASE }}
                    >
                        <SectionHeader
                            eyebrow="Built for the full school day"
                            title="Everything your school team needs"
                            sub="One connected workspace for the office, classroom, finance desk, students, and families."
                        />
                    </Motion.div>

                    <Motion.div
                        id="operations"
                        className="mt-12 grid gap-x-10 gap-y-5 md:grid-cols-2 lg:grid-cols-3"
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={stagger}
                    >
                        {[
                            {
                                icon: <Users size={21} />,
                                title: 'Admissions and student records',
                                desc: 'Keep admissions, enrollments, guardian links, and learner history together from day one.',
                            },
                            {
                                icon: <Building2 size={21} />,
                                title: 'Branches and transfers',
                                desc: 'Manage every campus while preserving the history behind transfers and enrollment changes.',
                            },
                            {
                                icon: <ReceiptText size={21} />,
                                title: 'Fees, invoices, and receipts',
                                desc: 'Set fees, issue invoices, collect payments, and keep reliable receipt and balance records.',
                            },
                            {
                                icon: <CalendarCheck size={21} />,
                                title: 'Attendance and timetables',
                                desc: 'Coordinate classes, teacher schedules, daily attendance, and student participation records.',
                            },
                            {
                                icon: <BookOpen size={21} />,
                                title: 'Results and progression',
                                desc: 'Record marks, calculate performance, promote learners, and preserve every academic year.',
                            },
                            {
                                icon: <ShieldCheck size={21} />,
                                title: 'Role-aware access',
                                desc: 'Give every role the access it needs while protecting tenant, branch, and student boundaries.',
                            },
                        ].map(item => (
                            <Motion.div
                                key={item.title}
                                variants={fadeSoft}
                                transition={{ duration: 0.48, ease: MOTION_EASE }}
                            >
                                <FeatureCard {...item} />
                            </Motion.div>
                        ))}
                    </Motion.div>
                </div>
            </section>

            <section className="bg-[#f7f9fc] py-24">
                <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                    <div>
                        <Motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={VIEWPORT_ONCE}
                            variants={fadeUp}
                            transition={{ duration: 0.55, ease: MOTION_EASE }}
                        >
                            <SectionHeader
                                align="left"
                                eyebrow="One connected journey"
                                title="Records that move with every learner"
                                sub="From first admission to graduation, every year, payment, result, and branch change remains connected."
                            />
                        </Motion.div>
                        <div className="relative mt-9">
                            <Motion.div
                                className="absolute bottom-8 left-[22px] top-8 w-px bg-[#c9d8f5]"
                                initial={reducedMotion ? false : { scaleY: 0 }}
                                whileInView={reducedMotion ? undefined : { scaleY: 1 }}
                                viewport={VIEWPORT_ONCE}
                                transition={{ duration: 0.8, ease: MOTION_EASE }}
                                style={{ transformOrigin: 'top' }}
                            />
                            <Motion.div
                                className="space-y-5"
                                initial="hidden"
                                whileInView="visible"
                                viewport={VIEWPORT_ONCE}
                                variants={timelineStagger}
                            >
                            {[
                                ['Register and approve', 'Platform owners approve schools and assign plans before school teams begin setup.'],
                                ['Set up each branch', 'Super admins and branch admins prepare users, classes, sections, subjects, assignments, timetables, and exams.'],
                                ['Run the academic year', 'Registrars admit students, finance teams collect fees, teachers record attendance and results.'],
                                ['Promote, transfer, preserve', 'Year history, branch history, parent access, and student records stay connected.'],
                            ].map(([title, desc], index) => (
                                <Motion.div
                                    key={title}
                                    className="relative grid grid-cols-[46px_1fr] gap-4"
                                    variants={fadeSoft}
                                    transition={{ duration: 0.5, ease: MOTION_EASE }}
                                >
                                    <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-[#f7f9fc] bg-[#15233d] text-sm font-semibold text-white">
                                        {index + 1}
                                    </span>
                                    <div className="border-b border-slate-200 pb-5">
                                        <p className="text-xs font-semibold uppercase text-[#4477f5]">Step {String(index + 1).padStart(2, '0')}</p>
                                        <h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3>
                                        <p className="mt-2 text-sm font-normal leading-6 text-slate-600">{desc}</p>
                                    </div>
                                </Motion.div>
                            ))}
                            </Motion.div>
                        </div>
                    </div>

                    <Motion.div
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={fadeLeft}
                        transition={{ duration: 0.65, ease: MOTION_EASE }}
                    >
                        <img
                            src={OPERATING_RHYTHM_IMAGE}
                            alt="School lifecycle records and planning workspace"
                            className="h-72 w-full object-cover object-center md:h-96"
                        />
                        <div className="grid border-t border-slate-200 md:grid-cols-3">
                            {[
                                ['Live dashboards', <BarChart3 size={17} />],
                                ['Secure portals', <ShieldCheck size={17} />],
                                ['Finance reports', <TrendingUp size={17} />],
                            ].map(([label, icon]) => (
                                <div key={label} className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
                                    <span className="text-[#4477f5]">{icon}</span>
                                    <span className="text-sm font-semibold text-slate-700">{label}</span>
                                </div>
                            ))}
                        </div>
                    </Motion.div>
                </div>
            </section>

            <section id="pricing" className="scroll-mt-20 bg-[#f7f9fc] py-24">
                <div className="mx-auto max-w-6xl px-5 sm:px-6">
                    <Motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={fadeUp}
                        transition={{ duration: 0.55, ease: MOTION_EASE }}
                    >
                        <SectionHeader
                            eyebrow="Plans"
                            title="A plan that fits your school today"
                            sub="Start with the capacity you need and move to a larger plan as your school grows."
                        />
                    </Motion.div>

                    <Motion.div
                        className="mt-7 flex items-center justify-center gap-3"
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={fadeSoft}
                        transition={{ duration: 0.45, ease: MOTION_EASE }}
                    >
                        <span className={`text-sm font-semibold ${billingPeriod === 'monthly' ? 'text-slate-950' : 'text-slate-500'}`}>
                            Monthly
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={billingPeriod === 'yearly'}
                            aria-label="Switch between monthly and yearly pricing"
                            onClick={() => setBillingPeriod(current => current === 'monthly' ? 'yearly' : 'monthly')}
                            className={`relative h-6 w-11 rounded-full transition-colors ${billingPeriod === 'yearly' ? 'bg-[#4477f5]' : 'bg-slate-300'}`}
                        >
                            <span
                                className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${billingPeriod === 'yearly' ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                        </button>
                        <span className={`text-sm font-semibold ${billingPeriod === 'yearly' ? 'text-slate-950' : 'text-slate-500'}`}>
                            Yearly
                        </span>
                    </Motion.div>

                    {plansLoading ? (
                        <div className="mt-14 flex items-center justify-center gap-3 text-sm font-semibold text-slate-500">
                            <Loader2 size={22} className="animate-spin" />
                            Loading plans...
                        </div>
                    ) : plans.length > 0 ? (
                        <Motion.div
                            className="mt-12 grid gap-5 md:grid-cols-3"
                            initial="hidden"
                            whileInView="visible"
                            viewport={VIEWPORT_ONCE}
                            variants={stagger}
                        >
                            {plans.map((plan, index) => (
                                <Motion.div
                                    key={plan._id || plan.slug}
                                    className="h-full"
                                    variants={fadeSoft}
                                    transition={{ duration: 0.48, ease: MOTION_EASE }}
                                >
                                    <PricingCard
                                        plan={plan}
                                        featured={index === 1}
                                        registrationOpen={registrationOpen}
                                        billingPeriod={billingPeriod}
                                    />
                                </Motion.div>
                            ))}
                        </Motion.div>
                    ) : (
                        <div className="mt-12 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
                            No active subscription plans are available right now.
                        </div>
                    )}
                </div>
            </section>

            <section id="reviews" className="landing-secondary-band scroll-mt-20 py-20">
                <div className="mx-auto max-w-5xl px-5 text-center sm:px-6">
                    <Motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={fadeUp}
                        transition={{ duration: 0.55, ease: MOTION_EASE }}
                    >
                        <Quote size={48} className="mx-auto text-white/85" strokeWidth={1.5} />
                        <p className="mt-4 text-xs font-semibold uppercase text-white/70">School team perspectives</p>
                        <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Built around the people who run the school</h2>
                    </Motion.div>

                    <div className="relative mx-auto mt-10 max-w-4xl px-12 sm:px-16">
                        <AnimatePresence mode="wait">
                            <Motion.div
                                key={perspectiveIndex}
                                initial={reducedMotion ? false : { opacity: 0, x: 24 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={reducedMotion ? undefined : { opacity: 0, x: -24 }}
                                transition={{ duration: 0.32, ease: MOTION_EASE }}
                            >
                                <p className="text-lg font-normal leading-8 text-white/72 sm:text-xl sm:leading-9">
                                    &ldquo;{TEAM_PERSPECTIVES[perspectiveIndex].quote}&rdquo;
                                </p>
                                <div className="mt-7">
                                    <p className="text-sm font-semibold text-white">{TEAM_PERSPECTIVES[perspectiveIndex].role}</p>
                                    <p className="mt-1 text-sm font-normal text-white/48">{TEAM_PERSPECTIVES[perspectiveIndex].context}</p>
                                </div>
                            </Motion.div>
                        </AnimatePresence>

                        <button
                            type="button"
                            aria-label="Previous perspective"
                            onClick={() => setPerspectiveIndex(current => (current - 1 + TEAM_PERSPECTIVES.length) % TEAM_PERSPECTIVES.length)}
                            className="absolute left-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#15233d] transition hover:bg-[#eaf2ff]"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            type="button"
                            aria-label="Next perspective"
                            onClick={() => setPerspectiveIndex(current => (current + 1) % TEAM_PERSPECTIVES.length)}
                            className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#15233d] transition hover:bg-[#eaf2ff]"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    <div className="mt-8 flex justify-center gap-2" aria-label="Perspective slides">
                        {TEAM_PERSPECTIVES.map((item, index) => (
                            <button
                                key={item.role}
                                type="button"
                                aria-label={`Show ${item.role} perspective`}
                                aria-current={perspectiveIndex === index ? 'true' : undefined}
                                onClick={() => setPerspectiveIndex(index)}
                                className={`h-2 rounded-full transition-all ${perspectiveIndex === index ? 'w-7 bg-white' : 'w-2 bg-white/32 hover:bg-white/60'}`}
                            />
                        ))}
                    </div>
                </div>
            </section>

            <section id="faq" className="scroll-mt-20 bg-white py-24">
                <div className="mx-auto max-w-6xl px-5 sm:px-6">
                    <Motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={fadeUp}
                        transition={{ duration: 0.55, ease: MOTION_EASE }}
                    >
                        <SectionHeader
                            eyebrow="Questions and answers"
                            title="Frequently asked questions"
                            sub="Find quick answers about registration, plans, branches, permissions, and student records."
                        />
                    </Motion.div>

                    <Motion.div
                        className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-12"
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={stagger}
                    >
                        {FAQ_GROUPS.map((group, groupIndex) => (
                            <Motion.div key={group.title} variants={fadeSoft} transition={{ duration: 0.48, ease: MOTION_EASE }}>
                                <div className="mb-4 flex items-center gap-2 text-slate-950">
                                    <group.icon size={21} className="text-[#4477f5]" />
                                    <h3 className="text-lg font-semibold">{group.title}</h3>
                                </div>
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    {group.items.map((item, itemIndex) => {
                                        const itemId = `${groupIndex}-${itemIndex}`;
                                        const isOpen = openFaq === itemId;
                                        return (
                                            <div key={item.question} className="border-b border-slate-200 last:border-b-0">
                                                <button
                                                    type="button"
                                                    aria-expanded={isOpen}
                                                    aria-controls={`faq-answer-${itemId}`}
                                                    onClick={() => setOpenFaq(current => current === itemId ? null : itemId)}
                                                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                                                >
                                                    <span className="text-sm font-semibold leading-6 text-slate-800">{item.question}</span>
                                                    <ChevronDown
                                                        size={17}
                                                        className={`shrink-0 text-[#4477f5] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                                    />
                                                </button>
                                                <AnimatePresence initial={false}>
                                                    {isOpen && (
                                                        <Motion.div
                                                            id={`faq-answer-${itemId}`}
                                                            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.24, ease: MOTION_EASE }}
                                                            className="overflow-hidden"
                                                        >
                                                            <p className="px-5 pb-5 text-sm font-normal leading-6 text-slate-600">{item.answer}</p>
                                                        </Motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Motion.div>
                        ))}
                    </Motion.div>
                </div>
            </section>

            <section id="contact" className="landing-secondary-soft scroll-mt-20 py-24">
                <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
                    <Motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={fadeUp}
                        transition={{ duration: 0.55, ease: MOTION_EASE }}
                    >
                        <p className="text-xs font-semibold uppercase text-[#4477f5]">Contact us</p>
                        <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
                            Let's plan your school setup.
                        </h2>
                        <p className="mt-4 max-w-xl text-[15px] font-normal leading-7 text-slate-600">
                            Tell us about your branches, students, and daily workflow. We'll help you choose the right starting point.
                        </p>

                        <div className="mt-8 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eaf2ff] text-[#4477f5]">
                                    <Mail size={18} />
                                </div>
                                <p className="mt-4 text-sm font-semibold text-slate-950">Email</p>
                                <a href={`mailto:${contactEmail}`} className="mt-1 block break-all text-sm font-semibold text-slate-600 hover:text-[#4477f5]">
                                    {contactEmail}
                                </a>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eaf2ff] text-[#4477f5]">
                                    <Clock size={18} />
                                </div>
                                <p className="mt-4 text-sm font-semibold text-slate-950">Response</p>
                                <p className="mt-1 text-sm font-semibold text-slate-600">School requests are reviewed by the platform team.</p>
                            </div>
                        </div>
                    </Motion.div>

                    <Motion.form
                        onSubmit={handleContactSubmit}
                        noValidate
                        className="landing-contact-form rounded-lg border border-slate-200 bg-white p-5 sm:p-7"
                        initial="hidden"
                        whileInView="visible"
                        viewport={VIEWPORT_ONCE}
                        variants={fadeLeft}
                        transition={{ duration: 0.6, ease: MOTION_EASE }}
                    >
                        <div className="mb-6 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#15233d] text-white">
                                <MessageSquare size={20} />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-slate-950">Send a message</h3>
                                <p className="text-sm font-medium text-slate-500">It opens your email app with this message ready.</p>
                            </div>
                        </div>

                        {contactError && (
                            <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                {contactError}
                            </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                            <ContactField
                                label="Your name"
                                name="name"
                                value={contactForm.name}
                                onChange={handleContactChange}
                                placeholder="Full name"
                                required
                            />
                            <ContactField
                                label="Email address"
                                name="email"
                                type="email"
                                value={contactForm.email}
                                onChange={handleContactChange}
                                placeholder="you@example.com"
                                required
                            />
                        </div>

                        <div className="mt-4">
                            <ContactField
                                label="School name"
                                name="school"
                                value={contactForm.school}
                                onChange={handleContactChange}
                                placeholder="Your school"
                            />
                        </div>

                        <label className="mt-4 block">
                            <span className="text-sm font-bold text-slate-700">Message</span>
                            <textarea
                                name="message"
                                value={contactForm.message}
                                onChange={handleContactChange}
                                rows={5}
                                required
                                placeholder="Tell us what you need help with..."
                                className="landing-contact-input mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#4477f5]"
                            />
                        </label>

                        <div className="mt-5 flex justify-end">
                            <button
                                type="submit"
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#4477f5] px-6 text-sm font-bold text-white transition-colors hover:bg-[#3266ef]"
                            >
                                Send Message
                                <ArrowRight size={17} />
                            </button>
                        </div>
                    </Motion.form>
                </div>
            </section>

            <section className="bg-[#15233d] py-12 sm:py-14">
                <Motion.div
                    className="mx-auto flex max-w-7xl flex-col gap-7 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:text-left"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VIEWPORT_ONCE}
                    variants={stagger}
                >
                    <div>
                        <Motion.p
                            className="text-xs font-semibold uppercase text-sky-200"
                            variants={fadeSoft}
                            transition={{ duration: 0.45, ease: MOTION_EASE }}
                        >
                            Ready to begin?
                        </Motion.p>
                        <Motion.h2
                            className="mt-2 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-4xl"
                            variants={fadeSoft}
                            transition={{ duration: 0.55, ease: MOTION_EASE }}
                        >
                            Bring your school into one secure system.
                        </Motion.h2>
                    </div>
                    <Motion.div
                        className="flex shrink-0 flex-col gap-3 sm:flex-row"
                        variants={fadeSoft}
                        transition={{ duration: 0.5, ease: MOTION_EASE }}
                    >
                        {registrationOpen ? (
                            <HeroButton to="/register" primary label="Register Your School" icon={<ArrowRight size={18} />} />
                        ) : (
                            <div className="flex h-12 items-center justify-center rounded-full border border-white/16 bg-white/10 px-6 text-sm font-bold text-white/82">
                                Registration is currently closed
                            </div>
                        )}
                        <HeroButton to="/login" label="Sign In" inverted />
                    </Motion.div>
                </Motion.div>
            </section>

            <footer className="bg-[#0e1729] px-5 py-14 sm:px-6">
                <div className="mx-auto max-w-7xl">
                    <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
                        <div>
                            <div className="flex items-center gap-3">
                                {logoSrc ? (
                                    <img src={logoSrc} alt={platformName} className="h-9 w-9 rounded-lg object-contain" />
                                ) : (
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4477f5] text-white">
                                        <GraduationCap size={18} />
                                    </span>
                                )}
                                <span className="text-lg font-bold text-white">{platformName}</span>
                            </div>
                            <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-white/56">
                                A modern school management platform for institutions that need clean records, strong permissions, and connected academic history.
                            </p>
                        </div>
                        <FooterGroup title="Platform" links={[['#features', 'Features'], ['#operations', 'Operations'], ['#pricing', 'Pricing']]} />
                        <FooterGroup
                            title="Account"
                            links={[
                                ['/login', 'Sign In', true],
                                ...(registrationOpen ? [['/register', 'Register School', true]] : []),
                                ['/platform/login', 'Platform Admin', true],
                            ]}
                        />
                        <div>
                            <h3 className="text-sm font-bold text-white">Contact</h3>
                            <div className="mt-4 space-y-3 text-sm font-medium text-white/56">
                                {platformSettings.supportEmail && (
                                    <a href={`mailto:${platformSettings.supportEmail}`} className="block hover:text-white">
                                        {platformSettings.supportEmail}
                                    </a>
                                )}
                                {platformSettings.officialWebsite && (
                                    <a href={platformSettings.officialWebsite} className="block hover:text-white">
                                        Official website
                                    </a>
                                )}
                                <span className="block">Somalia, Djibouti, Ethiopia</span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-7 text-sm font-medium text-white/42 sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/18 text-xs font-bold text-white/54">
                                C
                            </span>
                            <span>{new Date().getFullYear()} {platformName}. All Rights Reserved.</span>
                        </span>
                        <span className="flex items-center gap-2">
                            <ShieldCheck size={15} />
                            Secure multi-tenant school operations
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

const NavCTA = ({ to, label, dark }) => (
    <Link
        to={to}
        className={`landing-nav-cta inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold transition-colors ${
            dark ? 'bg-white text-[#15233d] hover:bg-[#eaf2ff]' : 'bg-[#15233d] text-white hover:bg-[#4477f5]'
        }`}
    >
        {label}
        <ChevronRight size={15} />
    </Link>
);

const HeroButton = ({ to, label, primary, icon, inverted }) => (
    <Link
        to={to}
        className={`inline-flex h-12 items-center justify-center gap-2 rounded-md px-7 text-sm font-semibold transition-colors ${!primary && !inverted ? 'landing-hero-secondary' : ''} ${
            primary
                ? 'bg-[#4477f5] text-white hover:bg-[#3266ef]'
                : inverted
                    ? 'border border-white/18 bg-white/8 text-white hover:bg-white/12'
                    : 'border border-white/18 bg-white text-[#15233d] hover:bg-[#eaf2ff]'
        }`}
    >
        {label}
        {icon}
    </Link>
);

const SectionHeader = ({ eyebrow, title, sub, align = 'center' }) => (
    <div className={`${align === 'center' ? 'mx-auto text-center' : ''} max-w-3xl`}>
        <p className="text-xs font-semibold uppercase text-[#4477f5]">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold leading-[1.2] text-slate-950 sm:text-4xl">{title}</h2>
        <p className={`${align === 'center' ? 'mx-auto' : ''} mt-4 max-w-2xl text-[15px] font-normal leading-7 text-slate-600`}>{sub}</p>
    </div>
);

const ContactField = ({ label, ...props }) => (
    <label className="block">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        <input
            {...props}
            className="landing-contact-input mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#4477f5]"
        />
    </label>
);

const FeatureCard = ({ icon, title, desc }) => (
    <div className="group flex gap-4 border-b border-slate-200 px-1 py-6 transition hover:border-[#9db8ed]">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#eaf2ff] text-[#4477f5] transition group-hover:bg-[#15233d] group-hover:text-white">
            {icon}
        </div>
        <div>
            <h3 className="text-base font-semibold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm font-normal leading-6 text-slate-600">{desc}</p>
        </div>
    </div>
);

const SchoolShowcaseChip = ({ school }) => {
    const logoSrc = getAssetSrc(school.logoUrl);

    return (
        <div
            className="flex h-24 w-48 shrink-0 items-center justify-center px-3 sm:w-56"
            title={school.name}
            aria-label={school.name}
        >
            <img
                src={logoSrc}
                alt={`${school.name} logo`}
                className="school-showcase-logo max-h-20 max-w-44 object-contain opacity-85 transition duration-300 hover:scale-[1.03] hover:opacity-100 sm:max-w-52"
            />
        </div>
    );
};

const PricingCard = ({ plan, featured, registrationOpen, billingPeriod }) => {
    const monthlyPrice = Number(plan.monthlyPrice ?? plan.price);
    const yearlyPrice = Number(plan.yearlyPrice);
    const isCustom = String(plan.price).toLowerCase() === 'custom' || !Number.isFinite(monthlyPrice);
    const selectedPrice = billingPeriod === 'yearly'
        ? (Number.isFinite(yearlyPrice) ? yearlyPrice : monthlyPrice * 12)
        : monthlyPrice;
    const priceDisplay = isCustom ? 'Contact' : Number(selectedPrice).toLocaleString();
    const billingLabel = billingPeriod === 'yearly' ? '/year' : '/month';
    const features = [
        formatLimit(plan.maxBranches, 'branches'),
        formatLimit(plan.maxStudents, 'students'),
        formatLimit(plan.maxUsers, 'users'),
        `Storage: ${plan.storage || 'included'}`,
        plan.hasPrioritySupport ? 'Priority support' : 'Standard support',
    ];

    return (
        <div className={`relative flex h-full overflow-hidden rounded-lg border bg-white p-7 text-slate-950 shadow-sm transition hover:-translate-y-1 hover:shadow-md ${featured ? 'border-[#4477f5]' : 'border-slate-200'}`}>
            <div className="flex min-h-full w-full flex-col">
                {featured && (
                    <div className="absolute right-0 top-0 rounded-bl-lg bg-[#4477f5] px-4 py-1.5 text-xs font-semibold text-white">
                        Popular
                    </div>
                )}
                <div className="flex min-h-[76px] items-start gap-4 pr-14">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold text-slate-950">{plan.name}</h3>
                        <p className="mt-1 min-h-12 line-clamp-2 text-sm font-normal leading-6 text-slate-500">
                            {plan.description || 'For active school operations'}
                        </p>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-[#4477f5]">
                        {featured ? <Zap size={18} /> : <Layers3 size={18} />}
                    </span>
                </div>
                <div className="flex min-h-[116px] items-center justify-center py-7 text-center">
                    {isCustom ? (
                        <span className="text-3xl font-semibold text-slate-950">Contact us</span>
                    ) : (
                        <div className="flex items-end justify-center gap-1">
                            <sup className="pb-5 text-sm font-semibold text-slate-700">$</sup>
                            <span className="text-4xl font-semibold text-slate-950">{priceDisplay}</span>
                            <span className="pb-1 text-xs font-medium text-slate-500">{billingLabel}</span>
                        </div>
                    )}
                </div>
                <div className="h-px bg-slate-200" />
                <ul className="mt-7 space-y-3.5">
                    {features.map(feature => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm font-normal text-slate-600">
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#4477f5]" />
                            <span>{feature}</span>
                        </li>
                    ))}
                </ul>
                <div className="mt-auto pt-8">
                    {registrationOpen ? (
                        <Link
                            to="/register"
                            className={`flex h-11 items-center justify-center rounded-md px-5 text-sm font-semibold transition hover:-translate-y-0.5 active:translate-y-0 ${
                                featured ? 'bg-[#4477f5] text-white hover:bg-[#3266ef]' : 'bg-[#eaf2ff] text-[#15233d] hover:bg-[#dbe8ff]'
                            }`}
                        >
                            {isCustom ? 'Contact Sales' : 'Get Started'}
                        </Link>
                    ) : (
                        <div className="flex h-11 items-center justify-center rounded-md bg-slate-100 px-5 text-sm font-semibold text-slate-400">
                            Registration closed
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const FooterGroup = ({ title, links }) => (
    <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <div className="mt-4 space-y-3 text-sm font-medium text-white/56">
            {links.map(([href, label, isRoute]) => (
                isRoute ? (
                    <Link key={href} to={href} className="block hover:text-white">
                        {label}
                    </Link>
                ) : (
                    <a key={href} href={href} className="block hover:text-white">
                        {label}
                    </a>
                )
            ))}
        </div>
    </div>
);

export default Landing;
