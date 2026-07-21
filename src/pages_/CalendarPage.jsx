'use client';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Alert, Snackbar,
  Chip, FormControl, InputLabel, Select, MenuItem, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Skeleton,
  useMediaQuery, useTheme, TextField, Tooltip,
} from '@mui/material';
import {
  Block as BlockIcon, CalendarMonth as CalendarMonthIcon,
  Close as CloseIcon, LocalPhone as PhoneIcon,
  Person as PersonIcon, Sync as SyncIcon,
  Delete as DeleteIcon, Edit as EditIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin   from '@fullcalendar/daygrid';
import timeGridPlugin  from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useLang } from '../context/AppContext.jsx';
import {
  getBookings, dragDropBooking, getDoctors, getBlockedSlots,
  getHolidays, syncFromGoogle, deleteBooking, updateBooking,
} from '../services/api.js';
import { STATUS_COLORS, STATUS_LABEL_EN, STATUS_LABEL_AR, STATUS_KEYS } from '../app/lib/constants';

function CalendarSkeleton() {
  return (
    <Card>
      <CardContent>
        <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1, mb: 1.5 }} />
        <Skeleton variant="rectangular" height={500} sx={{ borderRadius: 1 }} />
      </CardContent>
    </Card>
  );
}

const ConfirmDialog = React.memo(({ open, title, message, confirmLabel, onConfirm, onCancel }) => (
  <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
    <DialogContent><Typography>{message}</Typography></DialogContent>
    <DialogActions sx={{ px: 3, pb: 3 }}>
      <Button onClick={onCancel} sx={{ borderRadius: 2 }}>Cancel</Button>
      <Button onClick={onConfirm} variant="contained" color="error" sx={{ borderRadius: 2 }}>{confirmLabel}</Button>
    </DialogActions>
  </Dialog>
));
ConfirmDialog.displayName = 'ConfirmDialog';

function buildBackgroundEvents(selectedDoctorObj, holidays) {
  const bg = [];

  if (selectedDoctorObj?.breakEnabled) {
    bg.push({
      id: `break_${selectedDoctorObj.id}`,
      title: 'Break',
      startTime: selectedDoctorObj.breakStart || '13:00',
      endTime: selectedDoctorObj.breakEnd || '14:00',
      daysOfWeek: selectedDoctorObj.workingDays || [0, 1, 2, 3, 4],
      backgroundColor: '#FFF3E0',
      borderColor: '#FFB74D',
      display: 'background',
      extendedProps: { type: 'break' },
    });
  }

  const holidayList = Array.isArray(holidays) ? holidays : [];
  holidayList.forEach(h => {
    if (!h.applyToAll && selectedDoctorObj && !(h.doctorIds || []).includes(selectedDoctorObj.id)) return;
    if (h.type === 'date' && h.date) {
      bg.push({
        id: `holiday_${h.id}`,
        title: h.nameEn || h.nameAr || 'Holiday',
        start: h.date,
        allDay: true,
        backgroundColor: '#FCE4EC',
        borderColor: '#F48FB1',
        display: 'background',
        extendedProps: { type: 'holiday', nameEn: h.nameEn, nameAr: h.nameAr },
      });
    } else if (h.type === 'weekly' && h.dayOfWeek !== null) {
      bg.push({
        id: `holiday_${h.id}`,
        title: h.nameEn || h.nameAr || 'Holiday',
        daysOfWeek: [h.dayOfWeek],
        startTime: '00:00',
        endTime: '24:00',
        backgroundColor: '#FCE4EC',
        borderColor: '#F48FB1',
        display: 'background',
        extendedProps: { type: 'holiday', nameEn: h.nameEn, nameAr: h.nameAr },
      });
    }
  });

  return bg;
}

