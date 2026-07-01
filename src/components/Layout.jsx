'use client';
import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Box, Drawer, AppBar, Toolbar, List, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Avatar, Divider, Menu, MenuItem, Typography } from '@mui/material';
import { useLang, useAuth } from '../context/AppContext.jsx';
import LangToggle from './LangToggle.jsx';
import { BarChartRoundedIcon, BeachAccessRoundedIcon, BlockRoundedIcon, CalendarMonthRoundedIcon, DashboardRoundedIcon, EventNoteRoundedIcon, HistoryRoundedIcon, KeyboardArrowDownRoundedIcon, LocalHospitalRoundedIcon, LocalOfferRoundedIcon, LogoutRoundedIcon, ManageAccountsRoundedIcon, MenuRoundedIcon, PeopleRoundedIcon } from '../components/icons';

const DW = 260;
const ROLE_BADGE = { superadmin:{ bg:'#FEF3C7', color:'#92400E', label:'★ Super Admin' }, admin:{ bg:'#EFF6FF', color:'#1D4ED8', label:'◆ Admin' }, doctor:{ bg:'#F0FDF4', color:'#166534', label:'✦ Doctor' } };

export default function Layout() {
  const { t, isRTL } = useLang();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const navItems = [
    { label:t('dashboard'),   path:'/dashboard',   icon:<DashboardRoundedIcon/> },
    { label:t('analytics'),   path:'/analytics',   icon:<BarChartRoundedIcon/> },
    { label:t('bookings'),    path:'/bookings',    icon:<EventNoteRoundedIcon/> },
    { label:t('doctors'),     path:'/doctors',     icon:<PeopleRoundedIcon/> },
    { label:t('calendar'),    path:'/calendar',    icon:<CalendarMonthRoundedIcon/> },
    { label:t('slotManager'), path:'/slots',       icon:<BlockRoundedIcon/> },
    { label:isRTL?'العروض':'Offers',  path:'/offers',  icon:<LocalOfferRoundedIcon/> },
    { label:isRTL?'العطلات':'Holidays',path:'/holidays',icon:<BeachAccessRoundedIcon/> },
    ...(user?.role==='superadmin'||user?.role==='admin'?[
      { label:t('users'),     path:'/users',       icon:<ManageAccountsRoundedIcon/> },
      { label:t('auditLogs'), path:'/audit-logs',  icon:<HistoryRoundedIcon/> },
    ]:[]),
  ];

  const handleLogout = () => { setAnchorEl(null); logout(); navigate('/login'); };
  const rb = ROLE_BADGE[user?.role]||ROLE_BADGE.admin;
  const initials = user?.name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?';

  const sidebar = (
    <Box sx={{ height:'100%', display:'flex', flexDirection:'column', bgcolor:'#0A1628' }}>
      <Box sx={{ px:3, py:2.5, display:'flex', alignItems:'center', gap:1.5 }}>
        <Box sx={{ width:40, height:40, borderRadius:2.5, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#0A6EBD,#14B8A6)', boxShadow:'0 4px 12px rgba(10,110,189,0.4)' }}>
          <LocalHospitalRoundedIcon sx={{ color:'white', fontSize:22 }}/>
        </Box>
        <Box>
          <Typography sx={{ color:'white', fontWeight:800, fontSize:17, lineHeight:1.2 }}>SmartClinic</Typography>
          <Typography sx={{ color:'rgba(255,255,255,0.4)', fontSize:11, fontWeight:500 }}>{t('adminPortal')}</Typography>
        </Box>
      </Box>
      <Box sx={{ mx:2, height:'1px', bgcolor:'rgba(255,255,255,0.06)', mb:1 }}/>
      <List sx={{ px:1.5, pt:0.5, flexGrow:1, display:'flex', flexDirection:'column', gap:0.25, overflowY:'auto' }}>
        {navItems.map(item => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton component={NavLink} to={item.path} sx={{ borderRadius:2.5, py:0.9, px:1.5, gap:1.5, color:'rgba(255,255,255,0.5)', '& .MuiListItemIcon-root':{ color:'rgba(255,255,255,0.4)', minWidth:'auto' }, '&:hover':{ bgcolor:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.85)' }, '&.active':{ bgcolor:'rgba(10,110,189,0.25)', color:'#60BDFF', '& .MuiListItemIcon-root':{ color:'#60BDFF' }, position:'relative', '&::before':{ content:'""', position:'absolute', [isRTL?'right':'left']:0, top:'20%', bottom:'20%', width:3, bgcolor:'#60BDFF', borderRadius:99 } }, transition:'all 0.15s' }}>
              <ListItemIcon sx={{ minWidth:'auto' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight:600, fontSize:13 }}/>
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ mx:2, height:'1px', bgcolor:'rgba(255,255,255,0.06)', mb:2 }}/>
      <Box sx={{ px:2, pb:3 }}>
        <Box onClick={e=>setAnchorEl(e.currentTarget)} sx={{ display:'flex', alignItems:'center', gap:1.5, p:1.5, borderRadius:2.5, bgcolor:'rgba(255,255,255,0.05)', cursor:'pointer', '&:hover':{ bgcolor:'rgba(255,255,255,0.09)' }, transition:'all 0.15s' }}>
          <Avatar sx={{ width:36, height:36, bgcolor:'rgba(10,110,189,0.6)', fontSize:14, fontWeight:700 }}>{initials}</Avatar>
          <Box sx={{ flex:1, minWidth:0 }}>
            <Typography sx={{ color:'white', fontWeight:600, fontSize:13, lineHeight:1.3 }} noWrap>{user?.name}</Typography>
            <Box sx={{ display:'inline-flex', px:1, py:0.2, borderRadius:1, bgcolor:rb.bg, mt:0.3 }}>
              <Typography sx={{ color:rb.color, fontSize:10, fontWeight:700 }}>{rb.label}</Typography>
            </Box>
          </Box>
          <KeyboardArrowDownRoundedIcon sx={{ color:'rgba(255,255,255,0.35)', fontSize:18 }}/>
        </Box>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={()=>setAnchorEl(null)} PaperProps={{ sx:{ borderRadius:2.5, minWidth:200, boxShadow:'0 10px 30px rgba(0,0,0,0.15)', border:'1px solid rgba(148,163,184,0.12)' } }}>
          <Box sx={{ px:2, py:1.5 }}><Typography fontWeight={700} fontSize={14}>{user?.name}</Typography><Typography color="text.secondary" fontSize={12}>{user?.email}</Typography></Box>
          <Divider/>
          <MenuItem onClick={handleLogout} sx={{ color:'error.main', gap:1, fontWeight:600, py:1.2 }}><LogoutRoundedIcon fontSize="small"/>{t('logout')}</MenuItem>
        </Menu>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display:'flex', minHeight:'100vh', direction:isRTL?'rtl':'ltr' }}>
      <AppBar position="fixed" elevation={0} sx={{ width:{ sm:`calc(100% - ${DW}px)` }, [isRTL?'mr':'ml']:{ sm:`${DW}px` }, bgcolor:'white', borderBottom:'1px solid rgba(148,163,184,0.12)' }}>
        <Toolbar sx={{ justifyContent:'space-between', minHeight:'60px !important', px:3 }}>
          <IconButton onClick={()=>setMobileOpen(!mobileOpen)} sx={{ display:{ sm:'none' } }}><MenuRoundedIcon/></IconButton>
          <Box/><LangToggle/>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width:{ sm:DW }, flexShrink:{ sm:0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={()=>setMobileOpen(false)} anchor={isRTL?'right':'left'} ModalProps={{ keepMounted:true }} sx={{ display:{ xs:'block', sm:'none' }, '& .MuiDrawer-paper':{ width:DW, bgcolor:'#0A1628' } }}>{sidebar}</Drawer>
        <Drawer variant="permanent" anchor={isRTL?'right':'left'} sx={{ display:{ xs:'none', sm:'block' }, '& .MuiDrawer-paper':{ width:DW, bgcolor:'#0A1628', border:'none' } }} open>{sidebar}</Drawer>
      </Box>
      <Box component="main" sx={{ flexGrow:1, pt:'60px', minHeight:'100vh', bgcolor:'#F0F4F8', width:{ sm:`calc(100% - ${DW}px)` } }}>
        <Box sx={{ p:{ xs:2, sm:3.5 }, maxWidth:1400, mx:'auto' }}><Outlet/></Box>
      </Box>
    </Box>
  );
}
