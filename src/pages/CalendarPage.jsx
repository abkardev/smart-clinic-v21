'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Alert, Snackbar, CircularProgress,
  Chip, FormControl, InputLabel, Select, MenuItem, Button,
} from '@mui/material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin   from '@fullcalendar/daygrid';
import timeGridPlugin  from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useLang } from '../context/AppContext.jsx';
import { getBookings, dragDropBooking, getDoctors, getBlockedSlots, syncFromGoogle } from '../services/api.js';

const STATUS_COLORS = {
  pending: '#ffa726', confirmed: '#1a73e8', completed: '#34a853',
  cancelled: '#ef5350', 'no-show': '#ab47bc', no_show: '#ab47bc',
};

const STATUS_LABEL_AR = {
  pending: 'قيد الانتظار', confirmed: 'مؤكد', completed: 'مكتمل',
  cancelled: 'ملغي', 'no-show': 'لم يحضر', no_show: 'لم يحضر',
};
const STATUS_LABEL_EN = {
  pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed',
  cancelled: 'Cancelled', 'no-show': 'No Show', no_show: 'No Show',
};

// Full Arabic button text for FullCalendar toolbar
const AR_BUTTON_TEXT = {
  today:   'اليوم',
  month:   'شهر',
  week:    'أسبوع',
  day:     'يوم',
  list:    'قائمة',
  allDay:  'طول اليوم',
};