const CalendarHeader = React.memo(({ isRTL, doctors, selectedDoctor, onDoctorChange, onSync, loading }) => (
  <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
    <Typography variant="h5" fontWeight={800}>
      {isRTL ? 'التقويم' : 'Calendar'}
    </Typography>
    <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel>{isRTL ? 'اختر الطبيب' : 'Select Doctor'}</InputLabel>
        <Select
          value={selectedDoctor}
          label={isRTL ? 'اختر الطبيب' : 'Select Doctor'}
          onChange={onDoctorChange}
        >
          <MenuItem value="">{isRTL ? 'جميع الأطباء' : 'All Doctors'}</MenuItem>
          {doctors.map(d => (
            <MenuItem key={d.id} value={d.id}>
              {isRTL ? `د. ${d.nameAr || d.nameEn}` : `Dr. ${d.nameEn || d.nameAr}`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedDoctor && (
        <Button variant="outlined" size="small" onClick={onSync} disabled={loading}
          startIcon={<SyncIcon />}>
          {isRTL ? 'مزامنة' : 'Sync'}
        </Button>
      )}

      <Box display="flex" gap={0.5} flexWrap="wrap">
        {STATUS_KEYS.map(status => (
          <Chip key={status}
            label={isRTL ? STATUS_LABEL_AR[status] : STATUS_LABEL_EN[status]}
            size="small"
            sx={{ bgcolor: STATUS_COLORS[status], color: 'white', fontWeight: 600, fontSize: 11 }}
          />
        ))}
        <Chip label={isRTL ? 'محظور' : 'Blocked'} size="small"
          sx={{ bgcolor: '#b0bec5', color: '#37474f', fontWeight: 600, fontSize: 11 }} />
        <Chip label={isRTL ? 'استراحة' : 'Break'} size="small"
          sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 600, fontSize: 11 }} />
        <Chip label={isRTL ? 'عطلة' : 'Holiday'} size="small"
          sx={{ bgcolor: '#FCE4EC', color: '#C62828', fontWeight: 600, fontSize: 11 }} />
      </Box>
    </Box>
  </Box>
));
CalendarHeader.displayName = 'CalendarHeader';

export default function CalendarPage() {
  const { isRTL } = useLang();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const calendarRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ status: '', notes: '' });

  const notify = useCallback((en, ar, severity = 'success') => {
    setSnackbar({ open: true, message: isRTL ? ar : en, severity });
  }, [isRTL]);

  useEffect(() => {
    getDoctors().then(r => setDoctors(r.data));
  }, []);

  const doctorMap = useMemo(() => {
    const map = {};
    doctors.forEach(d => { map[d.id] = d; });
    return map;
  }, [doctors]);

  const selectedDoctorObj = useMemo(
    () => (selectedDoctor ? doctorMap[selectedDoctor] : null),
    [selectedDoctor, doctorMap],
  );

  const businessHours = useMemo(() => {
    if (selectedDoctorObj) {
      return {
        daysOfWeek: selectedDoctorObj.workingDays,
        startTime: selectedDoctorObj.workingStart,
        endTime: selectedDoctorObj.workingEnd,
      };
    }
    return { daysOfWeek: [0, 1, 2, 3, 4], startTime: '09:00', endTime: '17:00' };
  }, [selectedDoctorObj]);

  const slotDurationStr = useMemo(() => {
    const minutes = selectedDoctorObj?.slotDuration || 30;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }, [selectedDoctorObj]);

  const loadEvents = useCallback(async (start, end) => {
    if (!start || !end) return;
    setLoading(true);
    try {
      const params = { startDate: start, endDate: end, legacy: 'true' };
      if (selectedDoctor) params.doctorId = selectedDoctor;

      const [bookingsRes, blockedRes, holidaysRes] = await Promise.all([
        getBookings(params),
        selectedDoctor
          ? getBlockedSlots({ doctorId: selectedDoctor, startDate: start, endDate: end })
          : Promise.resolve({ data: [] }),
        getHolidays().catch(() => ({ data: [] })),
      ]);

      const rawBookings = Array.isArray(bookingsRes.data) ? bookingsRes.data : [];
      const rawBlocked = Array.isArray(blockedRes.data) ? blockedRes.data : [];

      const bookingEvents = rawBookings.map(b => {
        const startStr = `${b.date}T${b.time}:00`;
        const endDate = new Date(new Date(startStr).getTime() + 30 * 60000);
        const doctorName = b.doctorId
          ? (isRTL
            ? (b.doctorId.nameAr || b.doctorId.nameEn)
            : (b.doctorId.nameEn || b.doctorId.nameAr))
          : null;
        return {
          id: b.id,
          title: `${b.time} · ${b.name}`,
          start: startStr,
          end: endDate.toISOString(),
          backgroundColor: STATUS_COLORS[b.status] || '#1a73e8',
          borderColor: STATUS_COLORS[b.status] || '#1a73e8',
          textColor: '#ffffff',
          extendedProps: {
            type: 'booking',
            name: b.name, phone: b.phone, service: b.service,
            status: b.status, notes: b.notes || '', source: b.source || 'dashboard',
            calendarLink: b.calendarLink,
            doctor: doctorName, date: b.date, time: b.time,
          },
        };
      });

      const blockedEvents = rawBlocked.map(s => ({
        id: `blocked_${s.id}`,
        title: s.reason || (isRTL ? 'محظور' : 'Blocked'),
        start: s.isWholeDay ? s.date : `${s.date}T${s.time}:00`,
        end: s.isWholeDay
          ? s.date
          : new Date(new Date(`${s.date}T${s.time}:00`).getTime() + 30 * 60000).toISOString(),
        allDay: s.isWholeDay || false,
        backgroundColor: '#b0bec5',
        borderColor: '#78909c',
        textColor: '#37474f',
        extendedProps: { type: 'blocked', reason: s.reason },
      }));

      const bgEvents = buildBackgroundEvents(selectedDoctorObj, holidaysRes.data);

      setEvents([...bookingEvents, ...blockedEvents, ...bgEvents]);
    } catch {
      notify('Failed to load calendar', 'فشل تحميل التقويم', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedDoctor, selectedDoctorObj, isRTL, notify]);

  const handleDatesSet = useCallback((info) => {
    const start = info.startStr.slice(0, 10);
    const end = info.endStr.slice(0, 10);
    setDateRange({ start, end });
  }, []);

  useEffect(() => {
    if (dateRange.start && dateRange.end) {
      loadEvents(dateRange.start, dateRange.end);
    }
  }, [dateRange.start, dateRange.end, loadEvents]);

  const handleDoctorChange = useCallback((e) => {
    setSelectedDoctor(e.target.value);
  }, []);

  const handleEventDrop = useCallback(async (info) => {
    if (info.event.extendedProps.type !== 'booking') return info.revert();
    const newDate = info.event.start.toISOString().split('T')[0];
    const newTime = info.event.start.toTimeString().slice(0, 5);
    try {
      await dragDropBooking(info.event.id, { date: newDate, time: newTime });
      notify(`Moved to ${newDate} ${newTime}`, `تم نقل الموعد إلى ${newDate} ${newTime}`);
    } catch {
      info.revert();
      notify('Failed to move appointment', 'فشل نقل الموعد', 'error');
    }
  }, [notify]);

  const handleEventAllow = useCallback((dropInfo) => {
    const occupiedSlots = new Set();
    events.forEach(e => {
      if (e.extendedProps?.type === 'booking' && e.id !== dropInfo.draggedEvent?.id) {
        const dateStr = dropInfo.startStr.slice(0, 10);
        if (e.start && typeof e.start === 'string' && e.start.startsWith(dateStr)) {
          occupiedSlots.add(e.start.slice(11, 16));
        }
      }
    });
    const dropTime = dropInfo.startStr.slice(11, 16);
    return !occupiedSlots.has(dropTime);
  }, [events]);

  const handleEventClick = useCallback((info) => {
    const p = info.event.extendedProps;
    setSelectedEvent({
      title: info.event.title,
      id: info.event.id,
      ...p,
      start: info.event.startStr,
      date: p.date || info.event.startStr?.slice(0, 10),
      time: p.time || info.event.startStr?.slice(11, 16),
    });
    setEditForm({ status: p.status || '', notes: p.notes || '' });
    setEditing(false);
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedEvent(null);
    setEditing(false);
  }, []);

  const handleEditToggle = useCallback(() => {
    setEditing(prev => !prev);
    if (selectedEvent) {
      setEditForm({ status: selectedEvent.status || '', notes: selectedEvent.notes || '' });
    }
  }, [selectedEvent]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedEvent) return;
    try {
      await updateBooking(selectedEvent.id, editForm);
      notify('Booking updated', 'تم تحديث الحجز');
      handleCloseDialog();
      if (dateRange.start && dateRange.end) {
        loadEvents(dateRange.start, dateRange.end);
      }
    } catch {
      notify('Failed to update booking', 'فشل تحديث الحجز', 'error');
    }
  }, [selectedEvent, editForm, notify, handleCloseDialog, loadEvents, dateRange]);

  const handleDeleteClick = useCallback(() => setConfirmOpen(true), []);
  const handleDeleteCancel = useCallback(() => setConfirmOpen(false), []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedEvent) return;
    try {
      await deleteBooking(selectedEvent.id);
      notify('Booking deleted', 'تم حذف الحجز');
      setConfirmOpen(false);
      handleCloseDialog();
      if (dateRange.start && dateRange.end) {
        loadEvents(dateRange.start, dateRange.end);
      }
    } catch {
      notify('Failed to delete booking', 'فشل حذف الحجز', 'error');
      setConfirmOpen(false);
    }
  }, [selectedEvent, notify, handleCloseDialog, loadEvents, dateRange]);

  const handleSync = useCallback(async () => {
    if (!selectedDoctor) return;
    try {
      const res = await syncFromGoogle(selectedDoctor);
      notify(`Synced: ${res.data.synced} events`, `تمت المزامنة: ${res.data.synced} أحداث`);
      if (dateRange.start && dateRange.end) {
        loadEvents(dateRange.start, dateRange.end);
      }
    } catch {
      notify('Sync failed', 'فشلت المزامنة', 'error');
    }
  }, [selectedDoctor, notify, loadEvents, dateRange]);

  const handleKeyDown = useCallback((e) => {
    const calApi = calendarRef.current?.getApi();
    if (!calApi) return;

    if (e.key === 'Escape' && dialogOpen) {
      handleCloseDialog();
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowLeft') {
      (isRTL ? calApi.next : calApi.prev)();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight') {
      (isRTL ? calApi.prev : calApi.next)();
      e.preventDefault();
      return;
    }
    if (e.key === 't' || e.key === 'T') {
      calApi.today();
      e.preventDefault();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      if (dateRange.start && dateRange.end) {
        loadEvents(dateRange.start, dateRange.end);
      }
      e.preventDefault();
    }
  }, [dialogOpen, handleCloseDialog, isRTL, loadEvents, dateRange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const contentHeight = useMemo(() => (isMobile ? 400 : 580), [isMobile]);
  const showSkeleton = loading && events.length === 0;

  return (
    <Box>
      <CalendarHeader
        isRTL={isRTL}
        doctors={doctors}
        selectedDoctor={selectedDoctor}
        onDoctorChange={handleDoctorChange}
        onSync={handleSync}
        loading={loading}
      />

      {showSkeleton ? <CalendarSkeleton /> : (
        <Card>
          <CardContent sx={{ p: isMobile ? '8px !important' : '12px !important' }}>
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView={isMobile ? 'dayGridMonth' : 'timeGridWeek'}
              direction={isRTL ? 'rtl' : 'ltr'}
              locale={isRTL ? 'ar' : 'en'}
              allDayText={isRTL ? 'طول اليوم' : 'all-day'}
              headerToolbar={{
                left:   isRTL ? 'dayGridMonth,timeGridWeek,timeGridDay' : 'prev,next today',
                center: 'title',
                right:  isRTL ? 'prev,next today' : 'dayGridMonth,timeGridWeek,timeGridDay',
              }}
              events={events}
              editable={true}
              eventDrop={handleEventDrop}
              eventAllow={handleEventAllow}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              slotMinTime="07:00:00"
              slotMaxTime="20:00:00"
              allDaySlot={true}
              height="auto"
              contentHeight={contentHeight}
              slotDuration={slotDurationStr}
              nowIndicator={true}
              businessHours={businessHours}
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800 }}>
          {selectedEvent?.type === 'booking'
            ? (isRTL ? 'تفاصيل الحجز' : 'Booking Details')
            : (isRTL ? 'وقت محظور' : 'Blocked Slot')}
          <IconButton size="small" onClick={handleCloseDialog}><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {selectedEvent?.type === 'booking' ? (
            editing ? (
              <Box display="flex" flexDirection="column" gap={2} mt={1}>
                <FormControl fullWidth size="small">
                  <InputLabel>{isRTL ? 'الحالة' : 'Status'}</InputLabel>
                  <Select
                    value={editForm.status}
                    label={isRTL ? 'الحالة' : 'Status'}
                    onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  >
                    {STATUS_KEYS.map(s => (
                      <MenuItem key={s} value={s}>
                        {isRTL ? STATUS_LABEL_AR[s] : STATUS_LABEL_EN[s]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label={isRTL ? 'ملاحظات' : 'Notes'}
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  fullWidth multiline rows={3} size="small"
                />
              </Box>
            ) : (
              <Box display="flex" flexDirection="column" gap={2} mt={1}>
                <Box display="flex" alignItems="center" gap={1}>
                  <PersonIcon fontSize="small" color="action" />
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>{selectedEvent.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{selectedEvent.service}</Typography>
                  </Box>
                </Box>

                <Box display="flex" alignItems="center" gap={1}>
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography variant="body2">{selectedEvent.phone}</Typography>
                </Box>

                {selectedEvent.doctor && (
                  <Box display="flex" alignItems="center" gap={1}>
                    <PersonIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {isRTL ? `د. ${selectedEvent.doctor}` : `Dr. ${selectedEvent.doctor}`}
                    </Typography>
                  </Box>
                )}

                <Box display="flex" alignItems="center" gap={1}>
                  <CalendarMonthIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    {selectedEvent.date} · {selectedEvent.time}
                  </Typography>
                </Box>

                {selectedEvent.status && (
                  <Chip
                    label={isRTL ? STATUS_LABEL_AR[selectedEvent.status] : STATUS_LABEL_EN[selectedEvent.status]}
                    size="small"
                    sx={{ bgcolor: STATUS_COLORS[selectedEvent.status], color: 'white', fontWeight: 700, alignSelf: 'flex-start' }}
                  />
                )}

                {selectedEvent.source && (
                  <Box display="flex" alignItems="center" gap={1}>
                    <InfoIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      {isRTL ? `المصدر: ${selectedEvent.source}` : `Source: ${selectedEvent.source}`}
                    </Typography>
                  </Box>
                )}

                {selectedEvent.notes && (
                  <Box>
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      {isRTL ? 'ملاحظات' : 'Notes'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                      {selectedEvent.notes}
                    </Typography>
                  </Box>
                )}

                {selectedEvent.calendarLink && (
                  <Button href={selectedEvent.calendarLink} target="_blank" rel="noreferrer"
                    size="small" variant="outlined" startIcon={<CalendarMonthIcon />}
                    sx={{ alignSelf: 'flex-start', borderRadius: 2 }}>
                    {isRTL ? 'عرض في تقويم جوجل' : 'View in Google Calendar'}
                  </Button>
                )}
              </Box>
            )
          ) : (
            <Box display="flex" alignItems="center" gap={1.5}>
              <BlockIcon color="disabled" />
              <Typography variant="h6">
                {selectedEvent?.reason || (isRTL ? 'وقت محظور' : 'Blocked slot')}
              </Typography>
            </Box>
          )}
        </DialogContent>
        {selectedEvent?.type === 'booking' && (
          <DialogActions sx={{ px: 3, pb: 3, gap: 1, justifyContent: 'space-between' }}>
            <Box>
              <Tooltip title={isRTL ? 'حذف' : 'Delete'}>
                <IconButton color="error" onClick={handleDeleteClick} size="small">
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </Box>
            <Box display="flex" gap={1}>
              {editing ? (
                <>
                  <Button onClick={handleEditToggle} sx={{ borderRadius: 2 }}>
                    {isRTL ? 'إلغاء' : 'Cancel'}
                  </Button>
                  <Button variant="contained" onClick={handleSaveEdit} sx={{ borderRadius: 2 }}>
                    {isRTL ? 'حفظ' : 'Save'}
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleCloseDialog} sx={{ borderRadius: 2 }}>
                    {isRTL ? 'إغلاق' : 'Close'}
                  </Button>
                  <Button variant="contained" startIcon={<EditIcon />} onClick={handleEditToggle} sx={{ borderRadius: 2 }}>
                    {isRTL ? 'تعديل' : 'Edit'}
                  </Button>
                </>
              )}
            </Box>
          </DialogActions>
        )}
        {selectedEvent?.type !== 'booking' && (
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={handleCloseDialog} sx={{ borderRadius: 2 }}>
              {isRTL ? 'إغلاق' : 'Close'}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title={isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}
        message={isRTL ? 'هل أنت متأكد من حذف هذا الحجز؟' : 'Are you sure you want to delete this booking?'}
        confirmLabel={isRTL ? 'حذف' : 'Delete'}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: isRTL ? 'left' : 'right' }}
      >
        <Alert severity={snackbar.severity} sx={{ borderRadius: 2.5 }}
          onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
