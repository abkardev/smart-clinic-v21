'use client';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Chip, TextField, Select, MenuItem, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails, Pagination, Paper,
  FormControl, InputLabel, Button, Tooltip,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';


import { useLang } from '../context/AppContext.jsx';
import { getAuditLogs } from '../services/api.js';
import { ExpandMoreRoundedIcon, FilterListRoundedIcon, InfoOutlinedIcon, RefreshRoundedIcon } from '../components/icons';


const ACTION_COLORS = {
  CREATE: 'success', UPDATE: 'info', DELETE: 'error',
  BLOCK: 'warning', UNBLOCK: 'secondary', SEND: 'info',
  LOGIN: 'default', APPROVE: 'success', REJECT: 'error',
};
const getActionColor = (a) => ACTION_COLORS[Object.keys(ACTION_COLORS).find(k => a?.includes(k))] || 'default';

const ACTION_LABELS_AR = {
  CREATE_BOOKING:    'إنشاء حجز',
  UPDATE_BOOKING:    'تعديل حجز',
  DELETE_BOOKING:    'حذف حجز',
  CREATE_DOCTOR:     'إضافة طبيب',
  UPDATE_DOCTOR:     'تعديل طبيب',
  DELETE_DOCTOR:     'حذف طبيب',
  UPDATE_USER_STATUS:'تغيير حالة مستخدم',
  UPDATE_USER_ROLE:  'تغيير دور مستخدم',
  DELETE_USER:       'حذف مستخدم',
  BLOCK_SLOT:        'حظر موعد',
  UNBLOCK_SLOT:      'إلغاء حظر',
  CREATE_OFFER:      'إضافة عرض',
  UPDATE_OFFER:      'تعديل عرض',
  DELETE_OFFER:      'حذف عرض',
  CREATE_HOLIDAY:    'إضافة عطلة',
  DELETE_HOLIDAY:    'حذف عطلة',
};

const ENTITY_AR = {
  Booking:'حجز', Doctor:'طبيب', User:'مستخدم',
  BlockedSlot:'موعد محظور', Offer:'عرض', Holiday:'عطلة',
};

const AR_GRID = {
  noRowsLabel:             'لا توجد سجلات',
  noResultsOverlayLabel:   'لا توجد نتائج',
  toolbarColumns:          'الأعمدة',
  toolbarFilters:          'فلتر',
  toolbarDensity:          'الكثافة',
  toolbarExport:           'تصدير',
  // three-dots column menu
  columnMenuLabel:         'القائمة',
  columnMenuShowColumns:   'إظهار الأعمدة',
  columnMenuManageColumns: 'إدارة الأعمدة',
  columnMenuFilter:        'فلتر',
  columnMenuHideColumn:    'إخفاء هذا العمود',
  columnMenuUnsort:        'إلغاء الترتيب',
  columnMenuSortAsc:       'ترتيب تصاعدي ↑',
  columnMenuSortDesc:      'ترتيب تنازلي ↓',
  // filter panel
  filterPanelAddFilter:        'إضافة فلتر',
  filterPanelDeleteIconLabel:  'حذف',
  filterPanelLogicOperator:    'المنطق',
  filterPanelOperator:         'العملية',
  filterPanelOperatorAnd:      'و',
  filterPanelOperatorOr:       'أو',
  filterPanelColumns:          'الأعمدة',
  filterPanelInputLabel:       'القيمة',
  filterPanelInputPlaceholder: 'ابحث...',
  filterOperatorContains:      'يحتوي على',
  filterOperatorEquals:        'يساوي',
  filterOperatorStartsWith:    'يبدأ بـ',
  filterOperatorEndsWith:      'ينتهي بـ',
  filterOperatorIs:            'هو',
  filterOperatorNot:           'ليس',
  filterOperatorAfter:         'بعد',
  filterOperatorBefore:        'قبل',
  filterOperatorIsEmpty:       'فارغ',
  filterOperatorIsNotEmpty:    'ليس فارغاً',
  filterOperatorIsAnyOf:       'أي من',
  columnHeaderSortIconLabel:   'ترتيب',
  MuiTablePagination: {
    labelRowsPerPage: 'صفوف في الصفحة:',
    labelDisplayedRows: ({ from, to, count }) =>
      `${from}–${to} من ${count !== -1 ? count : `أكثر من ${to}`}`,
  },
};