export default function CalendarPage() {
  const { isRTL } = useLang();
  const calendarRef = useRef(null);
  const [events, setEvents]             = useState([]);
  const [doctors, setDoctors]           = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [loading, setLoading]           = useState(true);
  const [snackbar, setSnackbar]         = useState({ open: false, message: '', severity: 'success' });
  const [selectedEvent, setSelectedEvent] = useState(null);

  const notify = (en, ar, severity = 'success') =>
    setSnackbar({ open: true, message: isRTL ? ar : en, severity });

  useEffect(() => { getDoctors().then(r => setDoctors(r.data)); }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedDoctor ? { doctorId: selectedDoctor } : {};
      const [bookingsRes, blockedRes] = await Promise.all([
        getBookings(params),
        selectedDoctor
          ? getBlockedSlots({ doctorId: selectedDoctor })
          : Promise.resolve({ data: [] }),
      ]);

      const bookingEvents = bookingsRes.data.map(b => ({
        id: b.id,
        title: `${b.time} · ${b.name}`,
        start: `${b.date}T${b.time}:00`,
        end: new Date(new Date(`${b.date}T${b.time}:00`).getTime() + 30 * 60000).toISOString(),
        backgroundColor: STATUS_COLORS[b.status] || '#1a73e8',
        borderColor:     STATUS_COLORS[b.status] || '#1a73e8',
        textColor: '#ffffff',
        extendedProps: {
          type: 'booking', name: b.name, phone: b.phone,
          service: b.service, status: b.status,
          doctor: b.doctorId
            ? (isRTL ? (b.doctorId.nameAr || b.doctorId.nameEn) : (b.doctorId.nameEn || b.doctorId.nameAr))
            : null,
        },
      }));

      const blockedEvents = blockedRes.data.map(s => ({
        id: `blocked_${s.id}`,
        title: `🚫 ${s.reason || (isRTL ? 'محظور' : 'Blocked')}`,
        start: s.isWholeDay ? s.date : `${s.date}T${s.time}:00`,
        end: s.isWholeDay
          ? s.date
          : new Date(new Date(`${s.date}T${s.time}:00`).getTime() + 30 * 60000).toISOString(),
        allDay: s.isWholeDay,
        backgroundColor: '#b0bec5',
        borderColor:     '#78909c',
        textColor: '#37474f',
        extendedProps: { type: 'blocked', reason: s.reason },
      }));

      setEvents([...bookingEvents, ...blockedEvents]);
    } catch {
      notify('Failed to load calendar', 'فشل تحميل التقويم', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedDoctor, isRTL]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleEventDrop = async info => {
    if (info.event.extendedProps.type === 'blocked') return info.revert();
    const newDate = info.event.start.toISOString().split('T')[0];
    const newTime = info.event.start.toTimeString().slice(0, 5);
    try {
      await dragDropBooking(info.event.id, { date: newDate, time: newTime });
      notify(`Moved to ${newDate} ${newTime}`, `تم نقل الموعد إلى ${newDate} ${newTime}`);
    } catch (err) {
      info.revert();
      notify(err.response?.data?.message || 'Failed', 'فشل نقل الموعد', 'error');
    }
  };

  const handleEventClick = info => {
    const p = info.event.extendedProps;
    setSelectedEvent({ title: info.event.title, ...p, start: info.event.startStr });
  };

  const handleSync = async () => {
    if (!selectedDoctor) return;
    try {
      const res = await syncFromGoogle(selectedDoctor);
      notify(`Synced: ${res.data.synced} events`, `تمت المزامنة: ${res.data.synced} أحداث`);
      loadEvents();
    } catch {
      notify('Sync failed', 'فشلت المزامنة', 'error');
    }
  };

  return (
    <Box>
      {/* Header */}
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
              onChange={e => setSelectedDoctor(e.target.value)}
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
            <Button variant="outlined" size="small" onClick={handleSync}>
              {isRTL ? 'مزامنة جوجل' : 'Sync Google'}
            </Button>
          )}

          {/* Status legend */}
          <Box display="flex" gap={0.75} flexWrap="wrap">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <Chip
                key={status}
                label={isRTL ? STATUS_LABEL_AR[status] : STATUS_LABEL_EN[status]}
                size="small"
                sx={{ bgcolor: color, color: 'white', fontWeight: 600, fontSize: 11 }}
              />
            ))}
            <Chip
              label={isRTL ? 'محظور' : 'Blocked'}
              size="small"
              sx={{ bgcolor: '#b0bec5', color: '#37474f', fontWeight: 600, fontSize: 11 }}
            />
          </Box>
        </Box>
      </Box>

      {loading && (
        <Box display="flex" justifyContent="center" mb={2}>
          <CircularProgress size={24} />
        </Box>
      )}

      <Card>
        <CardContent sx={{ p: '12px !important' }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            // ─── RTL & locale ───────────────────────────────────────────────────
            direction={isRTL ? 'rtl' : 'ltr'}
            // Pass locale string only — FullCalendar ships Arabic locale internally
            locale={isRTL ? 'ar' : 'en'}
            // ─── Translated toolbar button text ─────────────────────────────────
            buttonText={isRTL ? AR_BUTTON_TEXT : undefined}
            allDayText={isRTL ? 'طول اليوم' : 'all-day'}
            // ─── Toolbar layout ──────────────────────────────────────────────────
            headerToolbar={{
              left:   isRTL ? 'dayGridMonth,timeGridWeek,timeGridDay' : 'prev,next today',
              center: 'title',
              right:  isRTL ? 'prev,next today' : 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            events={events}
            editable={true}
            eventDrop={handleEventDrop}
            eventClick={handleEventClick}
            slotMinTime="07:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={true}
            height="auto"
            contentHeight={580}
            slotDuration="00:30:00"
            nowIndicator={true}
            businessHours={{ daysOfWeek: [0, 1, 2, 3, 4], startTime: '09:00', endTime: '17:00' }}
          />
        </CardContent>
      </Card>

      {/* Selected event detail */}
      {selectedEvent && (
        <Card sx={{ mt: 2, borderLeft: `4px solid ${selectedEvent.type === 'blocked' ? '#78909c' : '#1a73e8'}` }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="flex-start">
              <Box>
                {selectedEvent.type === 'booking' ? (
                  <>
                    <Typography variant="h6">{selectedEvent.name}</Typography>
                    <Typography color="text.secondary">{selectedEvent.service}</Typography>
                    <Typography variant="body2" mt={1}>📞 {selectedEvent.phone}</Typography>
                    {selectedEvent.doctor && (
                      <Typography variant="body2">
                        {isRTL ? `👨‍⚕️ د. ${selectedEvent.doctor}` : `👨‍⚕️ Dr. ${selectedEvent.doctor}`}
                      </Typography>
                    )}
                    {selectedEvent.calendarLink && (
                      <a href={selectedEvent.calendarLink} target="_blank" rel="noreferrer"
                        style={{ color: '#1a73e8', fontSize: 13 }}>
                        {isRTL ? 'عرض في تقويم جوجل ←' : 'View in Google Calendar →'}
                      </a>
                    )}
                  </>
                ) : (
                  <Typography variant="h6">
                    🚫 {selectedEvent.reason || (isRTL ? 'وقت محظور' : 'Blocked slot')}
                  </Typography>
                )}
              </Box>
              {selectedEvent.status && (
                <Chip
                  label={isRTL ? STATUS_LABEL_AR[selectedEvent.status] : STATUS_LABEL_EN[selectedEvent.status]}
                  size="small"
                  sx={{
                    bgcolor: STATUS_COLORS[selectedEvent.status],
                    color: 'white', fontWeight: 700,
                  }}
                />
              )}
            </Box>
          </CardContent>
        </Card>
      )}

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
