'use client';
import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Button, Paper, Grid, TextField, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  Chip, IconButton, Tooltip, Skeleton, Avatar,
} from '@mui/material';
import { useLang } from '../context/AppContext.jsx';
import { getOffers, createOffer, updateOffer, deleteOffer } from '../services/api.js';
import { AddRoundedIcon, DeleteRoundedIcon, EditRoundedIcon, ImageRoundedIcon, InstagramIcon, LocalOfferRoundedIcon, WhatsAppIcon } from '../components/icons';

// Resolves an offer's image URL for display.
//
// imageUrl can be in one of two valid, *currently working* formats depending
// on which storage backend is configured for this deployment:
//   - A full https:// URL — image is stored in Vercel Blob.
//   - A relative path like "/uploads/offers/xxx.png" — image is stored on
//     local disk (Hostinger, a VPS, Docker) and served by Next.js's normal
//     static file handler from the public/ folder. This is NOT broken or
//     legacy; it's the correct, working format on any host with a
//     persistent filesystem.
//
// The only genuinely unrecoverable case is an offer created before the
// storage fix when this app was deployed on Vercel without Blob configured
// — those images were written to Vercel's ephemeral filesystem and lost on
// the next deploy. For that case only, we fall back to imageBase64 (still
// stored in the DB) so the offer still displays instead of a broken image.
function resolveOfferImageSrc(offer) {
  if (offer.imageUrl?.startsWith('http')) return offer.imageUrl;
  if (offer.imageUrl?.startsWith('/uploads/')) return offer.imageUrl;
  if (offer.imageBase64) return offer.imageBase64;
  return null;
}

const emptyForm = { titleEn:'', titleAr:'', descriptionEn:'', descriptionAr:'', code:'', expiresAt:'', isActive:true, imageBase64:'' };

