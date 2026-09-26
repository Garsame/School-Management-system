import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import tenantService from '../../services/tenantService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { HOME_AREA_BY_ROLE, STAFF_AREAS } from '../../config/staffMenu';
import { Badge, Button, Switch } from '../../components/ui';
import { confirmAction, notify } from '../../components/feedback/notificationService';

const ROLE_ORDER = ['super_admin', 'hr_payroll_manager', 'finance_director', 'registrar', 'branch_admin', 'cashier', 'teacher', 'dugsi_teacher', 'parent', 'student'];

// Catalog groups in the words the school uses.
const GROUP_LABELS = {
    'School Admin': 'School management',
    Branch: 'Branch work (classes, staff, exams)',
    Finance: 'Finance',
    Cashier: 'Payments desk (take payments, receipts)',
    Registrar: 'Admissions',
    Students: 'Students',
    Enrollments: 'Enrollments',
    Attendance: 'Attendance',
    Dugsi: 'Dugsi (Quran circles & progress)',
    HR: 'People (HR)',
    Payroll: 'Payroll',
    Teacher: 'Teacher portal',
    Student: 'Student portal',
    Parent: 'Parent portal'
};

// Portal features only work for the portal's own accounts, so they are offered only there.
const PORTAL_GROUP_ROLE = { Teacher: 'teacher', Student: 'student', Parent: 'parent' };

