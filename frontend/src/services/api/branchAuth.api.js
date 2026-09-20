import http from './http';

export const branchLogin = async (email, password) => {
    const response = await http.post('/branch/auth/login', { 
        email, 
        password,
        requiredRoles: ['branch_admin', 'teacher', 'registrar', 'cashier']
    });
    return response.data;
};

// Optional: Get current user details if needed separately
export const getMe = async () => {
    const response = await http.get('/branch/auth/me');
    return response.data;
};
