'use client';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Select, MenuItem, FormControl, InputLabel, Button,
  Chip, Alert, Snackbar, CircularProgress, TextField, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Paper,
} from '@mui/material';
import { useLang } from '../context/AppContext.jsx';
import { getDoctors, getBlockedSlots, blockSlot, unblockSlot, getBookings } from '../services/api.js';
import { CheckCircleRoundedIcon, EventBusyRoundedIcon, LockOpenRoundedIcon, LockRoundedIcon } from '../components/icons';

function generateSlots(start, end, dur) {
  const slots = [];
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  let cur = toMin(start);
  const endMin = toMin(end);
  while (cur + dur <= endMin) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0');
    const m = String(cur % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    cur += dur;
  }
  return slots;
}

export default function SlotManagerPage() {
  const { t, isRTL } = useLang();
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [allSlots, setAllSlots] = useState([]);
  const [blockedList, setBlockedList] = useState([]);
  const [bookedTimes, setBookedTimes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, label: '' });

  const notify = (msg, severity = 'success') => setSnackbar({ open: true, message: msg, severity });

  useEffect(() => {
    getDoctors().then((r) => {
      setDoctors(r.data);
      if (r.data.length > 0) setSelectedDoctor(r.data[0].id);
    }).catch(() => notify('Failed to load doctors', 'error'));
  }, []);

  const loadSlotData = useCallback(async () => {
    if (!selectedDoctor || !selectedDate) return;
    const doctor = doctors.find((d) => d.id === selectedDoctor);
    if (!doctor) return;
    setLoading(true);
    try {
      setAllSlots(generateSlots(doctor.workingHours?.start || '09:00', doctor.workingHours?.end || '17:00', doctor.slotDuration || 30));
      const [bl, bk] = await Promise.all([
        getBlockedSlots({ doctorId: selectedDoctor, date: selectedDate }),
        getBookings({ doctorId: selectedDoctor, date: selectedDate }),
      ]);
      setBlockedList(bl.data || []);
      setBookedTimes((bk.data || []).map((b) => b.time));
    } catch (err) {
      notify('Failed to load slot data', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedDoctor, selectedDate, doctors]);

  useEffect(() => { loadSlotData(); }, [loadSlotData]);

  const isBlocked = (time) => blockedList.some((b) => !b.isWholeDay && b.time === time);
  const isWholeDayBlocked = blockedList.some((b) => b.isWholeDay);
  const getBlockedId = (time) => blockedList.find((b) => b.time === time)?.id;
  const getWholeDayId = () => blockedList.find((b) => b.isWholeDay)?.id;
  const isBooked = (time) => bookedTimes.includes(time);

  const doBlockSlot = async (time) => {
    try {
      await blockSlot({ doctorId: selectedDoctor, date: selectedDate, time, reason, isWholeDay: false });
      notify(isRTL ? 'تم حظر الوقت' : 'Slot blocked');
      loadSlotData();
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
  };

  const doUnblockSlot = async (id) => {
    try {
      await unblockSlot(id);
      notify(isRTL ? 'تم إلغاء الحظر' : 'Slot unblocked');
      loadSlotData();
    } catch { notify('Failed', 'error'); }
  };

  const doWholeDayToggle = async () => {
    try {
      if (isWholeDayBlocked) {
        await unblockSlot(getWholeDayId());
        notify(isRTL ? 'تم إلغاء حظر اليوم' : 'Day unblocked');
      } else {
        await blockSlot({ doctorId: selectedDoctor, date: selectedDate, isWholeDay: true, reason });
        notify(isRTL ? 'تم حظر اليوم كاملاً' : 'Whole day blocked');
      }
      loadSlotData();
    } catch { notify('Failed', 'error'); }
    setConfirmDialog({ open: false });
  };

  const selectedDoctorObj = doctors.find((d) => d.id === selectedDoctor);
  const availableCount = allSlots.filter((s) => !isBlocked(s) && !isBooked(s)).length;
  const blockedCount = allSlots.filter((s) => isBlocked(s)).length;
  const bookedCount = bookedTimes.length;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.02em' }}>{t('slotManager')}</Typography>
        <Typography color="text.secondary" fontSize={14} mt={0.5}>{t('clickToBlock')}</Typography>
      </Box>

      {/* Controls */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end', border: '1px solid rgba(148,163,184,0.15)' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>{t('selectDoctor')}</InputLabel>
          <Select value={selectedDoctor} label={t('selectDoctor')} onChange={(e) => setSelectedDoctor(e.target.value)}>
            {doctors.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {isRTL ? `د. ${d.nameAr || d.nameEn}` : `Dr. ${d.nameEn || d.nameAr}`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label={t('date')} type="date" size="small" value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ minWidth: 160 }}
        />
        <TextField
          label={t('reason')} size="small" value={reason}
          onChange={(e) => setReason(e.target.value)} sx={{ minWidth: 200 }}
          placeholder={isRTL ? 'مثال: إجازة، اجتماع...' : 'e.g. vacation, meeting...'}
        />
        <Button
          variant={isWholeDayBlocked ? 'outlined' : 'contained'}
          color={isWholeDayBlocked ? 'success' : 'error'}
          startIcon={isWholeDayBlocked ? <LockOpenRoundedIcon /> : <EventBusyRoundedIcon />}
          onClick={() => setConfirmDialog({ open: true, action: doWholeDayToggle, label: isWholeDayBlocked ? t('unblockDay') : t('wholeDay') })}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {isWholeDayBlocked ? t('unblockDay') : t('wholeDay')}
        </Button>
      </Paper>

      {/* Stats summary */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: t('available'), count: availableCount, color: '#10B981', bg: '#ECFDF5' },
          { label: t('blocked'), count: blockedCount, color: '#EF4444', bg: '#FEF2F2' },
          { label: t('booked'), count: bookedCount, color: '#0A6EBD', bg: '#EFF6FF' },
        ].map(({ label, count, color, bg }) => (
          <Paper key={label} elevation={0} sx={{ px: 3, py: 2, borderRadius: 3, bgcolor: bg, border: `1px solid ${color}22`, flex: '1 1 120px' }}>
            <Typography sx={{ color, fontWeight: 800, fontSize: 28, lineHeight: 1 }}>{count}</Typography>
            <Typography sx={{ color, fontSize: 12, fontWeight: 600, mt: 0.5, opacity: 0.8 }}>{label}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Slot Grid */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
      ) : !selectedDoctorObj ? (
        <Alert severity="info">{isRTL ? 'اختر طبيباً لعرض المواعيد' : 'Select a doctor to view slots'}</Alert>
      ) : isWholeDayBlocked ? (
        <Alert severity="error" icon={<EventBusyRoundedIcon />} sx={{ borderRadius: 3, fontWeight: 600 }}>
          {t('wholeDayBlocked')}
        </Alert>
      ) : allSlots.length === 0 ? (
        <Alert severity="warning">{isRTL ? 'لا توجد مواعيد لهذا اليوم' : 'No slots configured for this day'}</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 1.5 }}>
          {allSlots.map((slot) => {
            const blocked = isBlocked(slot);
            const booked = isBooked(slot);
            const blId = getBlockedId(slot);
            const stateColor = booked ? { bg: '#EFF6FF', border: '#0A6EBD', text: '#0A6EBD' }
              : blocked ? { bg: '#FEF2F2', border: '#EF4444', text: '#EF4444' }
              : { bg: '#ECFDF5', border: '#10B981', text: '#059669' };

            return (
              <Paper
                key={slot}
                elevation={0}
                onClick={() => {
                  if (booked) return;
                  if (blocked) doUnblockSlot(blId);
                  else doBlockSlot(slot);
                }}
                sx={{
                  p: 2, borderRadius: 2.5, textAlign: 'center', cursor: booked ? 'not-allowed' : 'pointer',
                  border: `2px solid ${stateColor.border}`,
                  bgcolor: stateColor.bg,
                  transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                  '&:hover': booked ? {} : {
                    transform: 'translateY(-3px) scale(1.03)',
                    boxShadow: `0 8px 20px ${stateColor.border}30`,
                  },
                }}
              >
                <Typography sx={{ fontWeight: 800, fontSize: 18, color: stateColor.text, fontVariantNumeric: 'tabular-nums' }}>{slot}</Typography>
                <Box sx={{ mt: 1 }}>
                  {booked && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, color: '#0A6EBD' }}><CheckCircleRoundedIcon sx={{ fontSize: 14 }} /><Typography sx={{ fontSize: 10, fontWeight: 700 }}>{t('booked')}</Typography></Box>}
                  {blocked && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, color: '#EF4444' }}><LockRoundedIcon sx={{ fontSize: 14 }} /><Typography sx={{ fontSize: 10, fontWeight: 700 }}>{t('blocked')}</Typography></Box>}
                  {!blocked && !booked && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, color: '#059669' }}><LockOpenRoundedIcon sx={{ fontSize: 14 }} /><Typography sx={{ fontSize: 10, fontWeight: 700 }}>{t('available')}</Typography></Box>}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false })} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle fontWeight={700}>{t('confirm')}</DialogTitle>
        <DialogContent><Typography>{confirmDialog.label}?</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmDialog({ open: false })} variant="outlined">{t('cancel')}</Button>
          <Button variant="contained" color={isWholeDayBlocked ? 'success' : 'error'} onClick={confirmDialog.action}>{t('confirm')}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3500} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: isRTL ? 'left' : 'right' }}>
        <Alert severity={snackbar.severity} sx={{ borderRadius: 2.5 }} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}


export async function getServerSideProps() {
  return { props: {} };
}
