import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import Table from '../../components/ui/Table';
import Toast from '../../components/ui/Toast';
import {
  closeAttendanceSession,
  getTeacherAttendanceSessions,
  submitAttendanceSessionRecords,
} from '../../services/api/teacherAttendance.api';
import { getStudents } from '../../services/api/teacher.api';

const STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Late' },
  { value: 'EXCUSED', label: 'Excused' },
];

const AttendanceSessionPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams();
  const initialSession = location.state?.session || null;
  const initialStudents = useMemo(() => location.state?.students || [], [location.state?.students]);

  const [session, setSession] = useState(initialSession);
  const [students, setStudents] = useState(initialStudents);
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [autoClose, setAutoClose] = useState(false);
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    const hydrate = async () => {
      setLoading(true);
      try {
        let activeSession = initialSession;
        if (!activeSession) {
          const sessions = await getTeacherAttendanceSessions({});
          activeSession = (sessions || []).find((row) => (row._id || row.id) === sessionId);
          if (!activeSession) {
            setPageError('Attendance session not found. Open attendance from My Schedule.');
            return;
          }
          setSession(activeSession);
        }

        const status = String(activeSession?.status || '').toUpperCase();
        if (status === 'SUBMITTED' || status === 'CLOSED') {
          setSubmitted(true);
          setPageError('This attendance session is already submitted.');
        }

        let sessionStudents = initialStudents;
        if (!sessionStudents?.length) {
          const classId = activeSession.classId?._id || activeSession.classId;
          const schoolYearId =
            activeSession.schoolYearId?._id ||
            activeSession.schoolYearId ||
            activeSession.academicYearId?._id ||
            activeSession.academicYearId ||
            location.state?.schoolYearId;

          if (classId && schoolYearId) {
            const studentResponse = await getStudents({ classId, academicYearId: schoolYearId });
            sessionStudents = studentResponse?.data || [];
          } else {
            sessionStudents = [];
          }
        }
        setStudents(sessionStudents || []);

        const seeded = {};
        (sessionStudents || []).forEach((student) => {
          seeded[student._id] = 'PRESENT';
        });
        setRecords(seeded);
      } catch (error) {
        setPageError(error?.response?.data?.message || 'Failed to load attendance session.');
      } finally {
        setLoading(false);
      }
    };

    hydrate();
  }, [initialSession, initialStudents, location.state?.schoolYearId, sessionId]);

  const sessionMeta = useMemo(() => {
    if (!session) return null;
    const className = session.classId?.name || session.className || 'Class';
    const subjectName = session.subjectId?.name || session.subjectName || 'Subject';
    const date = session.date || '--';
    const startTime = session.startTime || '--:--';
    const endTime = session.endTime || '--:--';
    return { className, subjectName, date, startTime, endTime };
  }, [session]);

  const handleStatusChange = (studentId, status) => {
    if (submitted) return;
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = (students || []).map((student) => ({
        studentId: student._id,
        status: records[student._id] || 'PRESENT',
      }));
      await submitAttendanceSessionRecords(sessionId, payload);
      if (autoClose) {
        try {
          await closeAttendanceSession(sessionId);
        } catch {
          // no-op
        }
      }
      setSubmitted(true);
      setToast({ message: 'Submitted successfully', type: 'success' });
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to submit attendance.';
      setPageError(message);
      setToast({ message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="phoenix-page-header">
        <div>
          <h1 className="phoenix-page-title">Attendance Session</h1>
          <p className="phoenix-page-subtitle">Record and submit student attendance for this session.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={submitted ? 'warning' : 'primary'}>
            <span>{submitted ? 'Submitted' : 'Open'}</span>
          </Badge>
        </div>
      </div>

      {sessionMeta && (
        <div className="phoenix-card">
          <div className="phoenix-card-body">
            <div className="grid grid-cols-1 gap-4 text-sm text-slate-600 md:grid-cols-2">
              <p>
                <span className="font-bold text-slate-700">Class:</span> {sessionMeta.className}
              </p>
              <p>
                <span className="font-bold text-slate-700">Subject:</span> {sessionMeta.subjectName}
              </p>
              <p>
                <span className="font-bold text-slate-700">Date:</span> {sessionMeta.date}
              </p>
              <p>
                <span className="font-bold text-slate-700">Time:</span> {sessionMeta.startTime} - {sessionMeta.endTime}
              </p>
            </div>
          </div>
        </div>
      )}

      {pageError && (
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      <div className="phoenix-table-shell">
        <div className="overflow-x-auto">
          <Table headers={['Student', 'Student ID', 'Status']}>
            {(students || []).map((student) => (
              <tr key={student._id} className="border-b border-[#e3e6ed]">
                <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                  {(student.firstName || '') + ' ' + (student.lastName || '')}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {student.studentCode || student.admissionNumber || '--'}
                </td>
                <td className="px-4 py-3">
                  <Select
                    value={records[student._id] || 'PRESENT'}
                    onChange={(e) => handleStatusChange(student._id, e.target.value)}
                    options={STATUS_OPTIONS}
                    placeholder="Select status"
                    disabled={submitted}
                  />
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </div>

      <div className="flex flex-col items-end gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
          <input 
            type="checkbox" 
            checked={autoClose} 
            onChange={(e) => setAutoClose(e.target.checked)} 
            disabled={submitted}
            className="rounded border-[#cbd0dd] text-[var(--primary)] focus:ring-[var(--primary)]"
          />
          <span>Close session after submit</span>
        </label>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/teacher/schedule')}>
            <span>Back to Schedule</span>
          </Button>
          <Button onClick={handleSubmit} disabled={submitted || submitting || !(students || []).length}>
            <span>{submitting ? 'Submitting...' : submitted ? 'Submitted' : 'Submit Attendance'}</span>
          </Button>
        </div>
      </div>

      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}
    </div>
  );
};

export default AttendanceSessionPage;
