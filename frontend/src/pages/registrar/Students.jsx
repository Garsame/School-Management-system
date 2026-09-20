import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createStudentAdmission, downloadStudentImportTemplate, exportStudentsCsv, getStudents, previewStudentImport } from '../../services/api/registrar.api';
import { getClasses } from '../../services/api/branch.api';
import { Table, Button, Spinner, Badge, Toast, Modal } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Download, FileUp, Search, XCircle } from 'lucide-react';
import { dateStamp, downloadBlob, parseCsvText } from '../../utils/download';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

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

    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            const text = await file.text();
            const rows = parseCsvText(text);

            if (rows.length === 0) {
                setToast({ type: 'error', message: 'No valid student rows found in the CSV file.' });
                return;
            }

            const response = await previewStudentImport(rows);
            const preview = response.data?.data || response.data;
            setImportPreview({ fileName: file.name, academicYear: preview.academicYear, rows: preview.rows || [] });
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: 'Could not read the CSV import file.' });
        }
    };

    const handleConfirmImport = async () => {
        const validRows = (importPreview?.rows || []).filter((row) => row.errors.length === 0);
        if (validRows.length === 0) {
            setToast({ type: 'error', message: 'Fix the CSV file first. There are no valid rows to import.' });
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
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
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

                        {importPreview.rows.some(row => row.errors.length > 0) && (
                            <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-amber-900">
                                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                <p className="text-sm font-semibold">
                                    Rows with errors will be skipped. Update the CSV and upload again if you need those records included.
                                </p>
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
                        placeholder="Search by name or admission no..."
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
                                        <td className="px-4 py-3 font-semibold text-slate-700 text-sm">{s.firstName} {s.lastName}</td>
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