export default function OffersPage() {
  const { t, isRTL } = useLang();
  const [offers, setOffers]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [editId, setEditId]     = useState(null);
  const [preview, setPreview]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [snackbar, setSnackbar] = useState({ open:false, message:'', severity:'success' });
  const fileRef = useRef();

  const notify = (message, severity='success') => setSnackbar({ open:true, message, severity });

  const load = async () => {
    setLoading(true);
    try { const r = await getOffers(); setOffers(r.data); }
    catch { notify(isRTL?'فشل تحميل العروض':'Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleOpen = (offer=null) => {
    if (offer) {
      setForm({ titleEn:offer.titleEn, titleAr:offer.titleAr, descriptionEn:offer.descriptionEn||'', descriptionAr:offer.descriptionAr||'', code:offer.code||'', expiresAt:offer.expiresAt?offer.expiresAt.slice(0,10):'', isActive:offer.isActive, imageBase64:offer.imageBase64||'' });
      setPreview(resolveOfferImageSrc(offer) || '');
      setEditId(offer.id);
    } else { setForm(emptyForm); setPreview(''); setEditId(null); }
    setOpen(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(f => ({ ...f, imageBase64: ev.target.result }));
      setPreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.titleEn || !form.titleAr) return notify(isRTL?'يرجى إدخال العنوان بالعربية والإنجليزية':'Title required in both languages','error');
    setSaving(true);
    try {
      if (editId) await updateOffer(editId, form);
      else await createOffer(form);
      notify(isRTL ? (editId?'تم تحديث العرض':'تم إنشاء العرض') : (editId?'Offer updated':'Offer created'));
      setOpen(false); load();
    } catch (err) { notify(err.response?.data?.message||'Error','error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('deleteConfirm'))) return;
    try { await deleteOffer(id); notify(isRTL?'تم حذف العرض':'Offer deleted'); load(); }
    catch { notify('Error','error'); }
  };

  const handleToggle = async (offer) => {
    try { await updateOffer(offer.id, { isActive: !offer.isActive }); load(); }
    catch { notify('Error','error'); }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}>
        <Box>
          <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">
            {isRTL ? 'العروض والخصومات' : 'Offers & Discounts'}
          </Typography>
          <Typography color="text.secondary" fontSize={14} mt={0.5}>
            {isRTL ? 'تُعرض تلقائياً للعملاء في واتساب وإنستجرام' : 'Displayed automatically in WhatsApp & Instagram bot'}
          </Typography>
          <Box sx={{ display:'flex', gap:1, mt:1 }}>
            <Chip icon={<WhatsAppIcon sx={{ fontSize:14 }}/>} label={isRTL?'واتساب':'WhatsApp'} size="small" sx={{ bgcolor:'#DCFCE7', color:'#166534', fontWeight:600 }}/>
            <Chip icon={<InstagramIcon sx={{ fontSize:14 }}/>} label="Instagram" size="small" sx={{ bgcolor:'#FCE7F3', color:'#9D174D', fontWeight:600 }}/>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddRoundedIcon/>} onClick={()=>handleOpen()} sx={{ borderRadius:2.5, px:3, py:1.2 }}>
          {isRTL?'إضافة عرض':'Add Offer'}
        </Button>
      </Box>

      <Grid container spacing={2.5}>
        {loading ? Array.from({length:4}).map((_,i) => (
          <Grid item xs={12} sm={6} lg={4} key={i}>
            <Paper elevation={0} sx={{ borderRadius:3, overflow:'hidden', border:'1px solid rgba(148,163,184,0.15)' }}>
              <Skeleton variant="rectangular" height={180}/>
              <Box sx={{ p:2.5 }}><Skeleton width="60%" height={22}/><Skeleton width="80%" height={16} sx={{ mt:0.75 }}/><Skeleton width="40%" height={16} sx={{ mt:0.75 }}/></Box>
            </Paper>
          </Grid>
        )) : offers.length===0 ? (
          <Grid item xs={12}>
            <Paper elevation={0} sx={{ textAlign:'center', py:10, border:'2px dashed rgba(148,163,184,0.3)', borderRadius:3 }}>
              <LocalOfferRoundedIcon sx={{ fontSize:64, color:'#CBD5E1', mb:2 }}/>
              <Typography fontWeight={700} color="text.secondary">{isRTL?'لا توجد عروض بعد':'No offers yet'}</Typography>
              <Button variant="contained" startIcon={<AddRoundedIcon/>} onClick={()=>handleOpen()} sx={{ mt:2 }}>
                {isRTL?'إضافة أول عرض':'Add First Offer'}
              </Button>
            </Paper>
          </Grid>
        ) : offers.map(offer => (
          <Grid item xs={12} sm={6} lg={4} key={offer.id}>
            <Paper elevation={0} sx={{ borderRadius:3, overflow:'hidden', border:'1px solid rgba(148,163,184,0.15)', transition:'all 0.2s', '&:hover':{ transform:'translateY(-3px)', boxShadow:'0 12px 32px rgba(0,0,0,0.1)' } }}>
              {/* Image */}
              <Box sx={{ height:180, bgcolor:'#F1F5F9', position:'relative', overflow:'hidden' }}>
                {resolveOfferImageSrc(offer) ? (
                  <Box component="img" src={resolveOfferImageSrc(offer)} alt={offer.titleEn} sx={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                ) : (
                  <Box sx={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#E8F4FD,#CCFBF1)' }}>
                    <LocalOfferRoundedIcon sx={{ fontSize:48, color:'#94A3B8' }}/>
                  </Box>
                )}
                {/* Active badge */}
                <Box sx={{ position:'absolute', top:10, [isRTL?'left':'right']:10 }}>
                  <Chip label={offer.isActive?(isRTL?'نشط':'Active'):(isRTL?'غير نشط':'Inactive')} size="small" color={offer.isActive?'success':'default'} sx={{ fontWeight:700, fontSize:10 }}/>
                </Box>
              </Box>

              <Box sx={{ p:2.5 }}>
                <Typography fontWeight={800} fontSize={15} mb={0.5}>{isRTL?offer.titleAr:offer.titleEn}</Typography>
                <Typography color="text.secondary" fontSize={13} mb={1.5} sx={{ minHeight:36 }}>
                  {isRTL?offer.descriptionAr:offer.descriptionEn}
                </Typography>
                <Box sx={{ display:'flex', gap:1, flexWrap:'wrap', mb:1.5 }}>
                  {offer.code && <Chip label={`🏷️ ${offer.code}`} size="small" sx={{ bgcolor:'#EFF6FF', color:'#0A6EBD', fontWeight:700, fontSize:11 }}/>}
                  {offer.expiresAt && <Chip label={`⏰ ${new Date(offer.expiresAt).toLocaleDateString(isRTL?'ar-SA':'en-US')}`} size="small" sx={{ bgcolor:'#FEF3C7', color:'#92400E', fontWeight:600, fontSize:11 }}/>}
                </Box>
                <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <FormControlLabel control={<Switch size="small" checked={offer.isActive} onChange={()=>handleToggle(offer)} color="success"/>} label={<Typography fontSize={12} fontWeight={600}>{offer.isActive?(isRTL?'مفعّل':'Active'):(isRTL?'معطّل':'Inactive')}</Typography>}/>
                  <Box>
                    <Tooltip title={t('edit')}><IconButton size="small" onClick={()=>handleOpen(offer)}><EditRoundedIcon fontSize="small"/></IconButton></Tooltip>
                    <Tooltip title={t('delete')}><IconButton size="small" color="error" onClick={()=>handleDelete(offer.id)}><DeleteRoundedIcon fontSize="small"/></IconButton></Tooltip>
                  </Box>
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Form Dialog */}
      <Dialog open={open} onClose={()=>!saving&&setOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle fontWeight={800}>{editId?(isRTL?'تعديل العرض':'Edit Offer'):(isRTL?'إضافة عرض جديد':'New Offer')}</DialogTitle>
        <DialogContent sx={{ display:'flex', flexDirection:'column', gap:2, pt:'16px !important' }}>
          {/* Image upload */}
          <Box sx={{ border:'2px dashed rgba(148,163,184,0.4)', borderRadius:2.5, p:2, textAlign:'center', cursor:'pointer', '&:hover':{ borderColor:'#0A6EBD', bgcolor:'#EFF6FF' }, transition:'all 0.15s' }} onClick={()=>fileRef.current.click()}>
            {preview ? (
              <Box><Box component="img" src={preview} sx={{ maxHeight:160, borderRadius:2, objectFit:'cover', width:'100%' }}/><Typography fontSize={12} color="text.secondary" mt={1}>{isRTL?'انقر لتغيير الصورة':'Click to change image'}</Typography></Box>
            ) : (
              <Box sx={{ py:2 }}><ImageRoundedIcon sx={{ fontSize:40, color:'#94A3B8', mb:1 }}/><Typography fontWeight={600} color="text.secondary" fontSize={13}>{isRTL?'انقر لرفع صورة العرض':'Click to upload offer image'}</Typography><Typography fontSize={11} color="text.disabled">PNG, JPG, WEBP — max 5MB</Typography></Box>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageChange}/>
          </Box>

          <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:2 }}>
            <TextField label={isRTL?'العنوان بالإنجليزية':'Title (English)'} value={form.titleEn} onChange={e=>setForm({...form,titleEn:e.target.value})} required/>
            <TextField label={isRTL?'العنوان بالعربية':'Title (Arabic)'} value={form.titleAr} onChange={e=>setForm({...form,titleAr:e.target.value})} required inputProps={{ dir:'rtl' }}/>
          </Box>
          <TextField label={isRTL?'الوصف بالإنجليزية':'Description (English)'} value={form.descriptionEn} onChange={e=>setForm({...form,descriptionEn:e.target.value})} multiline rows={2}/>
          <TextField label={isRTL?'الوصف بالعربية':'Description (Arabic)'} value={form.descriptionAr} onChange={e=>setForm({...form,descriptionAr:e.target.value})} multiline rows={2} inputProps={{ dir:'rtl' }}/>
          <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:2 }}>
            <TextField label={isRTL?'كود الخصم':'Discount Code'} value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="SAVE20"/>
            <TextField label={isRTL?'تاريخ الانتهاء':'Expires On'} type="date" value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})} InputLabelProps={{ shrink:true }}/>
          </Box>
          <FormControlLabel control={<Switch checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})} color="success"/>} label={<Typography fontWeight={600} fontSize={13}>{isRTL?'تفعيل العرض فوراً':'Activate immediately'}</Typography>}/>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={()=>setOpen(false)} disabled={saving} variant="outlined" sx={{ borderRadius:2 }}>{t('cancel')}</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving||!form.titleEn||!form.titleAr} sx={{ borderRadius:2, px:3 }}>
            {saving?(isRTL?'جارٍ الحفظ...':'Saving...'):t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={()=>setSnackbar({...snackbar,open:false})} anchorOrigin={{ vertical:'bottom', horizontal:isRTL?'left':'right' }}>
        <Alert severity={snackbar.severity} sx={{ borderRadius:2.5 }} onClose={()=>setSnackbar({...snackbar,open:false})}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}


export async function getServerSideProps() {
  return { props: {} };
}
