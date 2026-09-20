import React, { useEffect, useState } from 'react';
import { getCurrentAcademicYear, createStudentAdmission } from '../../services/api/registrar.api';
import { getClasses, getSections } from '../../services/api/branch.api';
import { Input, Button, Spinner, Toast } from '../../components/ui';
import { useNavigate } from 'react-router-dom';

const Admissions = () => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [sectionsLoading, setSectionsLoading] = useState(false);
    const [academicYear, setAcademicYear] = useState(null);
    const [admissionResult, setAdmissionResult] = useState(null);
    const [formData, setFormData] = useState({
        firstName: '',
        middleName: '',
        lastName: '',
        DOB: '',
        gender: 'Male',
        admissionDate: new Date().toISOString().slice(0, 10),
        nationality: '',
        previousSchool: '',
        guardianName: '',
        guardianPhone: '',
        guardianAddress: '',
        guardianEmail: '',
        guardianRelationship: '',
        emergencyName: '',
        emergencyPhone: '',
        medicalNotes: '',
        classId: '',
        sectionId: '',
        sectionName: '',
        status: 'Active'
    });
    const [toast, setToast] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const init = async () => {
            try {
                const [yearRes, classRes] = await Promise.all([
                    getCurrentAcademicYear(),
                    getClasses()
                ]);
                setAcademicYear(yearRes.data?.data); // Adjusted based on previous response structure which usually wraps in data
                setClasses(classRes.data);
            } catch (err) {
                console.error(err);
                setToast({ type: 'error', message: 'Failed to load form requirements.' });
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const loadSections = async (classId) => {
        if (!classId) {
            setSections([]);
            return;
        }
        setSectionsLoading(true);
        try {
            const secRes = await getSections(classId);
            setSections(secRes.data || []);
        } catch (err) {
            console.error(err);
            setSections([]);
            setToast({ type: 'error', message: 'Failed to load sections for selected class.' });
        } finally {
            setSectionsLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'classId') {
            setFormData(prev => ({ ...prev, classId: value, sectionId: '', sectionName: '' }));
            loadSections(value);
            return;
        }
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setToast(null);

        try {
            const payload = {
                firstName: formData.firstName,
                middleName: formData.middleName,
                lastName: formData.lastName,
                DOB: formData.DOB,
                gender: formData.gender,
                admissionDate: formData.admissionDate,
                nationality: formData.nationality,
                previousSchool: formData.previousSchool,
                guardianInfo: {
                    name: formData.guardianName,
                    phone: formData.guardianPhone,
                    address: formData.guardianAddress,
                    email: formData.guardianEmail,
                    relationship: formData.guardianRelationship
                },
                emergencyContact: formData.emergencyName || formData.emergencyPhone
                    ? { name: formData.emergencyName, phone: formData.emergencyPhone, relationship: 'Emergency contact' }
                    : undefined,
                medicalInfo: formData.medicalNotes ? { notes: formData.medicalNotes } : undefined,
                classId: formData.classId,
                sectionId: formData.sectionId || undefined,
                sectionName: formData.sectionName?.trim() || undefined,
                academicYearId: academicYear?._id,
                status: formData.status
            };

            const res = await createStudentAdmission(payload);
            const createdStudentId = res.data?.data?.student?.admissionNumber;
            const loginId = res.data?.data?.account?.username || createdStudentId;
            const defaultPassword = res.data?.data?.account?.defaultPassword;
            const parentAccount = res.data?.data?.parentAccount;
            const parentMessage = parentAccount?.created
                ? ' Parent portal account created.'
                : parentAccount
                    ? ' Existing parent account linked.'
                    : '';
            setToast({
                type: 'success',
                message: `Student admitted successfully.${parentMessage}`
            });
            setAdmissionResult({
                studentId: res.data.data.student._id,
                admissionNumber: createdStudentId,
                loginId,
                temporaryPassword: defaultPassword,
                parentAccount
            });

        } catch (err) {
            const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || 'Admission failed';
            setToast({ type: 'error', message: msg });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="h-96 flex items-center justify-center"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">New Admission</h1>
                    <p className="phoenix-page-subtitle">Register a new student and assign them to a class.</p>
                </div>
                <div className="bg-white px-3 py-1.5 rounded border border-[#e3e6ed] flex items-center gap-2 max-w-max text-xs">
                    <span className="font-bold text-[#6e7891]">Academic Year:</span>
                    <span className="font-black text-[var(--primary)]">{academicYear?.name || 'Not Available'}</span>
                </div>
            </div>
            
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {!academicYear && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    No active academic year is configured. New admissions are unavailable until the Super Admin activates one.
                </div>
            )}

            {admissionResult && (
                <section className="rounded-lg border border-[var(--primary)] bg-white p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-[#141824]">Admission credentials</h2>
                            <p className="mt-1 text-xs text-[#6e7891]">Record these temporary credentials before leaving this page.</p>
                            <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                                <div><dt className="text-xs text-[#8a94ad]">Student ID</dt><dd className="font-semibold text-[#141824]">{admissionResult.admissionNumber}</dd></div>
                                <div><dt className="text-xs text-[#8a94ad]">Student login</dt><dd className="font-mono font-semibold text-[#141824]">{admissionResult.loginId}</dd></div>
                                <div><dt className="text-xs text-[#8a94ad]">Student temporary password</dt><dd className="font-mono font-semibold text-[#141824]">{admissionResult.temporaryPassword || 'Unavailable'}</dd></div>
                                {admissionResult.parentAccount && (
                                    <>
                                        <div><dt className="text-xs text-[#8a94ad]">Parent login</dt><dd className="font-mono font-semibold text-[#141824]">{admissionResult.parentAccount.email}</dd></div>
                                        <div><dt className="text-xs text-[#8a94ad]">Parent account</dt><dd className="font-semibold text-[#141824]">{admissionResult.parentAccount.created ? 'New account created' : 'Existing account linked'}</dd></div>
                                        {admissionResult.parentAccount.created && <div><dt className="text-xs text-[#8a94ad]">Parent temporary password</dt><dd className="font-mono font-semibold text-[#141824]">{admissionResult.parentAccount.defaultPassword}</dd></div>}
                                    </>
                                )}
                            </dl>
                        </div>
                        <Button type="button" onClick={() => navigate(`/registrar/students/${admissionResult.studentId}`)}>View student</Button>
                    </div>
                </section>
            )}

            <div className="phoenix-card p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <h3 className="font-bold text-lg text-[#141824] border-b border-[#e3e6ed] pb-2">Student Details</h3>
                        <p className="text-xs text-[#8a94ad] mt-1">Provide student profile and initial grade placements.</p>
                    </div>

                    <div className="bg-[#eaf0ff] border border-[#cbd0dd] text-[#3874ff] text-sm rounded-lg px-4 py-3">
                        Student ID is auto-generated when you submit (format: STD-001, STD-002, ...).
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-semibold text-slate-700">Class to Join</label>
                            <select
                                name="classId"
                                value={formData.classId}
                                onChange={handleChange}
                                required
                                className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60"
                            >
                                <option value="">-- Select Class --</option>
                                {(classes || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-semibold text-slate-700">Section (Optional)</label>
                            <select
                                name="sectionId"
                                value={formData.sectionId}
                                onChange={handleChange}
                                disabled={!formData.classId || sectionsLoading}
                                className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60 disabled:bg-[#f5f7fa] disabled:text-[#8a94ad]"
                            >
                                <option value="">
                                    {sectionsLoading ? 'Loading sections...' : '-- Select Existing Section --'}
                                </option>
                                {(sections || []).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                            </select>
                        </div>
                        <Input label="First Name" name="firstName" value={formData.firstName} onChange={handleChange} required />
                        <Input label="Middle Name" name="middleName" value={formData.middleName} onChange={handleChange} />
                        <Input label="Last Name" name="lastName" value={formData.lastName} onChange={handleChange} required />
                        <Input label="Date of Birth" name="DOB" type="date" value={formData.DOB} onChange={handleChange} required />
                        <Input label="Admission Date" name="admissionDate" type="date" value={formData.admissionDate} onChange={handleChange} required />
                        <Input label="Nationality" name="nationality" value={formData.nationality} onChange={handleChange} />
                        <Input label="Previous School" name="previousSchool" value={formData.previousSchool} onChange={handleChange} />
                        <div className="space-y-1.5">
                             <label className="text-[13px] font-semibold text-slate-700">Gender</label>
                             <select
                                name="gender"
                                value={formData.gender}
                                onChange={handleChange}
                                className="w-full h-11 px-3 border border-[var(--border)] bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100/60"
                             >
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <Input
                                label="Create New Section (Optional)"
                                name="sectionName"
                                value={formData.sectionName}
                                onChange={handleChange}
                                placeholder="e.g. A, Blue, East Wing"
                            />
                        </div>
                    </div>

                    <div>
                        <h3 className="font-bold text-lg text-[#141824] border-b border-[#e3e6ed] pb-2 mt-6">Guardian Info</h3>
                        <p className="text-xs text-[#8a94ad] mt-1">Required contact person details for notifications and billing.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Guardian Name" name="guardianName" value={formData.guardianName} onChange={handleChange} required />
                        <Input label="Phone Number" name="guardianPhone" value={formData.guardianPhone} onChange={handleChange} required />
                        <Input label="Guardian Email" name="guardianEmail" type="email" value={formData.guardianEmail} onChange={handleChange} required helperText="Used to create or link the parent portal account" />
                        <Input label="Relationship" name="guardianRelationship" value={formData.guardianRelationship} onChange={handleChange} placeholder="Mother, father, guardian..." />
                        <div className="md:col-span-2">
                            <Input label="Address" name="guardianAddress" value={formData.guardianAddress} onChange={handleChange} required />
                        </div>
                        <div className="md:col-span-2 rounded-lg border border-[#cbd0dd] bg-[#f5f7fa] p-3 text-xs text-[#525b75]">
                            Parent access is automatic. A new account will be created, or an existing parent with the same email will be linked to this student.
                        </div>
                        <Input label="Emergency Contact Name" name="emergencyName" value={formData.emergencyName} onChange={handleChange} />
                        <Input label="Emergency Contact Phone" name="emergencyPhone" value={formData.emergencyPhone} onChange={handleChange} />
                        <div className="md:col-span-2">
                            <Input label="Medical Alerts or Notes" name="medicalNotes" value={formData.medicalNotes} onChange={handleChange} placeholder="Allergies or information staff must know" />
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-[#e3e6ed]">
                        <Button type="submit" size="lg" disabled={submitting || !academicYear}>
                            {submitting ? 'Processing...' : 'Complete Admission'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Admissions;
