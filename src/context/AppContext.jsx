'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations } from './translations.js';

// ─── Language Context ─────────────────────────────────────────────────────────
const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('sc_lang') || 'en');
  const isRTL = lang === 'ar';

  // Memoized so consumers relying on `t` in dependency arrays don't see a new
  // function identity every render (was previously recreated on every render).
  const t = useCallback(
    (key) => translations[lang]?.[key] || translations['en']?.[key] || key,
    [lang]
  );

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'en' ? 'ar' : 'en';
      localStorage.setItem('sc_lang', next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dir  = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRTL]);

  // CRITICAL PERFORMANCE FIX: without useMemo, this object literal is a new
  // reference on every render of LangProvider, which forces all 15 consumers
  // across the app to re-render even when lang/isRTL haven't actually changed.
  const value = useMemo(
    () => ({ lang, t, isRTL, toggleLang }),
    [lang, t, isRTL, toggleLang]
  );

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);

// ─── Auth Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext();

// Works with both CRA (process.env.REACT_APP_*) and Vite (import.meta.env.VITE_*)
// Next.js: API routes are served from same origin at /api
const API_URL = '/api';

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(() => localStorage.getItem('sc_token'));
  const [loading, setLoading] = useState(true);

  const doLogout = useCallback(() => {
    localStorage.removeItem('sc_token');
    setToken(null);
    setUser(null);
  }, []);

  const fetchMe = useCallback(async (tok) => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        doLogout();
      }
    } catch {
      doLogout();
    } finally {
      setLoading(false);
    }
  }, [doLogout]);

  useEffect(() => {
    if (token) fetchMe(token);
    else       setLoading(false);
  }, [token, fetchMe]);

  const login = useCallback((newToken, userData) => {
    localStorage.setItem('sc_token', newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  // CRITICAL PERFORMANCE FIX: memoize the context value. Without this, every
  // render of AuthProvider (which wraps the whole app) creates a new object,
  // forcing all consumers to re-render even when user/token/loading are unchanged.
  const value = useMemo(
    () => ({ user, token, loading, login, logout: doLogout, isAuth: !!user }),
    [user, token, loading, login, doLogout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
