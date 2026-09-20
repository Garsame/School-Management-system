import { http } from './http';

export const loginRegistrar = async (email, password) => {
    // According to backend setup, we might re-use branch auth or a specific registrar login
    // Using the same branch auth endpoint which handles all branch users including registrar
    return await http.post('/branch/auth/login', { email, password });
};

export const getRegistrarProfile = async () => {
    return await http.get('/branch/auth/me');
};
