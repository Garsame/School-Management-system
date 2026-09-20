import React, { useEffect, useState } from 'react';
import { 
    getExams, 
    createExam, 
    getClasses, 
    getCurrentAcademicYear, 
    getTerms,
    getSubjects,
    getExamCategories,
    getClassSubjects,
    createExamCategory,
    updateExamStatus,
    deleteExam
} from '../../services/api/branch.api';
import { Table, Button, Modal, Input, Spinner, Toast, Badge, Select } from '../../components/ui';
import { Plus, Calendar, Trash2, CheckCircle, Clock, BookOpen, Layers, Target, Settings2, Search, RotateCcw } from 'lucide-react';
import { confirmAction } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const Exams = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('exams');
    const [exams, setExams] = useState([]);
    const [categories, setCategories] = useState([]);
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [classSubjects, setClassSubjects] = useState([]); // Curriculum data
    const [currentYear, setCurrentYear] = useState(null);
    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const [saving, setSaving] = useState(false);

    // Form States
    const [examForm, setExamForm] = useState({ 
        examCategoryId: '', 
        classId: '', // Keep for "all" option
        classIds: [], // New for multi-select
        subjectId: '', 
        date: '', 
        academicYearId: '',
        termId: ''
    });
    const [categoryForm, setCategoryForm] = useState({ name: '', maxScore: 100, description: '' });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [examRes, catRes, classRes, yearRes, subRes, curriculumRes] = await Promise.all([
                getExams(),
                getExamCategories(),
                getClasses(),
                getCurrentAcademicYear(),
                getSubjects(),
                getClassSubjects()
            ]);
            setExams(examRes?.data || examRes || []);
            setCategories(catRes?.data || catRes || []);
            setClasses(classRes?.data || classRes || []);
            setCurrentYear(yearRes?.data || yearRes);
            setSubjects(subRes?.data || subRes || []);
            setClassSubjects(curriculumRes?.data || curriculumRes || []);
            if (yearRes?.data || yearRes) {
                const yearId = yearRes?.data?._id || yearRes?._id;
                setExamForm(prev => ({ ...prev, academicYearId: yearId }));
                const termRes = await getTerms(yearId);
                setTerms(termRes?.data || termRes || []);
            }
        } catch {
            setToast({ type: 'error', message: 'Failed to load data' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreateExam = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { ...examForm };
            if (payload.classId === 'all') {
                payload.classIds = []; // Let backend handle "all"
            } else if (payload.classIds.length === 0 && payload.classId) {
                payload.classIds = [payload.classId];
            }

            const res = await createExam(payload);
            if (res.success) {
                setToast({ type: 'success', message: res.message || 'Exam Authorized' });
            }
            setIsModalOpen(false);
            fetchData();
        } catch (err) {
            setToast({ type: 'error', message: err.response?.data?.message || 'Failed to create exam' });
        } finally {
            setSaving(false);
        }
    };

    const handleCreateCategory = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await createExamCategory(categoryForm);
            setToast({ type: 'success', message: 'Category created' });
            setIsModalOpen(false);
            fetchData();
        } catch (err) {
            setToast({ type: 'error', message: err.response?.data?.message || 'Failed' });
        } finally {
            setSaving(false);
        }
    };

    const handleStatusUpdate = async (id, status, { confirmMessage } = {}) => {
        if (confirmMessage && !(await confirmAction(confirmMessage, {
            title: status === 'Closed' ? 'Close exam' : 'Reopen exam',
            confirmLabel: status === 'Closed' ? 'Close entry' : 'Reopen entry'
        }))) return;
        try {
            await updateExamStatus(id, status);
            setToast({ type: 'success', message: status === 'Open' ? 'Exam entry is now open' : `Exam marked as ${status}` });
            fetchData();
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Status update failed' });
        }
    };

    const handleDeleteExam = async (id) => {
        if (!(await confirmAction('Delete this exam? Exams with protected results cannot be removed.', { title: 'Delete exam', confirmLabel: 'Delete' }))) return;
        try {
            await deleteExam(id);
            setToast({ type: 'success', message: 'Exam deleted' });
            fetchData();
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Deletion failed' });
        }
    };

    if (loading && exams.length === 0) return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
            <Spinner size="lg" />
            <p className="text-[#8a94ad] font-bold animate-pulse uppercase tracking-wider text-xs">Synchronizing Academic Engine...</p>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header section */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Academic Oversight</h1>
                    <p className="phoenix-page-subtitle">Configure examination structures and manage grading sessions.</p>
                </div>
                <Button 
                    onClick={() => {
                        setIsModalOpen(true);
                        if (activeTab === 'exams') {
                            setExamForm({ ...examForm, academicYearId: currentYear?._id || '' });
                        }
                    }} 
                    className="flex items-center gap-2 !h-9 text-xs"
                    variant="primary"
                >
                    <Plus size={16} /> {activeTab === 'exams' ? 'Create Draft Exam' : 'New Assessment Component'}
                </Button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#e3e6ed] gap-6 mb-6">
                <button 
                    onClick={() => setActiveTab('exams')}
                    className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'exams' 
                            ? 'border-[var(--primary)] text-[#141824]' 
                            : 'border-transparent text-[#8a94ad] hover:text-[#525b75]'
                    }`}
                >
                    <Calendar size={14} />
                    Exams
                </button>
                <button 
                    onClick={() => setActiveTab('categories')}
                    className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'categories' 
                            ? 'border-[var(--primary)] text-[#141824]' 
                            : 'border-transparent text-[#8a94ad] hover:text-[#525b75]'
                    }`}
                >
                    <Layers size={14} />
                    Assessment Components
                </button>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {loading ? (
                 <div className="py-20 flex justify-center"><Spinner /></div>
            ) : (
                <div className="space-y-4">
                    {activeTab === 'exams' ? (
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Exam Identity', 'Scope (Class/Sub)', 'Timeline', 'Availability', 'Standards', 'Actions']}>
                                    {exams.map(exam => (
                                        <tr key={exam._id}>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[#141824]">{exam.examCategoryId?.name}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="space-y-1">
                                                    <Badge variant="indigo">
                                                        {exam.classId?.name}
                                                    </Badge>
                                                    <div className="flex items-center gap-1.5 text-[#525b75] text-[11px] font-semibold">
                                                        <BookOpen size={11} className="text-[#8a94ad]" />
                                                        <span>{exam.subjectId?.name}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs font-bold text-[#525b75]">{exam.date ? new Date(exam.date).toLocaleDateString() : 'Flexible Date'}</p>
                                                <p className="text-[10px] font-semibold uppercase text-[#8a94ad] mt-0.5">{exam.termId?.name || currentYear?.name}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={exam.status === 'Open' ? 'success' : 'outline'} className={exam.status === 'Draft' ? '!border-amber-300 !bg-amber-50 !text-amber-800' : exam.status === 'Closed' ? '!border-slate-300 !bg-slate-100 !text-slate-700' : ''}>
                                                    {exam.status === 'Draft' && <Clock size={10} className="mr-1 inline" />}
                                                    {exam.status === 'Open' && <CheckCircle size={10} className="mr-1 inline" />}
                                                    {exam.status}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 text-xs">
                                                    <Target size={12} className="text-[#cbd0dd]" />
                                                    <span className="font-bold text-[#141824]">{exam.examCategoryId?.maxScore}</span>
                                                    <span className="text-[10px] text-[#8a94ad] uppercase font-semibold">Pts</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5 justify-end">
                                                    {exam.status === 'Draft' && hasPermission(user, 'branch.exams.update') && (
                                                        <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(exam._id, 'Open')} className="!h-7 text-[10px] uppercase font-bold tracking-wider">
                                                            Open Entry
                                                        </Button>
                                                    )}
                                                    {exam.status === 'Open' && hasPermission(user, 'branch.exams.update') && (
                                                        <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(exam._id, 'Closed', { confirmMessage: 'Close this exam? Teachers will no longer be able to enter or change marks.' })} className="!h-7 text-[10px] uppercase font-bold tracking-wider">
                                                            Close Entry
                                                        </Button>
                                                    )}
                                                    {exam.status === 'Closed' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleStatusUpdate(exam._id, 'Open', {
                                                                confirmMessage: 'Reopen this exam? Teachers will be able to enter or change results again.'
                                                            })}
                                                            className="!h-7 text-[10px] uppercase font-bold tracking-wider"
                                                        >
                                                            <RotateCcw size={11} className="mr-1" /> Reopen Entry
                                                        </Button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleDeleteExam(exam._id)}
                                                        className="p-1 text-[#8a94ad] hover:text-[#e63757] hover:bg-[#fdebef] rounded transition-all"
                                                        title="Delete Exam"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {exams.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="py-12 text-center text-[#8a94ad]">
                                                No examination sessions authorized yet.
                                            </td>
                                        </tr>
                                    )}
                                </Table>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                             {categories.map(cat => (
                                <article key={cat._id} className="phoenix-card p-4 flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="h-8 w-8 bg-[#f5f7fa] border border-[#e3e6ed] rounded flex items-center justify-center text-[#525b75]">
                                                <Settings2 size={16} />
                                            </div>
                                            <Badge variant="success">Active Component</Badge>
                                        </div>
                                        <h3 className="text-sm font-bold text-[#141824] uppercase tracking-wider mb-1">{cat.name}</h3>
                                        <p className="text-[#6e7891] text-xs leading-relaxed mb-4 min-h-[36px]">{cat.description || 'Assessment component used when calculating the subject total.'}</p>
                                    </div>
                                    
                                    <div className="flex items-center justify-between pt-3 border-t border-[#e3e6ed]">
                                        <div>
                                            <p className="text-[10px] font-semibold text-[#8a94ad] uppercase tracking-wider">Max Score</p>
                                            <p className="font-bold text-[#141824] text-sm">{cat.maxScore} <span className="text-[10px] text-[#8a94ad] font-semibold uppercase">Pts</span></p>
                                        </div>
                                    </div>
                                </article>
                            ))}
                            {categories.length === 0 && (
                                <div className="col-span-full py-12 text-center text-[#8a94ad]">
                                    Create templates first to authorize exams.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Modal */}
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
                                {activeTab === 'exams' ? "Create Draft Assessment" : "New Assessment Component"}
                            </h3>
                            <p className="text-[10px] font-semibold text-[#8a94ad] uppercase tracking-wider">Academic Assessment Protocol</p>
                        </div>
                    </div>
                }
            >
                {activeTab === 'exams' ? (
                     <form onSubmit={handleCreateExam} className="py-2">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="col-span-1 md:col-span-2 bg-[#eaf0ff] rounded p-3 flex justify-between items-center text-xs border border-[#cbd0dd]">
                                 <div>
                                     <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3874ff]">Academic Context</p>
                                     <p className="font-bold text-[#141824]">{currentYear?.name}</p>
                                 </div>
                                 <Calendar size={18} className="text-[#3874ff]" />
                             </div>

                             <Select 
                                 label="Assessment Type"
                                 options={categories.map(c => ({ value: c._id, label: `${c.name} (${c.maxScore} pts)` }))}
                                 value={examForm.examCategoryId}
                                 onChange={e => setExamForm({...examForm, examCategoryId: e.target.value})}
                                 required
                             />

                             <Select
                                 label="Academic Term (Optional)"
                                 options={terms.map(term => ({ value: term._id, label: term.name }))}
                                 value={examForm.termId}
                                 onChange={e => setExamForm({...examForm, termId: e.target.value})}
                             />

                             <div className="col-span-1 md:col-span-2 space-y-1">
                                 <label className="text-xs font-semibold text-[#525b75] uppercase tracking-wider block">Academic Scope (Class)</label>
                                 <div className="flex flex-wrap gap-1.5 p-2 bg-[#f5f7fa] rounded border border-[#cbd0dd] min-h-[60px]">
                                     <button 
                                         type="button"
                                         onClick={() => setExamForm(prev => ({ ...prev, classId: prev.classId === 'all' ? '' : 'all', classIds: [] }))}
                                         className={`px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${examForm.classId === 'all' ? 'bg-[#3874ff] text-white' : 'bg-white text-[#525b75] border border-[#cbd0dd] hover:bg-[#f5f7fa]'}`}
                                     >
                                         Apply to All
                                     </button>
                                     {examForm.classId !== 'all' && classes.map(c => (
                                         <button 
                                             key={c._id}
                                             type="button"
                                             onClick={() => {
                                                 const newIds = examForm.classIds.includes(c._id) 
                                                     ? examForm.classIds.filter(id => id !== c._id)
                                                     : [...examForm.classIds, c._id];
                                                 setExamForm(prev => ({ ...prev, classIds: newIds, classId: '' }));
                                             }}
                                             className={`px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${examForm.classIds.includes(c._id) ? 'bg-[#3874ff] text-white' : 'bg-white text-[#525b75] border border-[#cbd0dd] hover:bg-[#f5f7fa]'}`}
                                         >
                                             {c.name}
                                         </button>
                                     ))}
                                 </div>
                             </div>

                             <Select 
                                 label="Knowledge Area"
                                 options={(examForm.classId === 'all' ? subjects : (
                                     subjects.filter(s => {
                                         if (examForm.classIds.length === 0) return true;
                                         return classSubjects.some(cs => 
                                             examForm.classIds.includes(cs.classId?._id || cs.classId) && 
                                             (cs.subjectId?._id || cs.subjectId) === s._id
                                         );
                                     })
                                 )).map(s => ({ value: s._id, label: s.name }))}
                                 value={examForm.subjectId}
                                 onChange={e => setExamForm({...examForm, subjectId: e.target.value})}
                                 required
                             />

                             <Input 
                                 type="date"
                                 label="Session Date (Optional)"
                                 value={examForm.date}
                                 onChange={e => setExamForm({...examForm, date: e.target.value})}
                             />
                         </div>

                         <div className="flex justify-end gap-2 pt-4 border-t border-[#e3e6ed] mt-4">
                             <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                             <Button type="submit" disabled={saving} variant="primary">
                                 {saving ? 'Authorizing...' : 'Authorize Assessment'}
                             </Button>
                         </div>
                     </form>
                ) : (
                    <form onSubmit={handleCreateCategory} className="py-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input 
                                label="Component Name"
                                placeholder="e.g. Mid-Term Review"
                                value={categoryForm.name}
                                onChange={e => setCategoryForm({...categoryForm, name: e.target.value})}
                                required
                            />
                            <div className="hidden md:block"></div>

                            <Input 
                                type="number"
                                min="1"
                                max="100"
                                label="Maximum Score"
                                placeholder="100"
                                value={categoryForm.maxScore}
                                onChange={e => setCategoryForm({...categoryForm, maxScore: e.target.value})}
                                required
                            />
                            <div className="flex items-end">
                                <Badge variant="indigo" className="h-10 w-full flex items-center justify-center rounded border font-semibold uppercase text-[10px] tracking-wider">Points System</Badge>
                            </div>

                            <div className="col-span-1 md:col-span-2">
                                <Input 
                                    label="Brief Description (Optional)"
                                    placeholder="Describe the purpose of this assessment template..."
                                    value={categoryForm.description}
                                    onChange={e => setCategoryForm({...categoryForm, description: e.target.value})}
                                />
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-4 border-t border-[#e3e6ed] mt-4">
                            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving} variant="primary">
                                {saving ? 'Saving...' : 'Save Component'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default Exams;
