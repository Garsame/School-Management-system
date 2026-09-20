import React, { useEffect, useRef, useState } from 'react';
import {
    BriefcaseBusiness,
    Calendar,
    Camera,
    CheckCircle2,
    KeyRound,
    LockKeyhole,
    LoaderCircle,
    Mail,
    MapPin,
    Pencil,
    Phone,
    ShieldCheck,
    UserRound,
    X
} from 'lucide-react';
import UserAvatar from '../../components/account/UserAvatar';
import ImageCropModal from '../../components/account/ImageCropModal';
import { notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { changeOwnPassword, getOwnProfile, updateOwnAvatar, updateOwnProfile } from '../../services/api/auth.api';
import { resolveAvatarUrl } from '../../utils/avatar';

const EMPTY_PROFILE = {
    name: '',
    email: '',
    username: '',
    phone: '',
    address: '',
    dateOfBirth: '',
    gender: '',
    avatarUrl: '',
    employeeId: '',
    role: '',
    scope: '',
    emergencyContact: { name: '', relationship: '', phone: '', email: '' }
};

const normalizeProfile = (profile = {}) => ({
    ...EMPTY_PROFILE,
    ...profile,
    dateOfBirth: profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : '',
    emergencyContact: { ...EMPTY_PROFILE.emergencyContact, ...(profile.emergencyContact || {}) }
});

const formatRole = (value = '') => String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = (value) => value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString()
    : 'Not recorded';

const AccountProfile = () => {
    const { user, updateSession } = useAuth();
    const fileInputRef = useRef(null);
    const [profile, setProfile] = useState(EMPTY_PROFILE);
    const [savedProfile, setSavedProfile] = useState(EMPTY_PROFILE);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState('');
    const [cropImage, setCropImage] = useState(null);
    const [editing, setEditing] = useState(false);
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    useEffect(() => {
        let active = true;
        getOwnProfile()
            .then((data) => {
                if (active) {
                    const normalized = normalizeProfile(data);
                    setProfile(normalized);
                    setSavedProfile(normalized);
                }
            })
            .catch((error) => notify(error.response?.data?.message || 'Could not load your profile.', 'error'))
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    useEffect(() => () => {
        if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    }, [avatarPreview]);

    const setField = (field, value) => setProfile((current) => ({ ...current, [field]: value }));
    const setEmergencyField = (field, value) => setProfile((current) => ({
        ...current,
        emergencyContact: { ...current.emergencyContact, [field]: value }
    }));

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!editing) return;
        setSaving(true);
        try {
            const response = await updateOwnProfile({
                ...(['super_admin', 'branch_admin', 'registrar'].includes(profile.role) ? {
                    name: profile.name,
                    email: profile.email,
                    dateOfBirth: profile.dateOfBirth,
                    gender: profile.gender
                } : {}),
                phone: profile.phone,
                address: profile.address,
                emergencyContact: profile.emergencyContact
            });
            const updated = normalizeProfile(response.profile);
            setProfile(updated);
            setSavedProfile(updated);
            setEditing(false);
            updateSession({ ...user, name: updated.name, avatarUrl: updated.avatarUrl });
            notify(response.message || 'Profile updated successfully.', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Could not update your profile.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const cancelEditing = () => {
        setProfile(savedProfile);
        setEditing(false);
    };

    const openPasswordModal = () => {
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setPasswordError('');
        setPasswordModalOpen(true);
    };

    const closePasswordModal = () => {
        if (passwordSaving) return;
        setPasswordModalOpen(false);
        setPasswordError('');
    };

    const handlePasswordSubmit = async (event) => {
        event.preventDefault();
        setPasswordError('');
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('New password and confirmation do not match.');
            return;
        }
        if (passwordForm.newPassword.length < 8) {
            setPasswordError('New password must be at least 8 characters.');
            return;
        }

        setPasswordSaving(true);
        try {
            const session = await changeOwnPassword(passwordForm.currentPassword, passwordForm.newPassword);
            updateSession(session);
            setPasswordModalOpen(false);
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            notify('Password changed successfully.', 'success');
        } catch (error) {
            setPasswordError(error.response?.data?.message || 'Password could not be changed.');
        } finally {
            setPasswordSaving(false);
        }
    };

    const uploadAvatar = async (file) => {
        setCropImage(null);
        if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(URL.createObjectURL(file));
        setUploading(true);
        try {
            const response = await updateOwnAvatar(file);
            const updated = normalizeProfile(response.profile);
            setProfile((current) => ({ ...current, avatarUrl: updated.avatarUrl }));
            setSavedProfile((current) => ({ ...current, avatarUrl: updated.avatarUrl }));
            const avatarVersion = Date.now();
            setAvatarPreview(resolveAvatarUrl(updated.avatarUrl, avatarVersion));
            updateSession({ ...user, avatarUrl: updated.avatarUrl, avatarVersion });
            notify(response.message || 'Profile image updated successfully.', 'success');
        } catch (error) {
            setAvatarPreview('');
            notify(error.response?.data?.message || 'Could not upload your profile image.', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleAvatarChange = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            notify('Please choose a supported image.', 'warning');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            notify('The selected image is too large.', 'warning');
            return;
        }
        setCropImage({ file, url: URL.createObjectURL(file) });
    };

    const closeCropModal = () => {
        if (cropImage?.url) URL.revokeObjectURL(cropImage.url);
        setCropImage(null);
    };

    const confirmCrop = async (croppedFile) => {
        if (cropImage?.url) URL.revokeObjectURL(cropImage.url);
        await uploadAvatar(croppedFile);
    };

    if (loading) {
        return <div className="flex min-h-72 items-center justify-center"><LoaderCircle className="animate-spin text-[var(--primary)]" size={28} /></div>;
    }

    const avatarUser = { ...profile, avatarUrl: avatarPreview || profile.avatarUrl };
    const canEditIdentity = ['super_admin', 'branch_admin', 'registrar'].includes(profile.role);
    const identitySection = (
        <section className="space-y-5 bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-semibold text-[#141824]">Identity and account information</h3>
                    <p className="mt-1 text-sm text-[#6e7891]">Review identity first, then update contact details below.</p>
                </div>
                <button
                    type="button"
                    className="phoenix-secondary-button shrink-0"
                    onClick={() => editing ? cancelEditing() : setEditing(true)}
                    aria-label={editing ? 'Cancel profile editing' : 'Edit profile information'}
                >
                    {editing ? <X size={16} /> : <Pencil size={16} />}
                    {editing ? 'Cancel edit' : 'Edit profile'}
                </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {!canEditIdentity ? <ReadOnlyRow label="Full name" value={profile.name || 'Not recorded'} icon={UserRound} /> : <Field label="Full name" icon={UserRound}><input required className="phoenix-control phoenix-control-with-icon" placeholder="e.g. Mohamed Hassan Mohamed" value={profile.name} onChange={(event) => setField('name', event.target.value)} disabled={!editing} /></Field>}
                {!canEditIdentity ? <ReadOnlyRow label="Date of birth" value={formatDate(profile.dateOfBirth)} icon={Calendar} /> : <Field label="Date of birth" icon={Calendar}><input type="date" className="phoenix-control phoenix-control-with-icon" value={profile.dateOfBirth} onChange={(event) => setField('dateOfBirth', event.target.value)} disabled={!editing} /></Field>}
                {!canEditIdentity ? <ReadOnlyRow label="Gender" value={profile.gender || 'Not recorded'} icon={UserRound} /> : <Field label="Gender" icon={UserRound}><select className="phoenix-control phoenix-control-with-icon" value={profile.gender} onChange={(event) => setField('gender', event.target.value)} disabled={!editing}><option value="">Not recorded</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></Field>}
                {!canEditIdentity ? <ReadOnlyRow label="Email" value={profile.email || 'Not provided'} icon={Mail} /> : <Field label="Email" icon={Mail}><input required type="email" className="phoenix-control phoenix-control-with-icon" placeholder="e.g. mohamed@school.edu" value={profile.email} onChange={(event) => setField('email', event.target.value)} disabled={!editing} /></Field>}
                {profile.username && <ReadOnlyRow label="Username" value={profile.username} icon={UserRound} />}
                {profile.employeeId && <ReadOnlyRow label="Employee ID" value={profile.employeeId} icon={BriefcaseBusiness} />}
                <ReadOnlyRow label="Role" value={formatRole(profile.role)} icon={ShieldCheck} />
                <ReadOnlyRow label="Access scope" value={formatRole(profile.scope)} icon={KeyRound} />
            </div>
            <p className="rounded-md border border-[#e3e6ed] bg-[#f8f9fb] p-3 text-xs leading-5 text-[#6e7891]">
                Employee ID, role, access scope, school, and branch assignments remain protected administrative records.
            </p>
        </section>
    );

    return (
        <div className="mx-auto max-w-6xl space-y-5">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">My Profile</h1>
                    <p className="phoenix-page-subtitle">Manage your personal details and profile image.</p>
                </div>
                <button type="button" onClick={openPasswordModal} className="phoenix-secondary-button inline-flex items-center gap-2">
                    <KeyRound size={16} /> Change password
                </button>
            </div>

            <section className="phoenix-card overflow-hidden">
                <div className="border-b border-[#e3e6ed] px-5 py-5 sm:px-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                        <div className="relative w-fit">
                            <UserAvatar user={avatarUser} size="lg" />
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={handleAvatarChange}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[var(--primary)] text-white transition hover:brightness-95 disabled:opacity-60"
                                aria-label="Upload profile image"
                                title="Upload profile image"
                            >
                                {uploading ? <LoaderCircle className="animate-spin" size={15} /> : <Camera size={15} />}
                            </button>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-xl font-semibold text-[#141824]">{profile.name}</h2>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[#6e7891]">
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#e3e6ed] px-2.5 py-1"><ShieldCheck size={13} /> {formatRole(profile.role)}</span>
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#e3e6ed] px-2.5 py-1"><CheckCircle2 size={13} className="text-emerald-600" /> Active account</span>
                            </div>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col divide-y divide-[#e3e6ed]">
                        {identitySection}
                        <div className="space-y-6 p-5 sm:p-6">
                            <div>
                                <div>
                                    <h3 className="text-base font-semibold text-[#141824]">Contact information</h3>
                                    <p className="mt-1 text-sm text-[#6e7891]">Contact details you can keep up to date.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field label="Phone" icon={Phone}>
                                    <input type="tel" className="phoenix-control phoenix-control-with-icon" value={profile.phone} onChange={(event) => setField('phone', event.target.value)} maxLength={30} placeholder="e.g. +252 61 234 5678" disabled={!editing} />
                                </Field>
                                <Field label="Address" icon={MapPin}>
                                    <input className="phoenix-control phoenix-control-with-icon" value={profile.address} onChange={(event) => setField('address', event.target.value)} maxLength={300} placeholder="e.g. Hodan District, Mogadishu" disabled={!editing} />
                                </Field>
                            </div>

                            <div className="border-t border-[#e3e6ed] pt-6">
                                <h3 className="text-base font-semibold text-[#141824]">Emergency contact</h3>
                                <p className="mt-1 text-sm text-[#6e7891]">A trusted person the institution may contact when needed.</p>
                                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field label="Contact name" icon={UserRound}>
                                        <input className="phoenix-control phoenix-control-with-icon" value={profile.emergencyContact.name} onChange={(event) => setEmergencyField('name', event.target.value)} maxLength={120} placeholder="e.g. Amina Hassan" disabled={!editing} />
                                    </Field>
                                    <Field label="Relationship" icon={BriefcaseBusiness}>
                                        <input className="phoenix-control phoenix-control-with-icon" value={profile.emergencyContact.relationship} onChange={(event) => setEmergencyField('relationship', event.target.value)} maxLength={80} placeholder="e.g. Spouse, parent, or sibling" disabled={!editing} />
                                    </Field>
                                    <Field label="Contact phone" icon={Phone}>
                                        <input type="tel" className="phoenix-control phoenix-control-with-icon" value={profile.emergencyContact.phone} onChange={(event) => setEmergencyField('phone', event.target.value)} maxLength={30} placeholder="e.g. +252 61 234 5678" disabled={!editing} />
                                    </Field>
                                    <Field label="Contact email" icon={Mail}>
                                        <input type="email" className="phoenix-control phoenix-control-with-icon" value={profile.emergencyContact.email} onChange={(event) => setEmergencyField('email', event.target.value)} maxLength={160} placeholder="e.g. amina@example.com" disabled={!editing} />
                                    </Field>
                                </div>
                            </div>
                        </div>

                    </div>

                    {editing && (
                        <div className="flex justify-end gap-2 border-t border-[#e3e6ed] px-5 py-4 sm:px-6">
                            <button type="button" className="phoenix-secondary-button" onClick={cancelEditing} disabled={saving}>Cancel</button>
                            <button type="submit" className="phoenix-primary-button inline-flex items-center gap-2" disabled={saving || uploading}>
                                {saving ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                {saving ? 'Saving...' : 'Save profile'}
                            </button>
                        </div>
                    )}
                </form>
            </section>

            {passwordModalOpen && (
                <div className="fixed inset-0 z-[190] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
                    <button type="button" className="absolute inset-0 bg-[#141824]/45" onClick={closePasswordModal} aria-label="Close change password dialog" />
                    <section className="relative w-full max-w-md overflow-hidden rounded-lg border border-[#cbd0dd] bg-white">
                        <div className="flex items-start gap-3 border-b border-[#e3e6ed] p-5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                                <KeyRound size={19} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 id="change-password-title" className="text-lg font-semibold text-[#141824]">Change password</h2>
                                <p className="mt-1 text-sm text-[#6e7891]">Use a private password with at least 8 characters.</p>
                            </div>
                            <button type="button" className="phoenix-icon-button shrink-0" onClick={closePasswordModal} disabled={passwordSaving} aria-label="Close dialog" title="Close">
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handlePasswordSubmit}>
                            <div className="space-y-4 p-5">
                                {[
                                    ['currentPassword', 'Current password', 'Enter your current password'],
                                    ['newPassword', 'New password', 'Create a new password'],
                                    ['confirmPassword', 'Confirm new password', 'Re-enter the new password']
                                ].map(([name, label, placeholder], index) => (
                                    <label key={name} className="block">
                                        <span className="phoenix-field-label">{label}</span>
                                        <span className="relative mt-1 block">
                                            <LockKeyhole className="phoenix-input-icon" size={16} />
                                            <input
                                                type="password"
                                                className="phoenix-control phoenix-control-with-icon"
                                                placeholder={placeholder}
                                                value={passwordForm[name]}
                                                onChange={(event) => setPasswordForm((current) => ({ ...current, [name]: event.target.value }))}
                                                minLength={8}
                                                autoComplete={index === 0 ? 'current-password' : 'new-password'}
                                                autoFocus={index === 0}
                                                required
                                            />
                                        </span>
                                    </label>
                                ))}

                                {passwordError && (
                                    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700" role="alert">
                                        {passwordError}
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 border-t border-[#e3e6ed] p-4">
                                <button type="button" className="phoenix-secondary-button" onClick={closePasswordModal} disabled={passwordSaving}>Cancel</button>
                                <button type="submit" className="phoenix-primary-button inline-flex items-center gap-2" disabled={passwordSaving}>
                                    {passwordSaving ? <LoaderCircle className="animate-spin" size={16} /> : <KeyRound size={16} />}
                                    {passwordSaving ? 'Changing...' : 'Change password'}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {cropImage && (
                <ImageCropModal
                    sourceUrl={cropImage.url}
                    fileName={cropImage.file.name}
                    onCancel={closeCropModal}
                    onConfirm={confirmCrop}
                />
            )}
        </div>
    );
};

const Field = ({ label, icon: Icon, className = '', children }) => (
    <label className={`block ${className}`}>
        <span className="phoenix-field-label">{label}</span>
        <span className="relative mt-1 block">
            {React.createElement(Icon, { className: 'phoenix-input-icon', size: 16 })}
            {children}
        </span>
    </label>
);

const ReadOnlyRow = ({ label, value, icon: Icon }) => (
    <div className="rounded-md border border-[#e3e6ed] bg-white p-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-[#8a94ad]">{React.createElement(Icon, { size: 14 })} {label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-[#31374a]">{value}</p>
    </div>
);

export default AccountProfile;
