'use client';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, CardActions, Grid, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Alert, Snackbar, Chip, IconButton, Tooltip, Skeleton, Paper,
  Switch, FormControlLabel, Divider,
} from '@mui/material';









import { useLang } from '../context/AppContext.jsx';
import { getDoctors, createDoctor, updateDoctor, deleteDoctor, syncFromGoogle } from '../services/api.js';
import { AccessTimeRoundedIcon, AddRoundedIcon, CalendarTodayRoundedIcon, CoffeeRoundedIcon, DeleteRoundedIcon, EditRoundedIcon, EmailRoundedIcon, PersonRoundedIcon, PhoneRoundedIcon, SyncRoundedIcon } from '../components/icons';


// ─── Constants ────────────────────────────────────────────────────────────────
const GRADIENTS = [
  'linear-gradient(135deg,#0A6EBD,#14B8A6)',
  'linear-gradient(135deg,#8B5CF6,#EC4899)',
  'linear-gradient(135deg,#F59E0B,#EF4444)',
  'linear-gradient(135deg,#10B981,#0A6EBD)',
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#EC4899,#F59E0B)',
];

const DAYS_EN  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_AR  = ['أحد','اثن','ثلا','أرب','خمس','جمع','سبت'];
const DAYS_FULL_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_FULL_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

const EMPTY_FORM = {
  nameEn: '', nameAr: '',
  specialtyEn: '', specialtyAr: '',
  phone: '', email: '', calendarId: '',
  workingHours: { start: '09:00', end: '17:00' },
  workingDays: [0, 1, 2, 3, 4],   // Sun–Thu default
  slotDuration: 30,
  breakTime: { enabled: false, start: '13:00', end: '14:00', duration: 60 },
};

// ─── Skeleton card ────────────────────────────────────────────────────────────
function DoctorCardSkeleton() {
  return (
    <Card elevation={0}>
      <CardContent>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Skeleton variant="circular" width={56} height={56} />
          <Box flex={1}>
            <Skeleton width="60%" height={20} />
            <Skeleton width="40%" height={16} sx={{ mt: 0.5 }} />
          </Box>
        </Box>
        {[1,2,3].map(i => <Skeleton key={i} width="80%" height={16} sx={{ mb: 0.75 }} />)}
        <Skeleton width={60} height={24} sx={{ mt: 1, borderRadius: 2 }} />
      </CardContent>
    </Card>
  );
}

