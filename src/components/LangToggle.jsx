'use client';
import React from 'react';
import { ButtonBase, Typography, Box } from '@mui/material';
import { useLang } from '../context/AppContext.jsx';

export default function LangToggle() {
  const { lang, toggleLang } = useLang();
  return (
    <ButtonBase onClick={toggleLang} sx={{
      display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.8,
      borderRadius: 2.5, border: '1.5px solid rgba(148,163,184,0.3)',
      bgcolor: 'white', transition: 'all 0.18s',
      '&:hover': { bgcolor: '#F8FAFC', borderColor: '#0A6EBD' },
    }}>
      <Box sx={{ fontSize: 16, lineHeight: 1 }}>{lang === 'en' ? '🇸🇦' : '🇬🇧'}</Box>
      <Typography sx={{ fontWeight: 700, fontSize: 12, color: '#0F172A', letterSpacing: '0.02em' }}>
        {lang === 'en' ? 'العربية' : 'English'}
      </Typography>
    </ButtonBase>
  );
}
