import React from 'react';
import { Badge } from '../ui';

const badgeVariant = (status) => {
    if (['Current', 'Active', 'active'].includes(status)) return 'success';
    if (status === 'Retained') return 'danger';
    return 'default';
};

const decisionText = (decision) => {
    if (!decision?.outcome) return '';
    if (decision.outcome === 'Retained') {
        return `Retained after failing ${decision.failedSubjects || 0} of ${decision.totalSubjects || 0} subjects (threshold ${decision.retentionThreshold || 0}).`;
    }
    if (decision.outcome === 'Promoted') {
        return `Promoted after failing ${decision.failedSubjects || 0} of ${decision.totalSubjects || 0} subjects.`;
    }
    if (decision.outcome === 'Graduated') {
        return `Graduated after completing ${decision.totalSubjects || 0} subjects.`;
    }
    return decision.reason || 'Promotion decision is waiting for complete results.';
};

const EnrollmentHistory = ({ enrollments = [], emptyMessage = 'No enrollment history found.' }) => (
    <div className="space-y-3">
        {enrollments.map((enrollment) => (
            <div key={enrollment._id} className="border-b border-[#e3e6ed] pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-[#141824]">{enrollment.classId?.name || 'Class not assigned'}</p>
                        <p className="mt-0.5 text-xs text-[#6e7891]">
                            {enrollment.academicYearId?.name || 'Academic year unavailable'}
                            {enrollment.sectionId?.name ? ` - Section ${enrollment.sectionId.name}` : ''}
                        </p>
                        {enrollment.branchId?.name && <p className="mt-0.5 text-xs text-[#8a94ad]">{enrollment.branchId.name}</p>}
                    </div>
                    <Badge variant={badgeVariant(enrollment.status)}>{enrollment.status}</Badge>
                </div>
                {enrollment.promotionDecision?.outcome && (
                    <p className={`mt-2 text-xs font-semibold ${enrollment.promotionDecision.outcome === 'Retained' ? 'text-rose-700' : 'text-[#525b75]'}`}>
                        {decisionText(enrollment.promotionDecision)}
                    </p>
                )}
            </div>
        ))}
        {enrollments.length === 0 && <p className="py-4 text-center text-sm text-[#8a94ad]">{emptyMessage}</p>}
    </div>
);

export default EnrollmentHistory;
