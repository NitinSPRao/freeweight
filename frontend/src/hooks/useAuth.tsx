import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authApi, LoginRequest, SignupRequest, User } from '../api/endpoints';
import { onUnauthorized } from '../api/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
    });

    return unsubscribe;
  }, []);

  const loadUser = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        const response = await authApi.me();
        setUser(response.data);
      }
    } catch {
      await SecureStore.deleteItemAsync('auth_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (data: LoginRequest) => {
    const tokenRes = await authApi.login(data);
    await SecureStore.setItemAsync('auth_token', tokenRes.data.access_token);
    const meRes = await authApi.me();
    setUser(meRes.data);
  };

  const signup = async (data: SignupRequest) => {
    const tokenRes = await authApi.signup(data);
    await SecureStore.setItemAsync('auth_token', tokenRes.data.access_token);
    const meRes = await authApi.me();
    setUser(meRes.data);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('auth_token');
    setUser(null);
  };

  const refreshUser = async () => {
    const meRes = await authApi.me();
    setUser(meRes.data);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
