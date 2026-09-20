import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const normalizeRole = (role = '') => String(role).toUpperCase();
const normalizeScope = (scope = '') => String(scope).toLowerCase();

export const hasRole = (user, expectedRole) => {
  if (!user) return false;
  return normalizeRole(user.role) === normalizeRole(expectedRole);
};

export const hasScope = (user, expectedScope = 'branch') => {
  if (!user) return false;
  return normalizeScope(user.scope) === normalizeScope(expectedScope);
};

export const ProtectedRoute = ({ role, scope = 'branch', redirectTo, children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return React.createElement(
      'div',
      { className: 'flex min-h-screen items-center justify-center bg-slate-50' },
      React.createElement('div', {
        className: 'h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[var(--primary)]',
      })
    );
  }

  if (!user) return React.createElement(Navigate, { to: redirectTo, replace: true });
  if (role && !hasRole(user, role)) return React.createElement(Navigate, { to: redirectTo, replace: true });
  if (scope && !hasScope(user, scope)) return React.createElement(Navigate, { to: redirectTo, replace: true });

  if (children) return children;
  return React.createElement(Outlet);
};
