import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAdmissionSummary, getStudentById, updateStudent, apiResetStudentPassword } from '../../services/api/registrar.api';
import { Spinner, Button, Input, Badge, Toast } from '../../components/ui';
import { Printer, RefreshCw, ShieldAlert } from 'lucide-react';
import { confirmAction } from '../../components/feedback/notificationService';
import { documentHeader, downloadHtmlDocument, escapeHtml, formatPrintDate, printHtmlDocument, signatureBlock } from '../../utils/printDocument';
import { useBranding } from '../../context/BrandingContext';
import EnrollmentHistory from '../../components/students/EnrollmentHistory';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const StudentDetails = () => {
    const { user } = useAuth();
    const { studentId: id } = useParams();
    const navigate = useNavigate();
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [formData, setFormData] = useState({});
    const [toast, setToast] = useState(null);
    const [error, setError] = useState(null);
    const { branding } = useBranding();

    const fetchStudent = async (studentId) => {
        try {
            setError(null);
            const res = await getStudentById(studentId);
            const data = res.data.data || res.data;
            setStudent(data);
            setFormData(data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Failed to load student details. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id && id !== 'undefined' && id.length === 24) {
            fetchStudent(id);
        } else {
            setError(id === 'undefined' ? "No Student ID provided." : "Invalid ID format in URL.");
            setLoading(false);
        }
    }, [id]);

    const handleSave = async () => {
        try {
            await updateStudent(id, {
                firstName: formData.firstName,
                middleName: formData.middleName,
                lastName: formData.lastName,
                DOB: formData.DOB,
                gender: formData.gender,
                admissionDate: formData.admissionDate,
                nationality: formData.nationality,
                previousSchool: formData.previousSchool,
                guardianInfo: formData.guardianInfo,
                emergencyContact: formData.emergencyContact,
                medicalInfo: formData.medicalInfo,
                status: formData.status,
                // Leaving ends the student's class place and stops all future bills.
                ...(formData.status === 'Left' && student.status !== 'Left'
                    ? { leftOn: formData.leftOn || undefined, leftReason: formData.leftReason || '' }
                    : {})
            });
            setToast({ type: 'success', message: 'Student updated successfully' });
            setEditing(false);
            fetchStudent(id);
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: err.response?.data?.message || 'Update failed' });
        }
    };

    const handleResetPassword = async () => {
        if (!(await confirmAction('Reset this student password and generate new temporary credentials?', { title: 'Reset student password', confirmLabel: 'Reset password' }))) return;
        setResetting(true);
        try {
            const response = await apiResetStudentPassword(id);
            const temporaryPassword = response.data?.data?.temporaryPassword;
            setToast({
                type: 'success',
                message: temporaryPassword
                    ? `Password reset. Temporary password: ${temporaryPassword}`
                    : 'Password reset successfully'
            });
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: 'Reset failed' });
        } finally {
            setResetting(false);
        }
    };

    const buildAdmissionSummaryBody = (summary) => `
        <div class="doc">
            ${documentHeader({
                schoolName: summary.school?.name || branding?.tenantName || 'Admission Summary',
                schoolAddress: summary.school?.address,
                schoolPhone: summary.school?.phone,
                schoolEmail: summary.school?.email,
                logoUrl: branding?.logoUrl || summary.school?.logoUrl,
                title: 'Admission Summary',
                subtitle: summary.student?.admissionNumber || ''
            })}
            <h2>Student Admission Summary</h2>
            <div class="grid">
                <div><div class="label">Student Name</div><div class="value">${escapeHtml(summary.student?.name)}</div></div>
                <div><div class="label">Admission Number</div><div class="value">${escapeHtml(summary.student?.admissionNumber)}</div></div>
                <div><div class="label">Gender</div><div class="value">${escapeHtml(summary.student?.gender)}</div></div>
                <div><div class="label">Date of Birth</div><div class="value">${escapeHtml(formatPrintDate(summary.student?.dateOfBirth))}</div></div>
                <div><div class="label">Admission Date</div><div class="value">${escapeHtml(formatPrintDate(summary.student?.admissionDate))}</div></div>
                <div><div class="label">Status</div><div class="value">${escapeHtml(summary.student?.status)}</div></div>
            </div>
            <h2>Enrollment</h2>
            <div class="grid">
                <div><div class="label">Academic Year</div><div class="value">${escapeHtml(summary.enrollment?.academicYearName || 'Not assigned')}</div></div>
                <div><div class="label">Class</div><div class="value">${escapeHtml(summary.enrollment?.className || 'Not assigned')}</div></div>
                <div><div class="label">Section</div><div class="value">${escapeHtml(summary.enrollment?.sectionName || 'Not assigned')}</div></div>
                <div><div class="label">Enrollment Status</div><div class="value">${escapeHtml(summary.enrollment?.status || 'Not assigned')}</div></div>
            </div>
            <h2>Guardian</h2>
            <div class="grid">
                <div><div class="label">Name</div><div class="value">${escapeHtml(summary.guardian?.name)}</div></div>
                <div><div class="label">Phone</div><div class="value">${escapeHtml(summary.guardian?.phone)}</div></div>
                <div><div class="label">Relationship</div><div class="value">${escapeHtml(summary.guardian?.relationship || 'Guardian')}</div></div>
                <div><div class="label">Email</div><div class="value">${escapeHtml(summary.guardian?.email)}</div></div>
            </div>
            ${signatureBlock()}
            <div class="footer"><span>Generated from the official admission record.</span><span>Printed ${escapeHtml(formatPrintDate(summary.issuedAt || new Date()))}</span></div>
        </div>`;

    const handlePrintAdmissionSummary = async () => {
        setPrinting(true);
        try {
            const response = await getAdmissionSummary(id);
            const summary = response.data?.data || response.data;
            const body = buildAdmissionSummaryBody(summary);
            if (!printHtmlDocument({
                title: `Admission Summary - ${summary.student?.admissionNumber || ''}`,
                body,
                primaryColor: branding?.primaryColor,
                secondaryColor: branding?.secondaryColor
            })) {
                setToast({ type: 'error', message: 'Popup blocked. Please allow popups to print admission summaries.' });
            }
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: 'Could not prepare admission summary.' });
        } finally {
            setPrinting(false);
        }
    };

    const handleDownloadAdmissionSummary = async () => {
        setPrinting(true);
        try {
            const response = await getAdmissionSummary(id);
            const summary = response.data?.data || response.data;
            downloadHtmlDocument({
                title: `Admission Summary - ${summary.student?.admissionNumber || ''}`,
                filename: `admission-summary-${summary.student?.admissionNumber || 'student'}`,
                body: buildAdmissionSummaryBody(summary),
                primaryColor: branding?.primaryColor,
                secondaryColor: branding?.secondaryColor
            });
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: 'Could not download admission summary.' });
        } finally {
            setPrinting(false);
        }
    };

    if (loading) return (
        <div className="h-96 flex items-center justify-center">
            <Spinner size="lg" />
        </div>
    );

    if (!student) return (
        <div className="flex flex-col items-center justify-center py-20 px-4 animate-fade-in text-center">
            <div className="bg-slate-100 p-6 rounded-full mb-6">
                <ShieldAlert size={64} className="text-slate-400" />
            </div>
            <h2 className="text-3xl font-bold text-slate-800 mb-2">Student Not Found</h2>
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm mb-6 border border-red-100 font-medium">
                Reason: {error || "Access Denied / Record Missing"}
            </div>
            <p className="text-slate-500 max-w-md mb-8">
                The student record you requested could not be found in your current branch. 
                Double check the student list or try searching again.
            </p>
            <div className="flex gap-4">
                <Button variant="ghost" onClick={() => navigate(-1)}>
                    Go Back
                </Button>
                <Button onClick={() => navigate('/registrar/students')}>
                    View Student Directory
                </Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">
                        {student.firstName} {student.middleName ? `${student.middleName} ` : ''}{student.lastName}
                    </h1>
                    <p className="phoenix-page-subtitle">ID: {student.admissionNumber} | Portal Username: {student.portalAccount?.username || 'N/A'}</p>
                </div>
                <div className="flex gap-2">
                    {!editing ? (
                        <>
                            <Button 
                                variant="outline" 
                                className="flex items-center gap-2 text-xs h-10 px-4 border border-[var(--border)]"
                                onClick={handlePrintAdmissionSummary}
                                disabled={printing}
                            >
                                <Printer size={14} />
                                Admission Summary
                            </Button>
                            <Button
                                variant="outline"
                                className="flex items-center gap-2 text-xs h-10 px-4 border border-[var(--border)]"
                                onClick={handleDownloadAdmissionSummary}
                                disabled={printing}
                            >
                                Download Summary
                            </Button>
                            {hasPermission(user, 'students.password.reset') && <Button 
                                variant="outline" 
                                className="flex items-center gap-2 text-xs h-10 px-4 border border-[var(--border)]"
                                onClick={handleResetPassword}
                                disabled={resetting}
                            >
                                <RefreshCw size={14} className={resetting ? 'animate-spin' : ''} />
                                Reset Password
                            </Button>}
                            {hasPermission(user, 'students.update') && <Button onClick={() => setEditing(true)} className="text-xs h-10 px-4">Edit Profile</Button>}
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" onClick={() => { setEditing(false); setFormData(student); }} className="text-xs h-10 px-4">Cancel</Button>
                            <Button onClick={handleSave} className="text-xs h-10 px-4">Save Changes</Button>
                        </>
                    )}
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 phoenix-card p-6 space-y-6">
                    <div className="border-b border-[#e3e6ed] pb-3">
                        <h3 className="font-bold text-base text-[#141824]">Personal Profile</h3>
                        <p className="text-xs text-[#8a94ad] mt-1">General student registration information.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input 
                            label="First Name" 
                            value={formData.firstName || ''} 
                            onChange={e => setFormData({...formData, firstName: e.target.value})}
                            disabled={!editing} 
                        />
                        <Input
                            label="Middle Name"
                            value={formData.middleName || ''}
                            onChange={e => setFormData({...formData, middleName: e.target.value})}
                            disabled={!editing}
                        />
                        <Input 
                            label="Last Name" 
                            value={formData.lastName || ''} 
                            onChange={e => setFormData({...formData, lastName: e.target.value})}
                            disabled={!editing} 
                        />
                        <Input label="Date of Birth" type={editing ? 'date' : 'text'} value={editing ? (formData.DOB?.slice?.(0, 10) || '') : (student.DOB ? new Date(student.DOB).toLocaleDateString() : 'N/A')} onChange={e => setFormData({...formData, DOB: e.target.value})} disabled={!editing} />
                        <Input label="Admission Date" type={editing ? 'date' : 'text'} value={editing ? (formData.admissionDate?.slice?.(0, 10) || '') : (student.admissionDate ? new Date(student.admissionDate).toLocaleDateString() : 'N/A')} onChange={e => setFormData({...formData, admissionDate: e.target.value})} disabled={!editing} />
                        <Input label="Nationality" value={formData.nationality || ''} onChange={e => setFormData({...formData, nationality: e.target.value})} disabled={!editing} />
                        <Input label="Previous School" value={formData.previousSchool || ''} onChange={e => setFormData({...formData, previousSchool: e.target.value})} disabled={!editing} />
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-semibold text-slate-700">Status</label>
                            {editing && student.status !== 'Left' ? (
                                <select 
                                    className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 text-sm"
                                    value={formData.status}
                                    onChange={e => setFormData({...formData, status: e.target.value})}
                                >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="Left">Left the school</option>
                                </select>
                            ) : (
                                <div className="min-h-11 flex flex-col justify-center">
                                    <Badge variant={student.status === 'Active' ? 'success' : 'default'}>{student.status === 'Left' ? 'Left the school' : student.status}</Badge>
                                    {student.status === 'Left' && (
                                        <p className="mt-1 text-xs text-slate-500">
                                            {student.withdrawalDate ? `Left on ${new Date(student.withdrawalDate).toLocaleDateString()}` : 'Left'}{student.withdrawalReason ? ` · ${student.withdrawalReason}` : ''}. No new bills. Use Re-Enrollment to bring them back.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        {editing && formData.status === 'Left' && student.status !== 'Left' && (
                            <>
                                <Input label="Leaving date" type="date" value={formData.leftOn || ''} onChange={e => setFormData({...formData, leftOn: e.target.value})} />
                                <Input label="Reason (optional)" value={formData.leftReason || ''} onChange={e => setFormData({...formData, leftReason: e.target.value})} placeholder="For example: family moved" />
                                <p className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                                    When you save, the student leaves their class and gets no more monthly bills. What they already owe stays on their record.
                                </p>
                            </>
                        )}
                    </div>

                    <div className="border-b border-[#e3e6ed] pb-3 pt-4">
                        <h3 className="font-bold text-base text-[#141824]">Guardian Contact Details</h3>
                        <p className="text-xs text-[#8a94ad] mt-1">Primary contact person information.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <Input 
                            label="Guardian Name" 
                            value={formData.guardianInfo?.name || ''} 
                            onChange={e => setFormData({...formData, guardianInfo: {...formData.guardianInfo, name: e.target.value}})}
                            disabled={!editing} 
                        />
                        <Input 
                            label="Phone" 
                            value={formData.guardianInfo?.phone || ''} 
                            onChange={e => setFormData({...formData, guardianInfo: {...formData.guardianInfo, phone: e.target.value}})}
                            disabled={!editing} 
                        />
                        <Input
                            label="Email"
                            type="email"
                            value={formData.guardianInfo?.email || ''}
                            onChange={e => setFormData({...formData, guardianInfo: {...formData.guardianInfo, email: e.target.value}})}
                            disabled={!editing}
                        />
                        <Input
                            label="Relationship"
                            value={formData.guardianInfo?.relationship || ''}
                            onChange={e => setFormData({...formData, guardianInfo: {...formData.guardianInfo, relationship: e.target.value}})}
                            disabled={!editing}
                        />
                         <Input 
                            label="Address" 
                            value={formData.guardianInfo?.address || ''} 
                            onChange={e => setFormData({...formData, guardianInfo: {...formData.guardianInfo, address: e.target.value}})}
                            disabled={!editing} 
                            containerClassName="md:col-span-2"
                        />
                        <Input label="Emergency Contact" value={formData.emergencyContact?.name || ''} onChange={e => setFormData({...formData, emergencyContact: {...formData.emergencyContact, name: e.target.value}})} disabled={!editing} />
                        <Input label="Emergency Phone" value={formData.emergencyContact?.phone || ''} onChange={e => setFormData({...formData, emergencyContact: {...formData.emergencyContact, phone: e.target.value}})} disabled={!editing} />
                        <div className="md:col-span-2">
                            <Input label="Medical Alerts or Notes" value={formData.medicalInfo?.notes || ''} onChange={e => setFormData({...formData, medicalInfo: {...formData.medicalInfo, notes: e.target.value}})} disabled={!editing} />
                        </div>
                    </div>
                </div>

                <div className="phoenix-card p-6 space-y-6">
                    <div className="border-b border-[#e3e6ed] pb-3">
                        <h3 className="font-bold text-base text-[#141824]">Enrollment History</h3>
                        <p className="text-xs text-[#8a94ad] mt-1">Past and current class placements.</p>
                    </div>
                    <EnrollmentHistory enrollments={student.enrollments || []} />
                </div>
            </div>
        </div>
    );
};

export default StudentDetails;
