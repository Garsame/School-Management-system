import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Spinner } from '../../components/ui';
import { apiChangeStudentPassword } from '../../services/api/student.api';
import { ShieldAlert, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';

const ChangePassword = () => {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (newPassword !== confirmPassword) {
            return setError('New passwords do not match');
        }

        if (newPassword.length < 8) {
             return setError('Password must be at least 8 characters');
        }

        setLoading(true);
        try {
            await apiChangeStudentPassword(oldPassword, newPassword);
            setSuccess(true);
            setTimeout(() => navigate('/student'), 2000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Change Password</h1>
                    <p className="phoenix-page-subtitle">For your security, please update your password regularly.</p>
                </div>
            </div>

            <div className="phoenix-card">
                <div className="phoenix-card-body">
                    {success ? (
                        <div className="text-center py-10">
                            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-4">
                                <CheckCircle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-[#141824]">Password updated!</h3>
                            <p className="text-sm text-[#8a94ad] mt-1 font-medium">Redirecting you to the portal...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="md:col-span-2 space-y-4">
                                {error && (
                                    <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-lg flex items-center gap-3">
                                        <AlertCircle size={20} className="shrink-0" />
                                        <span className="text-sm font-semibold">{error}</span>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500">Current password</label>
                                    <Input
                                        type="password"
                                        placeholder="Enter current password"
                                        value={oldPassword}
                                        onChange={(e) => setOldPassword(e.target.value)}
                                        className="w-full"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                     <label className="text-xs font-bold text-slate-500">New password</label>
                                    <Input
                                        type="password"
                                        placeholder="Min. 8 characters"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                     <label className="text-xs font-bold text-slate-500">Confirm new password</label>
                                    <Input
                                        type="password"
                                        placeholder="Repeat new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full"
                                        required
                                    />
                                </div>

                                <div className="pt-2">
                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        className="flex items-center gap-2"
                                    >
                                        {loading ? <Spinner size="sm" /> : (
                                            <>
                                                <span>Update password</span>
                                                <ArrowRight size={16} />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="md:col-span-1">
                                <div className="p-6 bg-slate-50 rounded-lg border border-dashed border-[#cbd0dd]">
                                    <div className="flex gap-3">
                                        <ShieldAlert className="text-amber-500 shrink-0" size={20} />
                                        <div>
                                            <h4 className="text-sm font-bold text-[#141824]">Why this is required?</h4>
                                            <p className="text-xs text-[#525b75] font-medium mt-1 leading-relaxed">
                                                You are using a temporary password. To keep your academic data safe, you must set a private password before proceeding.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChangePassword;

