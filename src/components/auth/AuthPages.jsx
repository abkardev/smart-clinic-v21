'use client';
import React, { useState, useMemo } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert, CircularProgress, Paper,
  MenuItem, Select, FormControl, InputLabel, InputAdornment, IconButton, LinearProgress,
} from '@mui/material';


import { useLang } from '../../context/AppContext.jsx';
import { authRegister, authForgotPassword, authResetPassword } from '../../services/api.js';
import LangToggle from '../LangToggle.jsx';
import { CheckCircleRoundedIcon, LocalHospitalRoundedIcon, RadioButtonUncheckedRoundedIcon, Visibility, VisibilityOff } from '../../components/icons';

// ─── Shared page shell ────────────────────────────────────────────────────────
function AuthShell({ children }) {
  const { isRTL } = useLang();
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
        <LangToggle />
      </Box>

      {/* Left brand panel */}
      <Box sx={{
        flex: 1, display: { xs: 'none', md: 'flex' },
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#0A6EBD 0%,#064A8B 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position:'absolute', width:400, height:400, borderRadius:'50%', bgcolor:'rgba(255,255,255,0.04)', top:-80, right:-80 }}/>
        <Box sx={{ position:'absolute', width:280, height:280, borderRadius:'50%', bgcolor:'rgba(255,255,255,0.06)', bottom:-60, left:-60 }}/>
        <Box textAlign="center" sx={{ zIndex:1, px:4 }}>
          <LocalHospitalRoundedIcon sx={{ fontSize:72, color:'white', mb:2 }}/>
          <Typography sx={{ color:'white', fontWeight:800, fontSize:32, letterSpacing:'-0.02em' }}>SmartClinic</Typography>
          <Typography sx={{ color:'rgba(255,255,255,0.7)', mt:1, fontSize:16 }}>
            {isRTL ? 'نظام إدارة العيادة الذكية' : 'Intelligent Clinic Management'}
          </Typography>
        </Box>
      </Box>

      {/* Right form panel */}
      <Box sx={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', bgcolor:'#F0F4F8', p:3, overflowY:'auto' }}>
        <Paper elevation={0} sx={{ width:'100%', maxWidth:480, p:4, borderRadius:3, boxShadow:'0 4px 28px rgba(0,0,0,0.09)' }}>
          {children}
        </Paper>
      </Box>
    </Box>
  );
}

// ─── Password strength logic ──────────────────────────────────────────────────
function usePasswordStrength(password) {
  return useMemo(() => {
    const checks = {
      length:    password.length >= 12,
      uppercase: /[A-Z]/.test(password),
      number:    /[0-9]/.test(password),
      special:   /[@#$%&*!^()\-_+=]/.test(password),
    };
    const passed = Object.values(checks).filter(Boolean).length;
    // 3 required (length + uppercase + number) → Good; add special → Strong
    const level =
      passed === 4 ? 4 :   // Strong  (all 4)
      passed === 3 ? 3 :   // Good    (any 3)
      passed === 2 ? 2 :   // Fair
      passed === 1 ? 1 :   // Weak
      0;
    const pct     = [0, 25, 50, 75, 100][level];
    const labels  = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const labelsAr= ['', 'ضعيفة', 'مقبولة', 'جيدة', 'قوية'];
    const colors  = ['#E2E8F0','#EF4444','#F59E0B','#0A6EBD','#10B981'];
    // minimum to allow submit: length + uppercase + number (level >= 3)
    const isStrong = level >= 3;
    return { checks, level, pct, label: labels[level], labelAr: labelsAr[level], color: colors[level], isStrong };
  }, [password]);
}

// ─── Single strength-rule row ─────────────────────────────────────────────────
function Rule({ ok, en, ar }) {
  const { isRTL } = useLang();
  return (
    <Box sx={{ display:'flex', alignItems:'center', gap:0.8,
      px:1.2, py:0.7, borderRadius:1.5,
      bgcolor: ok ? '#F0FDF4' : '#F8FAFC',
      border: `1px solid ${ok ? '#A7F3D0' : '#E2E8F0'}`,
      transition: 'all 0.2s',
    }}>
      {ok
        ? <CheckCircleRoundedIcon sx={{ fontSize:14, color:'#10B981', flexShrink:0 }}/>
        : <RadioButtonUncheckedRoundedIcon sx={{ fontSize:14, color:'#CBD5E1', flexShrink:0 }}/>
      }
      <Typography sx={{ fontSize:11.5, fontWeight: ok?700:400, color: ok?'#065F46':'#94A3B8', lineHeight:1.2 }}>
        {isRTL ? ar : en}
      </Typography>
    </Box>
  );
}

// ─── Password strength bar block ──────────────────────────────────────────────
function StrengthBlock({ password }) {
  const { isRTL } = useLang();
  const pw = usePasswordStrength(password);
  const isEmpty = password.length === 0;

  // Four segment bar
  const segments = [
    { threshold: 1, color: '#EF4444' },
    { threshold: 2, color: '#F59E0B' },
    { threshold: 3, color: '#0A6EBD' },
    { threshold: 4, color: '#10B981' },
  ];

  return (
    <Box sx={{ mt:1.5 }}>
      {/* Segment bar */}
      <Box sx={{ display:'flex', gap:0.5, mb:0.8 }}>
        {segments.map((seg, i) => (
          <Box key={i} sx={{
            flex:1, height:5, borderRadius:99,
            bgcolor: !isEmpty && pw.level >= seg.threshold ? seg.color : '#E2E8F0',
            transition:'background-color 0.3s ease',
          }}/>
        ))}
      </Box>

      {/* Label */}
      {!isEmpty && (
        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:1.2 }}>
          <Box sx={{ display:'flex', alignItems:'center', gap:0.6 }}>
            <Box sx={{ width:7, height:7, borderRadius:'50%', bgcolor: pw.color, transition:'background-color 0.3s' }}/>
            <Typography sx={{ fontSize:12, fontWeight:700, color: pw.color }}>
              {isRTL ? pw.labelAr : pw.label}
            </Typography>
          </Box>
          {pw.level === 4 && (
            <Typography sx={{ fontSize:11, fontWeight:700, color:'#10B981' }}>
              {isRTL ? '✓ قوية جداً' : '✓ Very strong'}
            </Typography>
          )}
        </Box>
      )}

      {/* Rules grid — always shown */}
      <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0.6 }}>
        <Rule ok={pw.checks.length}    en="At least 12 characters"  ar="12 حرفاً على الأقل"/>
        <Rule ok={pw.checks.uppercase} en="Uppercase letter (A–Z)"  ar="حرف كبير (A–Z)"/>
        <Rule ok={pw.checks.number}    en="Number (0–9)"             ar="رقم (0–9)"/>
        <Rule ok={pw.checks.special}   en="Symbol: @ # $ % & * !"   ar="رمز: @ # $ % & * !"/>
      </Box>

      {/* Hint about special char bonus */}
      {!isEmpty && !pw.checks.special && pw.level === 3 && (
        <Box sx={{ mt:1, px:1.2, py:0.8, borderRadius:1.5, bgcolor:'#EFF6FF', border:'1px solid #BFDBFE' }}>
          <Typography sx={{ fontSize:11, color:'#1D4ED8', fontWeight:600 }}>
            💡 {isRTL
              ? 'أضف رمزاً مثل @ # $ % لترقي كلمة المرور إلى "قوية جداً"'
              : 'Add a symbol like @ # $ % to upgrade to "Very strong"'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ─── Confirm password match indicator ────────────────────────────────────────
function MatchIndicator({ password, confirm }) {
  const { isRTL } = useLang();
  if (confirm.length === 0) return null;
  const match = password === confirm;
  return (
    <Box sx={{
      display:'flex', alignItems:'center', gap:0.8,
      mt:0.75, px:1.2, py:0.75, borderRadius:1.5,
      bgcolor: match ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${match ? '#A7F3D0' : '#FECACA'}`,
      transition:'all 0.2s',
    }}>
      {match
        ? <CheckCircleRoundedIcon sx={{ fontSize:15, color:'#10B981' }}/>
        : <RadioButtonUncheckedRoundedIcon sx={{ fontSize:15, color:'#EF4444' }}/>
      }
      <Typography sx={{ fontSize:12, fontWeight:700, color: match?'#065F46':'#B91C1C' }}>
        {match
          ? (isRTL ? '✓ كلمتا المرور متطابقتان' : '✓ Passwords match')
          : (isRTL ? '✗ كلمتا المرور غير متطابقتين' : '✗ Passwords do not match')
        }
      </Typography>
    </Box>
  );
}

// ─── Register ─────────────────────────────────────────────────────────────────
export function RegisterPage() {
  const { t, isRTL } = useLang();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'', role:'admin' });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);

  const pw = usePasswordStrength(form.password);
  const confirmMatch   = form.confirm.length > 0 && form.password === form.confirm;
  const confirmNoMatch = form.confirm.length > 0 && form.password !== form.confirm;
  const canSubmit = pw.isStrong && confirmMatch && form.name && form.email;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pw.isStrong) return setError(isRTL ? 'كلمة المرور لا تستوفي المتطلبات' : 'Password does not meet requirements');
    if (!confirmMatch) return setError(isRTL ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
    setError(''); setLoading(true);
    try {
      const res = await authRegister({ name: form.name, email: form.email, password: form.password, role: form.role });
      const msg = isRTL ? (res.data.messageAr || res.data.message) : res.data.message;
      setSuccess(msg);
      setTimeout(() => navigate('/login'), 3500);
    } catch (err) {
      const data = err.response?.data;
      const msg  = isRTL ? (data?.messageAr || data?.message) : data?.message;
      setError(msg || (isRTL ? 'فشل التسجيل' : 'Registration failed'));
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <Typography variant="h5" fontWeight={800} mb={0.5}>{t('register')}</Typography>
      <Typography color="text.secondary" mb={3} fontSize={13}>
        {isRTL
          ? 'أنشئ حسابك — سيتم مراجعته والموافقة عليه من قِبَل المشرف'
          : 'Create your account — it will be reviewed and approved by an administrator'}
      </Typography>

      {error   && <Alert severity="error"   sx={{ mb:2, borderRadius:2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb:2, borderRadius:2 }}>{success}</Alert>}

      <Box component="form" onSubmit={handleSubmit} sx={{ display:'flex', flexDirection:'column', gap:2 }}>

        {/* Name */}
        <TextField
          label={t('fullName')} required fullWidth
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />

        {/* Email */}
        <TextField
          label={t('email')} type="email" required fullWidth
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
        />

        {/* Role */}
        <FormControl fullWidth>
          <InputLabel>{t('role')}</InputLabel>
          <Select value={form.role} label={t('role')} onChange={e => setForm({ ...form, role: e.target.value })}>
            <MenuItem value="admin">{isRTL ? 'مشرف' : 'Admin'}</MenuItem>
            <MenuItem value="superadmin">{isRTL ? 'مشرف عام' : 'Super Admin'}</MenuItem>
          </Select>
        </FormControl>

        {/* ── Password ── */}
        <Box sx={{ p:2, borderRadius:2.5, border:'1.5px solid', borderColor: form.password.length===0 ? '#E2E8F0' : pw.isStrong ? '#A7F3D0' : '#FED7AA', bgcolor: form.password.length===0 ? '#FAFAFA' : pw.isStrong ? '#F0FDF4' : '#FFFBEB', transition:'all 0.25s' }}>
          <TextField
            label={t('password')} required fullWidth
            type={showPass ? 'text' : 'password'}
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            sx={{ '& .MuiOutlinedInput-notchedOutline':{ border:'none' }, '& .MuiOutlinedInput-root':{ bgcolor:'white', borderRadius:2 } }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPass(!showPass)} edge="end">
                    {showPass ? <VisibilityOff fontSize="small"/> : <Visibility fontSize="small"/>}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {/* Strength block — always visible once card is mounted */}
          <StrengthBlock password={form.password} />
        </Box>

        {/* ── Confirm Password ── */}
        <Box sx={{ p:2, borderRadius:2.5, border:'1.5px solid', borderColor: form.confirm.length===0 ? '#E2E8F0' : confirmMatch ? '#A7F3D0' : '#FECACA', bgcolor: form.confirm.length===0 ? '#FAFAFA' : confirmMatch ? '#F0FDF4' : '#FEF2F2', transition:'all 0.25s' }}>
          <TextField
            label={t('confirmPassword')} required fullWidth
            type={showConf ? 'text' : 'password'}
            value={form.confirm}
            onChange={e => setForm({ ...form, confirm: e.target.value })}
            sx={{ '& .MuiOutlinedInput-notchedOutline':{ border:'none' }, '& .MuiOutlinedInput-root':{ bgcolor:'white', borderRadius:2 } }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowConf(!showConf)} edge="end">
                    {showConf ? <VisibilityOff fontSize="small"/> : <Visibility fontSize="small"/>}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <MatchIndicator password={form.password} confirm={form.confirm} />
        </Box>

        {/* Submit */}
        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          disabled={loading || !canSubmit}
          sx={{ py:1.5, fontWeight:700, borderRadius:2.5, mt:0.5,
            bgcolor: canSubmit ? '#0A6EBD' : undefined,
            '&.Mui-disabled':{ bgcolor:'#E2E8F0', color:'#94A3B8' },
          }}
        >
          {loading
            ? <CircularProgress size={22} color="inherit"/>
            : (isRTL ? 'إنشاء الحساب' : 'Create Account')
          }
        </Button>

      </Box>

      <Typography textAlign="center" mt={3} fontSize={13} color="text.secondary">
        {t('haveAccount')}{' '}
        <Link to="/login" style={{ color:'#0A6EBD', fontWeight:700, textDecoration:'none' }}>
          {t('login')}
        </Link>
      </Typography>
    </AuthShell>
  );
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
export function ForgotPasswordPage() {
  const { t, isRTL } = useLang();
  const [email, setEmail]     = useState('');
  const [message, setMessage] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await authForgotPassword({ email });
      setMessage(t('resetLinkSent'));
    } catch (err) {
      setError(err.response?.data?.message || (isRTL ? 'فشل الإرسال' : 'Failed'));
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <Typography variant="h5" fontWeight={800} mb={0.5}>{t('forgotPassword')}</Typography>
      <Typography color="text.secondary" mb={3} fontSize={13}>
        {isRTL ? 'سنرسل لك رابط إعادة تعيين كلمة المرور' : 'We\'ll send you a password reset link'}
      </Typography>
      {message && <Alert severity="success" sx={{ mb:2, borderRadius:2 }}>{message}</Alert>}
      {error   && <Alert severity="error"   sx={{ mb:2, borderRadius:2 }}>{error}</Alert>}
      <Box component="form" onSubmit={handleSubmit} sx={{ display:'flex', flexDirection:'column', gap:2 }}>
        <TextField label={t('email')} type="email" required fullWidth value={email} onChange={e => setEmail(e.target.value)}/>
        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ py:1.5, fontWeight:700, borderRadius:2.5 }}>
          {loading ? <CircularProgress size={22} color="inherit"/> : t('sendResetLink')}
        </Button>
      </Box>
      <Typography textAlign="center" mt={3} fontSize={13}>
        <Link to="/login" style={{ color:'#0A6EBD', fontWeight:700, textDecoration:'none' }}>
          {t('backToLogin')}
        </Link>
      </Typography>
    </AuthShell>
  );
}

// ─── Reset Password ───────────────────────────────────────────────────────────
export function ResetPasswordPage() {
  const { t, isRTL } = useLang();
  const { token }   = useParams();
  const navigate    = useNavigate();
  const [form, setForm]   = useState({ password:'', confirm:'' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);

  const pw           = usePasswordStrength(form.password);
  const confirmMatch = form.confirm.length > 0 && form.password === form.confirm;
  const canSubmit    = pw.isStrong && confirmMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pw.isStrong) return setError(isRTL ? 'كلمة المرور لا تستوفي المتطلبات' : 'Password does not meet requirements');
    if (!confirmMatch) return setError(t('passwordMismatch'));
    setError(''); setLoading(true);
    try {
      await authResetPassword(token, { password: form.password });
      alert(t('passwordUpdated'));
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || (isRTL ? 'فشل إعادة التعيين' : 'Reset failed'));
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <Typography variant="h5" fontWeight={800} mb={0.5}>{t('resetPassword')}</Typography>
      <Typography color="text.secondary" mb={3} fontSize={13}>
        {isRTL ? 'أدخل كلمة مرور جديدة وقوية' : 'Enter a new strong password below'}
      </Typography>
      {error && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{error}</Alert>}

      <Box component="form" onSubmit={handleSubmit} sx={{ display:'flex', flexDirection:'column', gap:2 }}>
        {/* Password with strength */}
        <Box sx={{ p:2, borderRadius:2.5, border:'1.5px solid', borderColor: form.password.length===0?'#E2E8F0': pw.isStrong?'#A7F3D0':'#FED7AA', bgcolor: form.password.length===0?'#FAFAFA': pw.isStrong?'#F0FDF4':'#FFFBEB', transition:'all 0.25s' }}>
          <TextField
            label={t('password')} required fullWidth
            type={showPass ? 'text' : 'password'}
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            sx={{ '& .MuiOutlinedInput-notchedOutline':{ border:'none' }, '& .MuiOutlinedInput-root':{ bgcolor:'white', borderRadius:2 } }}
            InputProps={{ endAdornment:<InputAdornment position="end"><IconButton size="small" onClick={()=>setShowPass(!showPass)}>{showPass?<VisibilityOff fontSize="small"/>:<Visibility fontSize="small"/>}</IconButton></InputAdornment> }}
          />
          <StrengthBlock password={form.password}/>
        </Box>

        {/* Confirm */}
        <Box sx={{ p:2, borderRadius:2.5, border:'1.5px solid', borderColor: form.confirm.length===0?'#E2E8F0': confirmMatch?'#A7F3D0':'#FECACA', bgcolor: form.confirm.length===0?'#FAFAFA': confirmMatch?'#F0FDF4':'#FEF2F2', transition:'all 0.25s' }}>
          <TextField
            label={t('confirmPassword')} required fullWidth
            type={showConf ? 'text' : 'password'}
            value={form.confirm}
            onChange={e => setForm({ ...form, confirm: e.target.value })}
            sx={{ '& .MuiOutlinedInput-notchedOutline':{ border:'none' }, '& .MuiOutlinedInput-root':{ bgcolor:'white', borderRadius:2 } }}
            InputProps={{ endAdornment:<InputAdornment position="end"><IconButton size="small" onClick={()=>setShowConf(!showConf)}>{showConf?<VisibilityOff fontSize="small"/>:<Visibility fontSize="small"/>}</IconButton></InputAdornment> }}
          />
          <MatchIndicator password={form.password} confirm={form.confirm}/>
        </Box>

        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading||!canSubmit}
          sx={{ py:1.5, fontWeight:700, borderRadius:2.5 }}>
          {loading ? <CircularProgress size={22} color="inherit"/> : t('resetPassword')}
        </Button>
      </Box>
    </AuthShell>
  );
}