const opensIn = (roleKey) => {
    const area = STAFF_AREAS.find((item) => item.key === HOME_AREA_BY_ROLE[roleKey]);
    if (area) return area.label;
    return roleKey === 'parent' ? 'Parent portal' : roleKey === 'student' ? 'Student portal' : '—';
};

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const Roles = () => {
    const { user, refreshSession } = useAuth();
    const canEdit = hasPermission(user, 'tenant.roles.update');
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [catalogs, setCatalogs] = useState({});
    const [editor, setEditor] = useState(null);
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [switching, setSwitching] = useState(null);

    const loadRoles = useCallback(async () => {
        try {
            const list = unwrap(await tenantService.getRoles());
            setRoles((Array.isArray(list) ? list : []).sort((a, b) => ROLE_ORDER.indexOf(a.key) - ROLE_ORDER.indexOf(b.key)));
        } catch (error) {
            notify(error.response?.data?.message || 'Could not load roles', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRoles();
    }, [loadRoles]);

    const replaceRole = (updated) => setRoles((current) => current.map((role) => (
        role._id === updated._id ? { ...role, ...updated } : role
    )));

    // Editing your own role changes your own menu; pick it up now rather than on the next refresh.
    const refreshIfMine = (role) => {
        if (role.key === user?.role) refreshSession({ silent: true });
    };

    const openEditor = async (role) => {
        setQuery('');
        setEditor({ role, name: role.name || '', description: role.description || '', selected: new Set(role.permissions || []) });
        if (catalogs[role.scope]) return;
        try {
            const catalog = unwrap(await tenantService.getRoleCatalog(role.scope));
            setCatalogs((current) => ({ ...current, [role.scope]: catalog }));
        } catch (error) {
            notify(error.response?.data?.message || 'Could not load the feature list', 'error');
            setEditor(null);
        }
    };

    const groups = useMemo(() => {
        if (!editor) return [];
        const catalog = catalogs[editor.role.scope];
        if (!catalog || !Array.isArray(catalog.groups)) return [];
        const search = query.trim().toLowerCase();
        return catalog.groups
            .filter((group) => group && (!PORTAL_GROUP_ROLE[group.name] || PORTAL_GROUP_ROLE[group.name] === editor.role.key))
            .map((group) => {
                const groupPermissions = Array.isArray(group.permissions) ? group.permissions : [];
                return {
                    ...group,
                    label: GROUP_LABELS[group.name] || group.name || 'Features',
                    all: groupPermissions,
                    permissions: search
                        ? groupPermissions.filter((permission) => `${permission?.label || ''} ${permission?.description || ''} ${GROUP_LABELS[group.name] || group.name || ''}`.toLowerCase().includes(search))
                        : groupPermissions
                };
            })
            .filter((group) => group.permissions.length > 0);
    }, [catalogs, editor, query]);

    const setSelected = (update) => setEditor((current) => {
        if (!current) return current;
        const selected = new Set(current.selected || []);
        update(selected);
        return { ...current, selected };
    });

    const toggleFeature = (key) => setSelected((selected) => {
        if (selected.has(key)) {
            selected.delete(key);
        } else {
            selected.add(key);
        }
    });

    const toggleGroup = (group, on) => setSelected((selected) => {
        (group.permissions || []).forEach((permission) => {
            if (!permission || !permission.key) return;
            if (on) {
                selected.add(permission.key);
            } else {
                selected.delete(permission.key);
            }
        });
    });

    const save = async () => {
        if (!editor || !editor.name || !editor.name.trim()) {
            notify('The role needs a name', 'error');
            return;
        }
        setSaving(true);
        try {
            const updated = unwrap(await tenantService.updateRole(editor.role._id, {
                name: editor.name.trim(),
                description: (editor.description || '').trim(),
                permissions: [...(editor.selected || [])]
            }));
            replaceRole(updated);
            refreshIfMine(editor.role);
            setEditor(null);
            notify(`${updated.name} saved. Everyone with this role has the new features now.`, 'success');
            (updated.dutyConflicts || []).forEach((conflict) => notify(`Check this: ${conflict.label}`, 'warning'));
        } catch (error) {
            notify(error.response?.data?.message || 'Could not save the role', 'error');
        } finally {
            setSaving(false);
        }
    };

    const setActive = async (role, isActive) => {
        if (!isActive && !(await confirmAction(
            `Turn off ${role.name}? Nobody can be given this role while it is off.`,
            { title: 'Turn off role', confirmLabel: 'Turn off' }
        ))) return;

        setSwitching(role._id);
        try {
            replaceRole(unwrap(await tenantService.updateRole(role._id, { isActive })));
            notify(`${role.name} is ${isActive ? 'on' : 'off'}`, 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Could not change the role', 'error');
        } finally {
            setSwitching(null);
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
        <div className="phoenix-resource-page pb-10">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Roles & Features</h1>
                    <p className="phoenix-page-subtitle">
                        Choose what each role can do. Everyone with a role gets its features, and their menu shows the pages for them.
                    </p>
                </div>
            </div>

            <div className="phoenix-table-shell overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="px-4 py-3 text-left">Role</th>
                            <th className="px-4 py-3 text-left">Works at</th>
                            <th className="px-4 py-3 text-left">Opens in</th>
                            <th className="px-4 py-3 text-right">Features</th>
                            <th className="px-4 py-3 text-right">People</th>
                            <th className="px-4 py-3 text-center">On</th>
                            <th className="px-4 py-3 text-right"><span className="peer sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e6ed]">
                        {roles.map((role) => (
                            <tr key={role._id} className={role.isActive ? '' : 'bg-slate-50 text-slate-400'}>
                                <td className="px-4 py-3">
                                    <p className={`text-sm font-semibold ${role.isActive ? 'text-[#141824]' : 'text-slate-500'}`}>{role.name}</p>
                                    {role.description && <p className="max-w-md text-xs text-[#8a94ad]">{role.description}</p>}
                                </td>
                                <td className="px-4 py-3 text-sm text-[#525b75]">{role.scope === 'branch' ? 'One branch' : 'Whole school'}</td>
                                <td className="px-4 py-3 text-sm text-[#525b75]">{opensIn(role.key)}</td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-[#141824]">{role.permissions.length}</td>
                                <td className="px-4 py-3 text-right text-sm text-[#525b75]">{role.userCount ?? 0}</td>
                                <td className="px-4 py-3 text-center">
                                    <div className="inline-flex items-center gap-2">
                                        <Switch
                                            checked={role.isActive}
                                            onChange={(next) => setActive(role, next)}
                                            disabled={!canEdit || switching === role._id}
                                            label={`${role.name} on or off`}
                                        />
                                        {!role.isActive && <Badge variant="outline" className="!py-0.5 text-[10px]">Off</Badge>}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button type="button" className="phoenix-secondary-button !h-8 !px-3" onClick={() => openEditor(role)}>
                                        <SlidersHorizontal size={14} /> {canEdit ? 'Edit features' : 'View features'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editor && (
                <div className="phoenix-modal-backdrop">
                    <div className="phoenix-modal-scrim" onClick={() => !saving && setEditor(null)} />
                    <div className="phoenix-modal-panel max-w-4xl">
                        <div className="phoenix-modal-header">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-[var(--primary-soft)] p-2 text-[var(--primary)]"><ShieldCheck size={18} /></div>
                                <div>
                                    <h2 className="phoenix-section-title">{editor?.role?.name || editor?.name || 'Role'}</h2>
                                    <p className="phoenix-section-copy">
                                        {editor?.role?.scope === 'branch' ? 'Works at one branch' : 'Works across the whole school'} · {editor?.selected ? editor.selected.size : 0} features ticked
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="phoenix-icon-button" onClick={() => setEditor(null)} disabled={saving} aria-label="Close"><X size={18} /></button>
                        </div>

                        <div className="phoenix-modal-body max-h-[65vh] space-y-4 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="space-y-1.5">
                                    <span className="text-[13px] font-semibold text-slate-700">Role name</span>
                                    <input className="phoenix-control" value={editor?.name || ''} disabled={!canEdit} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} />
                                </label>
                                <label className="space-y-1.5">
                                    <span className="text-[13px] font-semibold text-slate-700">What this role does</span>
                                    <input className="phoenix-control" value={editor?.description || ''} disabled={!canEdit} onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))} />
                                </label>
                            </div>

                            <div className="relative">
                                <Search className="phoenix-input-icon" size={16} />
                                <input className="phoenix-control phoenix-control-with-icon" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a feature, for example payment or payroll" />
                            </div>

                            {!catalogs[editor.role.scope] ? (
                                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[var(--primary)]" /></div>
                            ) : groups.length === 0 ? (
                                <p className="py-8 text-center text-sm text-[#8a94ad]">No feature matches “{query}”.</p>
                            ) : groups.map((group) => {
                                const groupAll = group.all || [];
                                const groupPerms = group.permissions || [];
                                const ticked = groupAll.filter((permission) => editor?.selected?.has(permission.key)).length;
                                const allShownTicked = groupPerms.length > 0 && groupPerms.every((permission) => editor?.selected?.has(permission.key));
                                return (
                                    <section key={group.name} className="rounded-lg border border-[#e3e6ed]">
                                        <header className="flex items-center justify-between gap-3 border-b border-[#e3e6ed] bg-slate-50 px-4 py-2.5">
                                            <div>
                                                <h3 className="text-sm font-bold text-[#141824]">{group.label}</h3>
                                                <p className="text-xs text-[#8a94ad]">{ticked} of {groupAll.length} ticked</p>
                                            </div>
                                            {canEdit && (
                                                <button type="button" className="text-xs font-semibold text-[var(--primary)] hover:underline" onClick={() => toggleGroup(group, !allShownTicked)}>
                                                    {allShownTicked ? 'Untick all' : 'Tick all'}
                                                </button>
                                            )}
                                        </header>
                                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                                            {groupPerms.map((permission) => {
                                                const on = Boolean(editor?.selected?.has(permission.key));
                                                return (
                                                    <label key={permission.key} className={`flex items-start gap-3 px-4 py-2.5 ${canEdit ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only"
                                                            checked={on}
                                                            disabled={!canEdit}
                                                            onChange={() => toggleFeature(permission.key)}
                                                        />
                                                        <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--primary)] peer-focus-visible:ring-offset-1 ${on ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-slate-300 bg-white'}`}>
                                                            {on && <Check size={12} strokeWidth={3} />}
                                                        </span>
                                                        <span>
                                                            <span className="block text-sm font-semibold text-[#141824]">{permission.label}</span>
                                                            {permission.description && <span className="block text-xs text-[#8a94ad]">{permission.description}</span>}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>

                        <div className="phoenix-modal-footer">
                            <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>{canEdit ? 'Cancel' : 'Close'}</Button>
                            {canEdit && <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save role'}</Button>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Roles;
