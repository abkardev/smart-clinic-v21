'use client';
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  ThemeProvider, createTheme, CssBaseline, Box, CircularProgress,
} from '@mui/material';
import { LangProvider, AuthProvider, useLang, useAuth } from '../context/AppContext.jsx';
import Layout from './Layout.jsx';
import LoginPage from './auth/LoginPage.jsx';
import { RegisterPage, ForgotPasswordPage, ResetPasswordPage } from './auth/AuthPages.jsx';

const DashboardPage   = lazy(() => import('../pages/DashboardPage.jsx'));
const BookingsPage    = lazy(() => import('../pages/BookingsPage.jsx'));
const DoctorsPage     = lazy(() => import('../pages/DoctorsPage.jsx'));
const CalendarPage    = lazy(() => import('../pages/CalendarPage.jsx'));
const SlotManagerPage = lazy(() => import('../pages/SlotManagerPage.jsx'));
const AnalyticsPage   = lazy(() => import('../pages/AnalyticsPage.jsx'));
const UsersPage       = lazy(() => import('../pages/UsersPage.jsx'));
const AuditLogsPage   = lazy(() => import('../pages/AuditLogsPage.jsx'));
const OffersPage      = lazy(() => import('../pages/OffersPage.jsx'));
const HolidaysPage    = lazy(() => import('../pages/HolidaysPage.jsx'));

function AuthLoader() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#F0F4F8' }}>
      <CircularProgress size={40} thickness={4} sx={{ color: '#0A6EBD' }} />
    </Box>
  );
}

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <CircularProgress size={36} thickness={4} sx={{ color: '#0A6EBD' }} />
    </Box>
  );
}

function RequireAuth({ children }) {
  const { isAuth, loading } = useAuth();
  if (loading) return <AuthLoader />;
  if (!isAuth) return <Navigate to="/login" replace />;
  return children;
}

function RedirectIfAuth({ children }) {
  const { isAuth, loading } = useAuth();
  if (loading) return <AuthLoader />;
  if (isAuth) return <Navigate to="/dashboard" replace />;
  return children;
}

function S(Component) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function ThemedApp() {
  const { isRTL } = useLang();

  const theme = createTheme({
    direction: isRTL ? 'rtl' : 'ltr',
    palette: {
      mode: 'light',
      primary:    { main: '#0A6EBD', light: '#E8F4FD', dark: '#064A8B' },
      secondary:  { main: '#14B8A6', light: '#CCFBF1', dark: '#0F7B6C' },
      error:      { main: '#EF4444' },
      warning:    { main: '#F59E0B' },
      success:    { main: '#10B981' },
      background: { default: '#F0F4F8', paper: '#FFFFFF' },
      text:       { primary: '#0F172A', secondary: '#64748B' },
    },
    typography: {
      fontFamily: isRTL
        ? '"Cairo","Tajawal",sans-serif'
        : '"DM Sans","Helvetica Neue",sans-serif',
      h4: { fontWeight: 800, letterSpacing: '-0.02em' },
      h5: { fontWeight: 800, letterSpacing: '-0.01em' },
      h6: { fontWeight: 700 },
      button: { fontWeight: 600 },
    },
    shape: { borderRadius: 14 },
    shadows: ['none', '0 1px 3px rgba(0,0,0,0.06)', '0 4px 6px rgba(0,0,0,0.05)',
      '0 10px 15px rgba(0,0,0,0.07)', '0 20px 25px rgba(0,0,0,0.08)', ...Array(20).fill('none')],
    components: {
      MuiCssBaseline: {
        styleOverrides: `
          * { box-sizing: border-box; }
          body { -webkit-font-smoothing: antialiased; }
          ::-webkit-scrollbar { width:6px; height:6px; }
          ::-webkit-scrollbar-track { background:#f1f5f9; }
          ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:99px; }
        `,
      },
      MuiCard:          { styleOverrides: { root: { borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(148,163,184,0.15)' } } },
      MuiButton:        { styleOverrides: { root: { borderRadius: 10, textTransform: 'none', fontWeight: 600 }, contained: { boxShadow: 'none', '&:hover': { boxShadow: '0 4px 12px rgba(10,110,189,0.25)' } } } },
      MuiChip:          { styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } } },
      MuiTextField:     { defaultProps: { size: 'small' } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10 } } },
      MuiPaper:         { styleOverrides: { root: { borderRadius: 16 } } },
      MuiDrawer:        { styleOverrides: { paper: { borderRadius: 0 } } },
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/login"          element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
          <Route path="/register"       element={<RedirectIfAuth><RegisterPage /></RedirectIfAuth>} />
          <Route path="/forgot-password" element={<RedirectIfAuth><ForgotPasswordPage /></RedirectIfAuth>} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"  element={S(DashboardPage)} />
            <Route path="analytics"  element={S(AnalyticsPage)} />
            <Route path="bookings"   element={S(BookingsPage)} />
            <Route path="doctors"    element={S(DoctorsPage)} />
            <Route path="calendar"   element={S(CalendarPage)} />
            <Route path="slots"      element={S(SlotManagerPage)} />
            <Route path="offers"     element={S(OffersPage)} />
            <Route path="holidays"   element={S(HolidaysPage)} />
            <Route path="users"      element={S(UsersPage)} />
            <Route path="audit-logs" element={S(AuditLogsPage)} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </LangProvider>
  );
}