// ─── Section header inside dialog ─────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', mt: 0.5 }}>
      {children}
    </Typography>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DoctorsPage() {
  const { isRTL } = useLang();
  const [doctors, setDoctors]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [syncing, setSyncing]   = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const n  = (en, ar) => isRTL ? ar : en;
  const notify = (en, ar, severity = 'success') =>
    setSnackbar({ open: true, message: isRTL ? ar : en, severity });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getDoctors(); setDoctors(r.data); }
    catch { notify('Failed to load', 'فشل التحميل', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Open dialog ──────────────────────────────────────────────────────────────
  const handleOpen = (doc = null) => {
    if (doc) {
      setForm({
        nameEn:      doc.nameEn      || doc.name || '',
        nameAr:      doc.nameAr      || '',
        specialtyEn: doc.specialtyEn || doc.specialty || '',
        specialtyAr: doc.specialtyAr || '',
        phone:       doc.phone       || '',
        email:       doc.email       || '',
        calendarId:  doc.calendarId  || '',
        workingHours: doc.workingHours || { start: '09:00', end: '17:00' },
        workingDays:  doc.workingDays  || [0,1,2,3,4],
        slotDuration: doc.slotDuration || 30,
        breakTime:    doc.breakTime    || { enabled: false, start: '13:00', end: '14:00', duration: 60 },
      });
      setEditId(doc.id);
    } else {
      setForm(EMPTY_FORM);
      setEditId(null);
    }
    setOpen(true);
  };

  const toggleDay = (idx) => {
    setForm(f => ({
      ...f,
      workingDays: f.workingDays.includes(idx)
        ? f.workingDays.filter(d => d !== idx)
        : [...f.workingDays, idx].sort(),
    }));
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nameEn || !form.nameAr) return notify(
      'Name required in English and Arabic',
      'الاسم مطلوب بالعربية والإنجليزية', 'error'
    );
    if (!form.calendarId) return notify(
      'Google Calendar ID is required',
      'معرف تقويم جوجل مطلوب', 'error'
    );
    setSaving(true);
    try {
      if (editId) await updateDoctor(editId, form);
      else        await createDoctor(form);
      notify('Doctor saved', 'تم حفظ الطبيب');
      setOpen(false);
      load();
    } catch (err) {
      notify(err.response?.data?.message || 'Save failed',
             err.response?.data?.message || 'فشل الحفظ', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(isRTL ? 'هل أنت متأكد؟' : 'Deactivate this doctor?')) return;
    try { await deleteDoctor(id); notify('Doctor deactivated', 'تم إيقاف تفعيل الطبيب'); load(); }
    catch { notify('Failed', 'فشل', 'error'); }
  };

  const handleSync = async (id, name) => {
    setSyncing(id);
    try {
      const r = await syncFromGoogle(id);
      notify(`Synced: ${r.data.synced} events`, `تمت المزامنة: ${r.data.synced} أحداث`);
      load();
    } catch { notify('Sync failed', 'فشلت المزامنة', 'error'); }
    finally { setSyncing(null); }
  };

  // ── Card display helper: pick correct locale fields ──────────────────────────
  const docName      = d => isRTL ? (d.nameAr      || d.nameEn      || d.name)      : (d.nameEn      || d.name      || d.nameAr);
  const docSpecialty = d => isRTL ? (d.specialtyAr || d.specialtyEn || d.specialty) : (d.specialtyEn || d.specialty || d.specialtyAr);
  const DAYS_SHORT   = isRTL ? DAYS_AR : DAYS_EN;

  return (
    <Box>
      {/* Page header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}>
        <Box>
          <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">
            {isRTL ? 'الأطباء' : 'Doctors'}
          </Typography>
          <Typography color="text.secondary" fontSize={14} mt={0.5}>
            {isRTL
              ? `${doctors.length} طبيب مسجل`
              : `${doctors.length} registered doctor${doctors.length !== 1 ? 's' : ''}`}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => handleOpen()}
          sx={{ borderRadius: 2.5, px: 3, py: 1.2 }}
        >
          {isRTL ? 'إضافة طبيب' : 'Add Doctor'}
        </Button>
      </Box>

      {/* Cards grid */}
      <Grid container spacing={2.5}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Grid item xs={12} sm={6} lg={4} key={i}><DoctorCardSkeleton /></Grid>
            ))
          : doctors.length === 0
          ? (
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ textAlign: 'center', py: 10, border: '2px dashed rgba(148,163,184,0.3)', borderRadius: 3 }}>
                <PersonRoundedIcon sx={{ fontSize: 64, color: '#CBD5E1', mb: 2 }} />
                <Typography fontWeight={700} color="text.secondary">
                  {isRTL ? 'لا يوجد أطباء بعد' : 'No doctors yet'}
                </Typography>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => handleOpen()} sx={{ mt: 2 }}>
                  {isRTL ? 'إضافة طبيب' : 'Add Doctor'}
                </Button>
              </Paper>
            </Grid>
          )
          : doctors.map((d, i) => (
            <Grid item xs={12} sm={6} lg={4} key={d.id}>
              <Card elevation={0} sx={{
                transition: 'all 0.22s',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 14px 36px rgba(10,110,189,0.13)' },
              }}>
                {/* Colour band */}
                <Box sx={{ height: 6, background: GRADIENTS[i % GRADIENTS.length], borderRadius: '16px 16px 0 0' }} />

                <CardContent sx={{ pt: 2.5 }}>
                  {/* Avatar + name */}
                  <Box display="flex" alignItems="flex-start" gap={2} mb={2.5}>
                    <Avatar sx={{
                      width: 54, height: 54, fontSize: 21, fontWeight: 800,
                      background: GRADIENTS[i % GRADIENTS.length],
                      boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                      flexShrink: 0,
                    }}>
                      {docName(d).charAt(0).toUpperCase()}
                    </Avatar>
                    <Box flex={1} minWidth={0}>
                      <Typography fontWeight={700} fontSize={15} noWrap>
                        {isRTL ? `د. ${docName(d)}` : `Dr. ${docName(d)}`}
                      </Typography>
                      {/* Show both names if they differ */}
                      {d.nameEn && d.nameAr && d.nameEn !== d.nameAr && (
                        <Typography fontSize={11} color="text.disabled" noWrap>
                          {isRTL ? d.nameEn : d.nameAr}
                        </Typography>
                      )}
                      <Typography color="text.secondary" fontSize={12} fontWeight={500} mt={0.2}>
                        {docSpecialty(d) || (isRTL ? 'طب عام' : 'General Medicine')}
                      </Typography>
                    </Box>
                    <Chip
                      label={d.isActive ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                      color={d.isActive ? 'success' : 'default'}
                      size="small" sx={{ fontWeight: 700, fontSize: 10, flexShrink: 0 }}
                    />
                  </Box>

                  {/* Info rows */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.9 }}>
                    {d.phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PhoneRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography variant="body2" color="text.secondary" fontSize={13}>{d.phone}</Typography>
                      </Box>
                    )}
                    {d.email && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <EmailRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography variant="body2" color="text.secondary" fontSize={13} noWrap>{d.email}</Typography>
                      </Box>
                    )}
                    {/* Working hours */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AccessTimeRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary" fontSize={13}>
                        {d.workingHours?.start} – {d.workingHours?.end}
                      </Typography>
                      <Chip
                        label={`${d.slotDuration} ${isRTL ? 'د' : 'min'}`}
                        size="small"
                        sx={{ height: 18, fontSize: 10, bgcolor: '#F0F4F8', color: 'text.secondary' }}
                      />
                    </Box>
                    {/* Break time */}
                    {d.breakTime?.enabled && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CoffeeRoundedIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
                        <Typography variant="body2" color="text.secondary" fontSize={13}>
                          {isRTL ? 'استراحة:' : 'Break:'} {d.breakTime.start} – {d.breakTime.end}
                          <Chip
                            label={`${d.breakTime.duration} ${isRTL ? 'د' : 'min'}`}
                            size="small"
                            sx={{ ml: 0.5, height: 16, fontSize: 9, bgcolor: '#FEF3C7', color: '#92400E' }}
                          />
                        </Typography>
                      </Box>
                    )}
                    {/* Working days pills */}
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                      {DAYS_SHORT.map((day, idx) => {
                        const on = d.workingDays?.includes(idx);
                        return (
                          <Box key={idx} sx={{
                            px: 0.8, height: 22, borderRadius: 1,
                            display: 'flex', alignItems: 'center',
                            bgcolor: on ? '#0A6EBD18' : 'transparent',
                            border: `1px solid ${on ? '#0A6EBD40' : '#E2E8F0'}`,
                          }}>
                            <Typography sx={{ fontSize: 9, fontWeight: 700, color: on ? '#0A6EBD' : '#CBD5E1' }}>
                              {day}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                </CardContent>

                <Box sx={{ height: 1, bgcolor: 'rgba(148,163,184,0.12)', mx: 2 }} />

                <CardActions sx={{ px: 2, py: 1.2, gap: 0.5 }}>
                  <Tooltip title={isRTL ? 'تعديل' : 'Edit'}>
                    <IconButton size="small" onClick={() => handleOpen(d)}
                      sx={{ '&:hover': { bgcolor: '#EFF6FF', color: '#0A6EBD' } }}>
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={isRTL ? 'مزامنة من جوجل' : 'Sync from Google'}>
                    <IconButton size="small" onClick={() => handleSync(d.id, docName(d))} disabled={syncing === d.id}
                      sx={{ '&:hover': { bgcolor: '#F0FDF4', color: '#10B981' } }}>
                      <SyncRoundedIcon fontSize="small" sx={{
                        animation: syncing === d.id ? 'spin 1s linear infinite' : 'none',
                        '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
                      }}/>
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={isRTL ? 'إيقاف تفعيل' : 'Deactivate'}>
                    <IconButton size="small" onClick={() => handleDelete(d.id)}
                      sx={{ '&:hover': { bgcolor: '#FEF2F2', color: '#EF4444' } }}>
                      <DeleteRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {d.calendarId && (
                    <Tooltip title={isRTL ? 'فتح تقويم جوجل' : 'Open Google Calendar'} sx={{ ml: 'auto' }}>
                      <IconButton size="small" component="a"
                        href={`https://calendar.google.com/calendar/r?cid=${d.calendarId}`} target="_blank"
                        sx={{ ml: 'auto', '&:hover': { bgcolor: '#EFF6FF', color: '#0A6EBD' } }}>
                        <CalendarTodayRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))
        }
      </Grid>

      {/* ─── Add / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 18, pb: 1 }}>
          {editId
            ? (isRTL ? 'تعديل بيانات الطبيب' : 'Edit Doctor')
            : (isRTL ? 'إضافة طبيب جديد' : 'Add New Doctor')}
        </DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '14px !important' }}>

          {/* ── Name (bilingual) ── */}
          <SectionLabel>{isRTL ? 'الاسم' : 'Name'}</SectionLabel>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label={isRTL ? 'الاسم بالإنجليزية *' : 'Name in English *'}
              value={form.nameEn}
              onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
              placeholder="e.g. Ahmed Al-Rashidi"
              required
            />
            <TextField
              label={isRTL ? 'الاسم بالعربية *' : 'Name in Arabic *'}
              value={form.nameAr}
              onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
              placeholder="مثال: أحمد الراشدي"
              inputProps={{ dir: 'rtl' }}
              required
            />
          </Box>

          {/* ── Specialty (bilingual) ── */}
          <SectionLabel>{isRTL ? 'التخصص' : 'Specialty'}</SectionLabel>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label={isRTL ? 'التخصص بالإنجليزية' : 'Specialty in English'}
              value={form.specialtyEn}
              onChange={e => setForm(f => ({ ...f, specialtyEn: e.target.value }))}
              placeholder="e.g. Cardiology"
            />
            <TextField
              label={isRTL ? 'التخصص بالعربية' : 'Specialty in Arabic'}
              value={form.specialtyAr}
              onChange={e => setForm(f => ({ ...f, specialtyAr: e.target.value }))}
              placeholder="مثال: أمراض القلب"
              inputProps={{ dir: 'rtl' }}
            />
          </Box>

          {/* ── Contact ── */}
          <SectionLabel>{isRTL ? 'معلومات التواصل' : 'Contact'}</SectionLabel>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label={isRTL ? 'الهاتف' : 'Phone'}
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+966501234567"
            />
            <TextField
              label={isRTL ? 'البريد الإلكتروني' : 'Email'}
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </Box>

          {/* ── Google Calendar ── */}
          <TextField
            label={isRTL ? 'معرف تقويم جوجل *' : 'Google Calendar ID *'}
            value={form.calendarId}
            onChange={e => setForm(f => ({ ...f, calendarId: e.target.value }))}
            required
            helperText={isRTL ? 'مثال: primary أو doctor@example.com' : 'e.g. primary or doctor@example.com'}
          />

          <Divider sx={{ my: 0.5 }} />

          {/* ── Schedule ── */}
          <SectionLabel>{isRTL ? 'جدول العمل' : 'Work Schedule'}</SectionLabel>

          {/* Working hours + slot */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
            <TextField
              label={isRTL ? 'بداية الدوام' : 'Start Time'}
              type="time"
              value={form.workingHours.start}
              onChange={e => setForm(f => ({ ...f, workingHours: { ...f.workingHours, start: e.target.value } }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={isRTL ? 'نهاية الدوام' : 'End Time'}
              type="time"
              value={form.workingHours.end}
              onChange={e => setForm(f => ({ ...f, workingHours: { ...f.workingHours, end: e.target.value } }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={isRTL ? 'مدة الموعد (دقيقة)' : 'Slot Duration (min)'}
              type="number"
              value={form.slotDuration}
              onChange={e => setForm(f => ({ ...f, slotDuration: parseInt(e.target.value) || 30 }))}
              inputProps={{ min: 5, max: 120, step: 5 }}
            />
          </Box>

          {/* Working days visual picker */}
          <Box>
            <Typography fontSize={12} fontWeight={600} color="text.secondary" mb={1}>
              {isRTL ? 'أيام العمل (انقر لتفعيل/إلغاء):' : 'Working days (click to toggle):'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {DAYS_FULL_EN.map((day, idx) => {
                const on = form.workingDays.includes(idx);
                return (
                  <Box
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    sx={{
                      flex: 1, py: 1.2, borderRadius: 2, textAlign: 'center', cursor: 'pointer',
                      bgcolor:  on ? '#0A6EBD' : '#F8FAFC',
                      border: `2px solid ${on ? '#0A6EBD' : 'rgba(148,163,184,0.25)'}`,
                      transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                      '&:hover': { transform: 'translateY(-2px)', borderColor: '#0A6EBD' },
                    }}
                  >
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: on ? 'white' : '#94A3B8' }}>
                      {isRTL ? DAYS_AR[idx] : day.slice(0, 3)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Divider sx={{ my: 0.5 }} />

          {/* ── Break time ── */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={form.breakTime.enabled}
                  onChange={e => setForm(f => ({ ...f, breakTime: { ...f.breakTime, enabled: e.target.checked } }))}
                  color="warning"
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <CoffeeRoundedIcon sx={{ fontSize: 17, color: '#F59E0B' }}/>
                  <Typography fontWeight={700} fontSize={13}>
                    {isRTL ? 'تفعيل وقت الاستراحة' : 'Enable Break Time'}
                  </Typography>
                </Box>
              }
            />
            <Typography fontSize={11.5} color="text.secondary" mt={0.3} ml={0.5}>
              {isRTL
                ? 'مواعيد الاستراحة لن تكون متاحة للحجز'
                : 'Slots during break time will not be available for booking'}
            </Typography>
          </Box>

          {form.breakTime.enabled && (
            <Box sx={{
              p: 2, borderRadius: 2.5,
              bgcolor: '#FFFBEB', border: '1.5px solid #FCD34D50',
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2,
            }}>
              <TextField
                label={isRTL ? 'بداية الاستراحة' : 'Break Start'}
                type="time"
                value={form.breakTime.start}
                onChange={e => setForm(f => ({ ...f, breakTime: { ...f.breakTime, start: e.target.value } }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label={isRTL ? 'نهاية الاستراحة' : 'Break End'}
                type="time"
                value={form.breakTime.end}
                onChange={e => setForm(f => ({ ...f, breakTime: { ...f.breakTime, end: e.target.value } }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label={isRTL ? 'مدة الاستراحة (دقيقة)' : 'Break Duration (min)'}
                type="number"
                value={form.breakTime.duration}
                onChange={e => setForm(f => ({ ...f, breakTime: { ...f.breakTime, duration: parseInt(e.target.value) || 60 } }))}
                inputProps={{ min: 10, max: 240, step: 5 }}
                helperText={isRTL ? 'محسوبة تلقائياً من الوقتين' : 'Auto-calculated from times'}
              />
            </Box>
          )}

        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setOpen(false)}
            disabled={saving}
            variant="outlined"
            sx={{ borderRadius: 2 }}
          >
            {isRTL ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !form.nameEn || !form.nameAr || !form.calendarId}
            sx={{ borderRadius: 2, px: 3 }}
          >
            {saving ? (isRTL ? 'جارٍ الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: isRTL ? 'left' : 'right' }}
      >
        <Alert
          severity={snackbar.severity}
          sx={{ borderRadius: 2.5 }}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}


export async function getServerSideProps() {
  return { props: {} };
}
