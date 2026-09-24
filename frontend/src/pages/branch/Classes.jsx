import React, { useEffect, useState } from 'react';
import { 
    getClasses, createClass,
    getClassCategories, createClassCategory,
    getSections, createSection,
    getSubjects, createSubject,
    getClassSubjects, createClassSubject, deleteClassSubject,
    getStudentIdConfig, updateStudentIdConfig
} from '../../services/api/branch.api';
import { Table, Button, Modal, Input, Spinner, Toast, Badge, Select } from '../../components/ui';
import { Plus, Layers, BookOpen, Layout, Grid, Trash2, ShieldCheck, GraduationCap, Target, Fingerprint } from 'lucide-react';
import { confirmAction } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const Classes = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('categories');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ categories: [], classes: [], sections: [], subjects: [], classSubjects: [] });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState({});
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [idConfig, setIdConfig] = useState({
        prefix: 'KS',
        includeYear: true,
        separator: '-',
        padding: 3,
        academicYear: '2026/2027',
        preview: 'KS-2026-001'
    });
    const [savingIdConfig, setSavingIdConfig] = useState(false);

    const computePreview = (prefix, includeYear, sep, padding, year) => {
        const p = String(prefix || 'KS').trim().toUpperCase();
        const cleanYear = String(year || '2026/2027').trim();
        const ym = cleanYear.match(/\d{4}/);
        const yr = ym ? ym[0] : cleanYear;
        const seq = '1'.padStart(padding || 3, '0');
        if (includeYear && yr) {
            return sep ? `${p}${sep}${yr}${sep}${seq}` : `${p}${yr}${seq}`;
        }
        return sep ? `${p}${sep}${seq}` : `${p}${seq}`;
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [catRes, classRes, secRes, subRes, clsSubRes, idCfgRes] = await Promise.all([
                getClassCategories(),
                getClasses(),
                getSections(),
                getSubjects(),
                getClassSubjects(),
                getStudentIdConfig().catch(() => null)
            ]);
            setData({
                categories: catRes?.data || catRes || [],
                classes: classRes?.data || classRes || [],
                sections: secRes?.data || secRes || [],
                subjects: subRes?.data || subRes || [],
                classSubjects: clsSubRes?.data || clsSubRes || []
            });
            if (idCfgRes?.data || idCfgRes) {
                const cfg = idCfgRes.data || idCfgRes;
                setIdConfig(prev => ({ ...prev, ...cfg }));
            }
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: 'Failed to synchronize academic data' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenCreate = () => {
        setCurrentItem({
            totalMarks: 100,
            passMarks: 40,
            classId: '',
            sectionId: '',
            subjectId: ''
        });
        setIsModalOpen(true);
    };

    const handleDeleteClassSubject = async (id) => {
        if (!(await confirmAction('Remove this subject from the selected scope? The subject itself will remain available.', { title: 'Remove subject', confirmLabel: 'Remove' }))) return;
        try {
            await deleteClassSubject(id);
            setToast({ type: 'success', message: 'Subject detached successfully' });
            fetchData();
        } catch {
            setToast({ type: 'error', message: 'Failed to detach subject' });
        }
    };

    const handleSaveIdConfig = async (e) => {
        e.preventDefault();
        setSavingIdConfig(true);
        try {
            const res = await updateStudentIdConfig({
                prefix: idConfig.prefix,
                includeYear: idConfig.includeYear,
                separator: idConfig.separator,
                padding: Number(idConfig.padding) || 3
            });
            const updated = res?.data || res;
            setIdConfig(prev => ({ ...prev, ...updated }));
            setToast({ type: 'success', message: 'Student ID format updated successfully' });
        } catch (err) {
            setToast({ type: 'error', message: err?.response?.data?.message || 'Failed to save student ID configuration' });
        } finally {
            setSavingIdConfig(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (activeTab === 'categories') {
                await createClassCategory(currentItem);
            } else if (activeTab === 'classes') {
                await createClass(currentItem);
            } else if (activeTab === 'sections') {
                await createSection(currentItem);
            } else if (activeTab === 'subjects') {
                await createSubject(currentItem);
            } else if (activeTab === 'curriculum') {
                await createClassSubject(currentItem);
            }
            setToast({ type: 'success', message: 'Academic record updated successfully' });
            setIsModalOpen(false);
            fetchData();
        } catch (err) {
            setToast({ type: 'error', message: err.response?.data?.message || 'Transaction failed' });
        } finally {
            setSaving(false);
        }
    };

    const tabs = [
        { id: 'categories', name: 'Categories', icon: Layers },
        { id: 'classes', name: 'Classes', icon: Grid },
        { id: 'sections', name: 'Sections', icon: Layout },
        { id: 'subjects', name: 'Master Subjects', icon: BookOpen },
        { id: 'curriculum', name: 'Class Curriculum', icon: GraduationCap },
        { id: 'student-id', name: 'Student ID Format', icon: Fingerprint },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Academic Configuration</h1>
                    <p className="phoenix-page-subtitle">Define the foundation of your school curriculum.</p>
                </div>
                {activeTab !== 'student-id' && hasPermission(user, 'branch.classes.create') && <Button onClick={handleOpenCreate} className="flex items-center gap-2 !h-9 text-xs" variant="primary">
                    <Plus size={16} /> Add {activeTab === 'curriculum' ? 'Curriculum Link' : activeTab.slice(0, -1).replace('class-', '')}
                </Button>}
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#e3e6ed] gap-6 mb-6 overflow-x-auto">
                {tabs.map(tab => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
                                active 
                                    ? 'border-[var(--primary)] text-[#141824]' 
                                    : 'border-transparent text-[#8a94ad] hover:text-[#525b75]'
                            }`}
                        >
                            <tab.icon size={14} />
                            {tab.name}
                        </button>
                    );
                })}
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {loading ? <Spinner /> : (
                <div className="space-y-4">
                    {activeTab === 'categories' && (
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Category Profile', 'Description', 'Registration Date']}>
                                    {data.categories.map(cat => (
                                        <tr key={cat._id}>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[#141824]">{cat.name}</div>
                                                <div className="text-[10px] text-[#3874ff] uppercase tracking-wider font-semibold">Academic Department</div>
                                            </td>
                                            <td className="px-4 py-3 text-[#525b75]">{cat.description || <span className="text-[#8a94ad] italic text-xs">No description provided</span>}</td>
                                            <td className="px-4 py-3 text-[#6e7891] text-xs font-mono">{new Date(cat.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </Table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'classes' && (
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Class Designation', 'Academic Level', 'System Grade', 'Created']}>
                                    {data.classes.map(cls => (
                                        <tr key={cls._id}>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[#141824]">{cls.name}</div>
                                                <div className="text-[10px] text-[#525b75] uppercase tracking-wider font-semibold">Primary Territory</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant="indigo">{cls.categoryId?.name}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-[#141824] font-bold">{cls.gradeLevel}</td>
                                            <td className="px-4 py-3 text-[#6e7891] text-xs font-mono">{new Date(cls.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </Table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sections' && (
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Sub-Territory', 'Parent Class', 'Authorized Room', 'Max Occupancy']}>
                                    {data.sections.map(sec => (
                                        <tr key={sec._id}>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[#141824]">{sec.name}</div>
                                                <div className="text-[10px] text-[#168403] uppercase tracking-wider font-semibold">Specific Section</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="font-semibold text-[#525b75]">{sec.classId?.name}</span>
                                            </td>
                                            <td className="px-4 py-3 text-[#525b75] font-mono">{sec.roomNumber || <span className="text-[#8a94ad]">N/A</span>}</td>
                                            <td className="px-4 py-3 text-[#141824] font-bold">{sec.capacity || '-'}</td>
                                        </tr>
                                    ))}
                                </Table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'subjects' && (
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Master Knowledge Base', 'System Code', 'Operational Since']}>
                                    {data.subjects.map(sub => (
                                        <tr key={sub._id}>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[#141824]">{sub.name}</div>
                                                <div className="text-[10px] text-[#e5780b] uppercase tracking-wider font-semibold">Master Course</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="bg-[#f5f7fa] px-2 py-1 text-xs rounded border border-[#e3e6ed] font-mono font-bold text-[#525b75]">{sub.code || 'NO-CODE'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-[#6e7891] text-xs font-mono">{new Date(sub.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </Table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'curriculum' && (
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Scope Designation', 'Active Course', 'Scoring Standards', 'Actions']}>
                                    {data.classSubjects.map(cs => (
                                        <tr key={cs._id}>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1.5">
                                                    <Badge variant="indigo">{cs.classId?.name}</Badge>
                                                    {cs.sectionId ? (
                                                        <Badge variant="success">Sec: {cs.sectionId.name}</Badge>
                                                    ) : (
                                                        <span className="text-xs text-[#8a94ad] italic font-semibold px-2 py-0.5 border border-[#e3e6ed] rounded">All Sections</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[#141824]">{cs.subjectId?.name}</div>
                                                <div className="text-[10px] text-[#8a94ad] font-mono uppercase font-semibold">{cs.subjectId?.code}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-4 text-xs">
                                                    <div>
                                                        <span className="text-[10px] text-[#8a94ad] font-semibold uppercase block">Max</span>
                                                        <span className="font-bold text-[#141824]">{cs.totalMarks}</span>
                                                    </div>
                                                    <div className="h-6 w-px bg-[#e3e6ed]"></div>
                                                    <div>
                                                        <span className="text-[10px] text-[#e63757] font-semibold uppercase block">Pass</span>
                                                        <span className="font-bold text-[#e63757]">{cs.passMarks}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {hasPermission(user, 'branch.subjects.manage') && <button 
                                                    onClick={() => handleDeleteClassSubject(cs._id)}
                                                    className="p-1.5 text-[#8a94ad] hover:text-[#e63757] hover:bg-[#fdebef] rounded transition-all"
                                                    title="Detach Subject"
                                                >
                                                    <Trash2 size={15} />
                                                </button>}
                                            </td>
                                        </tr>
                                    ))}
                                </Table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'student-id' && (
                        <div className="phoenix-card p-6 bg-white space-y-6 max-w-3xl">
                            <div className="border-b border-[#e3e6ed] pb-4">
                                <h3 className="text-base font-bold text-[#141824] flex items-center gap-2">
                                    <Fingerprint size={18} className="text-[#3874ff]" />
                                    Student ID Format Configuration
                                </h3>
                                <p className="text-xs text-[#8a94ad] mt-1">
                                    Define how new student admission numbers and IDs are automatically generated for your school.
                                </p>
                            </div>

                            {/* Live Preview Box */}
                            <div className="bg-[#f5f8ff] border border-[#d0e1fd] rounded-lg p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div>
                                    <span className="text-[10px] font-bold text-[#3874ff] uppercase tracking-wider block">Generated ID Preview</span>
                                    <span className="text-2xl font-mono font-extrabold text-[#141824] mt-1 block">
                                        {computePreview(idConfig.prefix, idConfig.includeYear, idConfig.separator, idConfig.padding, idConfig.academicYear)}
                                    </span>
                                    <span className="text-xs text-[#6e7891] mt-0.5 block">Next sequential student code in academic year {idConfig.academicYear || '2026/2027'}</span>
                                </div>
                                <Badge variant="primary" className="!text-xs !py-1.5 !px-3 font-mono font-bold">
                                    Format: &lt;Prefix&gt;{idConfig.includeYear !== false ? '+<Year>' : ''}+&lt;Sequence&gt;
                                </Badge>
                            </div>

                            <form onSubmit={handleSaveIdConfig} className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-[#141824] mb-1">School ID Prefix</label>
                                        <input
                                            type="text"
                                            value={idConfig.prefix || ''}
                                            onChange={(e) => setIdConfig({ ...idConfig, prefix: e.target.value.toUpperCase() })}
                                            placeholder="e.g. KS"
                                            className="w-full h-10 px-3 border border-[#cbd0dd] rounded text-sm font-bold font-mono focus:border-[#3874ff] focus:outline-none uppercase"
                                            required
                                        />
                                        <span className="text-[11px] text-[#8a94ad] mt-1 block">Institution code prefix (e.g. KS for Kings School)</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-[#141824] mb-1">Separator</label>
                                        <select
                                            value={idConfig.separator !== undefined ? idConfig.separator : '-'}
                                            onChange={(e) => setIdConfig({ ...idConfig, separator: e.target.value })}
                                            className="w-full h-10 px-3 border border-[#cbd0dd] rounded text-sm font-semibold focus:border-[#3874ff] focus:outline-none bg-white"
                                        >
                                            <option value="-">Hyphen (-)</option>
                                            <option value="/">Slash (/)</option>
                                            <option value="">None (No separator)</option>
                                        </select>
                                        <span className="text-[11px] text-[#8a94ad] mt-1 block">Character between prefix, year, and number</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-[#141824] mb-1">Number of Sequence Digits</label>
                                        <select
                                            value={idConfig.padding || 3}
                                            onChange={(e) => setIdConfig({ ...idConfig, padding: Number(e.target.value) })}
                                            className="w-full h-10 px-3 border border-[#cbd0dd] rounded text-sm font-semibold focus:border-[#3874ff] focus:outline-none bg-white"
                                        >
                                            <option value={3}>3 digits (001, 002, ...)</option>
                                            <option value={4}>4 digits (0001, 0002, ...)</option>
                                            <option value={5}>5 digits (00001, 00002, ...)</option>
                                        </select>
                                        <span className="text-[11px] text-[#8a94ad] mt-1 block">Zero-padding format for student sequence</span>
                                    </div>

                                    <div className="flex items-center pt-6">
                                        <label className="flex items-center gap-3 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={idConfig.includeYear !== false}
                                                onChange={(e) => setIdConfig({ ...idConfig, includeYear: e.target.checked })}
                                                className="h-4 w-4 text-[#3874ff] rounded border-[#cbd0dd] focus:ring-0"
                                            />
                                            <div>
                                                <span className="text-xs font-bold text-[#141824] block">Include Academic Year</span>
                                                <span className="text-[11px] text-[#8a94ad] block">Embed academic year (e.g. 2026) in the ID</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {hasPermission(user, 'branch.classes.update') && (
                                    <div className="pt-4 border-t border-[#e3e6ed] flex justify-end">
                                        <Button type="submit" variant="primary" disabled={savingIdConfig} className="!h-9 text-xs flex items-center gap-2">
                                            {savingIdConfig ? <Spinner size="sm" /> : <ShieldCheck size={16} />}
                                            Save Student ID Settings
                                        </Button>
                                    </div>
                                )}
                            </form>
                        </div>
                    )}
                    
                    {activeTab !== 'student-id' && data[activeTab === 'curriculum' ? 'classSubjects' : activeTab]?.length === 0 && (
                        <div className="phoenix-card p-8 text-center border-dashed border border-[#e3e6ed] bg-white">
                            <div className="flex flex-col items-center gap-4">
                                <Plus size={32} className="text-[#cbd0dd]" />
                                <div className="space-y-1">
                                    <h3 className="text-sm font-bold text-[#525b75] uppercase tracking-wider">Registry Empty</h3>
                                    <p className="text-[#8a94ad] text-xs">Initialize the {activeTab} collection to begin academic planning.</p>
                                </div>
                                <Button onClick={handleOpenCreate} variant="outline" className="text-xs !h-9">Construct First Entry</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                title={
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-[#eaf0ff] text-[#3874ff] rounded flex items-center justify-center">
                            <Target size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-[#141824]">
                                {activeTab === 'curriculum' ? 'Establish Curriculum Link' : `Register ${activeTab.slice(0, -1).replace('class-', '')}`}
                            </h3>
                            <p className="text-[10px] font-semibold text-[#8a94ad] uppercase tracking-wider">Academic Registry Protocol</p>
                        </div>
                    </div>
                }
                maxWidth="2xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6 py-2">
                    {activeTab === 'categories' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input 
                                label="Scope Classification" 
                                value={currentItem.name || ''} 
                                onChange={e => setCurrentItem({...currentItem, name: e.target.value})}
                                placeholder="e.g. Primary School, Secondary, KG"
                                required
                            />
                            <Input 
                                label="Scope Description" 
                                value={currentItem.description || ''} 
                                onChange={e => setCurrentItem({...currentItem, description: e.target.value})}
                                placeholder="Describe the purpose of this category..."
                            />
                        </div>
                    )}

                    {activeTab === 'classes' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select 
                                label="Parent Category"
                                placeholder="Select Strategic Group"
                                options={data.categories.map(c => ({ value: c._id, label: c.name }))}
                                value={currentItem.categoryId || ''}
                                onChange={e => setCurrentItem({...currentItem, categoryId: e.target.value})}
                                required
                            />
                            <div className="hidden md:block"></div>
                            <Input 
                                label="Class Identity" 
                                value={currentItem.name || ''} 
                                onChange={e => setCurrentItem({...currentItem, name: e.target.value})}
                                placeholder="e.g. Grade 1-Alpha"
                                required
                            />
                            <Input 
                                label="Grade Coefficient (Numerical)" 
                                value={currentItem.gradeLevel || ''} 
                                onChange={e => setCurrentItem({...currentItem, gradeLevel: e.target.value})}
                                placeholder="e.g. 1"
                                required
                            />
                        </div>
                    )}

                    {activeTab === 'sections' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select 
                                label="Assign to Parent Class"
                                placeholder="Select Root Class"
                                options={data.classes.map(c => ({ value: c._id, label: c.name }))}
                                value={currentItem.classId || ''}
                                onChange={e => setCurrentItem({...currentItem, classId: e.target.value})}
                                required
                            />
                            <Input 
                                label="Internal Section Name" 
                                value={currentItem.name || ''} 
                                onChange={e => setCurrentItem({...currentItem, name: e.target.value})}
                                placeholder="e.g. Block-A"
                                required
                            />
                            <Input 
                                label="Physical Room Location" 
                                value={currentItem.roomNumber || ''} 
                                onChange={e => setCurrentItem({...currentItem, roomNumber: e.target.value})}
                                placeholder="Room Code..."
                            />
                            <Input 
                                label="Maximum Capacity" 
                                type="number"
                                value={currentItem.capacity || ''} 
                                onChange={e => setCurrentItem({...currentItem, capacity: e.target.value})}
                                placeholder="Total Students"
                            />
                        </div>
                    )}

                    {activeTab === 'subjects' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input 
                                label="Subject Name (Master List)" 
                                value={currentItem.name || ''} 
                                onChange={e => setCurrentItem({...currentItem, name: e.target.value})}
                                placeholder="e.g. Mathematics"
                                required
                            />
                            <Input 
                                label="Subject Canonical Code" 
                                value={currentItem.code || ''} 
                                onChange={e => setCurrentItem({...currentItem, code: e.target.value})}
                                placeholder="e.g. MATH-X"
                                className="font-mono uppercase tracking-wider"
                            />
                        </div>
                    )}

                    {activeTab === 'curriculum' && (
                        <div className="space-y-4">
                            <div className="p-3 bg-[#eaf0ff] rounded border border-[#e3e6ed] flex gap-2.5 items-start">
                                <ShieldCheck className="text-[#3874ff] mt-0.5 shrink-0" size={16} />
                                <p className="text-xs font-semibold text-[#141824] leading-relaxed uppercase tracking-wider">
                                    Strategic Definition: You are mapping a specialized subject to a specific territory (Class & Section).
                                </p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Select 
                                    label="Root Class Territory"
                                    placeholder="Required Class..."
                                    options={data.classes.map(c => ({ value: c._id, label: c.name }))}
                                    value={currentItem.classId || ''}
                                    onChange={e => setCurrentItem({...currentItem, classId: e.target.value, sectionId: ''})}
                                    required
                                />
                                <Select 
                                    label="Specific Section (Optional)"
                                    placeholder="All Sections (Global)"
                                    options={data.sections
                                        .filter(s => (s.classId?._id || s.classId) === currentItem.classId)
                                        .map(s => ({ value: s._id, label: s.name }))
                                    }
                                    value={currentItem.sectionId || ''}
                                    onChange={e => setCurrentItem({...currentItem, sectionId: e.target.value})}
                                    disabled={!currentItem.classId}
                                />
                                <Select 
                                    label="Course Authority"
                                    placeholder="Select Master Subject"
                                    options={data.subjects.map(s => ({ value: s._id, label: s.name }))}
                                    value={currentItem.subjectId || ''}
                                    onChange={e => setCurrentItem({...currentItem, subjectId: e.target.value})}
                                    required
                                />
                                <div className="hidden md:block"></div>
                                <Input 
                                    label="Standard Total Marks" 
                                    type="number"
                                    value={currentItem.totalMarks} 
                                    onChange={e => setCurrentItem({...currentItem, totalMarks: e.target.value})}
                                    required
                                />
                                <Input 
                                    label="Acceptable Pass Threshold" 
                                    type="number"
                                    value={currentItem.passMarks} 
                                    onChange={e => setCurrentItem({...currentItem, passMarks: e.target.value})}
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4 border-t border-[#e3e6ed]">
                        <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving} variant="primary">
                            {saving ? 'Saving...' : `Save Record`}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Classes;
