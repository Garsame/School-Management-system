import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Spinner, Toast } from '../../components/ui';
import { getProfile, updateProfile, changePassword } from '../../services/api/teacher.api';
import { User, Phone, MapPin, Key, Mail, Shield } from 'lucide-react';

const Profile = () => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updatingProfile, setUpdatingProfile] = useState(false);
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const [toast, setToast] = useState(null);

    // Profile form state
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');

    // Password form state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        fetchProfileData();
    }, []);

    const fetchProfileData = async () => {
        try {
            setLoading(true);
            const res = await getProfile();
            const data = res?.data || res || {};
            setProfile(data);
            setName(data.name || '');
            setPhone(data.phone || '');
            setAddress(data.address || '');
        } catch {
            setToast({ type: 'error', message: 'Failed to load profile details' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setUpdatingProfile(true);
        try {
            const res = await updateProfile({ name, phone, address });
            const data = res?.data || res || {};
            setProfile(data);
            setToast({ type: 'success', message: 'Profile details updated successfully' });
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Failed to update profile' });
        } finally {
            setUpdatingProfile(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (newPassword.length < 8) {
            setToast({ type: 'error', message: 'New password must be at least 8 characters long' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setToast({ type: 'error', message: 'New passwords do not match' });
            return;
        }

        setUpdatingPassword(true);
        try {
            await changePassword({ currentPassword, newPassword, confirmPassword });
            setToast({ type: 'success', message: 'Password updated successfully' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Failed to change password' });
        } finally {
            setUpdatingPassword(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in w-full">
            {/* Page Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">My Profile</h1>
                    <p className="phoenix-page-subtitle">Manage your personal details and security preferences.</p>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Profile Overview Card */}
            <div className="phoenix-card">
                <div className="phoenix-card-body">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-[var(--primary)] text-white flex items-center justify-center text-2xl font-bold shadow-inner">
                            {profile?.name?.charAt(0).toUpperCase() || 'T'}
                        </div>
                        <div className="text-center md:text-left space-y-1">
                            <h2 className="text-xl font-bold text-slate-900">{profile?.name}</h2>
                            <div className="flex flex-wrap justify-center md:justify-start gap-4 text-xs font-semibold text-slate-500">
                                <span className="flex items-center gap-1.5"><Mail size={14} /> {profile?.email}</span>
                                <span className="flex items-center gap-1.5 capitalize"><Shield size={14} /> Role: {String(profile?.role || '').replace('_', ' ')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Split Grid for Forms */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Profile Settings */}
                <div className="phoenix-card">
                    <div className="phoenix-card-body space-y-4">
                        <h3 className="text-base font-bold text-slate-800">Personal Details</h3>
                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Full name</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                                            <User size={16} />
                                        </span>
                                        <Input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Enter your full name"
                                            className="pl-10 w-full text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phone number</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                                            <Phone size={16} />
                                        </span>
                                        <Input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="Enter phone number"
                                            className="pl-10 w-full text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Address</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                                            <MapPin size={16} />
                                        </span>
                                        <Input
                                            type="text"
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            placeholder="Enter home/office address"
                                            className="pl-10 w-full text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    variant="primary"
                                    className="w-full flex justify-center py-2 text-sm font-semibold"
                                    disabled={updatingProfile}
                                >
                                    <span>{updatingProfile ? 'Saving details...' : 'Save details'}</span>
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Password Change */}
                <div className="phoenix-card">
                    <div className="phoenix-card-body space-y-4">
                        <h3 className="text-base font-bold text-slate-800">Security Settings</h3>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Current password</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                                            <Key size={16} />
                                        </span>
                                        <Input
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="pl-10 w-full text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">New password (minimum 8 characters)</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                                            <Key size={16} />
                                        </span>
                                        <Input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="pl-10 w-full text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Confirm new password</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                                            <Key size={16} />
                                        </span>
                                        <Input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="pl-10 w-full text-sm"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    variant="secondary"
                                    className="w-full flex justify-center py-2 text-sm font-semibold"
                                    disabled={updatingPassword}
                                >
                                    <span>{updatingPassword ? 'Updating password...' : 'Change password'}</span>
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
