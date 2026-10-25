import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { ApiError } from '../services/api';

const AuthContext = createContext(null);

const STORAGE_KEY_TOKEN = 'fwms_auth_token';
const STORAGE_KEY_USER = 'fwms_auth_user';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_TOKEN) || null;
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY_USER);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);

  // Sync token and user to sessionStorage
  const saveSession = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    try {
      if (newToken) {
        sessionStorage.setItem(STORAGE_KEY_TOKEN, newToken);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_TOKEN);
      }

      if (newUser) {
        sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
      } else {
        sessionStorage.removeItem(STORAGE_KEY_USER);
      }
    } catch {
      // Ignore sessionStorage access errors (e.g. private browsing storage quota)
    }
  }, []);

  const logout = useCallback(() => {
    saveSession(null, null);
  }, [saveSession]);

  // Validate session and refresh DB-backed user profile on mount
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await api.auth.getMe(token);
        if (isMounted && data?.user) {
          setUser(data.user);
          try {
            sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
          } catch {}
        }
      } catch (err) {
        // If token is expired or user is deactivated, safely log out
        if (isMounted) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            logout();
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [token, logout]);

  // Login handler
  const login = async (email, password) => {
    const response = await api.auth.login({ email, password });
    if (response?.token && response?.user) {
      saveSession(response.token, response.user);
    }
    return response;
  };

  // Register handler
  const register = async (userData) => {
    const response = await api.auth.register(userData);
    if (response?.token && response?.user) {
      saveSession(response.token, response.user);
    }
    return response;
  };

  // Refresh profile
  const refreshUser = async () => {
    if (!token) return null;
    try {
      const data = await api.auth.getMe(token);
      if (data?.user) {
        setUser(data.user);
        sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
        return data.user;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
      throw err;
    }
  };

  const isAuthenticated = Boolean(token && user);
  const isActive = Boolean(user && user.status === 'ACTIVE');
  const isPending = Boolean(user && user.status === 'PENDING');
  const isSuspended = Boolean(user && user.status === 'SUSPENDED');

  const value = {
    token,
    user,
    loading,
    isAuthenticated,
    isActive,
    isPending,
    isSuspended,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
