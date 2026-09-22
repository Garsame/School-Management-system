import React from 'react';

export const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    rounded = 'rounded',
    loading = false,
    className = '',
    disabled = false,
    ...props
}) => {
    const variants = {
        primary: 'bg-[var(--primary)] text-white shadow-md shadow-blue-500/20 hover:bg-[var(--primary-dark)]',
        secondary: 'bg-[var(--secondary)] text-white shadow-md shadow-emerald-500/20 hover:brightness-95',
        outline: 'border border-[var(--border-strong)] bg-white text-slate-700 hover:border-[var(--primary)] hover:text-[var(--primary)]',
        ghost: 'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        danger: 'bg-rose-600 text-white shadow-md shadow-rose-500/20 hover:bg-rose-700',
        soft: 'bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100',
        glass: 'bg-white/20 text-white border border-white/40 hover:bg-white/30 backdrop-blur-md'
    };

    const sizes = {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-11 px-4.5 text-sm',
        lg: 'h-12 px-6 text-base'
    };

    const shapes = {
        rounded: 'rounded-xl',
        pill: 'rounded-full',
        none: 'rounded-none'
    };

    return (
        <button 
            className={`inline-flex items-center justify-center gap-2 font-bold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${shapes[rounded] || shapes.rounded} ${className}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
            {children}
        </button>
    );
};

export const Input = ({ label, error, helperText, icon, placeholder, className = '', ...props }) => {
    const defaultPlaceholder = placeholder || (label ? `Enter ${label.toLowerCase()}...` : 'Enter value...');
    return (
        <div className="space-y-1.5 flex-1">
            {label && <label className="text-[13px] font-semibold text-slate-700">{label}</label>}
            <div className="relative group">
                {icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--primary)] transition-colors">
                        {icon}
                    </div>
                )}
                <input 
                    placeholder={defaultPlaceholder}
                    className={`w-full ${icon ? 'pl-10 pr-3' : 'px-3'} h-11 rounded-xl border border-[var(--border)] bg-white text-slate-800 shadow-none outline-none transition-all placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 ${className}`}
                    {...props}
                />
            </div>
            {helperText && !error && <p className="text-xs text-slate-500">{helperText}</p>}
            {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </div>
    );
};

export const Select = ({ label, options = [], error, className = '', placeholder = 'Select Option', ...props }) => (
    <div className="space-y-1.5 flex-1">
        {label && <label className="text-[13px] font-semibold text-slate-700">{label}</label>}
        <select 
            className={`w-full h-11 rounded-xl border border-[var(--border)] bg-white px-3 pr-10 text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 appearance-none ${className}`}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.2rem' }}
            {...props}
        >
            <option value="">{placeholder}</option>
            {options.map(opt => (
                <option key={opt.value ?? opt._id ?? String(opt)} value={opt.value ?? opt._id ?? String(opt)} disabled={Boolean(opt.disabled)}>
                    {opt.label ?? opt.name ?? String(opt)}
                </option>
            ))}
        </select>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
);

export const Card = ({ children, title, className = '', bodyClassName = '', headerAction, ...props }) => {
    const noBodyPadding = /\bp-0\b/.test(className);

    return (
    <div className={`rounded-2xl border border-[var(--border)] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)] overflow-hidden ${className}`} {...props}>
        {title && (
            <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-soft)]">
                <h3 className="font-bold text-slate-800">{title}</h3>
                {headerAction}
            </div>
        )}
        <div className={`${noBodyPadding ? '' : 'p-5 md:p-6'} ${bodyClassName}`}>{children}</div>
    </div>
);
};

export const Badge = ({ children, variant = 'default', className = '' }) => {
    const colors = {
        default: 'bg-slate-100 text-slate-700 border-slate-200',
        success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        warning: 'bg-amber-100 text-amber-700 border-amber-200',
        danger: 'bg-rose-100 text-rose-700 border-rose-200',
        primary: 'bg-blue-100 text-blue-700 border-blue-200',
        secondary: 'bg-violet-100 text-violet-700 border-violet-200',
        indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        blue: 'bg-blue-100 text-blue-700 border-blue-200',
        emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        slate: 'bg-slate-100 text-slate-700 border-slate-200',
        outline: 'bg-white text-slate-600 border-slate-300'
    };
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${colors[variant] || colors.default} ${className}`}>
            {children}
        </span>
    );
};

export const Table = ({ headers = [], children, className = '' }) => (
    <div className={`overflow-x-auto rounded-xl border border-[var(--border)] bg-white ${className}`}>
        <table className="min-w-full text-left text-sm">
            {headers.length > 0 && (
                <thead className="bg-[var(--surface-soft)] text-slate-700">
                    <tr>
                    {headers.map((h, i) => (
                        <th key={i} className="border-b border-[var(--border)] px-4 py-3 font-bold">
                            {h}
                        </th>
                    ))}
                    </tr>
                </thead>
            )}
            <tbody className="[&>tr>td]:border-b [&>tr>td]:border-[var(--border)]/70 [&>tr:last-child>td]:border-b-0">
                {children}
            </tbody>
        </table>
    </div>
);

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'lg' }) => {
    if (!isOpen) return null;
    const maxWidths = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        'full': 'max-w-full'
    };
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className={`w-full ${maxWidths[maxWidth]} max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-white shadow-2xl`}>
                <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-soft)]">
                    <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="h-8 w-8 rounded-full text-slate-500 transition-colors hover:bg-slate-200">&times;</button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
};

export const Spinner = ({ size = 'md' }) => {
    const sizes = { sm: 'h-4 w-4 border-2', md: 'h-8 w-8 border-4', lg: 'h-12 w-12 border-4' };
    return (
        <div className="flex justify-center p-8">
            <div className={`${sizes[size] || sizes.md} animate-spin rounded-full border-slate-200 border-t-[var(--primary)]`}></div>
        </div>
    );
};

export const Toast = ({ message, type = 'error', onClose }) => {
    if (!message) return null;
    const color = type === 'success'
        ? 'bg-emerald-500'
        : type === 'warning'
            ? 'bg-amber-500'
            : 'bg-rose-500';
    return (
        <div className="fixed bottom-6 right-6 z-[110] max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
                <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${color}`} />
                <span className="flex-1 text-sm font-medium text-slate-700">{message}</span>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-700">&times;</button>
            </div>
        </div>
    );
};

// An on/off switch. The label is required for screen readers even when it is not shown.
export const Switch = ({ checked, onChange, label, disabled = false, className = '' }) => (
    <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-[var(--primary)]' : 'bg-slate-300'} ${className}`}
    >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
);
