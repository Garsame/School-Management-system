import http from './http';

export const apiTeacherLogin = async (email, password) => {
    const response = await http.post('/auth/login', { email, password });
    return response.data;
};
