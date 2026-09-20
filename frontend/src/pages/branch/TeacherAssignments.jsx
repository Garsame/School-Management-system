import React, { useEffect, useState } from 'react';
import {
    getBranchUsers,
    getTeacherAssignments,
    updateTeacherAssignments,
    getClasses,
    getSections,
    getCurrentAcademicYear,
    getAllBranchAssignments,
    getClassSubjects
} from '../../services/api/branch.api';
import { Button, Modal, Select, Spinner, Toast } from '../../components/ui';
import {
    BookOpen,
    CalendarDays,
    Info,
    Pencil,
    Plus,
    Target,
    UserRound,
    X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const getName = (value, fallback = '') => {
    if (!value) return fallback;
    return typeof value === 'string' ? fallback : value.name || fallback;
};

const summarizeGrades = (classNames) => {
    const uniqueNames = [...new Set(classNames.filter(Boolean))];
    const grades = uniqueNames
        .map((name) => Number(String(name).match(/\d+/)?.[0]))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (grades.length === uniqueNames.length && grades.length > 2) {
        const consecutive = grades.every((grade, index) => index === 0 || grade === grades[index - 1] + 1);
        if (consecutive) return `Grades ${grades[0]}-${grades[grades.length - 1]}`;
    }
    return uniqueNames.join(', ');
};

const groupTeachingScopes = (teacherAssignments) => {
    const groups = new Map();
    teacherAssignments.forEach((assignment) => {
        const subjectName = getName(assignment.subjectId, 'Subject');
        const sectionName = getName(assignment.sectionId);
        const key = `${subjectName}|${sectionName}`;
        if (!groups.has(key)) groups.set(key, { subjectName, sectionName, classNames: [] });
        groups.get(key).classNames.push(getName(assignment.classId, 'Class'));
    });

    return [...groups.values()].map((group) => ({
        ...group,
        gradeSummary: summarizeGrades(group.classNames)
    }));
};

const TeacherAssignments = () => {
    const { user } = useAuth();
    const [teachers, setTeachers] = useState([]);
    const [allAssignments, setAllAssignments] = useState([]);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [classSubjects, setClassSubjects] = useState([]);
    const [currentYear, setCurrentYear] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const init = async () => {
        setLoading(true);
        try {
            const [teacherRes, classRes, sectionRes, yearRes, assignmentRes, classSubjectRes] = await Promise.all([
                getBranchUsers('teacher'),
                getClasses(),
                getSections(),
                getCurrentAcademicYear(),
                getAllBranchAssignments(),
                getClassSubjects()
            ]);
            setTeachers(teacherRes?.data || teacherRes || []);
            setClasses(classRes?.data || classRes || []);
            setSections(sectionRes?.data || sectionRes || []);
            setCurrentYear(yearRes?.data || yearRes);
            setAllAssignments(assignmentRes?.data || assignmentRes || []);
            setClassSubjects(classSubjectRes?.data || classSubjectRes || []);
        } catch {
            setToast({ type: 'error', message: 'Teacher assignment data could not be loaded.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        init();
    }, []);

    const handleOpenAssignments = async (teacher) => {
        setSelectedTeacher(teacher);
        try {
            const response = await getTeacherAssignments(teacher._id);
            const data = response?.data || response || [];
            setAssignments(data.map((assignment) => ({
                classId: assignment.classId?._id || assignment.classId,
                sectionId: assignment.sectionId?._id || assignment.sectionId || '',
                subjectId: assignment.subjectId?._id || assignment.subjectId,
                academicYearId: assignment.academicYearId?._id || assignment.academicYearId
            })));
            setIsModalOpen(true);
        } catch {
            setToast({ type: 'error', message: 'Current teaching scope could not be loaded.' });
        }
    };

    const handleAddAssignment = () => {
        setAssignments((current) => [...current, {
            classId: '',
            sectionId: '',
            subjectId: '',
            academicYearId: currentYear?._id
        }]);
    };

    const handleRemoveAssignment = (index) => {
        setAssignments((current) => current.filter((_, assignmentIndex) => assignmentIndex !== index));
    };

    const handleAssignmentChange = (index, field, value) => {
        setAssignments((current) => current.map((assignment, assignmentIndex) => {
            if (assignmentIndex !== index) return assignment;
            if (field === 'classId') return { ...assignment, classId: value, sectionId: '', subjectId: '' };
            return { ...assignment, [field]: value };
        }));
    };

    const handleSave = async () => {
        if (!assignments.every((assignment) => assignment.classId && assignment.subjectId)) {
            setToast({ type: 'error', message: 'Every assignment needs a class and subject.' });
            return;
        }

        setSaving(true);
        try {
            await updateTeacherAssignments(selectedTeacher._id, assignments);
            setToast({ type: 'success', message: 'Teaching scope updated successfully.' });
            setIsModalOpen(false);
            await init();
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Teaching scope could not be updated.' });
        } finally {
            setSaving(false);
        }
    };

    const assignedTeacherCount = teachers.filter((teacher) =>
        allAssignments.some((assignment) => (assignment.teacherUserId?._id || assignment.teacherUserId) === teacher._id)
    ).length;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Teacher assignments</h1>
                    <p className="phoenix-page-subtitle">Connect teachers with the classes and subjects they teach.</p>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-[#d8dde7] bg-white px-3 py-2 text-xs text-[#52617a]">
                    <CalendarDays size={15} className="text-[var(--primary)]" />
                    <span>Academic year <strong className="text-[#141824]">{currentYear?.name || 'Not set'}</strong></span>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {loading ? (
                <div className="flex min-h-[320px] items-center justify-center"><Spinner size="lg" /></div>
            ) : (
                <>
                    <section className="phoenix-card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-xs text-[#6e7891]">
                        <span><strong className="text-[#141824]">{teachers.length}</strong> teachers</span>
                        <span><strong className="text-[#141824]">{assignedTeacherCount}</strong> assigned</span>
                        <span><strong className="text-[#141824]">{allAssignments.length}</strong> class-subject links</span>
                    </section>

                    <section className="phoenix-card hidden overflow-hidden md:block">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] table-fixed text-left">
                                <thead className="bg-[#f7f8fb]">
                                    <tr className="border-b border-[#e3e6ed] text-xs font-semibold text-[#52617a]">
                                        <th className="w-[28%] px-5 py-3.5">Teacher</th>
                                        <th className="w-[45%] px-4 py-3.5">Teaching scope</th>
                                        <th className="w-[12%] px-4 py-3.5">Status</th>
                                        <th className="w-[15%] px-5 py-3.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#edf0f5]">
                                    {teachers.map((teacher) => {
                                        const teacherAssignments = allAssignments.filter((assignment) => (assignment.teacherUserId?._id || assignment.teacherUserId) === teacher._id);
                                        const scopeGroups = groupTeachingScopes(teacherAssignments);
                                        return (
                                            <tr key={teacher._id} className="transition-colors hover:bg-[#fafbfc]">
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative shrink-0">
                                                            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--primary)_18%,#d8dde7)] bg-[color-mix(in_srgb,var(--primary)_8%,white)] text-sm font-semibold text-[var(--primary)]">
                                                                {teacher.name?.charAt(0) || <UserRound size={16} />}
                                                            </span>
                                                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${teacher.isActive ? 'bg-emerald-500' : 'bg-[#b8c0d2]'}`} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-[#141824]">{teacher.name}</p>
                                                            <p className="mt-0.5 truncate text-xs text-[#8a94ad]">{teacher.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    {scopeGroups.length ? (
                                                        <div className="space-y-2">
                                                            {scopeGroups.map((group) => (
                                                                <div key={`${group.subjectName}-${group.sectionName}`} className="flex items-start gap-2.5 border-l-2 border-[var(--primary)] pl-3">
                                                                    <BookOpen size={14} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                                                                    <div>
                                                                        <p className="text-sm font-semibold text-[#3e465b]">{group.subjectName}</p>
                                                                        <p className="mt-0.5 text-xs text-[#8a94ad]">{group.gradeSummary}{group.sectionName ? ` · Section ${group.sectionName}` : ''}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-xs text-[#8a94ad]"><BookOpen size={14} />No teaching scope assigned</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${teacher.isActive ? 'text-emerald-700' : 'text-[#8a94ad]'}`}>
                                                        <span className={`h-2 w-2 rounded-full ${teacher.isActive ? 'bg-emerald-500' : 'bg-[#b8c0d2]'}`} />
                                                        {teacher.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    {hasPermission(user, 'branch.assignments.manage') && <button type="button" onClick={() => handleOpenAssignments(teacher)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d8dde7] bg-white px-3 text-xs font-semibold text-[#52617a] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]">
                                                        <Pencil size={14} /> Manage scope
                                                    </button>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid gap-3 md:hidden">
                        {teachers.map((teacher) => {
                            const teacherAssignments = allAssignments.filter((assignment) => (assignment.teacherUserId?._id || assignment.teacherUserId) === teacher._id);
                            const scopeGroups = groupTeachingScopes(teacherAssignments);
                            return (
                                <article key={teacher._id} className="phoenix-card p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--primary)_9%,white)] font-semibold text-[var(--primary)]">{teacher.name?.charAt(0) || <UserRound size={16} />}</span>
                                            <div className="min-w-0">
                                                <h2 className="truncate text-sm font-semibold text-[#141824]">{teacher.name}</h2>
                                                <p className="truncate text-xs text-[#8a94ad]">{teacher.email}</p>
                                            </div>
                                        </div>
                                        <span className={`flex items-center gap-1 text-xs font-semibold ${teacher.isActive ? 'text-emerald-700' : 'text-[#8a94ad]'}`}><span className={`h-2 w-2 rounded-full ${teacher.isActive ? 'bg-emerald-500' : 'bg-[#b8c0d2]'}`} />{teacher.isActive ? 'Active' : 'Inactive'}</span>
                                    </div>
                                    <div className="mt-4 space-y-2 border-t border-[#edf0f5] pt-3">
                                        {scopeGroups.length ? scopeGroups.map((group) => (
                                            <div key={`${group.subjectName}-${group.sectionName}`} className="border-l-2 border-[var(--primary)] pl-3">
                                                <p className="text-sm font-semibold text-[#3e465b]">{group.subjectName}</p>
                                                <p className="text-xs text-[#8a94ad]">{group.gradeSummary}{group.sectionName ? ` · Section ${group.sectionName}` : ''}</p>
                                            </div>
                                        )) : <p className="text-xs text-[#8a94ad]">No teaching scope assigned</p>}
                                    </div>
                                    {hasPermission(user, 'branch.assignments.manage') && <button type="button" onClick={() => handleOpenAssignments(teacher)} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#d8dde7] text-xs font-semibold text-[#52617a] hover:border-[var(--primary)] hover:text-[var(--primary)]"><Pencil size={14} />Manage teaching scope</button>}
                                </article>
                            );
                        })}
                    </div>
                </>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]"><Target size={19} /></span>
                        <div>
                            <h2 className="text-base font-semibold text-[#141824]">Manage teaching scope</h2>
                            <p className="text-xs font-normal text-[#8a94ad]">{selectedTeacher?.name}</p>
                        </div>
                    </div>
                }
                maxWidth="3xl"
            >
                <div className="max-h-[70vh] space-y-4 overflow-y-auto px-1 py-1">
                    <div className="flex items-start gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--primary)_20%,#d8dde7)] bg-[color-mix(in_srgb,var(--primary)_7%,white)] p-3">
                        <Info className="mt-0.5 shrink-0 text-[var(--primary)]" size={16} />
                        <p className="text-xs leading-5 text-[#52617a]">Available subjects come from each class curriculum. Add the subject to the curriculum first if it is not listed here.</p>
                    </div>

                    {assignments.length === 0 ? (
                        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-md border border-dashed border-[#cbd0dd] bg-[#fafbfc] px-6 text-center">
                            <BookOpen size={22} className="mb-3 text-[#9aa4b8]" />
                            <p className="text-sm font-semibold text-[#3e465b]">No teaching scope assigned</p>
                            <p className="mt-1 text-xs text-[#8a94ad]">Add a class and subject for this teacher.</p>
                            <Button variant="outline" onClick={handleAddAssignment} className="mt-4 !h-9 text-xs"><Plus size={14} /> Add assignment</Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {assignments.map((assignment, index) => {
                                const availableSubjects = classSubjects
                                    .filter((classSubject) => {
                                        const sameClass = (classSubject.classId?._id || classSubject.classId) === assignment.classId;
                                        const curriculumSectionId = classSubject.sectionId?._id || classSubject.sectionId;
                                        return sameClass && (!curriculumSectionId || curriculumSectionId === assignment.sectionId);
                                    })
                                    .map((classSubject) => ({
                                        value: classSubject.subjectId?._id || classSubject.subjectId,
                                        label: classSubject.subjectId?.name || 'Subject'
                                    }));

                                return (
                                    <article key={index} className="rounded-md border border-[#e3e6ed] bg-white p-4">
                                        <header className="mb-3 flex items-center justify-between border-b border-[#edf0f5] pb-3">
                                            <span className="text-xs font-semibold text-[#52617a]">Assignment {index + 1}</span>
                                            <button type="button" onClick={() => handleRemoveAssignment(index)} className="flex h-8 w-8 items-center justify-center rounded-md text-[#8a94ad] hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove assignment ${index + 1}`} title="Remove assignment"><X size={15} /></button>
                                        </header>
                                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                            <Select label="Class" placeholder="Choose class" value={assignment.classId} onChange={(event) => handleAssignmentChange(index, 'classId', event.target.value)} options={classes.map((classDoc) => ({ value: classDoc._id, label: classDoc.name }))} required />
                                            <Select label="Section" placeholder="All sections" value={assignment.sectionId} onChange={(event) => handleAssignmentChange(index, 'sectionId', event.target.value)} options={sections.filter((section) => (section.classId?._id || section.classId) === assignment.classId).map((section) => ({ value: section._id, label: section.name }))} disabled={!assignment.classId} />
                                            <Select label="Subject" placeholder={assignment.classId ? 'Choose subject' : 'Choose class first'} value={assignment.subjectId} onChange={(event) => handleAssignmentChange(index, 'subjectId', event.target.value)} options={availableSubjects} disabled={!assignment.classId || availableSubjects.length === 0} required />
                                        </div>
                                        {assignment.classId && availableSubjects.length === 0 && <p className="mt-2 text-xs text-amber-700">No curriculum subjects are configured for this class and section.</p>}
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex flex-col-reverse gap-3 border-t border-[#e3e6ed] pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <Button variant="ghost" onClick={handleAddAssignment} className="flex !h-9 items-center gap-1.5 text-xs text-[var(--primary)]"><Plus size={14} /> Add assignment</Button>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={saving} variant="primary">{saving ? 'Saving...' : 'Save teaching scope'}</Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default TeacherAssignments;
