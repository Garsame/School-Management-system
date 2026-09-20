import React, { useState, useEffect } from 'react';
import { Plus, X, CalendarCheck, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import { notify } from '../../components/feedback/notificationService';

const LeavesRequest = () => {
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        type: 'Sick',
        startDate: '',
        endDate: '',
        reason: ''
    });

    const fetchLeaves = async () => {
        try {
            const res = await api.get('/hr/leaves');
            if (res.data?.success) {
                setLeaves(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load leaves history', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaves();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post('/hr/leaves', formData);
            setIsModalOpen(false);
            setFormData({ type: 'Sick', startDate: '', endDate: '', reason: '' });
            fetchLeaves();
        } catch (err) {
            notify(err.response?.data?.message || 'Failed to submit leave request', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="h-96 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                        My Leave Requests
                    </h1>
                    <p className="text-slate-400 font-medium text-xs">Submit leave requests and monitor approvals history.</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="h-10 px-4 bg-slate-900 text-white rounded-lg font-semibold tracking-wider text-xs flex items-center gap-2 hover:bg-slate-800 transition-all active:scale-95 shadow-sm"
                >
                    <Plus size={16} />
                    REQUEST TIME OFF
                </button>
            </div>

            {/* Leaves History Table */}
            {leaves.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center max-w-md mx-auto shadow-sm">
                    <CalendarCheck className="mx-auto text-slate-300 mb-4" size={36} />
                    <h3 className="text-lg font-bold text-slate-800 mb-1">No Leave History</h3>
                    <p className="text-slate-500 text-sm">
                        You have not submitted any leave requests yet.
                    </p>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/20">
                                    <th className="p-6">Type</th>
                                    <th className="p-6">Start Date</th>
                                    <th className="p-6">End Date</th>
                                    <th className="p-6">Reason</th>
                                    <th className="p-6">Status</th>
                                    <th className="p-6">Approver Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaves.map(leave => (
                                    <tr key={leave._id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                                        <td className="p-6 font-black text-slate-900">{leave.type}</td>
                                        <td className="p-6 text-sm text-slate-600 font-bold">
                                            {new Date(leave.startDate).toLocaleDateString()}
                                        </td>
                                        <td className="p-6 text-sm text-slate-600 font-bold">
                                            {new Date(leave.endDate).toLocaleDateString()}
                                        </td>
                                        <td className="p-6 text-sm text-slate-500 font-bold max-w-xs truncate">
                                            {leave.reason}
                                        </td>
                                        <td className="p-6">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                                                leave.status === 'Approved' 
                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                                    : leave.status === 'Rejected'
                                                    ? 'bg-rose-50 text-rose-600 border-rose-100'
                                                    : 'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                                {leave.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-sm text-slate-500 font-bold italic">
                                            {leave.status !== 'Pending' ? (
                                                <span>
                                                    {leave.reviewRemarks || 'No remarks provided'}
                                                    <span className="text-[10px] block text-slate-400 font-bold">By {leave.reviewedBy?.name || 'Administrator'}</span>
                                                </span>
                                            ) : (
                                                <span className="text-slate-400">Awaiting review...</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Request Leave Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-xl relative z-10 overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-205 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Request Leave</h3>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Submit Time Off Details</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-200 rounded-lg transition-all shadow-sm">
                                <X size={16} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Leave Type</label>
                                <select 
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                >
                                    <option value="Sick">Sick Leave</option>
                                    <option value="Casual">Casual Leave</option>
                                    <option value="Annual">Annual Leave</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Date</label>
                                    <input 
                                        required
                                        type="date"
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                        value={formData.startDate}
                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">End Date</label>
                                    <input 
                                        required
                                        type="date"
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-500 transition-all"
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason / Remarks</label>
                                <textarea 
                                    required
                                    rows="4"
                                    placeholder="Provide detailed description of leave request..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-500 transition-all resize-none"
                                    value={formData.reason}
                                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={submitting}
                                className="w-full h-10 bg-slate-900 text-white rounded-lg font-semibold tracking-wider text-xs flex items-center justify-center hover:bg-slate-800 transition-all active:scale-[0.98]"
                            >
                                {submitting ? 'SUBMITTING...' : 'SUBMIT REQUEST'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeavesRequest;
