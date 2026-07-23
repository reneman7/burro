import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

const STORAGE_KEY = 'burro.token';

// sessionStorage (no localStorage): cada pestaña del navegador debe tener su
// propia sesión. Con localStorage, dos pestañas del mismo navegador logueadas
// como usuarios distintos terminan compartiendo el último token guardado,
// haciendo que una pestaña actúe silenciosamente como el usuario equivocado
// (así se veía como "el motor juega la carta equivocada").

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .me(token)
      .then(setUser)
      .catch(() => {
        setToken(null);
        sessionStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => setLoading(false));
  }, [token]);

  function handleAuthResult(result) {
    setToken(result.token);
    setUser(result.user);
    sessionStorage.setItem(STORAGE_KEY, result.token);
  }

  async function login(username, password) {
    const result = await api.login(username, password);
    handleAuthResult(result);
  }

  async function register(username, password) {
    const result = await api.register(username, password);
    handleAuthResult(result);
  }

  function logout() {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  async function refreshUser() {
    if (!token) return;
    const fresh = await api.me(token);
    setUser(fresh);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
