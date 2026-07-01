'use client';
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert, CircularProgress,
  Paper, InputAdornment, IconButton,
} from '@mui/material';
import { useLang, useAuth } from '../../context/AppContext.jsx';
import { authLogin } from '../../services/api.js';
import LangToggle from '../LangToggle.jsx';
import { EmailIcon, LocalHospitalIcon, LockIcon, Visibility, VisibilityOff } from '../../components/icons';

export default function LoginPage() {
  const { t, isRTL } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authLogin(form);
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      const data = err.response?.data;
      // Backend returns both message (EN) and messageAr (AR) — pick based on UI language
      const msg = isRTL ? (data?.messageAr || data?.message) : data?.message;
      setError(msg || (isRTL ? 'فشل تسجيل الدخول' : 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={styles.root}>
      <Box sx={styles.langBar}><LangToggle /></Box>
      <Box sx={styles.leftPanel}>
        <Box sx={styles.branding}>
          <LocalHospitalIcon sx={{ fontSize: 64, color: 'white', mb: 2 }} />
          <Typography variant="h3" color="white" fontWeight={800} fontFamily="'Playfair Display', serif">SmartClinic</Typography>
          <Typography color="rgba(255,255,255,0.8)" variant="h6" mt={1}>
            {isRTL ? 'نظام إدارة العيادة الذكية' : 'Intelligent Clinic Management'}
          </Typography>
        </Box>
      </Box>

      <Box sx={styles.rightPanel}>
        <Paper elevation={0} sx={styles.formCard}>
          <Typography variant="h5" fontWeight={700} mb={0.5}>{t('login')}</Typography>
          <Typography color="text.secondary" mb={3} variant="body2">
            {isRTL ? 'أدخل بياناتك للدخول إلى لوحة التحكم' : 'Enter your credentials to access the portal'}
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label={t('email')} type="email" required fullWidth
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" color="action" /></InputAdornment> }}
            />
            <TextField
              label={t('password')} required fullWidth
              type={showPass ? 'text' : 'password'}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              InputProps={{
                startAdornment: <InputAdornment position="start"><LockIcon fontSize="small" color="action" /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPass(!showPass)}>
                      {showPass ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ textAlign: isRTL ? 'left' : 'right' }}>
              <Link to="/forgot-password" style={{ color: '#1a73e8', fontSize: 13, textDecoration: 'none' }}>
                {t('forgotPassword')}
              </Link>
            </Box>
            <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}
              sx={{ py: 1.5, fontWeight: 700, fontSize: 15, borderRadius: 2 }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : t('signIn')}
            </Button>
          </Box>

          <Typography textAlign="center" mt={3} variant="body2" color="text.secondary">
            {t('dontHaveAccount')}{' '}
            <Link to="/register" style={{ color: '#1a73e8', fontWeight: 600, textDecoration: 'none' }}>{t('register')}</Link>
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}

const styles = {
  root: { display: 'flex', minHeight: '100vh', position: 'relative' },
  langBar: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  leftPanel: {
    flex: 1, display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
    position: 'relative', overflow: 'hidden',
    '&::before': { content: '""', position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', top: -100, right: -100 },
    '&::after': { content: '""', position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', bottom: -80, left: -80 },
  },
  branding: { textAlign: 'center', zIndex: 1 },
  rightPanel: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafd', p: 3 },
  formCard: { width: '100%', maxWidth: 420, p: 4, borderRadius: 3, bgcolor: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
};
