'use client';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Chip, Button, IconButton, Tooltip, TextField,
  Select, MenuItem, FormControl, InputLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Switch, FormControlLabel, Alert, Snackbar,
  Tabs, Tab, CircularProgress, Divider, Breadcrumbs, Link, LinearProgress,
  Card, CardContent, TableSortLabel, InputAdornment, Avatar, AvatarGroup,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';

import { useLang, useAuth } from '../context/AppContext.jsx';
import {
  SectionHeader, StatCard, StatusBadge, EmptyState, ConfirmDialog,
  FilterBar, MetricCard, LoadingOverlay, TableRowSkeleton,
} from '../components/admin/AdminComponents';
import {
  getCalendarOverview, getCalendarStatus, getCalendarStatistics, getCalendarActivity,
  verifyBooking, postVerifyBooking, resyncBooking, recreateEvent,
  getCalendarConflicts, getCalendarDiagnostics, getCalendarObservability,
  getCalendarConfig, updateCalendarConfig, exportCalendarData, runCalendarCleanup,
  getCalendarCleanup, resyncDoctor, fullResync, renewChannels, getChannels,
  getSchedulingAnalytics, getSmartAvailability, getSchedulingForecast,
  getSchedulingOptimize, autoReschedule,
} from '../services/api';
import {
  BarChartRoundedIcon, CheckCircleRoundedIcon, CloudSyncRoundedIcon,
  ErrorOutlineRoundedIcon, RefreshRoundedIcon, ScheduleRoundedIcon,
  SettingsRoundedIcon, SpeedRoundedIcon, StorageRoundedIcon,
  WarningAmberRoundedIcon, HistoryRoundedIcon, PeopleRoundedIcon,
  SyncRoundedIcon, FileDownloadRoundedIcon, PlayArrowRoundedIcon,
  StopRoundedIcon, TuneRoundedIcon, TroubleshootRoundedIcon,
  CalendarMonthRoundedIcon, KeyRoundedIcon, DnsRoundedIcon,
  ReportRoundedIcon, GroupsRoundedIcon, LocalHospitalRoundedIcon,
  VerifiedRoundedIcon, NotificationsRoundedIcon, HealingRoundedIcon,
  CloudOffRoundedIcon, SecurityRoundedIcon, ExtensionRoundedIcon,
  AnalyticsRoundedIcon, AutorenewRoundedIcon, EventNoteRoundedIcon,
  TodayRoundedIcon, TrendingUpRoundedIcon, TrendingDownRoundedIcon,
} from '../components/icons';

