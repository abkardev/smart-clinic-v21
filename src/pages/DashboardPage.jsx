'use client';
import React, { useEffect, useState } from 'react';
import { Box, Typography, Chip, Avatar, Paper, Grid, Skeleton } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useLang } from '../context/AppContext.jsx';
import { getDashboardStats } from '../services/api.js';
import { InstagramIcon, PeopleRoundedIcon, TodayRoundedIcon, TrendingUpRoundedIcon, WhatsAppIcon } from '../components/icons';

const STATUS_COLORS = {
  pending: '#F59E0B', confirmed: '#0A6EBD', completed: '#10B981',
  cancelled: '#EF4444', 'no-show': '#8B5CF6', no_show: '#8B5CF6',
};

function StatCard({ icon, label, value, gradient, subtitle }) {
  return (
    <Paper elevation={0} sx={{
      p: 3, borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)',
      background: gradient, position: 'relative', overflow: 'hidden',
      transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' },
      '&::after': { content: '""', position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' },
    }}>
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ p: 1.2, bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 2.5, display: 'inline-flex', mb: 2 }}>{icon}</Box>
        <Typography sx={{ color: 'white', fontWeight: 800, fontSize: 38, lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 13, mt: 0.5 }}>{label}</Typography>
        {subtitle && <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, mt: 0.3 }}>{subtitle}</Typography>}
      </Box>
    </Paper>
  );
}

function StatCardSkeleton() {
  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)' }}>
      <Skeleton width={40} height={40} sx={{ borderRadius: 2, mb: 2 }} />
      <Skeleton width="50%" height={42} sx={{ mb: 0.5 }} />
      <Skeleton width="70%" height={18} />
    </Paper>
  );
}

