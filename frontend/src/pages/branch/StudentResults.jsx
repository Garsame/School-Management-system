import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Search, Trophy, Users } from 'lucide-react';
import { Table, Badge, Button, Spinner, Input, Select } from '../../components/ui';
import { getAcademicYears, getClasses, getSections, getStudents, getStudentResults } from '../../services/api/branch.api';
import { documentHeader, downloadHtmlDocument, escapeHtml, formatPrintDate, printHtmlDocument, signatureBlock } from '../../utils/printDocument';
import { useBranding } from '../../context/BrandingContext';

const StudentResults = () => {
    const [classes, setClasses] = useState([]);
    const [years, setYears] = useState([]);
    const [sections, setSections] = useState([]);
    const [filters, setFilters] = useState({
        academicYearId: '',
        classId: '',
        sectionId: '',
        status: '',
        q: ''
    });
    const [students, setStudents] = useState([]);
    const [resultData, setResultData] = useState(null);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingResults, setLoadingResults] = useState(false);
    const { branding } = useBranding();

    useEffect(() => {
        const loadMeta = async () => {
            try {
                const [classRes, yearRes] = await Promise.all([
                    getClasses(),
                    getAcademicYears()
                ]);
                setClasses(classRes?.data || classRes || []);
                const yearList = yearRes?.data || yearRes || [];
                setYears(yearList);
                const yearId = yearList.find(year => year.isCurrent)?._id || yearList[0]?._id;
                if (yearId) {
                    setFilters(prev => prev.academicYearId ? prev : ({ ...prev, academicYearId: yearId }));
                }
            } catch (err) {
                console.error(err);
            }
        };
        loadMeta();
    }, []);

    useEffect(() => {
        if (!filters.classId) return setSections([]);
        getSections(filters.classId).then(response => setSections(response?.data || response || [])).catch(() => setSections([]));
    }, [filters.classId]);

    const classOptions = useMemo(() => (
        classes.map(c => ({ value: c._id, label: c.name }))
    ), [classes]);

    const handleSearch = async () => {
        if (!filters.q?.trim()) {
            setStudents([]);
            setResultData(null);
            return;
        }
        setLoadingSearch(true);
        setResultData(null);
        try {
            const payload = await getStudents({
                q: filters.q.trim(),
                classId: filters.classId,
                sectionId: filters.sectionId,
                status: filters.status,
                academicYearId: filters.academicYearId
            });
            setStudents(payload?.data || payload || []);
        } catch (err) {
            console.error('Search students failed', err);
        } finally {
            setLoadingSearch(false);
        }
    };

    const handleViewResults = async (student) => {
        setLoadingResults(true);
        try {
            const payload = await getStudentResults({
                studentId: student._id,
                academicYearId: filters.academicYearId
            });
            setResultData(payload?.data || payload);
        } catch (err) {
            console.error('Load student results failed', err);
        } finally {
            setLoadingResults(false);
        }
    };

    const categories = resultData?.categories || [];
    const subjects = resultData?.subjects || [];
    const overall = resultData?.overall;
    const rank = resultData?.rank;
    const enrollment = resultData?.enrollment;
    const studentInfo = resultData?.student;

    const buildReportCardBody = () => {
        if (!resultData) return '';
        const subjectRows = subjects.map((subject) => `
            <tr>
                <td>${escapeHtml(subject.subjectName)}</td>
                ${(subject.categoryMarks || []).map((mark) => `<td>${escapeHtml(mark.marksObtained === null ? '-' : mark.marksObtained)}</td>`).join('')}
                <td>${escapeHtml(`${subject.percentage}%`)}</td>
                <td>${escapeHtml(`${subject.totalMarks} / ${subject.totalMax}`)}</td>
                <td>${escapeHtml(subject.status)}</td>
            </tr>
        `).join('');
        return `
            <div class="doc">
                ${documentHeader({
                    schoolName: branding?.tenantName || branding?.name || 'School',
                    logoUrl: branding?.logoUrl,
                    title: 'Official Report Card',
                    subtitle: enrollment?.academicYearName || ''
                })}
                <h2>Student Profile</h2>
                <div class="grid">
                    <div><div class="label">Student</div><div class="value">${escapeHtml(`${studentInfo?.firstName || ''} ${studentInfo?.lastName || ''}`.trim())}</div></div>
                    <div><div class="label">Admission Number</div><div class="value">${escapeHtml(studentInfo?.admissionNumber || '--')}</div></div>
                    <div><div class="label">Class</div><div class="value">${escapeHtml(enrollment?.className || '--')}</div></div>
                    <div><div class="label">Academic Year</div><div class="value">${escapeHtml(enrollment?.academicYearName || '--')}</div></div>
                </div>
                <div class="summary">
                    <div class="box"><div class="label">Total</div><div class="value">${escapeHtml(`${overall?.totalMarks || 0} / ${overall?.totalMax || 0}`)}</div></div>
                    <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(overall?.overallStatus || 'N/A')}</div></div>
                    <div class="box"><div class="label">Rank</div><div class="value">${escapeHtml(`${rank?.rank || '--'} / ${rank?.classSize || 0}`)}</div></div>
                    <div class="box"><div class="label">Printed</div><div class="value">${escapeHtml(formatPrintDate(new Date()))}</div></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Subject</th>
                            ${categories.map((category) => `<th>${escapeHtml(category.categoryName)} / ${escapeHtml(category.maxScore)}</th>`).join('')}
                            <th>Percentage</th>
                            <th>Total</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${subjectRows}</tbody>
                </table>
                ${signatureBlock()}
                <div class="footer"><span>Generated from the official branch academic records.</span><span>${escapeHtml(formatPrintDate(new Date()))}</span></div>
            </div>`;
    };

    const handlePrintReportCard = () => {
        const body = buildReportCardBody();
        if (!body) return;
        printHtmlDocument({
            title: `Report Card - ${studentInfo?.admissionNumber || ''}`,
            body,
            primaryColor: branding?.primaryColor,
            secondaryColor: branding?.secondaryColor
        });
    };

    const handleDownloadReportCard = () => {
        const body = buildReportCardBody();
        if (!body) return;
        downloadHtmlDocument({
            title: `Report Card - ${studentInfo?.admissionNumber || ''}`,
            filename: `report-card-${studentInfo?.admissionNumber || 'student'}`,
            body,
            primaryColor: branding?.primaryColor,
            secondaryColor: branding?.secondaryColor
        });
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Student Results Search</h1>
                    <p className="phoenix-page-subtitle">Search a student to view subject results, totals, and class rank.</p>
                </div>
            </div>

            <article className="phoenix-card p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 items-end">
                    <Select
                        label="Academic Year"
                        value={filters.academicYearId}
                        onChange={(e) => setFilters(prev => ({ ...prev, academicYearId: e.target.value }))}
                        options={years.map(year => ({ value: year._id, label: `${year.name}${year.isCurrent ? ' (Current)' : ''}` }))}
                        placeholder="Select Year"
                        className="!h-10 text-xs"
                    />
                    <Select
                        label="Class (Optional)"
                        value={filters.classId}
                        onChange={(e) => setFilters(prev => ({ ...prev, classId: e.target.value, sectionId: '' }))}
                        options={classOptions}
                        placeholder="All Classes"
                        className="!h-10 text-xs"
                    />
                    <Select label="Section" value={filters.sectionId} onChange={(e) => setFilters(prev => ({ ...prev, sectionId: e.target.value }))} options={sections.map(section => ({ value: section._id, label: section.name }))} placeholder="All Sections" disabled={!filters.classId} className="!h-10 text-xs" />
                    <Select label="Student Status" value={filters.status} onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))} options={[{ value: 'Active', label: 'Active' }, { value: 'Graduated', label: 'Graduated' }, { value: 'Transferred', label: 'Transferred' }, { value: 'Inactive', label: 'Inactive' }]} placeholder="All Statuses" className="!h-10 text-xs" />
                    <Input
                        label="Search Student"
                        placeholder="Student, parent, or admission number..."
                        value={filters.q}
                        onChange={(e) => setFilters(prev => ({ ...prev, q: e.target.value }))}
                        icon={<Search size={16} />}
                        className="!h-10 text-xs"
                    />
                    <Button className="!h-10 text-xs" onClick={handleSearch} disabled={loadingSearch} variant="primary">
                        {loadingSearch ? 'Searching...' : 'Search'}
                    </Button>
                </div>
            </article>

            {students.length > 0 && (
                <div className="phoenix-table-shell">
                    <div className="overflow-x-auto">
                        <Table headers={['Student Name', 'Admission No.', 'Action']}>
                            {students.map(std => (
                                <tr key={std._id}>
                                    <td className="px-4 py-3 font-bold text-[#141824]">{std.firstName} {std.lastName}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-[#525b75]">{std.admissionNumber}</td>
                                    <td className="px-4 py-3">
                                        <Button size="sm" variant="outline" onClick={() => handleViewResults(std)} className="!h-7 text-[10px] uppercase font-bold tracking-wider">
                                            View Results
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </Table>
                    </div>
                </div>
            )}
            {!loadingSearch && filters.q.trim() && students.length === 0 && <div className="phoenix-card p-6 text-center text-sm text-[#6e7891]">No students match the selected filters.</div>}

            <div className="space-y-4">
                {loadingResults ? (
                    <div className="flex justify-center p-6"><Spinner /></div>
                ) : resultData ? (
                    <div className="space-y-6">
                        <article className="phoenix-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-base font-bold text-[#141824]">
                                    {studentInfo?.firstName} {studentInfo?.lastName}
                                </h2>
                                <p className="text-[#6e7891] text-xs mt-1">
                                    Admission No: {studentInfo?.admissionNumber || '--'} • Class: {enrollment?.className || '--'}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button variant="outline" size="sm" className="!h-8 text-[10px] uppercase font-bold tracking-wider" onClick={handlePrintReportCard}>
                                    <Printer size={13} />
                                    Print
                                </Button>
                                <Button variant="outline" size="sm" className="!h-8 text-[10px] uppercase font-bold tracking-wider" onClick={handleDownloadReportCard}>
                                    Download
                                </Button>
                                <Badge variant={overall?.overallStatus === 'PASS' ? 'success' : 'danger'}>
                                    {overall?.overallStatus || 'N/A'}
                                </Badge>
                                <div className="text-xs font-semibold text-[#525b75] flex items-center gap-1.5 bg-[#f5f7fa] px-2.5 py-1 rounded border border-[#cbd0dd]">
                                    <Trophy size={13} className="text-[#e5780b]" /> 
                                    <span>Rank {rank?.rank || '--'} / {rank?.classSize || 0}</span>
                                </div>
                            </div>
                        </article>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <article className="phoenix-card p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a94ad]">Total Marks</p>
                                <p className="text-lg font-bold text-[#141824] mt-1">
                                    {overall?.totalMarks || 0} / {overall?.totalMax || 0}
                                </p>
                            </article>
                            <article className="phoenix-card p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a94ad]">Pass Threshold</p>
                                <p className="text-lg font-bold text-[#141824] mt-1">
                                    {overall?.overallPassMark || 0}
                                </p>
                            </article>
                            <article className="phoenix-card p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a94ad]">Academic Year</p>
                                <p className="text-lg font-bold text-[#141824] mt-1">
                                    {enrollment?.academicYearName || '--'}
                                </p>
                            </article>
                        </div>

                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Subject', ...categories.map(c => `${c.categoryName} (${c.maxScore} pts)`), 'Percentage', 'Total', 'Status']}>
                                    {subjects.map(subject => (
                                        <tr key={subject.subjectId}>
                                            <td className="px-4 py-3 font-bold text-[#141824]">{subject.subjectName}</td>
                                            {(subject.categoryMarks || []).map((mark, idx) => (
                                                <td key={idx} className="px-4 py-3 font-mono text-center text-[#525b75]">
                                                    {mark.marksObtained === null ? '-' : mark.marksObtained}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 font-mono text-center text-[#525b75]">{subject.percentage}%</td>
                                            <td className="px-4 py-3 font-mono text-center text-[#525b75]">{subject.totalMarks} / {subject.totalMax}</td>
                                            <td className="px-4 py-3">
                                                <Badge variant={subject.status === 'PASS' ? 'success' : 'danger'}>
                                                    {subject.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </Table>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="phoenix-card p-8 text-center border-dashed border border-[#e3e6ed] bg-white">
                        <div className="flex flex-col items-center gap-3 opacity-75">
                            <Users size={32} className="text-[#cbd0dd]" />
                            <p className="text-xs font-bold text-[#525b75] uppercase tracking-wider">Select a student from the directory search to load scorecard.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentResults;
