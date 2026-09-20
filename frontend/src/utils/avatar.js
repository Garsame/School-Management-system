import { API_ORIGIN } from '../services/api';

export const resolveAvatarUrl = (avatarUrl = '', cacheKey = '') => {
    const value = String(avatarUrl || '').trim();
    if (!value) return '';
    const resolved = value.startsWith('http://') || value.startsWith('https://')
        ? value
        : `${API_ORIGIN}${value.startsWith('/') ? value : `/${value}`}`;
    if (!cacheKey) return resolved;
    return `${resolved}${resolved.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}`;
};
