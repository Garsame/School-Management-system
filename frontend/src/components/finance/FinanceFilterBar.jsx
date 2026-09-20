import React from 'react';
import { Filter, RotateCcw, Search } from 'lucide-react';
import { Button } from '../ui';

const FinanceFilterBar = ({ children, onApply, onReset, activeCount = 0, loading = false, resultLabel = '' }) => (
    <section className="phoenix-card overflow-visible" aria-label="Report filters">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Filter size={16} /> Filters</div>
                <p className="mt-1 text-xs text-slate-500">Choose your criteria, then apply them together.</p>
            </div>
            <div className="flex items-center gap-2">
                {resultLabel ? <span className="mr-1 text-xs font-semibold text-slate-500">{resultLabel}</span> : null}
                {activeCount > 0 ? <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{activeCount} active</span> : null}
                <Button type="button" variant="ghost" onClick={onReset} disabled={loading} className="!h-11"><RotateCcw size={15} /> Reset</Button>
                <Button type="button" onClick={onApply} disabled={loading} className="!h-11"><Search size={15} />{loading ? 'Applying…' : 'Apply filters'}</Button>
            </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4 [&_select]:!h-11 [&_select]:!text-sm [&_input]:!h-11 [&_input]:!text-sm">
            {children}
        </div>
    </section>
);

export default FinanceFilterBar;
