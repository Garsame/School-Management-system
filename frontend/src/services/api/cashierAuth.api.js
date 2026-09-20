import http from './http';

// Re-using branch login logic but exposing as cashier auth for clarity
// The backend likely uses a shared branch login endpoint for branch users (Cashier, Registrar, Teacher)
// Endpoint: /api/branch/auth/login (as established in previous steps)
export const apiCashierLogin = async (email, password) => {
    const response = await http.post('/branch/auth/login', { email, password });
    return response.data;
};

export const getCashierProfile = async () => {
    const response = await http.get('/branch/auth/me'); 
    return response.data;
};
