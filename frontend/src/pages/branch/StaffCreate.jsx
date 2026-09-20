import React, { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createBranchUser } from '../../services/api/branch.api';
import { Button, Input, Select } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';

const employmentTypes = [
    { value: 'Permanent', label: 'Permanent' },
    { value: 'Contract', label: 'Contract' },
    { value: 'Part-time', label: 'Part-time' },
    { value: 'Temporary', label: 'Temporary' },
    { value: 'Volunteer', label: 'Volunteer' }
];

const StaffCreate = ({ mode = 'staff' }) => {
    const teacherMode = mode === 'teachers';
    const navigate = useNavigate();
    const destination = teacherMode ? '/branch/teachers' : '/branch/staff';
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        role: teacherMode ? 'teacher' : 'registrar',
        phone: '',
        address: '',
        employmentInfo: {
            employmentType: '',
            hireDate: '',
            basicSalary: '',
            currency: 'USD',
            specialization: '',
            qualifiedSubjects: '',
            qualifications: '',
            yearsExperience: ''
        }
    });

    const updateEmployment = (key, value) => {
        setForm((current) => ({ ...current, employmentInfo: { ...current.employmentInfo, [key]: value } }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            await createBranchUser(form);
            notify(`${teacherMode ? 'Teacher' : 'Staff'} account created successfully`, 'success');
            navigate(destination);
        } catch (error) {
            notify(error.response?.data?.message || `Failed to create ${teacherMode ? 'teacher' : 'staff'} account`, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="phoenix-page-header">
                <div>
                    <button type="button" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#6e7891] hover:text-[var(--primary)]" onClick={() => navigate(destination)}>
                        <ArrowLeft size={14} /> Back to {teacherMode ? 'teachers' : 'staff'}
                    </button>
                    <h1 className="phoenix-page-title">Add {teacherMode ? 'Teacher' : 'Staff'}</h1>
                    <p className="phoenix-page-subtitle">Create a branch-scoped account with secure temporary credentials.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="phoenix-card overflow-hidden">
                <div className="border-b border-[#e3e6ed] px-5 py-4">
                    <h2 className="phoenix-section-title">Account details</h2>
                    <p className="phoenix-section-copy">The user must change this temporary password at first sign-in.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                    <Input label="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                    <Input label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
                    <Input label="Temporary password" type="password" minLength="8" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required helperText="Minimum 8 characters" />
                    {!teacherMode && (
                        <Select
                            label="Staff role"
                            value={form.role}
                            onChange={(event) => setForm({ ...form, role: event.target.value })}
                            options={[{ value: 'registrar', label: 'Registrar' }, { value: 'cashier', label: 'Cashier' }]}
                            required
                        />
                    )}
                    <Input label="Phone" type="tel" placeholder="e.g. +252 61 2345678" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
                    {!teacherMode && <Input label="Address" placeholder="Staff member's current address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />}
                </div>

                <div className="border-y border-[#e3e6ed] bg-[#f5f7fa] px-5 py-3">
                    <h2 className="text-sm font-semibold text-[#141824]">Employment details</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                    <Select label="Employment type" value={form.employmentInfo.employmentType} onChange={(event) => updateEmployment('employmentType', event.target.value)} options={employmentTypes} required />
                    <Input label="Hire date" type="date" value={form.employmentInfo.hireDate} onChange={(event) => updateEmployment('hireDate', event.target.value)} required />
                    <p className="rounded-md border border-[#cbd0dd] bg-[var(--primary-soft)] px-3 py-2 text-xs text-[#525b75] md:col-span-2">HR submits compensation after the account is created, and Finance must approve it before payroll uses it.</p>
                </div>

                {teacherMode && (
                    <>
                        <div className="border-y border-[#e3e6ed] bg-[#f5f7fa] px-5 py-3">
                            <h2 className="text-sm font-semibold text-[#141824]">Professional details</h2>
                        </div>
                        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                            <Input label="Primary specialization" placeholder="e.g. Mathematics education" value={form.employmentInfo.specialization} onChange={(event) => updateEmployment('specialization', event.target.value)} required />
                            <Input label="Teaching experience (years)" type="number" min="0" step="1" placeholder="0" value={form.employmentInfo.yearsExperience} onChange={(event) => updateEmployment('yearsExperience', event.target.value)} required />
                            <Input label="Qualified subjects" placeholder="e.g. Mathematics, Physics" value={form.employmentInfo.qualifiedSubjects} onChange={(event) => updateEmployment('qualifiedSubjects', event.target.value)} helperText="Separate multiple subjects with commas" required />
                            <Input label="Qualifications or certificates" placeholder="e.g. B.Ed, Teaching Certificate" value={form.employmentInfo.qualifications} onChange={(event) => updateEmployment('qualifications', event.target.value)} helperText="Separate multiple qualifications with commas" required />
                        </div>
                        <p className="mx-5 mb-4 rounded-md border border-[#cbd0dd] bg-[var(--primary-soft)] px-3 py-2 text-xs text-[#525b75]">
                            Class and subject assignments can be added from Teacher Assignments after the account is created.
                        </p>
                    </>
                )}

                <div className="flex justify-end gap-2 border-t border-[#e3e6ed] px-5 py-4">
                    <Button type="button" variant="outline" onClick={() => navigate(destination)}>Cancel</Button>
                    <Button type="submit" loading={saving}><Save size={15} /> Create {teacherMode ? 'teacher' : 'staff'}</Button>
                </div>
            </form>
        </div>
    );
};

export default StaffCreate;
