'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: { account: string; password: string }) => Promise<void>;
  register: (payload: { username: string; password: string; email?: string | null; nickname?: string | null }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (payload: { nickname?: string | null; email?: string | null; avatarUrl?: string | null }) => Promise<void>;
  changePassword: (payload: { oldPassword: string; newPassword: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (credentials: { account: string; password: string }) => {
    const res = await api.login(credentials);
    setUser(res.user);
  }, []);

  const register = useCallback(async (payload: { username: string; password: string; email?: string | null; nickname?: string | null }) => {
    const res = await api.register(payload);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }, []);

  const updateProfile = useCallback(async (payload: { nickname?: string | null; email?: string | null; avatarUrl?: string | null }) => {
    const res = await api.updateProfile(payload);
    setUser(res.user);
  }, []);

  const changePassword = useCallback(async (payload: { oldPassword: string; newPassword: string }) => {
    await api.changePassword(payload);
    await refreshUser();
  }, [refreshUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
