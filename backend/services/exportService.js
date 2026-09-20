const formatDate = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
};

const escapeCsvValue = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const toCSV = (headers, rows) => {
    const headerRow = headers.map(escapeCsvValue).join(',');
    const dataRows = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','));
    return [headerRow, ...dataRows].join('\n');
};

exports.toCSV = toCSV;

exports.formatDate = formatDate;

/**
 * Formats results data into CSV string
 * @param {Array} results - List of results with populated student data
 * @returns {string} CSV content
 */
exports.generateResultsCSV = (results) => {
    if (!results || results.length === 0) return '';

    // 1. Determine all unique subject names across all results to create columns
    const subjectNames = new Set();
    results.forEach(r => {
        r.subjects.forEach(s => subjectNames.add(s.name));
    });
    const subjectHeaders = Array.from(subjectNames).sort();

    // 2. Create Header Row
    const headers = ['Admission Number', 'Student Name', ...subjectHeaders, 'Total', 'Grade'];
    const rows = [headers.join(',')];

    // 3. Create Data Rows
    results.forEach(r => {
        const studentName = `${r.studentId?.firstName || 'Unknown'} ${r.studentId?.lastName || ''}`.trim();
        const admissionNumber = r.studentId?.admissionNumber || 'N/A';
        
        const rowData = [
            admissionNumber,
            `"${studentName}"`, // Quote names to handle commas
        ];

        // Add scores for each subject column
        subjectHeaders.forEach(header => {
            const sub = r.subjects.find(s => s.name === header);
            rowData.push(sub ? sub.score : '-');
        });

        rowData.push(r.total || 0);
        rowData.push(r.grade || 'F');

        rows.push(rowData.join(','));
    });

    return rows.join('\n');
};

exports.generateStudentDirectoryCSV = (students, enrollmentByStudentId = new Map()) => {
    const headers = [
        'Admission Number',
        'Student Name',
        'Status',
        'Gender',
        'Date of Birth',
        'Class',
        'Section',
        'Academic Year',
        'Guardian',
        'Guardian Phone',
        'Guardian Email',
        'Admission Date'
    ];

    const rows = (students || []).map((student) => {
        const enrollment = enrollmentByStudentId.get(String(student._id)) || {};
        const firstName = student.firstName || '';
        const middleName = student.middleName || '';
        const lastName = student.lastName || '';
        return {
            'Admission Number': student.admissionNumber || student.studentCode || '',
            'Student Name': [firstName, middleName, lastName].filter(Boolean).join(' '),
            Status: student.status || '',
            Gender: student.gender || '',
            'Date of Birth': formatDate(student.DOB),
            Class: enrollment.classId?.name || '',
            Section: enrollment.sectionId?.name || '',
            'Academic Year': enrollment.academicYearId?.name || '',
            Guardian: student.guardianInfo?.name || '',
            'Guardian Phone': student.guardianInfo?.phone || '',
            'Guardian Email': student.guardianInfo?.email || '',
            'Admission Date': formatDate(student.admissionDate || student.createdAt)
        };
    });

    return toCSV(headers, rows);
};

exports.generateInvoicesCSV = (invoices) => {
    const headers = [
        'Invoice ID',
        'Student',
        'Admission Number',
        'Branch',
        'Academic Year',
        'Billing Period',
        'Total Amount',
        'Paid Amount',
        'Balance',
        'Status',
        'Due Date',
        'Created Date'
    ];

    const rows = (invoices || []).map((invoice) => {
        const student = invoice.studentId || {};
        return {
            'Invoice ID': invoice._id || '',
            Student: [student.firstName, student.lastName].filter(Boolean).join(' '),
            'Admission Number': student.admissionNumber || '',
            Branch: invoice.branchId?.name || '',
            'Academic Year': invoice.academicYearId?.name || '',
            'Billing Period': invoice.billingPeriodLabel || invoice.billingPeriodKey || '',
            'Total Amount': invoice.totalAmount || 0,
            'Paid Amount': invoice.paidAmount || 0,
            Balance: invoice.balance || 0,
            Status: invoice.status || '',
            'Due Date': formatDate(invoice.dueDate),
            'Created Date': formatDate(invoice.createdAt)
        };
    });

    return toCSV(headers, rows);
};

exports.generatePaymentsCSV = (payments) => {
    const headers = [
        'Payment ID',
        'Receipt Number',
        'Student',
        'Admission Number',
        'Amount',
        'Method',
        'Reference',
        'Status',
        'Recorded By',
        'Date'
    ];

    const rows = (payments || []).map((payment) => {
        const invoice = payment.invoiceId || {};
        const student = invoice.studentId || {};
        const recordedBy = payment.recordedBy || {};
        return {
            'Payment ID': payment._id || '',
            'Receipt Number': payment.receiptNumber || '',
            Student: [student.firstName, student.lastName].filter(Boolean).join(' '),
            'Admission Number': student.admissionNumber || '',
            Amount: payment.amount || 0,
            Method: payment.method || '',
            Reference: payment.reference || '',
            Status: payment.status || '',
            'Recorded By': recordedBy.name || [recordedBy.firstName, recordedBy.lastName].filter(Boolean).join(' ') || recordedBy.email || '',
            Date: formatDate(payment.createdAt)
        };
    });

    return toCSV(headers, rows);
};

exports.generateDebtorsCSV = (debtors) => {
    const headers = [
        'Student',
        'Admission Number',
        'Branch',
        'Class',
        'Balance',
        'Oldest Due Date',
        'Open Invoice Count'
    ];

    const rows = (debtors || []).map((debtor) => ({
        Student: debtor.studentName || '',
        'Admission Number': debtor.admissionNumber || '',
        Branch: debtor.branchName || '',
        Class: debtor.className || '',
        Balance: debtor.balance || 0,
        'Oldest Due Date': formatDate(debtor.oldestDueDate),
        'Open Invoice Count': debtor.count || 0
    }));

    return toCSV(headers, rows);
};

exports.generateClassResultsCSV = ({ categories = [], rows = [] }) => {
    const categoryHeaders = categories.map((category) => category.categoryName || category.name || 'Assessment');
    const headers = ['Admission Number', 'Student Name', ...categoryHeaders, 'Total', 'Max Total', 'Percentage', 'Status', 'Rank'];
    const records = rows.map((row) => {
        const record = {
            'Admission Number': row.student?.admissionNumber || '',
            'Student Name': [row.student?.firstName, row.student?.lastName].filter(Boolean).join(' '),
            Total: row.totalMarks || 0,
            'Max Total': row.totalMax || 0,
            Percentage: row.percentage || 0,
            Status: row.status || '',
            Rank: row.rank || ''
        };
        categoryHeaders.forEach((header, index) => {
            const marks = row.categoryMarks?.[index];
            record[header] = marks?.marksObtained ?? '';
        });
        return record;
    });

    return toCSV(headers, records);
};
