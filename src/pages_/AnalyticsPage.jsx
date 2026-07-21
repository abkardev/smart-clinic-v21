'use client';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, Select, MenuItem, FormControl, InputLabel,
  Chip, Skeleton, Avatar, Button,
} from '@mui/material';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useLang } from '../context/AppContext.jsx';
import { getAnalyticsOverview, exportAppointmentsReport } from '../services/api.js';
import { DashboardRoundedIcon, DownloadRoundedIcon, InstagramIcon, TrendingDownRoundedIcon, TrendingUpRoundedIcon, WhatsAppIcon } from '../components/icons';
import { STATUS_COLORS } from '../app/lib/constants';

const SOURCE_COLORS = { whatsapp:'#25D366', instagram:'#E1306C', dashboard:'#0A6EBD', api:'#8B5CF6' };
const MONTH_NAMES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function KpiCard({ icon, label, value, sub, color, trend }) {
  const up = trend >= 0;
  return (
    <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)', height: '100%' }}>
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:1.5 }}>
        <Box sx={{ p:1, borderRadius:2, bgcolor:`${color}18` }}>{React.cloneElement(icon, { sx:{ fontSize:20, color } })}</Box>
        {trend !== undefined && (
          <Box sx={{ display:'flex', alignItems:'center', gap:0.3, px:1, py:0.3, borderRadius:99, bgcolor: up?'#ECFDF5':'#FEF2F2' }}>
            {up ? <TrendingUpRoundedIcon sx={{ fontSize:14, color:'#10B981' }} /> : <TrendingDownRoundedIcon sx={{ fontSize:14, color:'#EF4444' }} />}
            <Typography sx={{ fontSize:11, fontWeight:700, color: up?'#10B981':'#EF4444' }}>{Math.abs(trend)}%</Typography>
          </Box>
        )}
      </Box>
      <Typography sx={{ fontWeight:800, fontSize:30, lineHeight:1, letterSpacing:'-0.02em', color:'#0F172A' }}>{value}</Typography>
      <Typography sx={{ fontWeight:600, fontSize:13, color:'text.secondary', mt:0.5 }}>{label}</Typography>
      {sub && <Typography sx={{ fontSize:11, color:'text.disabled', mt:0.3 }}>{sub}</Typography>}
    </Paper>
  );
}

function SectionTitle({ children }) {
  return <Typography fontWeight={800} fontSize={15} mb={2} sx={{ letterSpacing:'-0.01em' }}>{children}</Typography>;
}

function ChartSkeleton({ height = 240 }) {
  return <Skeleton variant="rectangular" height={height} sx={{ borderRadius:2, transform:'none' }} />;
}