export default function AuditLogsPage() {
  const { isRTL } = useLang();
  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', entity: '', startDate: '', endDate: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({ ...filters, page, limit: 25 });
      setLogs(res.data.logs);
      setTotal(res.data.pages);
    } catch {}
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => setFilters({ action: '', entity: '', startDate: '', endDate: '' });

  const columns = useMemo(() => [
    {
      field: 'createdAt',
      headerName: isRTL ? 'الوقت والتاريخ' : 'Timestamp',
      width: 170,
      valueGetter: (value, row) => new Date(row.createdAt).toLocaleString(isRTL ? 'ar-SA' : 'en-US'),
    },
    {
      field: 'userName',
      headerName: isRTL ? 'المستخدم' : 'User',
      width: 150,
      valueGetter: (value, row) => row.userName || '—',
    },
    {
      field: 'action',
      headerName: isRTL ? 'الإجراء' : 'Action',
      width: 210,
      renderCell: (p) => {
        const arLabel = ACTION_LABELS_AR[p.value];
        return (
          <Tooltip title={isRTL ? (arLabel || p.value) : p.value}>
            <Chip
              label={isRTL ? (arLabel || p.value) : p.value}
              color={getActionColor(p.value)}
              size="small"
              sx={{ fontSize: 11, fontWeight: 700, maxWidth: 190 }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: 'entity',
      headerName: isRTL ? 'الكيان' : 'Entity',
      width: 120,
      renderCell: (p) => (
        <Typography fontSize={13} fontWeight={600}>
          {isRTL ? (ENTITY_AR[p.value] || p.value) : p.value}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: isRTL ? 'النتيجة' : 'Result',
      width: 100,
      renderCell: (p) => (
        <Chip
          label={isRTL ? (p.value === 'success' ? 'نجح' : 'فشل') : (p.value === 'success' ? 'Success' : 'Failed')}
          color={p.value === 'success' ? 'success' : 'error'}
          size="small"
          sx={{ fontWeight: 700 }}
        />
      ),
    },
    { field: 'ip', headerName: 'IP', width: 120 },
    {
      field: 'details',
      headerName: isRTL ? 'التفاصيل' : 'Details',
      flex: 1,
      renderCell: (p) => {
        const text = p.value ? JSON.stringify(p.value) : '—';
        return (
          <Tooltip title={text} placement="top-start">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
              <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                {text}
              </Typography>
            </Box>
          </Tooltip>
        );
      },
    },
  ], [isRTL]);

  const entityOptions = useMemo(() => [
    { value: '', en: 'All', ar: 'الكل' },
    { value: 'Booking',     en: 'Booking',      ar: 'حجز' },
    { value: 'Doctor',      en: 'Doctor',       ar: 'طبيب' },
    { value: 'User',        en: 'User',         ar: 'مستخدم' },
    { value: 'BlockedSlot', en: 'Blocked Slot', ar: 'موعد محظور' },
    { value: 'Offer',       en: 'Offer',        ar: 'عرض' },
    { value: 'Holiday',     en: 'Holiday',      ar: 'عطلة' },
  ], [isRTL]);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">
            {isRTL ? 'سجل الأحداث' : 'Audit Logs'}
          </Typography>
          <Typography color="text.secondary" fontSize={14} mt={0.5}>
            {isRTL ? 'جميع الإجراءات المسجلة في النظام' : 'All recorded system actions'}
          </Typography>
        </Box>
        <Tooltip title={isRTL ? 'تحديث السجلات' : 'Refresh logs'}>
          <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={load}
            sx={{ borderRadius: 2.5 }}>
            {isRTL ? 'تحديث' : 'Refresh'}
          </Button>
        </Tooltip>
      </Box>

      {/* Filter panel */}
      <Accordion sx={{ mb: 2, borderRadius: '12px !important', border: '1px solid rgba(148,163,184,0.15)', boxShadow: 'none', '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ borderRadius: 3 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <FilterListRoundedIcon fontSize="small" color="action" />
            <Typography fontWeight={700} fontSize={14}>
              {isRTL ? 'خيارات الفلتر' : 'Filter Options'}
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box display="flex" flexWrap="wrap" gap={2} alignItems="flex-end">
            <TextField
              label={isRTL ? 'بحث في الإجراءات' : 'Search Actions'}
              size="small" value={filters.action}
              onChange={e => setFilters({ ...filters, action: e.target.value })}
              placeholder={isRTL ? 'مثال: BOOKING' : 'e.g. BOOKING'}
              sx={{ minWidth: 190 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{isRTL ? 'الكيان' : 'Entity'}</InputLabel>
              <Select value={filters.entity} label={isRTL ? 'الكيان' : 'Entity'}
                onChange={e => setFilters({ ...filters, entity: e.target.value })}>
                {entityOptions.map(o => (
                  <MenuItem key={o.value} value={o.value}>{isRTL ? o.ar : o.en}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={isRTL ? 'من تاريخ' : 'From Date'}
              type="date" size="small" InputLabelProps={{ shrink: true }}
              value={filters.startDate}
              onChange={e => setFilters({ ...filters, startDate: e.target.value })}
            />
            <TextField
              label={isRTL ? 'إلى تاريخ' : 'To Date'}
              type="date" size="small" InputLabelProps={{ shrink: true }}
              value={filters.endDate}
              onChange={e => setFilters({ ...filters, endDate: e.target.value })}
            />
            <Button variant="outlined" onClick={clearFilters} sx={{ borderRadius: 2 }}>
              {isRTL ? 'مسح الفلتر' : 'Clear'}
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)' }}>
        <DataGrid
          rows={logs}
          columns={columns}
          getRowId={(row) => row.id}
          hideFooter
          disableRowSelectionOnClick
          loading={loading}
          autoHeight
          localeText={isRTL ? AR_GRID : undefined}
          sx={{
            border: 'none',
            minHeight: 400,
            '& .MuiDataGrid-columnHeaders': { bgcolor: '#F8FAFC', fontWeight: 700 },
            '& .MuiDataGrid-overlayWrapper': { minHeight: 200 },
          }}
        />
      </Paper>

      {total > 1 && (
        <Box display="flex" justifyContent="center" mt={2.5}>
          <Pagination
            count={total} page={page}
            onChange={(_, p) => setPage(p)}
            color="primary" shape="rounded"
          />
        </Box>
      )}
    </Box>
  );
}


export async function getServerSideProps() {
  return { props: {} };
}
