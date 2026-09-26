import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createStudentAdmission, downloadStudentImportTemplate, exportStudentsCsv, getStudents, previewStudentImportFile } from '../../services/api/registrar.api';
import { getClasses } from '../../services/api/branch.api';
import { Table, Button, Spinner, Badge, Toast, Modal } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Download, FileUp, Search, XCircle } from 'lucide-react';
import { dateStamp, downloadBlob } from '../../utils/download';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

// What to call each cell on the fix boxes. A school should never see a field name.
const IMPORT_FIELD_LABELS = {
    firstName: 'First name',
    middleName: 'Middle name',
    lastName: 'Last name',
    dateOfBirth: 'Date of birth (YYYY-MM-DD)',
    gender: 'Gender (Male, Female or Other)',
    classNumber: 'Class',
    sectionName: 'Section',
    admissionDate: 'Admission date (YYYY-MM-DD)',
    guardianName: 'Guardian name',
    guardianPhone: 'Guardian phone',
    guardianEmail: 'Guardian email',
    guardianAddress: 'Guardian address',
    emergencyContactPhone: 'Emergency contact phone'
};

const Students = () => {
    const { user } = useAuth();
    const [students, setStudents] = useState([]);
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ classId: '', status: '', q: '' });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    // Corrections typed on the preview screen, kept by row number so they survive a
    // re-check and are all sent together.
    const [importFixes, setImportFixes] = useState({});
    const [rechecking, setRechecking] = useState(false);
    const [toast, setToast] = useState(null);
    const fileInputRef = useRef(null);
    const navigate = useNavigate();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [stdRes, clsRes] = await Promise.all([
                getStudents({ ...filters, page, limit: 10, includeEnrollment: true }),
                // Only fetch classes once ideally, but here simplicity
                getClasses() 
            ]);
            const stdData = stdRes.data?.data || stdRes.data || [];
            const pagination = stdRes.data?.pagination || {};
            setStudents(stdData);
            setTotalPages(pagination.totalPages || 1);
            setTotal(pagination.total || 0);
            setClasses(clsRes.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filters, page]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(fetchData, 500);
        return () => clearTimeout(timer);
    }, [fetchData]);

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
        setPage(1);
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await exportStudentsCsv(filters);
            downloadBlob(response.data, `students_${dateStamp()}.csv`);
        } catch (err) {
            console.error(err);
        } finally {
            setExporting(false);
        }
    };

    const handleTemplateDownload = async () => {
        try {
            const response = await downloadStudentImportTemplate();
            downloadBlob(response.data, 'student_import_template.csv');
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: 'Could not download import template.' });
        }
    };

    const downloadImportResults = (results) => {
        if (!results.length) return;
        const headers = ['rowNumber', 'studentName', 'studentId', 'studentLogin', 'studentTemporaryPassword', 'parentEmail', 'parentAction', 'parentTemporaryPassword', 'status', 'message'];
        const escape = (value) => {
            const raw = String(value ?? '');
            const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
            return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const csv = [headers.join(','), ...results.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `student_import_results_${dateStamp()}.csv`);
    };

    // The file is kept so "Create them" can send it again without asking for it twice.
    const runImportPreview = async (file, { createMissing = false, fixes = null } = {}) => {
        try {
            const response = await previewStudentImportFile(file, { createMissing, fixes });
            const preview = response.data?.data || response.data;
            setImportPreview({
                file,
                fileName: preview.fileName || file.name,
                academicYear: preview.academicYear,
                rows: preview.rows || [],
                missing: preview.missing || { classes: [], sections: [] },
                created: preview.created || null,
                columns: preview.columns || null
            });
            if (preview.created?.classes?.length || preview.created?.sections?.length) {
                const parts = [];
                if (preview.created.classes.length) parts.push(`${preview.created.classes.length} classes`);
                if (preview.created.sections.length) parts.push(`${preview.created.sections.length} sections`);
                setToast({ type: 'success', message: `Created ${parts.join(' and ')} from the file.` });
            }
        } catch (err) {
            console.error(err);
            // The server explains what it could not read, which is far more use than a
            // generic message: a wrong file or wrong headings both land here.
            setToast({
                type: 'error',
                message: err?.response?.data?.message || 'That file could not be read.'
            });
        }
    };

    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setImportPreview(null);
        setImportFixes({});
        await runImportPreview(file);
    };

    const handleCreateMissing = async () => {
        if (!importPreview?.file) return;
        setImporting(true);
        try {
            await runImportPreview(importPreview.file, { createMissing: true, fixes: importFixes });
        } finally {
            setImporting(false);
        }
    };

    const setImportFix = (rowNumber, field, value) => {
        setImportFixes((prev) => ({
            ...prev,
            [rowNumber]: { ...(prev[rowNumber] || {}), [field]: value }
        }));
    };

    // The file is still in memory, so it goes back up with the corrections applied.
    const handleRecheck = async () => {
        if (!importPreview?.file) return;
        setRechecking(true);
        try {
            await runImportPreview(importPreview.file, { fixes: importFixes });
        } finally {
            setRechecking(false);
        }
    };

    const handleConfirmImport = async () => {
        const validRows = (importPreview?.rows || []).filter((row) => row.errors.length === 0);
        if (validRows.length === 0) {
            setToast({ type: 'error', message: 'Every row still needs a correction, so there is nothing to import yet.' });
            return;
        }

        setImporting(true);
        try {
            let successCount = 0;
            const results = (importPreview?.rows || [])
                .filter((row) => row.errors.length > 0)
                .map((row) => ({
                    rowNumber: row.rowNumber,
                    studentName: row.label,
                    parentEmail: row.guardianEmail,
                    parentAction: row.parentAction,
                    status: 'Skipped',
                    message: row.errors.join('; ')
                }));
            for (const row of validRows) {
                try {
                    const response = await createStudentAdmission(row.payload);
                    const data = response.data?.data || response.data || {};
                    successCount += 1;
                    results.push({
                        rowNumber: row.rowNumber,
                        studentName: row.label,
                        studentId: data.student?.admissionNumber || '',
                        studentLogin: data.account?.username || '',
                        studentTemporaryPassword: data.account?.defaultPassword || '',
                        parentEmail: data.parentAccount?.email || row.guardianEmail,
                        parentAction: data.parentAccount?.created ? 'New parent created' : 'Existing parent linked',
                        parentTemporaryPassword: data.parentAccount?.defaultPassword || '',
                        status: 'Imported',
                        message: ''
                    });
                } catch (err) {
                    results.push({
                        rowNumber: row.rowNumber,
                        studentName: row.label,
                        parentEmail: row.guardianEmail,
                        parentAction: row.parentAction,
                        status: 'Failed',
                        message: err.response?.data?.message || err.message || 'Import failed'
                    });
                }
            }

            const failed = results.filter((row) => row.status !== 'Imported');
            setToast({
                type: failed.length ? 'warning' : 'success',
                message: failed.length
                    ? `Imported ${successCount} student(s). ${failed.length} row(s) failed. Download the result file for details.`
                    : `Imported ${successCount} student(s) successfully.`
            });
            setImportPreview(null);
            downloadImportResults(results);
            fetchData();
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: 'Could not complete the CSV import.' });
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Students Directory</h1>
                    <p className="phoenix-page-subtitle">Browse, search and filter all registered student profiles in this branch.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input ref={fileInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleImportFile} />
                    <Button
                        type="button"
                        variant="outline"
                        className="flex items-center gap-2 !h-9 text-xs"
                        onClick={handleTemplateDownload}
                    >
                        <Download size={15} />
                        Template
                    </Button>
                    {hasPermission(user, 'students.create') && <Button
                        type="button"
                        variant="outline"
                        className="flex items-center gap-2 !h-9 text-xs"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importing}
                        loading={importing}
                    >
                        {!importing && <FileUp size={15} />}
                        Import CSV
                    </Button>}
                    <Button
                        type="button"
                        variant="outline"
                        className="flex items-center gap-2 !h-9 text-xs"
                        onClick={handleExport}
                        disabled={exporting}
                        loading={exporting}
                    >
                        {!exporting && <Download size={15} />}
                        Export CSV
                    </Button>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <Modal
                isOpen={Boolean(importPreview)}
                onClose={() => !importing && setImportPreview(null)}
                title="Review student import"
                maxWidth="4xl"
            >
                {importPreview && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8a94ad]">File</p>
                                <p className="mt-1 text-sm font-bold text-[#141824] truncate">{importPreview.fileName}</p>
                                <p className="mt-1 text-xs text-[#6e7891]">Academic year: {importPreview.academicYear}</p>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Ready rows</p>
                                <p className="mt-1 text-xl font-bold text-emerald-700">
                                    {importPreview.rows.filter(row => row.errors.length === 0).length}
                                </p>
                            </div>
                            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Rows needing fixes</p>
                                <p className="mt-1 text-xl font-bold text-rose-700">
                                    {importPreview.rows.filter(row => row.errors.length > 0).length}
                                </p>
                            </div>
                        </div>

                        {(importPreview.missing?.classes?.length > 0 || importPreview.missing?.sections?.length > 0) && (
                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-blue-900">
                                <div className="flex items-start gap-3">
                                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <p className="text-sm font-bold">
                                            This file uses classes the school has not set up yet.
                                        </p>
                                        {importPreview.missing.classes.length > 0 && (
                                            <p className="text-xs">
                                                <span className="font-semibold">Classes to create:</span>{' '}
                                                {importPreview.missing.classes.join(', ')}
                                            </p>
                                        )}
                                        {importPreview.missing.sections.length > 0 && (
                                            <p className="text-xs">
                                                <span className="font-semibold">Sections to create:</span>{' '}
                                                {importPreview.missing.sections.join(', ')}
                                            </p>
                                        )}
                                        <p className="text-xs text-blue-800">
                                            Check the spelling before creating these. A typo here becomes a class
                                            that stays in the school.
                                        </p>
                                        <Button size="sm" onClick={handleCreateMissing} loading={importing} className="!h-9 text-xs">
                                            Create them and check again
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {importPreview.columns?.notRecognised?.length > 0 && (
                            <p className="text-xs text-[#6e7891]">
                                Columns not used: {importPreview.columns.notRecognised.join(', ')}
                            </p>
                        )}

                        {importPreview.rows.some(row => row.errors.length > 0) && (
                            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-amber-900">
                                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-[240px]">
                                    <p className="text-sm font-semibold">
                                        Some rows need a correction before they can be imported.
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-amber-800">
                                        Type the right value in the box on the row, then press Check again. You do not
                                        need to open the file. Any row still marked Fix needed is simply left out.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleRecheck}
                                    loading={rechecking}
                                    disabled={importing || Object.keys(importFixes).length === 0}
                                    className="!h-9 text-xs"
                                >
                                    Check again
                                </Button>
                            </div>
                        )}

                        <div className="max-h-[360px] overflow-auto rounded-xl border border-[var(--border)]">
                            <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-[var(--surface-soft)] text-xs uppercase tracking-wider text-[#6e7891]">
                                    <tr>
                                        <th className="px-4 py-3">Row</th>
                                        <th className="px-4 py-3">Student</th>
                                        <th className="px-4 py-3">Class / Section</th>
                                        <th className="px-4 py-3">Parent action</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importPreview.rows.map((row) => (
                                        <tr key={row.rowNumber} className="border-t border-[var(--border)]">
                                            <td className="px-4 py-3 font-mono text-xs">{row.rowNumber}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-[#141824]">{row.label || 'Unnamed student'}</p>
                                                <p className="text-xs text-[#6e7891]">{row.guardianEmail || 'Guardian email missing'}</p>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-[#525b75]">{row.className} / {row.sectionName}</td>
                                            <td className="px-4 py-3 text-xs font-semibold text-[#525b75]">{row.parentAction}</td>
                                            <td className="px-4 py-3">
                                                {row.errors.length === 0 ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                                        <CheckCircle2 size={13} /> Ready
                                                    </span>
                                                ) : (
                                                    <div className="space-y-1">
                                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                                                            <XCircle size={13} /> Fix needed
                                                        </span>
                                                        <p className="max-w-md text-xs font-semibold text-rose-700">{row.errors.join('; ')}</p>
                                                        {(row.problemFields || []).length > 0 && (
                                                            <div className="mt-2 flex max-w-md flex-col gap-2">
                                                                {row.problemFields.map((field) => (
                                                                    <label key={field} className="block">
                                                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#6e7891]">
                                                                            {IMPORT_FIELD_LABELS[field] || field}
                                                                        </span>
                                                                        <input
                                                                            type="text"
                                                                            className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60"
                                                                            placeholder="Type the right value"
                                                                            value={importFixes[row.rowNumber]?.[field] ?? row.source?.[field] ?? ''}
                                                                            onChange={(event) => setImportFix(row.rowNumber, field, event.target.value)}
                                                                        />
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setImportPreview(null)} disabled={importing}>
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleConfirmImport}
                                disabled={importing || importPreview.rows.every(row => row.errors.length > 0)}
                                loading={importing}
                            >
                                {!importing && <FileUp size={15} />}
                                Import valid rows
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <div className="phoenix-card p-4 flex flex-wrap gap-4 items-center bg-white border border-[var(--border)] shadow-sm">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        className="w-full pl-10 pr-4 h-11 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                        placeholder="Search student by name, admission no, parent..."
                        value={filters.q}
                        onChange={(e) => handleFilterChange('q', e.target.value)}
                    />
                </div>
                
                <select 
                    className="h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                    value={filters.classId}
                    onChange={(e) => handleFilterChange('classId', e.target.value)}
                >
                    <option value="">All Classes</option>
                    {(classes || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>

                <select 
                    className="h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                    <option value="">All Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Transferred">Transferred</option>
                    <option value="Graduated">Graduated</option>
                    <option value="Left">Left the school</option>
                </select>
            </div>

            {loading ? <div className="h-96 flex items-center justify-center"><Spinner size="lg" /></div> : (
                <div className="space-y-4">
                    <div className="phoenix-table-shell">
                        <div className="overflow-x-auto">
                            <Table headers={['Student ID', 'Name', 'Current class', 'Year', 'Status', 'Guardian', 'Actions']}>
                                {(students || []).map(s => (
                                    <tr 
                                        key={s._id} 
                                        className="hover:bg-slate-50 cursor-pointer border-b border-[#e3e6ed] last:border-none" 
                                        onClick={() => navigate(`/registrar/students/${s._id}`)}
                                    >
                                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{s.admissionNumber}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-700 text-sm">{[s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ')}</td>
                                        <td className="px-4 py-3 text-sm text-slate-700">{s.currentEnrollment?.classId?.name || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{s.currentEnrollment?.academicYearId?.name || '-'}</td>
                                        <td className="px-4 py-3 text-sm">
                                            <Badge variant={s.status === 'Active' ? 'success' : 'default'}>{s.status}</Badge>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{s.guardianInfo?.name}</td>
                                        <td className="px-4 py-3 text-sm">
                                            <Button variant="ghost" size="sm">View</Button>
                                        </td>
                                    </tr>
                                ))}
                                {(students || []).length === 0 && <tr><td colSpan="7" className="text-center py-8 text-slate-500">No students found.</td></tr>}
                            </Table>
                        </div>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-[var(--border)] shadow-xs">
                            <span className="text-sm text-[#6e7891] font-medium">
                                Showing page <span className="font-bold text-[#141824]">{page}</span> of <span className="font-bold text-[#141824]">{totalPages}</span> ({total} total students)
                            </span>
                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    disabled={page <= 1} 
                                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                                >
                                    Previous
                                </Button>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    disabled={page >= totalPages} 
                                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Students;
