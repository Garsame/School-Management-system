import React, { useState, useEffect } from 'react';
import { User, Phone, MapPin, Key, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../../services/api';

const ParentProfile = () => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    // Profile Edit State
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [updatingProfile, setUpdatingProfile] = useState(false);

    // Password Change State
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [updatingPassword, setUpdatingPassword] = useState(false);

    const fetchProfile = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/parent/profile');
            if (res.data?.success) {
                const data = res.data.data;
                setProfile(data);
                setName(data.name || '');
                setPhone(data.phone || '');
                setAddress(data.address || '');
            } else {
                setError('Failed to retrieve profile data.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error loading profile settings.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setUpdatingProfile(true);
        setProfileSuccess('');
        setError('');

        try {
            const res = await api.put('/parent/profile', { name, phone, address });
            if (res.data?.success) {
                setProfile(res.data.data);
                setProfileSuccess('Profile details updated successfully.');
            } else {
                setError('Failed to update profile.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error updating profile details.');
        } finally {
            setUpdatingProfile(false);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (newPassword.length < 8) {
            setPasswordError('New password must be at least 8 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError('New password and password confirmation do not match.');
            return;
        }

        setUpdatingPassword(true);
        try {
            const res = await api.put('/parent/change-password', { oldPassword, newPassword });
            if (res.data?.success) {
                setPasswordSuccess('Password updated successfully.');
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                setPasswordError('Failed to change password.');
            }
        } catch (err) {
            setPasswordError(err.response?.data?.message || 'Error changing password.');
        } finally {
            setUpdatingPassword(false);
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
        <div className="space-y-6">
            {/* Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">My Profile</h1>
                    <p className="phoenix-page-subtitle">Manage your contact details and security preferences.</p>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-900 animate-fade-in">
                    <AlertTriangle className="text-rose-500 flex-shrink-0" size={20} />
                    <div className="text-sm font-semibold flex-1">{error}</div>
                    <button onClick={fetchProfile} className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold px-3 py-1.5 rounded-lg transition">
                        Retry
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Settings Card */}
                <div className="lg:col-span-2 phoenix-card p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center">
                                <User size={20} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-800">Personal Details</h2>
                        </div>

                        {profileSuccess && (
                            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center gap-2 text-emerald-950 text-xs font-semibold animate-fade-in">
                                <CheckCircle className="text-emerald-500" size={16} />
                                {profileSuccess}
                            </div>
                        )}

                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#8a94ad]">Account Email</label>
                                    <input
                                        type="text"
                                        value={profile?.email || ''}
                                        disabled
                                        className="w-full h-10 bg-slate-50 border border-slate-100 text-slate-400 rounded-lg px-3 text-sm font-semibold outline-none cursor-not-allowed"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#8a94ad]">Full Name</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                            placeholder="Your full name"
                                            className="w-full h-10 bg-white border border-[#cbd0dd] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 rounded-lg pl-9 pr-3 text-sm font-semibold outline-none transition-all"
                                        />
                                        <User className="absolute left-3 top-3 text-[#8a94ad]" size={14} />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#8a94ad]">Phone Number</label>
                                    <div className="relative">
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="Your phone number"
                                            className="w-full h-10 bg-white border border-[#cbd0dd] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 rounded-lg pl-9 pr-3 text-sm font-semibold outline-none transition-all"
                                        />
                                        <Phone className="absolute left-3 top-3 text-[#8a94ad]" size={14} />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#8a94ad]">Residential Address</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            placeholder="Your address"
                                            className="w-full h-10 bg-white border border-[#cbd0dd] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 rounded-lg pl-9 pr-3 text-sm font-semibold outline-none transition-all"
                                        />
                                        <MapPin className="absolute left-3 top-3 text-[#8a94ad]" size={14} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={updatingProfile}
                                    className="w-full md:w-auto px-6 h-10 bg-[var(--primary)] text-white font-bold rounded-lg text-sm transition hover:shadow-lg disabled:opacity-50"
                                >
                                    {updatingProfile ? 'Saving Details...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Password Change Card */}
                <div className="lg:col-span-1 phoenix-card p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-amber-550/10 text-amber-600 flex items-center justify-center">
                                <Key size={20} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-800">Security Settings</h2>
                        </div>

                        {passwordSuccess && (
                            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center gap-2 text-emerald-950 text-xs font-semibold animate-fade-in">
                                <CheckCircle className="text-emerald-500" size={16} />
                                {passwordSuccess}
                            </div>
                        )}

                        {passwordError && (
                            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-100 flex items-center gap-2 text-rose-950 text-xs font-semibold animate-fade-in">
                                <AlertTriangle className="text-rose-500" size={16} />
                                {passwordError}
                            </div>
                        )}

                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#8a94ad]">Current Password</label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={oldPassword}
                                        onChange={(e) => setOldPassword(e.target.value)}
                                        required
                                        placeholder="••••••••"
                                        className="w-full h-10 bg-white border border-[#cbd0dd] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 rounded-lg pl-9 pr-3 text-sm font-semibold outline-none transition-all"
                                    />
                                    <Key className="absolute left-3 top-3 text-[#8a94ad]" size={14} />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#8a94ad]">New Password</label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        placeholder="Min. 8 characters"
                                        className="w-full h-10 bg-white border border-[#cbd0dd] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 rounded-lg pl-9 pr-3 text-sm font-semibold outline-none transition-all"
                                    />
                                    <Key className="absolute left-3 top-3 text-[#8a94ad]" size={14} />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#8a94ad]">Confirm New Password</label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        placeholder="Min. 8 characters"
                                        className="w-full h-10 bg-white border border-[#cbd0dd] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 rounded-lg pl-9 pr-3 text-sm font-semibold outline-none transition-all"
                                    />
                                    <Key className="absolute left-3 top-3 text-[#8a94ad]" size={14} />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={updatingPassword}
                                className="w-full h-10 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-sm transition hover:shadow-lg disabled:opacity-50"
                            >
                                {updatingPassword ? 'Changing Password...' : 'Change Password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ParentProfile;
