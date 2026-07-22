'use client';
import React, { forwardRef } from 'react';
import {
  Box, Paper, Typography, Skeleton, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, IconButton, Tooltip, CircularProgress, Alert,
} from '@mui/material';
import { CloseRoundedIcon, CheckCircleRoundedIcon, ErrorOutlineRoundedIcon, WarningAmberRoundedIcon, InfoRoundedIcon } from '../icons';

function TableRowSkeleton({ cols = 5, rows = 3 }) {
  return (
    <Box>
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 2, px: 2, py: 1.5, borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} sx={{ flex: j === 0 ? 2 : 1, height: 20, borderRadius: 1 }} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

function SectionHeader({ title, subtitle, action, icon }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {icon && <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>}
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: 17 }}>{title}</Typography>
          {subtitle && <Typography color="text.secondary" fontSize={13}>{subtitle}</Typography>}
        </Box>
      </Box>
      {action && <Box sx={{ display: 'flex', gap: 1 }}>{action}</Box>}
    </Box>
  );
}

function StatCard({ label, value, subtitle, color, icon, loading, onClick, trend }) {
  if (loading) {
    return (
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)' }}>
        <Skeleton width={36} height={36} sx={{ borderRadius: 2, mb: 1.5 }} />
        <Skeleton width="60%" height={32} sx={{ mb: 0.5 }} />
        <Skeleton width="80%" height={16} />
      </Paper>
    );
  }
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2.5, borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
        '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } : {},
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
        {icon && (
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${color || 'primary'}.light`, color: `${color || 'primary'}.main`, display: 'flex' }}>
            {icon}
          </Box>
        )}
        {trend !== undefined && (
          <Chip
            label={`${trend >= 0 ? '+' : ''}${trend}%`}
            size="small"
            color={trend >= 0 ? 'success' : 'error'}
            sx={{ height: 22, fontSize: 11, fontWeight: 700 }}
          />
        )}
      </Box>
      <Typography sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'text.primary' }}>{value}</Typography>
      <Typography color="text.secondary" sx={{ fontSize: 13, fontWeight: 500, mt: 0.3 }}>{label}</Typography>
      {subtitle && <Typography color="text.disabled" sx={{ fontSize: 11, mt: 0.2 }}>{subtitle}</Typography>}
    </Paper>
  );
}

function StatusBadge({ status, label }) {
  const colorMap = {
    healthy: 'success', active: 'success', connected: 'success', pass: 'success', synced: 'success',
    degraded: 'warning', expiring: 'warning', pending: 'warning', warn: 'warning',
    unhealthy: 'error', expired: 'error', failed: 'error', revoked: 'error', stopped: 'error', cancelled: 'error', fail: 'error',
    processing: 'info', reserved: 'info',
  };
  const iconMap = {
    healthy: <CheckCircleRoundedIcon sx={{ fontSize: 14 }} />,
    active: <CheckCircleRoundedIcon sx={{ fontSize: 14 }} />,
    degraded: <WarningAmberRoundedIcon sx={{ fontSize: 14 }} />,
    unhealthy: <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />,
    expired: <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />,
    failed: <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />,
  };
  const color = colorMap[status?.toLowerCase()] || 'default';
  return (
    <Chip
      icon={iconMap[status?.toLowerCase()]}
      label={label || status}
      size="small"
      color={color === 'default' ? undefined : color}
      variant={color === 'default' ? 'outlined' : 'filled'}
      sx={{ fontWeight: 600, fontSize: 12, height: 26, '& .MuiChip-icon': { fontSize: 14, ml: 0.5 } }}
    />
  );
}

function EmptyState({ icon, title, description, action }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
      <Box sx={{ color: 'text.disabled', mb: 2, display: 'flex', justifyContent: 'center' }}>{icon}</Box>
      <Typography fontWeight={600} color="text.secondary" mb={0.5}>{title || 'No data'}</Typography>
      {description && <Typography fontSize={13} color="text.disabled" maxWidth={400} mx="auto" mb={2}>{description}</Typography>}
      {action}
    </Box>
  );
}

const ConfirmDialog = forwardRef(({ open, title, message, confirmLabel, confirmColor, loading, onConfirm, onCancel, children }, ref) => (
  <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
    <DialogTitle sx={{ fontWeight: 700, fontSize: 17, pb: 0.5 }}>{title || 'Confirm'}</DialogTitle>
    <DialogContent>
      {message && <Typography color="text.secondary" fontSize={14}>{message}</Typography>}
      {children}
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
      <Button onClick={onCancel} variant="outlined" color="inherit" sx={{ borderRadius: 2 }}>Cancel</Button>
      <Button onClick={onConfirm} variant="contained" color={confirmColor || 'primary'} disabled={loading} sx={{ borderRadius: 2, minWidth: 100 }}>
        {loading ? <CircularProgress size={18} sx={{ color: 'white' }} /> : (confirmLabel || 'Confirm')}
      </Button>
    </DialogActions>
  </Dialog>
));

function InfoTooltip({ title, children }) {
  return (
    <Tooltip title={title} arrow placement="top">
      <Box component="span" sx={{ cursor: 'help', display: 'inline-flex' }}>{children}</Box>
    </Tooltip>
  );
}

function FilterBar({ filters, onFilterChange, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2, border: '1px solid rgba(148,163,184,0.12)' }}>
      {children}
    </Box>
  );
}

function MetricCard({ label, value, subtitle, icon, color, loading }) {
  if (loading) {
    return (
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid rgba(148,163,184,0.12)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1 }}><Skeleton width="60%" height={20} /><Skeleton width="40%" height={14} /></Box>
      </Paper>
    );
  }
  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid rgba(148,163,184,0.12)', display: 'flex', alignItems: 'center', gap: 1.5, transition: 'all 0.2s', '&:hover': { borderColor: `${color || 'primary'}.main`, boxShadow: `0 2px 8px ${color || 'primary'}15` } }}>
      <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: `${color || 'primary'}.light`, color: `${color || 'primary'}.main`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>{value}</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 500 }} noWrap>{label}</Typography>
        {subtitle && <Typography color="text.disabled" sx={{ fontSize: 10 }}>{subtitle}</Typography>}
      </Box>
    </Paper>
  );
}

function LoadingOverlay() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
      <CircularProgress size={32} thickness={4} sx={{ color: 'primary.main' }} />
    </Box>
  );
}

export {
  TableRowSkeleton, SectionHeader, StatCard, StatusBadge, EmptyState,
  ConfirmDialog, InfoTooltip, FilterBar, MetricCard, LoadingOverlay,
};
