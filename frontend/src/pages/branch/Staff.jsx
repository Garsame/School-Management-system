import React, { useCallback, useEffect, useState } from 'react';
import { getBranchUsers, updateBranchUser } from '../../services/api/branch.api';
import { Table, Button, Modal, Input, Spinner, Toast, Badge, Select } from '../../components/ui';
import { Plus, Edit2, UserCheck, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const Staff = ({ mode = 'staff' }) => {
    const isTeacherMode = mode === 'teachers';
    const defaultRole = isTeacherMode ? 'teacher' : 'registrar';
    const allowedRoles = isTeacherMode
        ? [{ value: 'teacher', label: 'Teacher' }]
        : [
            { value: 'registrar', label: 'Registrar' },
            { value: 'cashier', label: 'Cashier' }
        ];
    const navigate = useNavigate();
    const { user } = useAuth();
    const canCreateStaff = hasPermission(user, 'branch.staff.create');
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState({
        name: '', email: '', password: '', role: defaultRole, phone: '', address: '',
        employmentInfo: { employmentType: '', hireDate: '', basicSalary: '', currency: 'USD', specialization: '', qualifiedSubjects: '', qualifications: '', yearsExperience: '' }
    });
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [filterRole, setFilterRole] = useState('');

    const fetchStaff = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getBranchUsers(isTeacherMode ? 'teacher' : filterRole);
            const records = res?.data || res || [];
            setStaff(records.filter((user) => isTeacherMode ? user.role === 'teacher' : ['registrar', 'cashier'].includes(user.role)));
        } catch {
            setToast({ type: 'error', message: 'Failed to load staff' });
        } finally {
            setLoading(false);
        }
    }, [filterRole, isTeacherMode]);

    useEffect(() => {
        fetchStaff();
    }, [fetchStaff]);

    const handleOpenEdit = (user) => {
        setCurrentItem({
            ...user,
            password: '',
            phone: user.phone || '',
            address: user.address || '',
            employmentInfo: {
                employmentType: user.employmentInfo?.employmentType || '',
                hireDate: user.employmentInfo?.hireDate?.slice?.(0, 10) || '',
                basicSalary: user.employmentInfo?.basicSalary ?? '',
                currency: user.employmentInfo?.currency || 'USD',
                specialization: user.employmentInfo?.specialization || '',
                qualifiedSubjects: (user.employmentInfo?.qualifiedSubjects || []).join(', '),
                qualifications: (user.employmentInfo?.qualifications || []).join(', '),
                yearsExperience: user.employmentInfo?.yearsExperience ?? ''
            }
        });
        setIsModalOpen(true);
    };

    const handleToggleStatus = async (user) => {
        try {
            await updateBranchUser(user._id, { isActive: !user.isActive });
            setToast({ type: 'success', message: `User ${user.isActive ? 'deactivated' : 'activated'}` });
            fetchStaff();
        } catch {
            setToast({ type: 'error', message: 'Failed to update status' });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const updateData = { ...currentItem };
            if (!updateData.password) delete updateData.password;
            await updateBranchUser(currentItem._id, updateData);
            setToast({ type: 'success', message: 'Staff member updated successfully' });
            setIsModalOpen(false);
            fetchStaff();
        } catch (err) {
             setToast({ type: 'error', message: err.response?.data?.message || 'Operation failed' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">{isTeacherMode ? 'Teachers' : 'Staff'}</h1>
                    <p className="phoenix-page-subtitle">{isTeacherMode ? 'Create teacher accounts and manage their branch access.' : 'Manage registrar and cashier accounts for this branch.'}</p>
                </div>
                {canCreateStaff && (
                    <Button onClick={() => navigate(isTeacherMode ? '/branch/teachers/new' : '/branch/staff/new')} className="flex items-center gap-2 !h-9 text-xs" variant="primary">
                        <Plus size={16} /> Add {isTeacherMode ? 'Teacher' : 'Staff'}
                    </Button>
                )}
            </div>

            {!isTeacherMode && <article className="phoenix-card p-4">
                <div className="w-full sm:w-64">
                    <Select
                        label="Filter by Role"
                        options={allowedRoles}
                        value={filterRole}
                        onChange={e => setFilterRole(e.target.value)}
                        placeholder="All Roles"
                        className="!h-9 text-xs"
                    />
                </div>
            </article>}

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {loading ? <Spinner /> : (
                <div className="phoenix-table-shell">
                    <div className="overflow-x-auto">
                        <Table headers={isTeacherMode ? ['Name', 'Email', 'Specialization', 'Status', 'Actions'] : ['Name', 'Email', 'Role', 'Status', 'Actions']}>
                            {staff.map(user => (
                                <tr key={user._id}>
                                    <td className="px-4 py-3 font-bold text-[#141824]">{user.name}</td>
                                    <td className="px-4 py-3 text-[#525b75] font-mono text-xs">{user.email}</td>
                                    <td className="px-4 py-3">
                                        {isTeacherMode ? (user.employmentInfo?.specialization || '—') : <Badge variant="indigo">{user.role}</Badge>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant={user.isActive ? 'success' : 'danger'}>
                                            {user.isActive ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(user)}
                                                className="p-1.5 text-[#8a94ad] hover:text-[#3874ff] hover:bg-[#eaf0ff] rounded transition-all"
                                                title="Edit"
                                            >
                                                <Edit2 size={15} />
                                            </button>
                                            <button
                                                onClick={() => handleToggleStatus(user)}
                                                className={`p-1.5 rounded transition-all ${
                                                    user.isActive
                                                        ? "text-[#8a94ad] hover:text-[#e63757] hover:bg-[#fdebef]"
                                                        : "text-[#8a94ad] hover:text-[#25b003] hover:bg-[#e9f7e7]"
                                                }`}
                                                title={user.isActive ? "Deactivate" : "Activate"}
                                            >
                                                {user.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {staff.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="text-center py-6 text-[#8a94ad]">No {isTeacherMode ? 'teacher' : 'staff'} records found.</td>
                                </tr>
                            )}
                        </Table>
                    </div>
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={`Edit ${isTeacherMode ? 'Teacher' : 'Staff'} Account`}
                maxWidth="4xl"
            >
                <form onSubmit={handleSubmit} className="py-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="Full Name"
                            value={currentItem.name}
                            onChange={e => setCurrentItem({...currentItem, name: e.target.value})}
                            required
                        />
                        <Input
                            label="Email"
                            type="email"
                            value={currentItem.email}
                            onChange={e => setCurrentItem({...currentItem, email: e.target.value})}
                            required
                            disabled
                        />
                        <Input label="Phone" type="tel" value={currentItem.phone} onChange={e => setCurrentItem({...currentItem, phone: e.target.value})} />

                        <Input label="Address" value={currentItem.address} onChange={e => setCurrentItem({...currentItem, address: e.target.value})} />

                        <Input
                            label="New Password (leave blank to keep)"
                            type="password"
                            value={currentItem.password}
                            onChange={e => setCurrentItem({...currentItem, password: e.target.value})}
                        />

                    </div>

                    <div className="border-t border-[#e3e6ed] pt-4 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select
                                label="Employment Type"
                                placeholder="Select type"
                                options={[
                                    { value: 'Permanent', label: 'Permanent' },
                                    { value: 'Contract', label: 'Contract' },
                                    { value: 'Part-time', label: 'Part-time' },
                                    { value: 'Temporary', label: 'Temporary' },
                                    { value: 'Volunteer', label: 'Volunteer' }
                                ]}
                                value={currentItem.employmentInfo?.employmentType || ''}
                                onChange={e => setCurrentItem({...currentItem, employmentInfo: {...currentItem.employmentInfo, employmentType: e.target.value}})}
                            />
                            <Input label="Hire Date" type="date" value={currentItem.employmentInfo?.hireDate || ''} onChange={e => setCurrentItem({...currentItem, employmentInfo: {...currentItem.employmentInfo, hireDate: e.target.value}})} />
                            {isTeacherMode && <Input label="Primary Specialization" value={currentItem.employmentInfo?.specialization || ''} onChange={e => setCurrentItem({...currentItem, employmentInfo: {...currentItem.employmentInfo, specialization: e.target.value}})} />}
                            {isTeacherMode && <Input label="Teaching Experience (years)" type="number" min="0" value={currentItem.employmentInfo?.yearsExperience ?? ''} onChange={e => setCurrentItem({...currentItem, employmentInfo: {...currentItem.employmentInfo, yearsExperience: e.target.value}})} />}
                            {isTeacherMode && <Input label="Qualified Subjects" value={currentItem.employmentInfo?.qualifiedSubjects || ''} onChange={e => setCurrentItem({...currentItem, employmentInfo: {...currentItem.employmentInfo, qualifiedSubjects: e.target.value}})} helperText="Separate multiple subjects with commas" />}
                            {isTeacherMode && <Input label="Qualifications or Certificates" value={currentItem.employmentInfo?.qualifications || ''} onChange={e => setCurrentItem({...currentItem, employmentInfo: {...currentItem.employmentInfo, qualifications: e.target.value}})} helperText="Separate multiple qualifications with commas" />}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-[#e3e6ed]">
                        <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving} variant="primary">
                            {saving ? 'Saving...' : `Save ${isTeacherMode ? 'Teacher' : 'Staff'}`}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Staff;
