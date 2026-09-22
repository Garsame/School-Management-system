import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const PlatformGuard = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user || user.role !== 'platform_owner' || user.scope !== 'platform') {
    return <Navigate to="/platform/login" replace />;
  }

  return <Outlet />;
};

export const PublicGuard = () => {
    const { user, loading } = useAuth();
  
    if (loading) return null;
  
    if (user && user.role === 'platform_owner' && user.scope === 'platform') {
      return <Navigate to="/platform" replace />;
    }
  
    return <Outlet />;
};