export default function AnalyticsPage() {
  const { t, isRTL } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  const MONTH_NAMES = isRTL ? MONTH_NAMES_AR : MONTH_NAMES_EN;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAnalyticsOverview({ period });
      setData(res.data);
    } catch {}
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format) => {
    try {
      const now = new Date();
      const start = new Date(now); start.setDate(now.getDate() - parseInt(period));
      const params = { format, startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
      const res = await exportAppointmentsReport(params);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `appointments-report.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const d = data || { total:{}, completed:{}, cancelled:{current:0,rate:0}, noShow:{current:0,rate:0}, whatsapp:0, instagram:0, trendData:[], statusBreakdown:[], sourceBreakdown:[], doctorPerformance:[], peakHours:[], monthlyTrend:[], mostBookedServices:[] };
  const trendPct = d.total?.trend;
  const completionsPct = d.completed?.trend;

  const kpis = [
    { icon:<TrendingUpRoundedIcon/>, label: isRTL?'إجمالي الحجوزات':t('totalBookings'), value:d.total?.current||0, trend:trendPct, color:'#0A6EBD', sub: isRTL?`${d.total?.previous||0} في الفترة السابقة`:`${d.total?.previous||0} prev period` },
    { icon:<DashboardRoundedIcon/>,  label: isRTL?'مكتملة':t('completed'),              value:d.completed?.current||0, trend:completionsPct, color:'#10B981' },
    { icon:<TrendingDownRoundedIcon/>,label:isRTL?'ملغاة':t('cancelled'),              value:`${d.cancelled?.current||0} (${d.cancelled?.rate||0}%)`, color:'#EF4444' },
    { icon:<TrendingDownRoundedIcon/>,label:isRTL?'لم يحضر':t('noShow'),               value:`${d.noShow?.current||0} (${d.noShow?.rate||0}%)`,    color:'#8B5CF6' },
    { icon:<WhatsAppIcon/>,           label:t('whatsappBookings'),                      value:d.whatsapp||0,        color:'#25D366', sub:t('viaBot') },
    { icon:<InstagramIcon/>,          label:t('instagramBookings'),                     value:d.instagram||0,       color:'#E1306C', sub:t('viaBot') },
  ];

  const statusData = d.statusBreakdown.map(s => ({
    name: t(s.name) || s.name,
    value: s.value,
    color: STATUS_COLORS[s.name] || '#94A3B8',
  }));

  const sourceData = d.sourceBreakdown.map(s => ({
    name: s.name,
    value: s.value,
    color: SOURCE_COLORS[s.name] || '#94A3B8',
  }));

  const monthlyData = d.monthlyTrend.map(m => ({
    ...m,
    label: MONTH_NAMES[parseInt(m.month.slice(5)) - 1] || m.month,
  }));

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">{t('analytics')}</Typography>
          <Typography color="text.secondary" fontSize={14} mt={0.5}>
            {isRTL ? 'تحليل شامل لأداء العيادة' : 'Comprehensive clinic performance analytics'}
          </Typography>
        </Box>
        <Box display="flex" gap={0.5} alignItems="center" flexWrap="wrap">
          <Button size="small" variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={() => handleExport('pdf')} sx={{ textTransform:'none', fontSize:12 }}>PDF</Button>
          <Button size="small" variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={() => handleExport('csv')} sx={{ textTransform:'none', fontSize:12 }}>CSV</Button>
          <Button size="small" variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={() => handleExport('xlsx')} sx={{ textTransform:'none', fontSize:12 }}>Excel</Button>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{isRTL?'الفترة الزمنية':'Time Period'}</InputLabel>
            <Select value={period} label={isRTL?'الفترة الزمنية':'Time Period'} onChange={e=>setPeriod(e.target.value)}>
              <MenuItem value="7">{isRTL?'آخر 7 أيام':'Last 7 Days'}</MenuItem>
              <MenuItem value="30">{isRTL?'آخر 30 يوم':'Last 30 Days'}</MenuItem>
              <MenuItem value="90">{isRTL?'آخر 3 أشهر':'Last 3 Months'}</MenuItem>
              <MenuItem value="180">{isRTL?'آخر 6 أشهر':'Last 6 Months'}</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3.5}>
        {loading
          ? Array.from({length:6}).map((_,i)=><Grid item xs={6} sm={4} lg={2} key={i}><Paper elevation={0} sx={{p:2.5,borderRadius:3,border:'1px solid rgba(148,163,184,0.15)'}}><Skeleton width={36} height={36} sx={{borderRadius:2,mb:1}}/><Skeleton width="60%" height={34}/><Skeleton width="80%" height={16} sx={{mt:0.5}}/></Paper></Grid>)
          : kpis.map((k,i)=><Grid item xs={6} sm={4} lg={2} key={i}><KpiCard {...k}/></Grid>)
        }
      </Grid>

      <Paper elevation={0} sx={{ p:3, mb:3, border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
        <SectionTitle>{isRTL?'الحجوزات عبر الزمن':'Bookings Over Time'}</SectionTitle>
        {loading ? <ChartSkeleton height={260}/> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={d.trendData} margin={{top:5,right:20,left:-20,bottom:5}}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0A6EBD" stopOpacity={0.3}/><stop offset="95%" stopColor="#0A6EBD" stopOpacity={0}/></linearGradient>
                <linearGradient id="gradComp"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="label" tick={{fontSize:11,fontWeight:600}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{borderRadius:10,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',fontWeight:600}}/>
              <Legend/>
              <Area type="monotone" dataKey="total"     name={isRTL?'إجمالي':t('totalBookings')} stroke="#0A6EBD" fill="url(#gradTotal)" strokeWidth={2.5}/>
              <Area type="monotone" dataKey="completed" name={isRTL?'مكتملة':t('completed')}     stroke="#10B981" fill="url(#gradComp)"  strokeWidth={2.5}/>
              <Area type="monotone" dataKey="cancelled" name={isRTL?'ملغاة':t('cancelled')}      stroke="#EF4444" fill="none"             strokeWidth={2} strokeDasharray="4 2"/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Paper>

      <Grid container spacing={2.5} mb={3}>
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p:3, height:'100%', border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
            <SectionTitle>{isRTL?'توزيع الحالات':t('bookingsByStatus')}</SectionTitle>
            {loading ? <ChartSkeleton height={200}/> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {statusData.map((e,i)=><Cell key={i} fill={e.color} stroke="none"/>)}
                    </Pie>
                    <Tooltip contentStyle={{borderRadius:10,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',fontWeight:600}}/>
                  </PieChart>
                </ResponsiveContainer>
                <Box sx={{display:'flex',flexWrap:'wrap',gap:1,mt:1}}>
                  {statusData.map(d=>(
                    <Box key={d.name} sx={{display:'flex',alignItems:'center',gap:0.5}}>
                      <Box sx={{width:8,height:8,borderRadius:'50%',bgcolor:d.color}}/>
                      <Typography fontSize={11} fontWeight={600} color="text.secondary">{d.name} ({d.value})</Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p:3, height:'100%', border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
            <SectionTitle>{isRTL?'مصادر الحجوزات':'Booking Sources'}</SectionTitle>
            {loading ? <ChartSkeleton height={200}/> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={sourceData} cx="50%" cy="50%" outerRadius={80} dataKey="value" paddingAngle={3}>
                      {sourceData.map((e,i)=><Cell key={i} fill={e.color} stroke="none"/>)}
                    </Pie>
                    <Tooltip contentStyle={{borderRadius:10,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',fontWeight:600}}/>
                  </PieChart>
                </ResponsiveContainer>
                <Box sx={{display:'flex',flexWrap:'wrap',gap:1,mt:1}}>
                  {sourceData.map(d=>(
                    <Box key={d.name} sx={{display:'flex',alignItems:'center',gap:0.5}}>
                      <Box sx={{width:8,height:8,borderRadius:'50%',bgcolor:d.color}}/>
                      <Typography fontSize={11} fontWeight={600} color="text.secondary">{d.name} ({d.value})</Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p:3, height:'100%', border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
            <SectionTitle>{isRTL?'أوقات الذروة':'Peak Hours'}</SectionTitle>
            {loading ? <ChartSkeleton height={220}/> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.peakHours} margin={{top:5,right:0,left:-30,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="hour" tick={{fontSize:9,fontWeight:600}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{borderRadius:10,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',fontWeight:600}}/>
                  <Bar dataKey="count" name={isRTL?'حجوزات':'Bookings'} radius={[6,6,0,0]}>
                    {d.peakHours.map((_,i)=><Cell key={i} fill={`hsl(${210 + i*4}, 80%, ${50+i*1}%)`}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Paper elevation={0} sx={{ p:3, mb:3, border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
        <SectionTitle>{isRTL?'الاتجاه الشهري (6 أشهر)':'Monthly Trend (6 months)'}</SectionTitle>
        {loading ? <ChartSkeleton height={220}/> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyData} margin={{top:5,right:20,left:-20,bottom:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="label" tick={{fontSize:12,fontWeight:600}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{borderRadius:10,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',fontWeight:600}}/>
              <Legend/>
              <Line type="monotone" dataKey="total"     name={isRTL?'إجمالي':t('totalBookings')} stroke="#0A6EBD" strokeWidth={2.5} dot={{r:4}} activeDot={{r:6}}/>
              <Line type="monotone" dataKey="completed" name={isRTL?'مكتملة':t('completed')}     stroke="#10B981" strokeWidth={2.5} dot={{r:4}} activeDot={{r:6}}/>
            </LineChart>
          </ResponsiveContainer>
        )}
      </Paper>

      <Paper elevation={0} sx={{ p:3, mb:3, border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
        <SectionTitle>{isRTL?'الخدمات الأكثر حجزاً':'Most Booked Services'}</SectionTitle>
        {loading ? <ChartSkeleton height={280}/> : d.mostBookedServices.length === 0 ? (
          <Typography color="text.disabled" textAlign="center" py={3}>{t('noData')}</Typography>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, d.mostBookedServices.length * 36)}>
            <BarChart data={d.mostBookedServices} layout="vertical" margin={{top:5,right:20,left:10,bottom:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis type="number" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={{fontSize:11,fontWeight:600}} axisLine={false} tickLine={false} width={isRTL?140:120}/>
              <Tooltip contentStyle={{borderRadius:10,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',fontWeight:600}}/>
              <Bar dataKey="count" name={isRTL?'حجوزات':'Bookings'} radius={[0,6,6,0]}>
                {d.mostBookedServices.map((_,i)=><Cell key={i} fill={`hsl(${190+i*12},70%,${55-i*2}%)`}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Paper>

      <Paper elevation={0} sx={{ p:3, border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
        <SectionTitle>{isRTL?'أداء الأطباء':'Doctor Performance'}</SectionTitle>
        {loading ? (
          Array.from({length:3}).map((_,i)=>(
            <Box key={i} sx={{display:'flex',alignItems:'center',gap:2,mb:2}}>
              <Skeleton variant="circular" width={40} height={40}/>
              <Box flex={1}><Skeleton width="40%" height={18}/><Skeleton width="60%" height={14} sx={{mt:0.5}}/></Box>
              <Skeleton width={80} height={26} sx={{borderRadius:2}}/>
            </Box>
          ))
        ) : d.doctorPerformance.length === 0 ? (
          <Typography color="text.disabled" textAlign="center" py={3}>{t('noData')}</Typography>
        ) : (
          <Box>
            <Box sx={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 80px 100px', gap:1, px:2, py:1, bgcolor:'#F8FAFC', borderRadius:2, mb:1 }}>
              {[isRTL?'الطبيب':'Doctor', isRTL?'إجمالي':'Total', isRTL?'مكتمل':'Done', isRTL?'ملغي':'Cancel', isRTL?'غائب':'No-Show', isRTL?'معدل النجاح':'Success Rate'].map((h,i)=>(
                <Typography key={i} fontSize={11} fontWeight={700} color="text.secondary">{h}</Typography>
              ))}
            </Box>
            {d.doctorPerformance.map((doc, i) => (
              <Box key={i} sx={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 80px 100px', gap:1, px:2, py:1.5, borderRadius:2, '&:hover':{bgcolor:'#F8FAFC'}, transition:'all 0.15s', alignItems:'center' }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                  <Avatar sx={{ width:32, height:32, fontSize:13, fontWeight:700, bgcolor:'#EFF6FF', color:'#0A6EBD' }}>
                    {(isRTL ? (doc.nameAr || doc.nameEn) : (doc.nameEn || doc.nameAr) || '?').charAt(0)}
                  </Avatar>
                  <Typography fontWeight={600} fontSize={13}>
                    {isRTL ? `د. ${doc.nameAr || doc.nameEn}` : `Dr. ${doc.nameEn || doc.nameAr}`}
                  </Typography>
                </Box>
                <Typography fontWeight={700} fontSize={14}>{doc.total}</Typography>
                <Typography fontWeight={600} fontSize={13} sx={{color:'#10B981'}}>{doc.completed}</Typography>
                <Typography fontWeight={600} fontSize={13} sx={{color:'#EF4444'}}>{doc.cancelled}</Typography>
                <Typography fontWeight={600} fontSize={13} sx={{color:'#8B5CF6'}}>{doc.noShow}</Typography>
                <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                  <Box sx={{ flex:1, height:6, bgcolor:'#E2E8F0', borderRadius:99, overflow:'hidden' }}>
                    <Box sx={{ height:'100%', width:`${doc.rate}%`, bgcolor: doc.rate>=70?'#10B981':doc.rate>=40?'#F59E0B':'#EF4444', borderRadius:99, transition:'width 0.5s' }}/>
                  </Box>
                  <Typography fontSize={11} fontWeight={700} color="text.secondary">{doc.rate}%</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
