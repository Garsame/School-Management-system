import React, { useState, useEffect } from 'react';
import { getFinancePolicies, updateFinancePolicies } from '../../services/api/finance.api';
import { Button } from '../../components/ui';
import { Save, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const Policies = () => {
    const { user } = useAuth();
    const [policy, setPolicy] = useState({ autoInvoiceMode: 'MANUAL', isEnabled: true });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        const fetchPolicy = async () => {
            try {
                const data = await getFinancePolicies();
                setPolicy(data?.data || data || { autoInvoiceMode: 'MANUAL', isEnabled: true });
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchPolicy();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await updateFinancePolicies(policy);
            setMessage({ type: 'success', text: 'Policies updated successfully!' });
        } catch {
            setMessage({ type: 'error', text: 'Failed to update policies.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-4">
            <div className="phoenix-page-header">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--primary)] bg-opacity-10 rounded-lg text-[var(--primary)]">
                         <ShieldCheck size={18} />
                    </div>
                    <div>
                        <h1 className="phoenix-page-title">Finance policies</h1>
                        <p className="phoenix-page-subtitle">Configure global invoicing and collection rules.</p>
                    </div>
                </div>
            </div>

            <article className="phoenix-card">
                <div className="phoenix-card-header">
                    <div>
                        <h2 className="phoenix-section-title">Invoice Generation Policy</h2>
                        <p className="phoenix-section-copy">Define automatic billing events and operational switches.</p>
                    </div>
                </div>
                <div className="phoenix-card-body space-y-6">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div>
                            <p className="font-bold text-slate-800 text-sm">Auto-Invoice Mode</p>
                            <p className="text-xs text-slate-500 mt-1 max-w-md">Record when your finance team expects invoices to be generated. Invoice generation remains a reviewed finance action.</p>
                        </div>
                        <select 
                            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-[var(--primary)] outline-none"
                            value={policy.autoInvoiceMode}
                            onChange={(e) => setPolicy({...policy, autoInvoiceMode: e.target.value})}
                        >
                            <option value="MANUAL">Manual Only</option>
                            <option value="ON_YEAR_START">On Year Start</option>
                            <option value="ON_ENROLLMENT">On Enrollment</option>
                        </select>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div>
                            <p className="font-bold text-slate-800 text-sm">Module Status</p>
                            <p className="text-xs text-slate-500 mt-1">Master switch for finance operations. Disabling stops all new transactions.</p>
                        </div>
                         <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={policy.isEnabled}
                                onChange={(e) => setPolicy({...policy, isEnabled: e.target.checked})}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                        </label>
                    </div>

                    {message && (
                        <div className={`p-3 rounded-lg text-xs font-semibold text-center ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                            {message.text}
                        </div>
                    )}

                    <div className="flex justify-end pt-4 border-t border-slate-100">
                        {hasPermission(user, 'finance.policies.update') && <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2 !h-9 text-xs">
                            <Save size={16} />
                            {saving ? 'Applying Changes...' : 'Save Configuration'}
                        </Button>}
                    </div>
                </div>
            </article>
        </div>
    );
};

export default Policies;