export default function DashboardPage() {
  const { t, isRTL } = useLang();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then((r) => setStats(r.data))
      .finally(() => setLoading(false));
  }, []);

  const statCards = stats ? [
    { icon: <TrendingUpRoundedIcon sx={{ color:'white',fontSize:22 }} />, label: t('totalBookings'),      value: stats.totalBookings,      gradient: 'linear-gradient(135deg,#0A6EBD 0%,#064A8B 100%)' },
    { icon: <TodayRoundedIcon     sx={{ color:'white',fontSize:22 }} />, label: t('todayAppointments'),  value: stats.todayBookings,      gradient: 'linear-gradient(135deg,#14B8A6 0%,#0F7B6C 100%)', subtitle: `${t('thisMonth')}: ${stats.monthBookings}` },
    { icon: <PeopleRoundedIcon    sx={{ color:'white',fontSize:22 }} />, label: t('activeDoctors'),      value: stats.totalDoctors,       gradient: 'linear-gradient(135deg,#8B5CF6 0%,#6D28D9 100%)' },
    { icon: <WhatsAppIcon         sx={{ color:'white',fontSize:22 }} />, label: t('whatsappBookings'),   value: stats.whatsappBookings,   gradient: 'linear-gradient(135deg,#25D366 0%,#128C7E 100%)', subtitle: t('viaBot') },
    { icon: <InstagramIcon        sx={{ color:'white',fontSize:22 }} />, label: t('instagramBookings'),  value: stats.instagramBookings,  gradient: 'linear-gradient(135deg,#E1306C 0%,#833AB4 50%,#F77737 100%)', subtitle: t('viaBot') },
  ] : [];

  const pieData = stats ? Object.entries(stats.statusBreakdown)
    .map(([k, v]) => ({ name: t(k) || k, value: v, color: STATUS_COLORS[k] }))
    .filter(d => d.value > 0) : [];

  return (
    <Box>
      <Box mb={4}>
        <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">{t('dashboard')}</Typography>
        <Typography color="text.secondary" fontSize={14} mt={0.5}>
          {isRTL ? 'نظرة عامة على العيادة' : 'Clinic overview & analytics'}
        </Typography>
      </Box>

      {/* Stat Cards */}
      <Grid container spacing={2.5} mb={3.5}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <Grid item xs={12} sm={6} lg={2.4} key={i}><StatCardSkeleton /></Grid>)
          : statCards.map((card, i) => <Grid item xs={12} sm={6} lg={2.4} key={i}><StatCard {...card} /></Grid>)
        }
      </Grid>

      <Grid container spacing={2.5} mb={3.5}>
        {/* Status Pie */}
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 3, height: '100%', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 3 }}>
            <Typography fontWeight={700} mb={0.5}>{t('bookingsByStatus')}</Typography>
            <Typography color="text.secondary" fontSize={12} mb={2}>{isRTL ? 'توزيع الحجوزات حسب الحالة' : 'Booking distribution by status'}</Typography>
            {loading ? (
              <Box display="flex" justifyContent="center" py={4}><Skeleton variant="circular" width={180} height={180} /></Box>
            ) : pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 600 }} />
                  </PieChart>
                </ResponsiveContainer>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  {pieData.map(d => (
                    <Box key={d.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: d.color }} />
                      <Typography fontSize={11} fontWeight={600} color="text.secondary">{d.name} ({d.value})</Typography>
                    </Box>
                  ))}
                </Box>
              </>
            ) : (
              <Box display="flex" alignItems="center" justifyContent="center" height={200}>
                <Typography color="text.disabled">{t('noBookingsYet')}</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Doctor Bar */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 3, height: '100%', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 3 }}>
            <Typography fontWeight={700} mb={0.5}>{t('bookingsByDoctor')}</Typography>
            <Typography color="text.secondary" fontSize={12} mb={2}>{isRTL ? 'مقارنة أداء الأطباء' : 'Doctor performance comparison'}</Typography>
            {loading ? (
              <Box><Skeleton height={200} sx={{ borderRadius: 2, transform: 'none' }} /></Box>
            ) : stats?.byDoctor?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={stats.byDoctor.map(d => ({
                    ...d,
                    doctorName: isRTL
                      ? (d.doctorNameAr || d.doctorNameEn || '—')
                      : (d.doctorNameEn || d.doctorNameAr || '—'),
                  }))}
                  margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="doctorName" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 600 }} />
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0A6EBD" /><stop offset="100%" stopColor="#14B8A6" />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="count" fill="url(#barGrad)" radius={[8,8,0,0]} name={t('bookings')} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box display="flex" alignItems="center" justifyContent="center" height={200}>
                <Typography color="text.disabled">{t('noData')}</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Recent bookings */}
      <Paper elevation={0} sx={{ p: 3, border: '1px solid rgba(148,163,184,0.15)', borderRadius: 3 }}>
        <Typography fontWeight={700} mb={2.5}>{t('recentBookings')}</Typography>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Box key={i} sx={{ display:'flex', alignItems:'center', gap:2, mb:1.5 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box flex={1}><Skeleton width="45%" height={18} /><Skeleton width="30%" height={14} sx={{ mt:0.5 }} /></Box>
              <Skeleton width={80} height={22} sx={{ borderRadius:2 }} />
            </Box>
          ))
        ) : stats?.recentBookings?.length === 0 ? (
          <Typography color="text.disabled" textAlign="center" py={3}>{t('noBookingsYet')}</Typography>
        ) : (
          <Box sx={{ display:'flex', flexDirection:'column', gap:1.2 }}>
            {stats.recentBookings.map((b, i) => (
              <Box key={b.id} sx={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                p:1.8, borderRadius:2.5, bgcolor: i%2===0 ? '#F8FAFC' : 'white',
                border:'1px solid rgba(148,163,184,0.1)',
                transition:'all 0.15s', '&:hover': { boxShadow:'0 2px 8px rgba(0,0,0,0.06)', transform:'translateX(2px)' },
              }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1.8 }}>
                  <Avatar sx={{ width:36, height:36, bgcolor:`${STATUS_COLORS[b.status]}22`, color:STATUS_COLORS[b.status], fontWeight:800, fontSize:14 }}>
                    {b.name?.charAt(0)}
                  </Avatar>
                  <Box>
                    <Typography fontWeight={700} fontSize={14}>{b.name}</Typography>
                    <Typography color="text.secondary" fontSize={12}>{b.service} · {
                      b.doctorId
                        ? (isRTL ? (b.doctorId.nameAr || b.doctorId.nameEn) : (b.doctorId.nameEn || b.doctorId.nameAr))
                        : '—'
                    }</Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                  <Typography fontSize={12} fontWeight={600} color="text.secondary">{b.date} · {b.time}</Typography>
                  <Chip label={t(b.status) || b.status} size="small" sx={{ mt:0.5, bgcolor:`${STATUS_COLORS[b.status]}18`, color:STATUS_COLORS[b.status], fontWeight:700, fontSize:10, height:20 }} />
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}


export async function getServerSideProps() {
  return { props: {} };
}
