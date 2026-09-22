import http from './http';

// --- Invoices ---
export const searchInvoices = async (params) => {
    const query = new URLSearchParams(params).toString();
    const response = await http.get(`/cashier/invoices/search?${query}`);
    return response.data;
};

export const getInvoiceById = async (id) => {
    const response = await http.get(`/cashier/invoices/${id}`);
    return response.data;
};

// --- Payments ---
export const createPayment = async (data) => {
    const response = await http.post('/cashier/payments', data);
    return response.data;
};

export const getPayments = async (params) => {
    const query = new URLSearchParams(params).toString();
    const response = await http.get(`/cashier/payments?${query}`);
    return response.data;
};

export const getDayCloseSummary = async (params) => {
    const query = new URLSearchParams(params).toString();
    const response = await http.get(`/cashier/day-close?${query}`);
    return response.data;
};

export const exportDayCloseCsv = async (params) => {
    const response = await http.get('/cashier/day-close/export.csv', {
        params,
        responseType: 'blob'
    });
    return response.data;
};

export const reversePayment = async (id, reason) => {
    const response = await http.post(`/cashier/payments/${id}/reverse`, { reason });
    return response.data;
};

// --- Receipts ---
export const getReceipt = async (paymentId) => {
    const response = await http.get(`/cashier/receipts/${paymentId}`);
    return response.data;
};

export const getDashboardStats = async () => {
    const response = await http.get('/cashier/dashboard/stats');
    return response.data;
};

// --- Student accounts: pay for a student, oldest month first ---
export const searchStudentAccounts = async (q) => {
    const response = await http.get('/cashier/students/search', { params: { q } });
    return response.data;
};

export const getStudentAccount = async (studentId) => {
    const response = await http.get(`/cashier/students/${studentId}/account`);
    return response.data;
};

export const createStudentPayment = async (data) => {
    const response = await http.post('/cashier/payments/student', data);
    return response.data;
};
