'use client';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, Select, MenuItem, FormControl, InputLabel,
  Chip, Skeleton, Divider, Avatar,
} from '@mui/material';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useLang } from '../context/AppContext.jsx';
import { getBookings, getDoctors } from '../services/api.js';
import { DashboardRoundedIcon, InstagramIcon, TrendingDownRoundedIcon, TrendingUpRoundedIcon, WhatsAppIcon } from '../components/icons';

const STATUS_COLORS  = { pending:'#F59E0B', confirmed:'#0A6EBD', completed:'#10B981', cancelled:'#EF4444', 'no-show':'#8B5CF6', no_show:'#8B5CF6' };
const SOURCE_COLORS  = { whatsapp:'#25D366', instagram:'#E1306C', dashboard:'#0A6EBD', api:'#8B5CF6' };
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
  const [bookings, setBookings] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30'); // days

  const MONTH_NAMES = isRTL ? MONTH_NAMES_AR : MONTH_NAMES_EN;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, dRes] = await Promise.all([getBookings(), getDoctors()]);
      setBookings(bRes.data);
      setDoctors(dRes.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Computed analytics ────────────────────────────────────────────────────
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(now.getDate() - parseInt(period));

  const filtered = bookings.filter(b => new Date(b.date) >= cutoff);
  const prev = bookings.filter(b => {
    const d = new Date(b.date);
    const prevCutoff = new Date(cutoff); prevCutoff.setDate(cutoff.getDate() - parseInt(period));
    return d >= prevCutoff && d < cutoff;
  });

  const trendPct = (cur, prv) => prv === 0 ? 100 : Math.round(((cur - prv) / prv) * 100);

  const totalCur = filtered.length;
  const totalPrv = prev.length;
  const completedCur = filtered.filter(b=>b.status==='completed').length;
  const completedPrv = prev.filter(b=>b.status==='completed').length;
  const cancelledCur = filtered.filter(b=>b.status==='cancelled').length;
  const noShowCur    = filtered.filter(b=>b.status==='no-show'||b.status==='no_show').length;
  const waCur        = filtered.filter(b=>b.source==='whatsapp').length;
  const igCur        = filtered.filter(b=>b.source==='instagram').length;

  // Bookings over time (group by date for last N days)
  const dateMap = {};
  for (let i = parseInt(period) - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dateMap[key] = { date: key, total:0, completed:0, cancelled:0 };
  }
  filtered.forEach(b => { if (dateMap[b.date]) { dateMap[b.date].total++; if(b.status==='completed') dateMap[b.date].completed++; if(b.status==='cancelled') dateMap[b.date].cancelled++; } });
  const trendData = Object.values(dateMap).map(d => ({ ...d, label: d.date.slice(5) }));

  // Aggregate by week if period > 30
  const groupedTrend = parseInt(period) > 30
    ? trendData.reduce((acc, d, i) => {
        const wk = Math.floor(i / 7);
        if (!acc[wk]) acc[wk] = { label: d.label, total:0, completed:0, cancelled:0 };
        acc[wk].total += d.total; acc[wk].completed += d.completed; acc[wk].cancelled += d.cancelled;
        return acc;
      }, [])
    : trendData;

  // Status breakdown
  const statusData = Object.entries(
    filtered.reduce((a, b) => { a[b.status] = (a[b.status]||0)+1; return a; }, {})
  ).map(([k,v]) => ({ name: t(k)||k, value:v, color: STATUS_COLORS[k]||'#94A3B8' }));

  // Source breakdown
  const sourceData = Object.entries(
    filtered.reduce((a, b) => { const s = b.source||'dashboard'; a[s] = (a[s]||0)+1; return a; }, {})
  ).map(([k,v]) => ({ name: k, value:v, color: SOURCE_COLORS[k]||'#94A3B8' }));

  // Doctor performance — build a lookup map from the doctors array (already fetched)
  const doctorLookup = {};
  doctors.forEach(d => { doctorLookup[d.id] = d; });

  const doctorMap = {};
  filtered.forEach(b => {
    // doctorId may be a string ID or a populated object — extract the raw ID string
    const id = (typeof b.doctorId === 'object' && b.doctorId !== null)
      ? (b.doctorId.id || b.doctorId.id || b.doctorId)
      : b.doctorId;
    if (!id) return;

    // Look up the doctor from the doctors list (always has nameEn/nameAr)
    const docObj = doctorLookup[id?.toString()] || doctorLookup[id];
    const name   = docObj
      ? (isRTL ? (docObj.nameAr || docObj.nameEn) : (docObj.nameEn || docObj.nameAr))
      : (isRTL ? 'غير معروف' : 'Unknown');
    const nameEn = docObj?.nameEn || name;
    const nameAr = docObj?.nameAr || name;

    if (!doctorMap[id]) doctorMap[id] = { name, nameEn, nameAr, total:0, completed:0, cancelled:0, noShow:0 };
    doctorMap[id].total++;
    if (b.status==='completed') doctorMap[id].completed++;
    if (b.status==='cancelled') doctorMap[id].cancelled++;
    if (b.status==='no-show'||b.status==='no_show') doctorMap[id].noShow++;
  });
  const doctorPerf = Object.values(doctorMap)
    .map(d => ({ ...d, rate: d.total ? Math.round((d.completed/d.total)*100) : 0 }))
    .sort((a,b)=>b.total-a.total);

  // Peak hours
  const hourMap = {};
  filtered.forEach(b => { const h = b.time?.slice(0,2); if(h) hourMap[h] = (hourMap[h]||0)+1; });
  const peakData = Array.from({length:13},(_,i)=> {
    const h = String(i+7).padStart(2,'0');
    return { hour: `${h}:00`, count: hourMap[h]||0 };
  });

  // Monthly trend
  const monthlyMap = {};
  bookings.forEach(b => {
    const m = b.date?.slice(0,7);
    if (!m) return;
    if (!monthlyMap[m]) monthlyMap[m] = { month:m, total:0, completed:0 };
    monthlyMap[m].total++;
    if(b.status==='completed') monthlyMap[m].completed++;
  });
  const monthlyData = Object.values(monthlyMap).sort((a,b)=>a.month.localeCompare(b.month)).slice(-6)
    .map(d => ({ ...d, label: MONTH_NAMES[parseInt(d.month.slice(5))-1] }));

  const kpis = [
    { icon:<TrendingUpRoundedIcon/>, label: isRTL?'إجمالي الحجوزات':t('totalBookings'), value:totalCur, trend:trendPct(totalCur,totalPrv), color:'#0A6EBD', sub: isRTL?`${prev.length} في الفترة السابقة`:`${prev.length} prev period` },
    { icon:<DashboardRoundedIcon/>,  label: isRTL?'مكتملة':t('completed'),              value:completedCur, trend:trendPct(completedCur,completedPrv), color:'#10B981' },
    { icon:<TrendingDownRoundedIcon/>,label:isRTL?'ملغاة':t('cancelled'),              value:cancelledCur, color:'#EF4444' },
    { icon:<TrendingDownRoundedIcon/>,label:isRTL?'لم يحضر':t('noShow'),               value:noShowCur,    color:'#8B5CF6' },
    { icon:<WhatsAppIcon/>,           label:t('whatsappBookings'),                      value:waCur,        color:'#25D366', sub:t('viaBot') },
    { icon:<InstagramIcon/>,          label:t('instagramBookings'),                     value:igCur,        color:'#E1306C', sub:t('viaBot') },
  ];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">{t('analytics')}</Typography>
          <Typography color="text.secondary" fontSize={14} mt={0.5}>
            {isRTL ? 'تحليل شامل لأداء العيادة' : 'Comprehensive clinic performance analytics'}
          </Typography>
        </Box>
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

      {/* KPI Row */}
      <Grid container spacing={2} mb={3.5}>
        {loading
          ? Array.from({length:6}).map((_,i)=><Grid item xs={6} sm={4} lg={2} key={i}><Paper elevation={0} sx={{p:2.5,borderRadius:3,border:'1px solid rgba(148,163,184,0.15)'}}><Skeleton width={36} height={36} sx={{borderRadius:2,mb:1}}/><Skeleton width="60%" height={34}/><Skeleton width="80%" height={16} sx={{mt:0.5}}/></Paper></Grid>)
          : kpis.map((k,i)=><Grid item xs={6} sm={4} lg={2} key={i}><KpiCard {...k}/></Grid>)
        }
      </Grid>

      {/* Trend over time */}
      <Paper elevation={0} sx={{ p:3, mb:3, border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
        <SectionTitle>{isRTL?'الحجوزات عبر الزمن':'Bookings Over Time'}</SectionTitle>
        {loading ? <ChartSkeleton height={260}/> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={groupedTrend} margin={{top:5,right:20,left:-20,bottom:5}}>
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
        {/* Status Pie */}
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

        {/* Source Pie */}
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

        {/* Peak hours */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p:3, height:'100%', border:'1px solid rgba(148,163,184,0.15)', borderRadius:3 }}>
            <SectionTitle>{isRTL?'أوقات الذروة':'Peak Hours'}</SectionTitle>
            {loading ? <ChartSkeleton height={220}/> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={peakData} margin={{top:5,right:0,left:-30,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="hour" tick={{fontSize:9,fontWeight:600}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{borderRadius:10,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',fontWeight:600}}/>
                  <Bar dataKey="count" name={isRTL?'حجوزات':'Bookings'} radius={[6,6,0,0]}>
                    {peakData.map((_,i)=><Cell key={i} fill={`hsl(${210 + i*4}, 80%, ${50+i*1}%)`}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Monthly trend line */}
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

      {/* Doctor performance table */}
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
        ) : doctorPerf.length === 0 ? (
          <Typography color="text.disabled" textAlign="center" py={3}>{t('noData')}</Typography>
        ) : (
          <Box>
            <Box sx={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 80px 100px', gap:1, px:2, py:1, bgcolor:'#F8FAFC', borderRadius:2, mb:1 }}>
              {[isRTL?'الطبيب':'Doctor', isRTL?'إجمالي':'Total', isRTL?'مكتمل':'Done', isRTL?'ملغي':'Cancel', isRTL?'غائب':'No-Show', isRTL?'معدل النجاح':'Success Rate'].map((h,i)=>(
                <Typography key={i} fontSize={11} fontWeight={700} color="text.secondary">{h}</Typography>
              ))}
            </Box>
            {doctorPerf.map((d, i) => (
              <Box key={i} sx={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 80px 100px', gap:1, px:2, py:1.5, borderRadius:2, '&:hover':{bgcolor:'#F8FAFC'}, transition:'all 0.15s', alignItems:'center' }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                  <Avatar sx={{ width:32, height:32, fontSize:13, fontWeight:700, bgcolor:'#EFF6FF', color:'#0A6EBD' }}>
                    {(isRTL ? (d.nameAr || d.nameEn) : (d.nameEn || d.nameAr) || '?').charAt(0)}
                  </Avatar>
                  <Typography fontWeight={600} fontSize={13}>
                    {isRTL ? `د. ${d.nameAr || d.nameEn}` : `Dr. ${d.nameEn || d.nameAr}`}
                  </Typography>
                </Box>
                <Typography fontWeight={700} fontSize={14}>{d.total}</Typography>
                <Typography fontWeight={600} fontSize={13} sx={{color:'#10B981'}}>{d.completed}</Typography>
                <Typography fontWeight={600} fontSize={13} sx={{color:'#EF4444'}}>{d.cancelled}</Typography>
                <Typography fontWeight={600} fontSize={13} sx={{color:'#8B5CF6'}}>{d.noShow}</Typography>
                <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                  <Box sx={{ flex:1, height:6, bgcolor:'#E2E8F0', borderRadius:99, overflow:'hidden' }}>
                    <Box sx={{ height:'100%', width:`${d.rate}%`, bgcolor: d.rate>=70?'#10B981':d.rate>=40?'#F59E0B':'#EF4444', borderRadius:99, transition:'width 0.5s' }}/>
                  </Box>
                  <Typography fontSize={11} fontWeight={700} color="text.secondary">{d.rate}%</Typography>
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