// ─── Color Palette ─────────────────────────────────────────────────────────────
const COLORS = ['#0A6EBD', '#14B8A6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#10B981'];
const STATUS_COLORS_MAP = { healthy: '#10B981', active: '#0A6EBD', degraded: '#F59E0B', unhealthy: '#EF4444', expired: '#EF4444', failed: '#EF4444', pending: '#F59E0B', pass: '#10B981', warn: '#F59E0B', fail: '#EF4444' };

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { if (n === null || n === undefined) return '—'; if (typeof n === 'number') return n.toLocaleString(); return String(n); }
function pct(n) { if (n === null || n === undefined) return '—'; return `${Math.round(n)}%`; }
function ago(d) { if (!d) return '—'; const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; }
function timeAgo(d) { return ago(d); }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Tab Config ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview', icon: <SpeedRoundedIcon /> },
  { id: 'metrics', label: 'Metrics', icon: <BarChartRoundedIcon /> },
  { id: 'activity', label: 'Activity', icon: <HistoryRoundedIcon /> },
  { id: 'doctors', label: 'Doctors', icon: <PeopleRoundedIcon /> },
  { id: 'bookings', label: 'Verification', icon: <VerifiedRoundedIcon /> },
  { id: 'conflicts', label: 'Conflicts', icon: <WarningAmberRoundedIcon /> },
  { id: 'retry', label: 'Retry Queue', icon: <AutorenewRoundedIcon /> },
  { id: 'channels', label: 'Channels', icon: <DnsRoundedIcon /> },
  { id: 'oauth', label: 'OAuth', icon: <KeyRoundedIcon /> },
  { id: 'drift', label: 'Drift', icon: <TroubleshootRoundedIcon /> },
  { id: 'schedule', label: 'Schedule', icon: <CalendarMonthRoundedIcon /> },
  { id: 'observability', label: 'Observability', icon: <AnalyticsRoundedIcon /> },
  { id: 'maintenance', label: 'Maintenance', icon: <SettingsRoundedIcon /> },
  { id: 'export', label: 'Export', icon: <FileDownloadRoundedIcon /> },
  { id: 'config', label: 'Config', icon: <TuneRoundedIcon /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Calendar Overview
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewSection({ data, loading, onRefresh }) {
  if (loading) return <LoadingOverlay />;
  if (!data) return <EmptyState title="No overview data" />;

  const { status, stats } = data;
  const health = data.diagnostics?.status || (status?.drift?.healthy > 0 ? 'healthy' : 'degraded');
  const healthColor = STATUS_COLORS_MAP[health] || '#F59E0B';

  const items = [
    { label: 'Health Score', value: health.toUpperCase(), color: healthColor, bold: true },
    { label: 'OAuth Tokens', value: `${status?.tokens?.active || 0} active / ${status?.tokens?.total || 0} total` },
    { label: 'Channels', value: `${status?.channels?.active || 0} active / ${status?.channels?.total || 0} total` },
    { label: 'Sync State', value: `${status?.syncStateCount || 0} doctors` },
    { label: 'Retry Queue', value: `${status?.retry?.pending || 0} pending, ${status?.retry?.failed || 0} failed` },
    { label: 'Drift', value: status?.drift ? `${status.drift.healthy} healthy, ${status.drift.degraded} degraded, ${status.drift.unhealthy} unhealthy` : 'No data' },
    { label: 'Failed Syncs', value: fmt(stats?.month?.failed || 0) },
    { label: 'Daily Quota', value: status?.quota ? `${fmt(status.quota.dailyRequests)} / ${fmt(status.quota.dailyLimit)} (${pct(status.quota.usagePercent)})` : '—' },
  ];

  return (
    <Box>
      <SectionHeader title="Calendar Overview" subtitle="System health and sync status" action={<Button size="small" startIcon={<RefreshRoundedIcon />} onClick={onRefresh}>Refresh</Button>} />
      <Grid container spacing={2}>
        {items.map((item, i) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid rgba(148,163,184,0.12)', height: '100%' }}>
              <Typography color="text.secondary" fontSize={12} fontWeight={600} mb={0.5}>{item.label}</Typography>
              <Typography fontWeight={item.bold ? 800 : 600} fontSize={item.bold ? 20 : 15} sx={{ color: item.color || 'text.primary' }}>{item.value}</Typography>
            </Paper>
          </Grid>
        ))}
        <Grid item xs={12}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={600} fontSize={14} mb={1.5}>Doctors Calendar Status</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow>{['Doctor', 'Calendar', 'OAuth', 'Channel', 'Drift'].map(h => <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>)}</TableRow></TableHead>
                <TableBody>
                  {status?.doctors?.length > 0 ? status.doctors.slice(0, 10).map((doc, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontWeight: 600 }}>{doc.name || doc.doctorId}</TableCell>
                      <TableCell><StatusBadge status={doc.calendarId ? 'active' : 'stopped'} /></TableCell>
                      <TableCell><StatusBadge status={doc.oauth?.status || 'unknown'} /></TableCell>
                      <TableCell><StatusBadge status={doc.channelStatus || 'unknown'} /></TableCell>
                      <TableCell><StatusBadge status={doc.driftStatus || 'healthy'} /></TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.disabled', py: 3 }}>No doctor data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Live Metrics
// ═══════════════════════════════════════════════════════════════════════════════
function LiveMetricsSection({ data, loading, observability }) {
  if (loading) return <LoadingOverlay />;
  const defaultStats = { today: { created: 0, updated: 0, deleted: 0, failed: 0, retries: 0 }, week: {}, month: {} };
  const stats = data?.stats || defaultStats;
  const obs = observability || {};

  const metrics = [
    { label: 'Bookings Synced Today', value: fmt(stats.today?.created || 0), icon: <CloudSyncRoundedIcon sx={{ fontSize: 20 }} />, color: 'primary', subtitle: `Updated: ${stats.today?.updated || 0}` },
    { label: 'Failed Syncs', value: fmt(stats.today?.failed || 0), icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 20 }} />, color: 'error', subtitle: `${stats.month?.failed || 0} this month` },
    { label: 'Pending Retry', value: fmt(data?.status?.retry?.pending || 0), icon: <AutorenewRoundedIcon sx={{ fontSize: 20 }} />, color: 'warning' },
    { label: 'Expired Channels', value: fmt(data?.status?.channels?.expired || 0), icon: <CloudOffRoundedIcon sx={{ fontSize: 20 }} />, color: 'error' },
    { label: 'Expiring OAuth', value: fmt(data?.status?.tokens?.expiring || 0), icon: <KeyRoundedIcon sx={{ fontSize: 20 }} />, color: 'warning' },
    { label: 'API Requests', value: fmt(obs.requestsTotal || 0), icon: <SpeedRoundedIcon sx={{ fontSize: 20 }} />, color: 'info' },
    { label: 'Avg Sync Time', value: obs.syncTime?.avg ? `${obs.syncTime.avg}ms` : '—', icon: <ScheduleRoundedIcon sx={{ fontSize: 20 }} />, color: 'secondary' },
    { label: 'P95 Latency', value: obs.syncTime?.p95 ? `${obs.syncTime.p95}ms` : '—', icon: <BarChartRoundedIcon sx={{ fontSize: 20 }} />, color: 'primary' },
    { label: 'P99 Latency', value: obs.syncTime?.p99 ? `${obs.syncTime.p99}ms` : '—', icon: <BarChartRoundedIcon sx={{ fontSize: 20 }} />, color: 'warning' },
  ];

  return (
    <Box>
      <SectionHeader title="Live Metrics" subtitle="Real-time calendar sync performance" />
      <Grid container spacing={1.5}>
        {metrics.map((m, i) => (
          <Grid item xs={6} sm={4} md={3} lg={2.4} key={i}>
            <MetricCard {...m} />
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={2} mt={1}>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Today's Sync Activity</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[
                { name: 'Created', value: stats.today?.created || 0 },
                { name: 'Updated', value: stats.today?.updated || 0 },
                { name: 'Deleted', value: stats.today?.deleted || 0 },
                { name: 'Failed', value: stats.today?.failed || 0 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ReTooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {[{ fill: '#0A6EBD' }, { fill: '#14B8A6' }, { fill: '#EF4444' }, { fill: '#F59E0B' }].map((e, i) => <Cell key={i} {...e} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Success vs Failure Ratio</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={[
                  { name: 'Success', value: Math.max(0, (obs.successRatio || 100)) },
                  { name: 'Failure', value: Math.max(0, (obs.failureRatio || 0)) },
                ]} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                  <Cell fill="#10B981" stroke="none" />
                  <Cell fill="#EF4444" stroke="none" />
                </Pie>
                <ReTooltip contentStyle={{ borderRadius: 8, border: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10B981' }} /><Typography fontSize={12}>Success {pct(obs.successRatio)}</Typography></Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#EF4444' }} /><Typography fontSize={12}>Failure {pct(obs.failureRatio)}</Typography></Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Calendar Activity Timeline
// ═══════════════════════════════════════════════════════════════════════════════
const ACTIVITY_FILTERS = ['all', 'GOOGLE_EVENT_CREATED', 'GOOGLE_EVENT_UPDATED', 'GOOGLE_EVENT_DELETED', 'GOOGLE_EVENT_RECREATED', 'GOOGLE_SYNC_RETRY', 'GOOGLE_CONFLICT_DETECTED', 'GOOGLE_OAUTH_REFRESHED', 'GOOGLE_CHANNEL_CREATED', 'GOOGLE_CHANNEL_RENEWED', 'GOOGLE_BUSY_IMPORTED', 'DRIFT_DETECTED'];
const ACTION_LABELS = { GOOGLE_EVENT_CREATED: 'Created', GOOGLE_EVENT_UPDATED: 'Updated', GOOGLE_EVENT_DELETED: 'Deleted', GOOGLE_EVENT_RECREATED: 'Recreated', GOOGLE_SYNC_RETRY: 'Retry', GOOGLE_CONFLICT_DETECTED: 'Conflict', GOOGLE_OAUTH_REFRESHED: 'OAuth Refreshed', GOOGLE_CHANNEL_CREATED: 'Channel Created', GOOGLE_CHANNEL_RENEWED: 'Channel Renewed', GOOGLE_BUSY_IMPORTED: 'Busy Imported', DRIFT_DETECTED: 'Drift Detected' };
const ACTION_COLORS = { GOOGLE_EVENT_CREATED: '#10B981', GOOGLE_EVENT_UPDATED: '#0A6EBD', GOOGLE_EVENT_DELETED: '#EF4444', GOOGLE_EVENT_RECREATED: '#8B5CF6', GOOGLE_SYNC_RETRY: '#F59E0B', GOOGLE_CONFLICT_DETECTED: '#EC4899', GOOGLE_OAUTH_REFRESHED: '#14B8A6', GOOGLE_CHANNEL_CREATED: '#6366F1', GOOGLE_CHANNEL_RENEWED: '#6366F1', GOOGLE_BUSY_IMPORTED: '#0A6EBD', DRIFT_DETECTED: '#EF4444' };

function ActivityTimeline({ loading: parentLoading }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [filter, setFilter] = useState('all');
  const loaderRef = useRef(null);

  const load = useCallback(async (reset) => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (!reset && cursor) params.cursor = cursor;
      const res = await getCalendarActivity(params);
      const data = res.data;
      if (reset) setItems(data.items || []);
      else setItems(prev => [...prev, ...(data.items || [])]);
      setHasMore(data.pagination?.hasMore || false);
      setCursor(data.pagination?.nextCursor || null);
    } catch { /* ignore */ }
    setLoading(false);
  }, [cursor]);

  useEffect(() => { load(true); }, []);

  useEffect(() => {
    if (!hasMore || loading) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) load(false); }, { rootMargin: '200px' });
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, load]);

  const filtered = items.filter(i => filter === 'all' || i.action === filter);

  return (
    <Box>
      <SectionHeader title="Activity Timeline" subtitle="Calendar sync and Google event activity" />
      <FilterBar>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <Select value={filter} onChange={e => setFilter(e.target.value)}>
            <MenuItem value="all">All Events</MenuItem>
            {ACTIVITY_FILTERS.slice(1).map(f => <MenuItem key={f} value={f}>{ACTION_LABELS[f] || f}</MenuItem>)}
          </Select>
        </FormControl>
        <Typography color="text.disabled" fontSize={12}>{filtered.length} events</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={() => load(true)}>Refresh</Button>
      </FilterBar>
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)', maxHeight: 600, overflow: 'auto' }}>
        {filtered.length === 0 && !loading ? (
          <EmptyState title="No activity" description="No calendar events recorded yet" />
        ) : (
          <Box>
            {filtered.map((item, i) => (
              <Box key={item.id || i} sx={{ display: 'flex', gap: 2, px: 2.5, py: 1.5, borderBottom: '1px solid rgba(148,163,184,0.08)', '&:hover': { bgcolor: 'grey.50' }, transition: 'background 0.15s' }}>
                <Box sx={{ mt: 0.3, flexShrink: 0 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: ACTION_COLORS[item.action] || '#94A3B8' }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={ACTION_LABELS[item.action] || item.action} size="small" sx={{ bgcolor: `${ACTION_COLORS[item.action] || '#94A3B8'}20`, color: ACTION_COLORS[item.action] || '#94A3B8', fontWeight: 700, fontSize: 11, height: 22 }} />
                    <Typography fontSize={13} fontWeight={500}>{item.entityType} #{item.entityId?.slice(0, 8)}</Typography>
                    <Typography fontSize={11} color="text.disabled">{timeAgo(item.time)}</Typography>
                  </Box>
                  {item.details && <Typography fontSize={12} color="text.secondary" mt={0.3} sx={{ opacity: 0.7 }}>{JSON.stringify(item.details).slice(0, 120)}</Typography>}
                </Box>
              </Box>
            ))}
            {loading && <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>}
            <div ref={loaderRef} style={{ height: 1 }} />
          </Box>
        )}
      </Paper>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Doctor Calendar Management
// ═══════════════════════════════════════════════════════════════════════════════
function DoctorManagementSection({ overviewData, overviewLoading }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    if (overviewData?.status?.doctors) {
      setDoctors(overviewData.status.doctors);
      setLoading(false);
    } else if (!overviewLoading) {
      getCalendarStatus().then(r => setDoctors(r.data?.doctors || [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [overviewData, overviewLoading]);

  const handleAction = async (doctorId, action) => {
    setActionLoading(`${action}:${doctorId}`);
    try {
      switch (action) {
        case 'resync': await resyncDoctor({ doctorId }); break;
        case 'reconnect': await resyncDoctor({ doctorId }); break;
        case 'renew': await resyncDoctor({ doctorId }); break;
        case 'full': await fullResync(); break;
      }
      setSnackbar({ open: true, message: `${action} completed for doctor`, severity: 'success' });
    } catch { setSnackbar({ open: true, message: `${action} failed`, severity: 'error' }); }
    setActionLoading(null);
    setConfirmAction(null);
  };

  if (loading) return <LoadingOverlay />;
  if (doctors.length === 0) return <EmptyState title="No doctors" description="No doctors with calendar integration" />;

  return (
    <Box>
      <SectionHeader title="Doctor Calendar Management" subtitle="OAuth, channels, and sync per doctor" action={<Button size="small" startIcon={<RefreshRoundedIcon />} onClick={() => getCalendarStatus().then(r => setDoctors(r.data?.doctors || [])).catch(() => {})}>Refresh</Button>} />
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)', overflow: 'auto' }}>
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
              {['Doctor', 'Calendar ID', 'OAuth', 'Channel', 'Bookings', 'Actions'].map(h => <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>)}
            </TableRow></TableHead>
            <TableBody>
              {doctors.map((doc, i) => (
                <TableRow key={doc.doctorId || i} sx={{ '&:hover': { bgcolor: '#FAFBFC' } }}>
                  <TableCell><Typography fontWeight={600} fontSize={13}>{doc.name || doc.doctorId?.slice(0, 12)}</Typography></TableCell>
                  <TableCell><Typography fontSize={12} color="text.secondary">{doc.calendarId || '—'}</Typography></TableCell>
                  <TableCell><StatusBadge status={doc.oauth?.status || 'unknown'} /></TableCell>
                  <TableCell><StatusBadge status={doc.channelStatus || 'unknown'} /></TableCell>
                  <TableCell><Typography fontSize={13}>{doc.syncedBookings ?? '—'}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Reconnect"><span><IconButton size="small" color="primary" onClick={() => setConfirmAction({ doctorId: doc.doctorId, action: 'reconnect' })} disabled={actionLoading === `reconnect:${doc.doctorId}`}>{actionLoading === `reconnect:${doc.doctorId}` ? <CircularProgress size={16} /> : <CloudSyncRoundedIcon fontSize="small" />}</IconButton></span></Tooltip>
                      <Tooltip title="Renew Channel"><IconButton size="small" color="secondary" onClick={() => setConfirmAction({ doctorId: doc.doctorId, action: 'renew' })}><AutorenewRoundedIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Full Sync"><IconButton size="small" color="info" onClick={() => setConfirmAction({ doctorId: doc.doctorId, action: 'full' })}><SyncRoundedIcon fontSize="small" /></IconButton></Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <ConfirmDialog open={!!confirmAction} title={`Confirm ${confirmAction?.action}`} message={`${confirmAction?.action} doctor ${confirmAction?.doctorId?.slice(0, 12)}?`} onConfirm={() => handleAction(confirmAction.doctorId, confirmAction.action)} onCancel={() => setConfirmAction(null)} />
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Booking Verification
// ═══════════════════════════════════════════════════════════════════════════════
function BookingVerificationSection() {
  const [bookingId, setBookingId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const handleVerify = async () => {
    if (!bookingId.trim()) return;
    setLoading(true);
    try {
      const res = await verifyBooking(bookingId.trim());
      setResult(res.data);
    } catch (err) { setSnackbar({ open: true, message: 'Booking not found or error', severity: 'error' }); setResult(null); }
    setLoading(false);
  };

  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      if (action === 'verify') { await handleVerify(); setActionLoading(false); return; }
      if (action === 'resync') await resyncBooking({ bookingId });
      if (action === 'recreate') await recreateEvent({ bookingId });
      setSnackbar({ open: true, message: `${action} completed`, severity: 'success' });
    } catch { setSnackbar({ open: true, message: `${action} failed`, severity: 'error' }); }
    setActionLoading(false);
  };

  const checks = result?.checks || result || {};
  const isGood = checks.bookingExists && checks.doctorExists && checks.googleEventExists !== false && checks.drift === 'none';

  return (
    <Box>
      <SectionHeader title="Booking Verification" subtitle="Verify and sync individual bookings" />
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <TextField label="Booking ID" value={bookingId} onChange={e => setBookingId(e.target.value)} placeholder="Enter booking ID" size="small" sx={{ minWidth: 300 }} onKeyDown={e => e.key === 'Enter' && handleVerify()} />
          <Button variant="contained" onClick={handleVerify} disabled={loading || !bookingId.trim()} startIcon={loading ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <VerifiedRoundedIcon />}>Verify</Button>
        </Box>
      </Paper>
      {result && (
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${isGood ? '#10B981' : '#EF4444'}40` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            {isGood ? <CheckCircleRoundedIcon sx={{ color: '#10B981' }} /> : <WarningAmberRoundedIcon sx={{ color: '#EF4444' }} />}
            <Typography fontWeight={700} fontSize={16}>{isGood ? 'Verified — All checks passed' : 'Issues detected'}</Typography>
          </Box>
          <Grid container spacing={1.5}>
            {[
              { label: 'Booking Exists', value: checks.bookingExists, good: true },
              { label: 'Doctor Exists', value: checks.doctorExists, good: true },
              { label: 'Has Event ID', value: checks.hasCalendarEventId, good: true },
              { label: 'Is Synced', value: checks.isCalendarSynced, good: true },
              { label: 'Google Event Exists', value: checks.googleEventExists, good: true },
              { label: 'Drift Level', value: checks.drift || 'none', good: checks.drift === 'none' },
              { label: 'Doctor Match', value: checks.doctorMatch, good: true },
            ].map((c, i) => (
              <Grid item xs={6} sm={4} md={3} key={i}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: c.value ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${c.value ? '#10B981' : '#EF4444'}20` }}>
                  <Typography fontSize={11} color="text.secondary" fontWeight={600}>{c.label}</Typography>
                  <Typography fontWeight={700} fontSize={15} color={c.value ? '#10B981' : '#EF4444'}>{String(c.value ?? '—')}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
          <Box sx={{ display: 'flex', gap: 1, mt: 2.5, flexWrap: 'wrap' }}>
            <Button variant="contained" color="primary" size="small" onClick={() => handleAction('resync')} disabled={actionLoading} startIcon={actionLoading ? <CircularProgress size={14} /> : <SyncRoundedIcon />}>Resync</Button>
            <Button variant="contained" color="secondary" size="small" onClick={() => handleAction('recreate')} disabled={actionLoading} startIcon={actionLoading ? <CircularProgress size={14} /> : <CloudSyncRoundedIcon />}>Recreate Event</Button>
          </Box>
        </Paper>
      )}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Conflict Center
// ═══════════════════════════════════════════════════════════════════════════════
function ConflictCenterSection() {
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('all');

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, pageSize: 20 };
      if (typeFilter !== 'all') params.type = typeFilter;
      const res = await getCalendarConflicts(params);
      setConflicts(res.data?.items || []);
      setTotal(res.data?.pagination?.total || 0);
    } catch { setConflicts([]); }
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { loadConflicts(); }, [loadConflicts]);

  const typeCounts = useMemo(() => {
    const counts = {};
    conflicts.forEach(c => { counts[c.type] = (counts[c.type] || 0) + 1; });
    return counts;
  }, [conflicts]);

  return (
    <Box>
      <SectionHeader title="Conflict Center" subtitle="Missing events, duplicates, double bookings" action={<Button size="small" startIcon={<RefreshRoundedIcon />} onClick={loadConflicts}>Refresh</Button>} />
      <FilterBar>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <Select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }}>
            <MenuItem value="all">All Types</MenuItem>
            {Array.from(new Set(conflicts.map(c => c.type))).map(t => <MenuItem key={t} value={t}>{t} ({typeCounts[t] || 0})</MenuItem>)}
          </Select>
        </FormControl>
        <Typography color="text.disabled" fontSize={12}>{total} total conflicts</Typography>
      </FilterBar>
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
        <Box sx={{ display: 'flex', gap: 2, p: 2, flexWrap: 'wrap' }}>
          {[
            { label: 'Missing Events', count: conflicts.filter(c => c.type === 'missing_event').length, color: '#EF4444' },
            { label: 'Duplicates', count: conflicts.filter(c => c.type === 'time_overlap').length, color: '#F59E0B' },
            { label: 'Cancelled', count: conflicts.filter(c => c.type === 'cancelled_event').length, color: '#8B5CF6' },
            { label: 'Orphan', count: conflicts.filter(c => c.type === 'orphan_event').length, color: '#EC4899' },
            { label: 'Busy Conflicts', count: conflicts.filter(c => c.type === 'busy_conflict').length, color: '#14B8A6' },
            { label: 'Double Bookings', count: conflicts.filter(c => c.severity === 'high').length, color: '#EF4444' },
          ].map((s, i) => (
            <Paper key={i} elevation={0} sx={{ px: 2, py: 1, borderRadius: 2, bgcolor: `${s.color}10`, border: `1px solid ${s.color}30`, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography fontWeight={800} fontSize={20} sx={{ color: s.color }}>{s.count}</Typography>
              <Typography fontSize={12} fontWeight={600} color="text.secondary">{s.label}</Typography>
            </Paper>
          ))}
        </Box>
        <DataGrid
          rows={conflicts}
          columns={[
            { field: 'type', headerName: 'Type', width: 150, renderCell: p => <Chip label={p.value} size="small" sx={{ fontWeight: 600, fontSize: 11 }} /> },
            { field: 'severity', headerName: 'Severity', width: 110, renderCell: p => <StatusBadge status={p.value} /> },
            { field: 'doctorName', headerName: 'Doctor', width: 150 },
            { field: 'date', headerName: 'Date', width: 110 },
            { field: 'time', headerName: 'Time', width: 80 },
            { field: 'description', headerName: 'Description', flex: 1, minWidth: 200 },
          ]}
          getRowId={(r) => `${r.bookingId}-${r.type}-${r.date}-${r.time}`}
          autoHeight
          pageSizeOptions={[20]}
          sx={{ border: 'none', '& .MuiDataGrid-columnHeaders': { bgcolor: '#F8FAFC', fontWeight: 700 } }}
          loading={loading}
        />
      </Paper>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Retry Queue
// ═══════════════════════════════════════════════════════════════════════════════
function RetryQueueSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCalendarOverview();
      const retryItems = (res.data?.recentActivity?.items || []).filter(i => i.action === 'GOOGLE_SYNC_RETRY').map(i => ({
        id: i.id, bookingId: i.entityId, doctorId: i.details?.doctorId || '—', attempt: i.details?.attempt || 1, status: i.details?.status || 'pending', error: i.details?.error || '—', time: i.time,
      }));
      setRows(retryItems.slice(0, 50));
    } catch { setRows([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const columns = useMemo(() => [
    { field: 'id', headerName: 'ID', width: 90, renderCell: p => <Typography fontSize={12}>{p.value?.slice(0, 8)}</Typography> },
    { field: 'bookingId', headerName: 'Booking', width: 100, renderCell: p => <Typography fontSize={12}>{p.value?.slice(0, 8)}</Typography> },
    { field: 'doctorId', headerName: 'Doctor', width: 100, renderCell: p => <Typography fontSize={12}>{typeof p.value === 'string' ? p.value.slice(0, 8) : '—'}</Typography> },
    { field: 'attempt', headerName: 'Attempts', width: 90, renderCell: p => <Chip label={p.value || 1} size="small" /> },
    { field: 'time', headerName: 'Next Retry', width: 160, renderCell: p => <Typography fontSize={12}>{timeAgo(p.value)}</Typography> },
    { field: 'status', headerName: 'Status', width: 110, renderCell: p => <StatusBadge status={p.value || 'pending'} /> },
    { field: 'error', headerName: 'Error', flex: 1, minWidth: 150, renderCell: p => <Typography fontSize={12} color="error.main" noWrap>{p.value}</Typography> },
  ], []);

  return (
    <Box>
      <SectionHeader title="Retry Queue" subtitle="Failed sync operations pending retry" action={<Button size="small" startIcon={<RefreshRoundedIcon />} onClick={loadData}>Refresh</Button>} />
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
        <DataGrid rows={rows} columns={columns} autoHeight pageSizeOptions={[20, 50]} initialState={{ pagination: { paginationModel: { pageSize: 20 } } }} sx={{ border: 'none', '& .MuiDataGrid-columnHeaders': { bgcolor: '#F8FAFC', fontWeight: 700 } }} loading={loading} getRowId={(r) => r.id} />
      </Paper>
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: Google Channels
// ═══════════════════════════════════════════════════════════════════════════════
function ChannelsSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCalendarStatus();
      const docs = res.data?.doctors || [];
      const channels = docs.filter(d => d.channelStatus).map((d, i) => ({
        id: d.doctorId || i, channelId: d.channelId || `${d.doctorId?.slice(0, 8)}`, doctorName: d.name || d.doctorId, expiration: d.channelExpiration, status: d.channelStatus || 'unknown',
      }));
      setRows(channels);
    } catch { setRows([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAction = async (action) => {
    try {
      if (action === 'renew') { await renewChannels(); }
      setSnackbar({ open: true, message: `${action} completed`, severity: 'success' });
      loadData();
    } catch { setSnackbar({ open: true, message: `${action} failed`, severity: 'error' }); }
  };

  return (
    <Box>
      <SectionHeader title="Google Channels" subtitle="Push notification channels for calendar sync" action={<Box sx={{ display: 'flex', gap: 1 }}><Button size="small" onClick={() => handleAction('renew')} startIcon={<AutorenewRoundedIcon />}>Renew All</Button><Button size="small" startIcon={<RefreshRoundedIcon />} onClick={loadData}>Refresh</Button></Box>} />
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>{['Doctor', 'Channel ID', 'Expiration', 'Status', 'Actions'].map(h => <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5} sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.disabled', py: 3 }}>No channels</TableCell></TableRow> : rows.map((row, i) => (
                <TableRow key={row.id || i} sx={{ '&:hover': { bgcolor: '#FAFBFC' } }}>
                  <TableCell><Typography fontWeight={600} fontSize={13}>{row.doctorName}</Typography></TableCell>
                  <TableCell><Typography fontSize={12} color="text.secondary">{row.channelId?.slice(0, 20)}</Typography></TableCell>
                  <TableCell><Typography fontSize={12}>{row.expiration ? timeAgo(row.expiration) : '—'}</Typography></TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Renew"><IconButton size="small" color="primary"><AutorenewRoundedIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Stop"><IconButton size="small" color="error"><StopRoundedIcon fontSize="small" /></IconButton></Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}><Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>{snackbar.message}</Alert></Snackbar>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: OAuth Tokens
// ═══════════════════════════════════════════════════════════════════════════════
function OAuthSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCalendarStatus().then(r => {
      const docs = r.data?.doctors || [];
      setRows(docs.filter(d => d.oauth).map((d, i) => ({ id: d.doctorId || i, doctorName: d.name || d.doctorId, ...d.oauth })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <SectionHeader title="OAuth Tokens" subtitle="Google OAuth 2.0 token status per doctor" />
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>{['Doctor', 'Expires', 'Status', 'Reconnect'].map(h => <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={4} sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={4} sx={{ textAlign: 'center', color: 'text.disabled', py: 3 }}>No OAuth tokens</TableCell></TableRow> : rows.map((row, i) => (
                <TableRow key={row.id || i} sx={{ '&:hover': { bgcolor: '#FAFBFC' } }}>
                  <TableCell><Typography fontWeight={600} fontSize={13}>{row.doctorName}</Typography></TableCell>
                  <TableCell><Typography fontSize={12}>{row.expiresAt ? timeAgo(row.expiresAt) : '—'}</Typography></TableCell>
                  <TableCell><StatusBadge status={row.status || 'active'} /></TableCell>
                  <TableCell><Button size="small" variant="outlined" color="primary" startIcon={<CloudSyncRoundedIcon />}>Reconnect</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: Drift Report
// ═══════════════════════════════════════════════════════════════════════════════
function DriftReportSection({ overviewData, overviewLoading }) {
  const drift = overviewData?.status?.drift;
  if (overviewLoading) return <LoadingOverlay />;
  if (!drift) return <EmptyState title="No drift data" description="Run a drift check from the Maintenance tab" />;

  const stats = [
    { label: 'Doctors Scanned', value: fmt(drift.doctorsScanned), color: '#0A6EBD' },
    { label: 'Healthy', value: fmt(drift.healthy), color: '#10B981' },
    { label: 'Degraded', value: fmt(drift.degraded), color: '#F59E0B' },
    { label: 'Unhealthy', value: fmt(drift.unhealthy), color: '#EF4444' },
    { label: 'Missing Events', value: fmt(drift.totalMissing), color: '#EF4444' },
    { label: 'Orphan Events', value: fmt(drift.totalOrphan), color: '#EC4899' },
    { label: 'Modified Events', value: fmt(drift.totalModified), color: '#8B5CF6' },
  ];

  return (
    <Box>
      <SectionHeader title="Drift Report" subtitle="Calendar synchronization drift between SmartClinic and Google Calendar" />
      <Grid container spacing={1.5}>
        {stats.map((s, i) => (
          <Grid item xs={6} sm={4} md={3} lg={2.4} key={i}>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: `1px solid ${s.color}30`, bgcolor: `${s.color}08`, textAlign: 'center' }}>
              <Typography fontWeight={800} fontSize={28} sx={{ color: s.color }}>{s.value}</Typography>
              <Typography fontSize={12} fontWeight={600} color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: Scheduling Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
function SchedulingDashboardSection() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('all');

  useEffect(() => {
    Promise.all([
      getSchedulingAnalytics({ days: 30 }).catch(() => ({ data: null })),
      getCalendarStatus().then(r => r.data?.doctors || []).catch(() => []),
    ]).then(([a, d]) => { setAnalytics(a.data); setDoctors(d); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingOverlay />;
  if (!analytics) return <EmptyState title="No scheduling data" />;

  const today = new Date().toISOString().split('T')[0];
  const todayTrend = analytics.monthlyTrend?.filter(d => d.date === today)?.[0];

  return (
    <Box>
      <SectionHeader title="Scheduling Dashboard" subtitle="Today's schedule, utilization, and availability" />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Today's Bookings" value={fmt(todayTrend?.count || 0)} color="primary" icon={<TodayRoundedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Utilization" value={analytics.utilization?.rate || '—'} color="secondary" icon={<TrendingUpRoundedIcon />} subtitle={`${fmt(analytics.utilization?.usedCapacity)} of ${fmt(analytics.utilization?.totalCapacity)} slots`} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Available Slots" value={fmt(analytics.utilization?.idleCapacity || 0)} color="success" icon={<ScheduleRoundedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Cancellations" value={fmt(analytics.summary?.cancelled || 0)} color="warning" icon={<WarningAmberRoundedIcon />} subtitle={`${analytics.summary?.cancellationRate || 0}% rate`} />
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Monthly Trend</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={analytics.monthlyTrend?.slice(-31) || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <ReTooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="count" stroke="#0A6EBD" fill="#0A6EBD20" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Service Distribution</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={(analytics.serviceLoad || []).slice(0, 8)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="service" paddingAngle={2}>
                  {(analytics.serviceLoad || []).slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                </Pie>
                <ReTooltip contentStyle={{ borderRadius: 8, border: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, justifyContent: 'center' }}>
              {(analytics.serviceLoad || []).slice(0, 8).map((s, i) => (
                <Chip key={s.service} label={`${s.service}: ${s.count}`} size="small" sx={{ bgcolor: `${COLORS[i % COLORS.length]}15`, color: COLORS[i % COLORS.length], fontWeight: 600, fontSize: 11 }} />
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Doctor Occupancy</Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={(analytics.occupancy || []).slice(0, 20)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="doctorId" tick={{ fontSize: 10 }} width={100} tickFormatter={v => v?.slice(0, 10)} />
                <ReTooltip contentStyle={{ borderRadius: 8, border: 'none' }} />
                <Bar dataKey="bookings" radius={[0, 6, 6, 0]} fill="#0A6EBD" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Peak Hours</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.peakHours || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ReTooltip contentStyle={{ borderRadius: 8, border: 'none' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#F59E0B" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Weekly Heat Map</Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
              {DAYS.map(day => {
                const count = analytics.heatMap?.[day] || 0;
                const maxCount = Math.max(...Object.values(analytics.heatMap || {}), 1);
                const intensity = maxCount > 0 ? count / maxCount : 0;
                return (
                  <Box key={day} sx={{ textAlign: 'center' }}>
                    <Box sx={{ width: 60, height: 60, borderRadius: 2, bgcolor: `rgba(10,110,189,${Math.max(0.08, intensity)})`, border: '1px solid rgba(10,110,189,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                      <Typography fontWeight={800} fontSize={18} color="primary.main">{count}</Typography>
                    </Box>
                    <Typography fontSize={11} fontWeight={600} color="text.secondary" mt={0.3}>{day}</Typography>
                  </Box>
                );
              })}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12: Observability
// ═══════════════════════════════════════════════════════════════════════════════
function ObservabilitySection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCalendarObservability().then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingOverlay />;
  if (!data) return <EmptyState title="No observability data" />;

  const latencyData = [
    { name: 'Avg', Sync: data.syncTime?.avg || 0, API: data.apiLatency?.avg || 0 },
    { name: 'P95', Sync: data.syncTime?.p95 || 0, API: data.apiLatency?.avg || 0 },
    { name: 'P99', Sync: data.syncTime?.p99 || 0, API: data.apiLatency?.avg || 0 },
    { name: 'Max', Sync: data.syncTime?.max || 0, API: data.apiLatency?.max || 0 },
  ];

  const webhookSeries = [
    { name: 'Webhook', value: data.webhookLatency || 0 },
    { name: 'Retry', value: data.retryLatency || 0 },
    { name: 'Channel', value: data.channelRenewalLatency || 0 },
  ].filter(d => d.value > 0);

  return (
    <Box>
      <SectionHeader title="Observability" subtitle="System performance, latency, and reliability metrics" />
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>API & Sync Latency (ms)</Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={latencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ReTooltip contentStyle={{ borderRadius: 8, border: 'none' }} />
                <Legend />
                <Bar dataKey="Sync" radius={[6, 6, 0, 0]} fill="#0A6EBD" />
                <Bar dataKey="API" radius={[6, 6, 0, 0]} fill="#14B8A6" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Request Stats</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Requests', value: fmt(data.requestsTotal || 0), color: '#0A6EBD' },
                { label: 'Total Failures', value: fmt(data.failuresTotal || 0), color: '#EF4444' },
                { label: 'Success Ratio', value: pct(data.successRatio || 0), color: '#10B981' },
                { label: 'Failure Ratio', value: pct(data.failureRatio || 0), color: '#EF4444' },
              ].map((s, i) => (
                <Box key={i} sx={{ p: 2, borderRadius: 2, bgcolor: `${s.color}10`, border: `1px solid ${s.color}30`, textAlign: 'center', flex: 1, minWidth: 100 }}>
                  <Typography fontWeight={800} fontSize={22} sx={{ color: s.color }}>{s.value}</Typography>
                  <Typography fontSize={11} fontWeight={600} color="text.secondary">{s.label}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Typography fontWeight={700} fontSize={15} mb={2}>Operational Latencies</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {[
                { label: 'Webhook', value: data.webhookLatency ? `${data.webhookLatency}ms` : '—', color: '#8B5CF6' },
                { label: 'Retry', value: data.retryLatency ? `${data.retryLatency}ms` : '—', color: '#F59E0B' },
                { label: 'Channel Renewal', value: data.channelRenewalLatency ? `${data.channelRenewalLatency}ms` : '—', color: '#EC4899' },
              ].map((s, i) => (
                <Box key={i} sx={{ p: 2, borderRadius: 2, bgcolor: `${s.color}10`, border: `1px solid ${s.color}30`, textAlign: 'center', flex: 1, minWidth: 100 }}>
                  <Typography fontWeight={800} fontSize={22} sx={{ color: s.color }}>{s.value}</Typography>
                  <Typography fontSize={11} fontWeight={600} color="text.secondary">{s.label}</Typography>
                </Box>
              ))}
            </Box>
            {data.mostSyncedDoctors?.length > 0 && (
              <Box mt={2}>
                <Typography fontWeight={600} fontSize={13} mb={1}>Most Synced Doctors</Typography>
                {data.mostSyncedDoctors.slice(0, 5).map((d, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <Typography fontSize={12}>{d.name || d.doctorId?.slice(0, 12)}</Typography>
                    <Typography fontSize={12} fontWeight={600}>{fmt(d.syncedCount)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13: Maintenance
// ═══════════════════════════════════════════════════════════════════════════════
function MaintenanceSection({ onRefreshOverview }) {
  const [loading, setLoading] = useState(null);
  const [results, setResults] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const actions = [
    { id: 'cleanup', label: 'Run Cleanup', desc: 'Remove orphan events, stale retry jobs, expired channels', icon: <HealingRoundedIcon /> },
    { id: 'drift', label: 'Run Drift Check', desc: 'Verify calendar synchronization consistency', icon: <TroubleshootRoundedIcon /> },
    { id: 'retry', label: 'Run Retry Worker', desc: 'Process pending retry jobs', icon: <AutorenewRoundedIcon /> },
    { id: 'channels', label: 'Renew All Channels', desc: 'Renew expiring push notification channels', icon: <DnsRoundedIcon /> },
    { id: 'report', label: 'Generate Diagnostics Report', desc: 'Comprehensive system health check', icon: <ReportRoundedIcon /> },
  ];

  const handleAction = async (action) => {
    setLoading(action);
    try {
      let res;
      switch (action) {
        case 'cleanup': res = await runCalendarCleanup({ type: 'all', dryRun: false }); break;
        case 'drift': res = await getCalendarOverview(); break;
        case 'retry': res = await getCalendarOverview(); break;
        case 'channels': res = await renewChannels(); break;
        case 'report': res = await getCalendarDiagnostics(); break;
      }
      setResults(prev => ({ ...prev, [action]: res?.data || res }));
      setSnackbar({ open: true, message: `${action} completed`, severity: 'success' });
      if (onRefreshOverview) onRefreshOverview();
    } catch { setSnackbar({ open: true, message: `${action} failed`, severity: 'error' }); }
    setLoading(null);
  };

  return (
    <Box>
      <SectionHeader title="Maintenance" subtitle="System maintenance and administrative tasks" />
      <Grid container spacing={2}>
        {actions.map((a) => (
          <Grid item xs={12} sm={6} lg={4} key={a.id}>
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)', '&:hover': { borderColor: 'primary.main' }, transition: 'all 0.2s' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.light', color: 'primary.main', display: 'flex' }}>{a.icon}</Box>
                <Box><Typography fontWeight={700} fontSize={14}>{a.label}</Typography><Typography fontSize={12} color="text.secondary">{a.desc}</Typography></Box>
              </Box>
              <Button variant="outlined" size="small" fullWidth onClick={() => handleAction(a.id)} disabled={loading === a.id} startIcon={loading === a.id ? <CircularProgress size={14} /> : <PlayArrowRoundedIcon />}>
                {loading === a.id ? 'Running...' : 'Run'}
              </Button>
            </Paper>
          </Grid>
        ))}
        {results?.report && (
          <Grid item xs={12}>
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(16,185,129,0.3)' }}>
              <Typography fontWeight={700} fontSize={15} mb={1.5}>Last Diagnostics Report</Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#F0FDF4' }}><Typography fontWeight={700} fontSize={24} color="success.main">{results.report.score || 0}<Typography component="span" fontSize={14} color="text.secondary">/100</Typography></Typography></Box>
                <Box><StatusBadge status={results.report.status || 'unknown'} /><Typography fontSize={12} color="text.secondary" mt={0.5}>Tested {results.report.summary?.total || 0} checks</Typography></Box>
              </Box>
              {results.report.checks?.map((c, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.8, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <StatusBadge status={c.status} />
                  <Typography fontWeight={600} fontSize={13} sx={{ flex: 1 }}>{c.name}</Typography>
                  <Typography fontSize={12} color="text.secondary">{c.details}</Typography>
                </Box>
              ))}
            </Paper>
          </Grid>
        )}
      </Grid>
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14: Export Center
// ═══════════════════════════════════════════════════════════════════════════════
function ExportCenterSection() {
  const [loading, setLoading] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const handleExport = async (type, format) => {
    setLoading(`${type}:${format}`);
    try {
      const res = await exportCalendarData({ type, format });
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${type}-report.${format}`; a.click();
      URL.revokeObjectURL(url);
      setSnackbar({ open: true, message: `${type} exported as ${format.toUpperCase()}`, severity: 'success' });
    } catch { setSnackbar({ open: true, message: `Export failed`, severity: 'error' }); }
    setLoading(null);
  };

  const types = [
    { id: 'sync', label: 'Sync Activity', desc: 'Calendar sync events log' },
    { id: 'conflict', label: 'Conflicts', desc: 'Detected conflicts and issues' },
    { id: 'retry', label: 'Retry Jobs', desc: 'Failed sync retry queue' },
    { id: 'activity', label: 'All Activity', desc: 'Complete activity timeline' },
  ];

  return (
    <Box>
      <SectionHeader title="Export Center" subtitle="Download calendar data as CSV or JSON" />
      <Grid container spacing={2}>
        {types.map((t) => (
          <Grid item xs={12} sm={6} lg={3} key={t.id}>
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)', textAlign: 'center' }}>
              <Typography fontWeight={700} fontSize={15} mb={0.3}>{t.label}</Typography>
              <Typography fontSize={12} color="text.secondary" mb={2}>{t.desc}</Typography>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                <Button size="small" variant="contained" onClick={() => handleExport(t.id, 'csv')} disabled={loading === `${t.id}:csv`} startIcon={loading === `${t.id}:csv` ? <CircularProgress size={14} /> : <FileDownloadRoundedIcon />}>CSV</Button>
                <Button size="small" variant="outlined" onClick={() => handleExport(t.id, 'json')} disabled={loading === `${t.id}:json`} startIcon={loading === `${t.id}:json` ? <CircularProgress size={14} /> : <FileDownloadRoundedIcon />}>JSON</Button>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 15: System Configuration
// ═══════════════════════════════════════════════════════════════════════════════
function SystemConfigSection() {
  const [config, setConfig] = useState(null);
  const [originalConfig, setOriginalConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const { user } = useAuth();
  const isSuper = user?.role === 'superadmin';

  useEffect(() => {
    getCalendarConfig().then(r => { setConfig(r.data); setOriginalConfig(r.data); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const changes = {};
      Object.entries(config).forEach(([k, v]) => { if (v !== originalConfig[k]) changes[k] = v; });
      if (Object.keys(changes).length === 0) { setSnackbar({ open: true, message: 'No changes to save', severity: 'info' }); setSaving(false); return; }
      await updateCalendarConfig(changes);
      setOriginalConfig({ ...config });
      setSnackbar({ open: true, message: 'Configuration updated', severity: 'success' });
    } catch { setSnackbar({ open: true, message: 'Failed to save', severity: 'error' }); }
    setSaving(false);
  };

  if (loading) return <LoadingOverlay />;
  if (!config) return <EmptyState title="No configuration data" />;

  const fields = [
    { key: 'retryAttempts', label: 'Retry Attempts', type: 'number', desc: 'Max retries for failed sync' },
    { key: 'quotaLimit', label: 'Daily Quota Limit', type: 'number', desc: 'Google Calendar API daily quota' },
    { key: 'quotaRps', label: 'Requests Per Second', type: 'number', desc: 'Rate limit per second' },
    { key: 'quotaBurst', label: 'Burst Limit', type: 'number', desc: 'Max burst requests' },
    { key: 'renewThreshold', label: 'Renew Threshold (ms)', type: 'number', desc: 'Channel renewal lead time' },
    { key: 'webhookTimeout', label: 'Webhook Timeout (ms)', type: 'number', desc: 'Webhook processing timeout' },
    { key: 'batchSize', label: 'Batch Size', type: 'number', desc: 'Sync batch size' },
    { key: 'renewalWindowHours', label: 'Renewal Window (hrs)', type: 'number', desc: 'Channel renewal window' },
  ];

  return (
    <Box>
      <SectionHeader title="System Configuration" subtitle="Calendar sync and Google API configuration" action={isSuper ? <Button variant="contained" size="small" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={14} sx={{ color: 'white' }} /> : <CloudSyncRoundedIcon />}>{saving ? 'Saving...' : 'Save Changes'}</Button> : undefined} />
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.12)' }}>
        <Grid container spacing={2}>
          {fields.map((f) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={f.key}>
              <Box>
                <Typography fontWeight={600} fontSize={13} mb={0.3}>{f.label}</Typography>
                <Typography fontSize={11} color="text.secondary" mb={0.5}>{f.desc}</Typography>
                <TextField
                  type={f.type}
                  value={config[f.key] ?? ''}
                  onChange={e => setConfig(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  size="small"
                  fullWidth
                  disabled={!isSuper}
                />
              </Box>
            </Grid>
          ))}
        </Grid>
        {config.retryIntervals && (
          <Box mt={2}>
            <Typography fontWeight={600} fontSize={13} mb={0.5}>Retry Intervals (minutes)</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {config.retryIntervals.map((v, i) => (
                <TextField key={i} type="number" size="small" value={v} disabled={!isSuper}
                  onChange={e => {
                    const arr = [...config.retryIntervals];
                    arr[i] = Number(e.target.value);
                    setConfig(p => ({ ...p, retryIntervals: arr }));
                  }}
                  sx={{ width: 100 }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Paper>
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — Calendar Admin Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
export default function CalendarAdminPage() {
  const { t, isRTL } = useLang();
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [statsData, setStatsData] = useState(null);
  const [obsData, setObsData] = useState(null);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const [overviewRes, statsRes, obsRes] = await Promise.all([
        getCalendarOverview().catch(() => ({ data: null })),
        getCalendarStatistics().catch(() => ({ data: null })),
        getCalendarObservability().catch(() => ({ data: null })),
      ]);
      setOverviewData(overviewRes.data);
      setStatsData(statsRes.data);
      setObsData(obsRes.data);
    } catch { /* ignore */ }
    setOverviewLoading(false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">
          {isRTL ? 'لوحة تحكم التقويم' : 'Calendar Administration'}
        </Typography>
        <Typography color="text.secondary" fontSize={14} mt={0.3}>
          {isRTL ? 'إدارة مزامنة التقويم والجدولة' : 'Google Calendar sync, scheduling, and system administration'}
        </Typography>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(e, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 3, minHeight: 44, borderBottom: '1px solid rgba(148,163,184,0.15)',
          '& .MuiTab-root': { minHeight: 44, py: 1, textTransform: 'none', fontWeight: 600, fontSize: 13, gap: 0.8, minWidth: 'auto', px: 2 },
          '& .MuiTabs-indicator': { height: 3, borderRadius: 99 },
        }}
      >
        {TABS.map(tab => (
          <Tab key={tab.id} value={tab.id} icon={tab.icon} iconPosition="start" label={tab.label} />
        ))}
      </Tabs>

      {activeTab === 'overview' && <OverviewSection data={overviewData} loading={overviewLoading} onRefresh={loadOverview} />}
      {activeTab === 'metrics' && <LiveMetricsSection data={{ status: overviewData?.status, stats: statsData }} loading={overviewLoading} observability={obsData} />}
      {activeTab === 'activity' && <ActivityTimeline loading={overviewLoading} />}
      {activeTab === 'doctors' && <DoctorManagementSection overviewData={overviewData} overviewLoading={overviewLoading} />}
      {activeTab === 'bookings' && <BookingVerificationSection />}
      {activeTab === 'conflicts' && <ConflictCenterSection />}
      {activeTab === 'retry' && <RetryQueueSection />}
      {activeTab === 'channels' && <ChannelsSection />}
      {activeTab === 'oauth' && <OAuthSection />}
      {activeTab === 'drift' && <DriftReportSection overviewData={overviewData} overviewLoading={overviewLoading} />}
      {activeTab === 'schedule' && <SchedulingDashboardSection />}
      {activeTab === 'observability' && <ObservabilitySection />}
      {activeTab === 'maintenance' && <MaintenanceSection onRefreshOverview={loadOverview} />}
      {activeTab === 'export' && <ExportCenterSection />}
      {activeTab === 'config' && <SystemConfigSection />}
    </Box>
  );
}
