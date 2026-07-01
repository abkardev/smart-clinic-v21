'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Paper, Grid, TextField, Select, MenuItem,
  FormControl, InputLabel, Snackbar, Alert, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip,
} from '@mui/material';




import { useLang } from '../context/AppContext.jsx';
import { getHolidays, createHoliday, deleteHoliday } from '../services/api.js';
import { AddRoundedIcon, CalendarTodayRoundedIcon, DeleteRoundedIcon, EventBusyRoundedIcon, InfoRoundedIcon, RepeatRoundedIcon } from '../components/icons';


const DAY_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const DAY_COLORS = ['#6366F1','#0A6EBD','#14B8A6','#10B981','#F59E0B','#EF4444','#8B5CF6'];

const EMPTY = { type: 'weekly', dayOfWeek: 5, date: '', nameEn: '', nameAr: '' };

export default function HolidaysPage() {
  const { isRTL } = useLang();
  const [holidays, setHolidays] = useState([]);
  const [open, setOpen]         = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const notify = (en, ar, severity = 'success') =>
    setSnackbar({ open: true, message: isRTL ? ar : en, severity });

  const load = async () => {
    try { const r = await getHolidays(); setHolidays(r.data); } catch {}
  };

  useEffect(() => { load(); }, []);

  const weeklyHolidays = holidays.filter(h => h.type === 'weekly');
  const dateHolidays   = holidays.filter(h => h.type === 'date');

  const handleSave = async () => {
    if (form.type === 'weekly' && form.dayOfWeek === undefined) return;
    if (form.type === 'date'   && !form.date) return;
    setSaving(true);
    try {
      await createHoliday(form);
      notify('Holiday added', 'تم إضافة العطلة');
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      notify(err.response?.data?.message || 'Error', err.response?.data?.message || 'خطأ', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm(isRTL ? 'هل أنت متأكد من الحذف؟' : 'Delete this holiday?');
    if (!confirmed) return;
    try {
      await deleteHoliday(id);
      notify('Holiday deleted', 'تم حذف العطلة');
      load();
    } catch {
      notify('Delete failed', 'فشل الحذف', 'error');
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">
            {isRTL ? 'إدارة العطلات والإجازات' : 'Holidays & Days Off'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
            <InfoRoundedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
            <Typography color="text.secondary" fontSize={13}>
              {isRTL
                ? 'الأيام المحظورة أسبوعياً تتكرر تلقائياً لكل الأسبوع طوال العام — لا يمكن للمرضى الحجز فيها'
                : 'Weekly days off repeat automatically every week all year — patients cannot book on these days'}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => { setForm(EMPTY); setOpen(true); }}
          sx={{ borderRadius: 2.5, px: 3, py: 1.2 }}
        >
          {isRTL ? 'إضافة عطلة' : 'Add Holiday'}
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* ── Weekly recurring column ── */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)', height: '100%' }}>
            <Box display="flex" alignItems="center" gap={1} mb={2.5}>
              <RepeatRoundedIcon sx={{ color: '#0A6EBD', fontSize: 20 }} />
              <Typography fontWeight={700} fontSize={15}>
                {isRTL ? 'أيام الراحة الأسبوعية' : 'Weekly Days Off'}
              </Typography>
              <Chip
                label={isRTL ? 'يتكرر كل أسبوع' : 'Repeats every week'}
                size="small"
                sx={{ bgcolor: '#EFF6FF', color: '#0A6EBD', fontWeight: 700, fontSize: 10, ml: 0.5 }}
              />
            </Box>

            {/* Visual 7-day grid — always shown */}
            <Box sx={{ display: 'flex', gap: 0.75, mb: 2.5 }}>
              {DAY_EN.map((day, idx) => {
                const isOff = weeklyHolidays.some(h => h.dayOfWeek === idx);
                const color = DAY_COLORS[idx];
                return (
                  <Box
                    key={idx}
                    sx={{
                      flex: 1, py: 1.5, borderRadius: 2, textAlign: 'center',
                      bgcolor:  isOff ? `${color}18` : '#F8FAFC',
                      border: `2px solid ${isOff ? color : 'rgba(148,163,184,0.2)'}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: isOff ? color : '#94A3B8' }}>
                      {isRTL ? DAY_AR[idx].slice(0, 3) : day.slice(0, 3)}
                    </Typography>
                    {isOff && (
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, mx: 'auto', mt: 0.5 }} />
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* List of set weekly holidays */}
            {weeklyHolidays.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <EventBusyRoundedIcon sx={{ fontSize: 44, color: '#CBD5E1', mb: 1 }} />
                <Typography color="text.disabled" fontSize={13}>
                  {isRTL ? 'لا توجد أيام راحة أسبوعية بعد' : 'No weekly days off set yet'}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {weeklyHolidays.map(h => {
                  const color = DAY_COLORS[h.dayOfWeek];
                  return (
                    <Box
                      key={h.id}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        px: 2, py: 1.2, borderRadius: 2.5,
                        bgcolor: `${color}12`,
                        border: `1.5px solid ${color}35`,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                        <Box>
                          <Typography fontWeight={700} fontSize={13} sx={{ color }}>
                            {isRTL ? DAY_AR[h.dayOfWeek] : DAY_EN[h.dayOfWeek]}
                          </Typography>
                          {(h.nameAr || h.nameEn) && (
                            <Typography fontSize={11} color="text.secondary">
                              {isRTL ? h.nameAr : h.nameEn}
                            </Typography>
                          )}
                        </Box>
                        <Chip
                          label={isRTL ? '🔁 كل أسبوع' : '🔁 Every week'}
                          size="small"
                          sx={{ fontSize: 10, fontWeight: 700, bgcolor: `${color}20`, color }}
                        />
                      </Box>
                      <Tooltip title={isRTL ? 'حذف هذا اليوم' : 'Remove this day off'}>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(h.id)}
                          sx={{ '&:hover': { color: 'error.main', bgcolor: '#FEF2F2' } }}
                        >
                          <DeleteRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* ── Specific date holidays column ── */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)', height: '100%' }}>
            <Box display="flex" alignItems="center" gap={1} mb={2.5}>
              <CalendarTodayRoundedIcon sx={{ color: '#F59E0B', fontSize: 20 }} />
              <Typography fontWeight={700} fontSize={15}>
                {isRTL ? 'الإجازات والعطل الرسمية' : 'Public Holidays'}
              </Typography>
              <Chip
                label={isRTL ? 'يوم واحد فقط' : 'One-time date'}
                size="small"
                sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 700, fontSize: 10, ml: 0.5 }}
              />
            </Box>

            {dateHolidays.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 5 }}>
                <CalendarTodayRoundedIcon sx={{ fontSize: 44, color: '#CBD5E1', mb: 1 }} />
                <Typography color="text.disabled" fontSize={13}>
                  {isRTL ? 'لا توجد إجازات رسمية مضافة' : 'No specific holidays added'}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                {[...dateHolidays]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map(h => {
                    const d = new Date(h.date + 'T00:00:00');
                    const dayName = isRTL
                      ? d.toLocaleDateString('ar-SA', { weekday: 'long' })
                      : d.toLocaleDateString('en-US', { weekday: 'long' });
                    return (
                      <Box
                        key={h.id}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          p: 1.5, borderRadius: 2.5,
                          bgcolor: '#FEF3C7',
                          border: '1.5px solid #FCD34D50',
                          transition: 'all 0.15s',
                          '&:hover': { boxShadow: '0 2px 8px rgba(245,158,11,0.15)' },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box
                            sx={{
                              width: 44, height: 44, borderRadius: 2,
                              bgcolor: '#F59E0B22',
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1, color: '#92400E' }}>
                              {h.date.slice(8, 10)}
                            </Typography>
                            <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#B45309' }}>
                              {isRTL
                                ? new Date(h.date + 'T00:00:00').toLocaleDateString('ar-SA', { month: 'short' })
                                : new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography fontWeight={700} fontSize={13}>
                              {isRTL ? (h.nameAr || h.nameEn) : (h.nameEn || h.nameAr)}
                            </Typography>
                            <Typography color="text.secondary" fontSize={11}>
                              {dayName} · {h.date}
                            </Typography>
                          </Box>
                        </Box>
                        <Tooltip title={isRTL ? 'حذف هذه الإجازة' : 'Remove this holiday'}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(h.id)}
                            sx={{ '&:hover': { bgcolor: '#FEF2F2' } }}
                          >
                            <DeleteRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    );
                  })}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* ── Add Dialog ── */}
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle fontWeight={800} fontSize={17}>
          {isRTL ? 'إضافة عطلة أو يوم راحة' : 'Add Holiday / Day Off'}
        </DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '20px !important' }}>
          {/* Type selector */}
          <FormControl fullWidth>
            <InputLabel>{isRTL ? 'نوع العطلة' : 'Holiday Type'}</InputLabel>
            <Select
              value={form.type}
              label={isRTL ? 'نوع العطلة' : 'Holiday Type'}
              onChange={e => setForm({ ...EMPTY, type: e.target.value })}
            >
              <MenuItem value="weekly">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <RepeatRoundedIcon sx={{ fontSize: 18, color: '#0A6EBD' }} />
                  <Box>
                    <Typography fontWeight={700} fontSize={13}>
                      {isRTL ? 'يوم راحة أسبوعي' : 'Weekly Day Off'}
                    </Typography>
                    <Typography fontSize={11} color="text.secondary">
                      {isRTL ? 'يتكرر تلقائياً كل أسبوع طوال العام' : 'Repeats automatically every week all year'}
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
              <MenuItem value="date">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CalendarTodayRoundedIcon sx={{ fontSize: 18, color: '#F59E0B' }} />
                  <Box>
                    <Typography fontWeight={700} fontSize={13}>
                      {isRTL ? 'تاريخ محدد (مرة واحدة)' : 'Specific Date (one-time)'}
                    </Typography>
                    <Typography fontSize={11} color="text.secondary">
                      {isRTL ? 'مثل اليوم الوطني، عيد الفطر...' : 'e.g. National Day, Eid al-Fitr...'}
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* Weekly: pick day of week */}
          {form.type === 'weekly' && (
            <Box>
              <Typography fontSize={13} fontWeight={600} color="text.secondary" mb={1}>
                {isRTL ? 'اختر اليوم:' : 'Select the day:'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {DAY_EN.map((day, idx) => {
                  const selected = form.dayOfWeek === idx;
                  const color    = DAY_COLORS[idx];
                  return (
                    <Box
                      key={idx}
                      onClick={() => setForm(f => ({ ...f, dayOfWeek: idx }))}
                      sx={{
                        flex: 1, py: 1.5, borderRadius: 2, textAlign: 'center', cursor: 'pointer',
                        bgcolor:  selected ? color : '#F8FAFC',
                        border: `2px solid ${selected ? color : 'rgba(148,163,184,0.25)'}`,
                        transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                        '&:hover': { transform: 'translateY(-2px)', borderColor: color, bgcolor: `${color}18` },
                      }}
                    >
                      <Typography sx={{ fontSize: 10, fontWeight: 800, color: selected ? 'white' : '#94A3B8' }}>
                        {isRTL ? DAY_AR[idx].slice(0, 3) : day.slice(0, 3)}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
              {form.dayOfWeek !== undefined && (
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: `${DAY_COLORS[form.dayOfWeek]}12`, border: `1px solid ${DAY_COLORS[form.dayOfWeek]}30` }}>
                  <Typography fontSize={12} fontWeight={700} sx={{ color: DAY_COLORS[form.dayOfWeek] }}>
                    🔁 {isRTL
                      ? `كل ${DAY_AR[form.dayOfWeek]} طوال العام سيكون يوم راحة`
                      : `Every ${DAY_EN[form.dayOfWeek]} all year will be a day off`}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* Specific date: date picker */}
          {form.type === 'date' && (
            <TextField
              label={isRTL ? 'التاريخ' : 'Date'}
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          )}

          {/* Names */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label={isRTL ? 'الاسم بالإنجليزية' : 'Name (English)'}
              value={form.nameEn}
              onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
              placeholder="e.g. National Day"
            />
            <TextField
              label={isRTL ? 'الاسم بالعربية' : 'Name (Arabic)'}
              value={form.nameAr}
              onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
              placeholder="مثال: اليوم الوطني"
              inputProps={{ dir: 'rtl' }}
            />
          </Box>
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
            disabled={saving || (form.type === 'date' && !form.date)}
            sx={{ borderRadius: 2, px: 3 }}
          >
            {saving
              ? (isRTL ? 'جارٍ الحفظ...' : 'Saving...')
              : (isRTL ? 'إضافة' : 'Add Holiday')}
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
