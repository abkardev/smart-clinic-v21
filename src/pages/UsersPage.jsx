'use client';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, Chip, IconButton, Tooltip, MenuItem, Select,
  Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions,
  Avatar, Paper, Button, FormControl, InputLabel,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';





import { useLang } from '../context/AppContext.jsx';
import { getUsers, updateUserStatus, updateUserRole, deleteUser } from '../services/api.js';
import { CancelRoundedIcon, CheckCircleRoundedIcon, DeleteRoundedIcon, PauseCircleRoundedIcon, PersonOffRoundedIcon } from '../components/icons';

const STATUS_CHIP = {
  approved:  { color: 'success', en: 'Approved',   ar: 'موافق عليه'   },
  pending:   { color: 'warning', en: 'Pending',    ar: 'قيد المراجعة' },
  rejected:  { color: 'error',   en: 'Rejected',   ar: 'مرفوض'         },
  suspended: { color: 'default', en: 'Suspended',  ar: 'معلق'          },
};
const ROLES = ['superadmin', 'admin', 'doctor'];
const ROLE_LABEL = { superadmin: { en: 'Super Admin', ar: 'مشرف عام' }, admin: { en: 'Admin', ar: 'مشرف' }, doctor: { en: 'Doctor', ar: 'طبيب' } };

const AR_GRID = {
  noRowsLabel:             'لا توجد بيانات',
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
  filterOperatorOnOrAfter:     'في أو بعد',
  filterOperatorBefore:        'قبل',
  filterOperatorOnOrBefore:    'في أو قبل',
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

export default function UsersPage() {
  const { isRTL } = useLang();
  // Keep a ref so DataGrid renderCell callbacks always get latest state without stale closure
  const usersRef = useRef([]);
  const [users, setUsersState]    = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilter] = useState('');
  const [snackbar, setSnackbar]   = useState({ open: false, message: '', severity: 'success' });
  const [confirmDialog, setConfirm] = useState({ open: false, userId: null, action: '', labelEn: '', labelAr: '' });

  const setUsers = (val) => {
    const next = typeof val === 'function' ? val(usersRef.current) : val;
    usersRef.current = next;
    setUsersState(next);
  };

  const notify = (en, ar, severity = 'success') =>
    setSnackbar({ open: true, message: isRTL ? ar : en, severity });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsers(filterStatus ? { status: filterStatus } : {});
      setUsers(res.data);
    } catch { notify('Failed to load', 'فشل التحميل', 'error'); }
    finally { setLoading(false); }
  }, [filterStatus]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Role change: optimistic + rollback, uses ref to avoid stale closure ──
  const handleRole = useCallback(async (id, newRole) => {
    const prev = usersRef.current.find(u => u.id === id)?.role;
    setUsers(cur => cur.map(u => u.id === id ? { ...u, role: newRole } : u));
    try {
      await updateUserRole(id, newRole);
      notify('Role updated', 'تم تحديث الدور');
    } catch (err) {
      setUsers(cur => cur.map(u => u.id === id ? { ...u, role: prev } : u));
      const msg = err.response?.data?.message || '';
      notify(msg || 'Failed to update role', msg || 'فشل تحديث الدور', 'error');
    }
  }, []); // eslint-disable-line

  const handleStatus = async (id, status) => {
    try {
      await updateUserStatus(id, status);
      setUsers(cur => cur.map(u => u.id === id ? { ...u, status } : u));
      const labels = { approved: ['Approved','تمت الموافقة'], rejected: ['Rejected','تم الرفض'], suspended: ['Suspended','تم التعليق'] };
      const [en, ar] = labels[status] || ['Done', 'تم'];
      notify(en, ar);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'فشلت العملية', 'error');
    }
    setConfirm({ open: false });
  };

  const handleDelete = async (id) => {
    const confirm = window.confirm(isRTL ? 'هل أنت متأكد من حذف هذا المستخدم؟' : 'Delete this user?');
    if (!confirm) return;
    try {
      await deleteUser(id);
      setUsers(cur => cur.filter(u => u.id !== id));
      notify('User deleted', 'تم حذف المستخدم');
    } catch { notify('Delete failed', 'فشل الحذف', 'error'); }
  };

  // ── Columns — memoized: only rebuilds when isRTL or handleRole changes ──
  const columns = useMemo(() => [
    {
      field: 'name',
      headerName: isRTL ? 'الاسم الكامل' : 'Full Name',
      flex: 1, minWidth: 150,
      renderCell: (p) => (
        <Box display="flex" alignItems="center" gap={1.2}>
          <Avatar sx={{ width: 30, height: 30, fontSize: 13, fontWeight: 700, bgcolor: '#EFF6FF', color: '#0A6EBD' }}>
            {p.row.name?.charAt(0)}
          </Avatar>
          <Typography fontSize={13} fontWeight={600}>{p.row.name}</Typography>
        </Box>
      ),
    },
    { field: 'email', headerName: isRTL ? 'البريد الإلكتروني' : 'Email', flex: 1, minWidth: 190 },
    {
      field: 'role',
      headerName: isRTL ? 'الدور' : 'Role',
      width: 155,
      // KEY FIX: renderCell uses the row's current value, not stale closure
      renderCell: (p) => (
        <Select
          value={p.row.role}
          size="small"
          variant="standard"
          disableUnderline
          sx={{ fontSize: 13, fontWeight: 600, minWidth: 120 }}
          onChange={(e) => {
            e.stopPropagation();
            handleRole(p.row.id, e.target.value);
          }}
        >
          {ROLES.map(r => (
            <MenuItem key={r} value={r}>
              {isRTL ? ROLE_LABEL[r].ar : ROLE_LABEL[r].en}
            </MenuItem>
          ))}
        </Select>
      ),
    },
    {
      field: 'status',
      headerName: isRTL ? 'الحالة' : 'Status',
      width: 140,
      renderCell: (p) => {
        const s = STATUS_CHIP[p.value] || { color: 'default', en: p.value, ar: p.value };
        return <Chip label={isRTL ? s.ar : s.en} color={s.color} size="small" sx={{ fontWeight: 700 }} />;
      },
    },
    {
      field: 'lastLogin',
      headerName: isRTL ? 'آخر دخول' : 'Last Login',
      width: 160,
      valueGetter: (value, row) => row.lastLogin
        ? new Date(row.lastLogin).toLocaleString(isRTL ? 'ar-SA' : 'en-US')
        : '—',
    },
    {
      field: 'createdAt',
      headerName: isRTL ? 'تاريخ التسجيل' : 'Registered',
      width: 130,
      valueGetter: (value, row) => new Date(row.createdAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US'),
    },
    {
      field: 'actions',
      headerName: isRTL ? 'الإجراءات' : 'Actions',
      width: 170,
      sortable: false,
      renderCell: (p) => (
        <Box display="flex" gap={0.5}>
          {p.row.status !== 'approved' && (
            <Tooltip title={isRTL ? 'الموافقة على المستخدم' : 'Approve user'}>
              <IconButton size="small" color="success"
                onClick={() => setConfirm({ open: true, userId: p.row.id, action: 'approved', labelEn: 'Approve', labelAr: 'موافقة' })}>
                <CheckCircleRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {p.row.status !== 'rejected' && p.row.role !== 'superadmin' && (
            <Tooltip title={isRTL ? 'رفض المستخدم' : 'Reject user'}>
              <IconButton size="small" color="error" onClick={() => handleStatus(p.row.id, 'rejected')}>
                <CancelRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {p.row.status !== 'suspended' && p.row.role !== 'superadmin' && (
            <Tooltip title={isRTL ? 'تعليق الحساب' : 'Suspend account'}>
              <IconButton size="small" color="warning" onClick={() => handleStatus(p.row.id, 'suspended')}>
                <PauseCircleRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {p.row.status === 'suspended' && p.row.role !== 'superadmin' && (
            <Tooltip title={isRTL ? 'إعادة تفعيل الحساب' : 'Reactivate account'}>
              <IconButton size="small" color="success" onClick={() => handleStatus(p.row.id, 'approved')}>
                <PersonOffRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {p.row.role !== 'superadmin' && (
            <Tooltip title={isRTL ? 'حذف المستخدم نهائياً' : 'Delete user permanently'}>
              <IconButton size="small" color="error" onClick={() => handleDelete(p.row.id)}>
                <DeleteRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ], [isRTL, handleRole]);

  const pendingCount = useMemo(() => users.filter(u => u.status === 'pending').length, [users]);

  const filterOptions = [
    { value: '', en: 'All Users', ar: 'جميع المستخدمين' },
    { value: 'pending',   en: 'Pending',   ar: 'قيد المراجعة' },
    { value: 'approved',  en: 'Approved',  ar: 'موافق عليه'   },
    { value: 'rejected',  en: 'Rejected',  ar: 'مرفوض'         },
    { value: 'suspended', en: 'Suspended', ar: 'معلق'          },
  ];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">
            {isRTL ? 'إدارة المستخدمين' : 'User Management'}
          </Typography>
          {pendingCount > 0 && (
            <Typography color="warning.main" fontSize={13} fontWeight={600} mt={0.5}>
              ⚠️ {pendingCount} {isRTL ? 'مستخدم بانتظار موافقتك' : 'user(s) awaiting approval'}
            </Typography>
          )}
        </Box>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{isRTL ? 'الحالة' : 'Filter by Status'}</InputLabel>
          <Select value={filterStatus} label={isRTL ? 'الحالة' : 'Filter by Status'}
            onChange={e => setFilter(e.target.value)}>
            {filterOptions.map(o => (
              <MenuItem key={o.value} value={o.value}>{isRTL ? o.ar : o.en}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {pendingCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2.5 }}>
          {isRTL
            ? `يوجد ${pendingCount} مستخدم بانتظار الموافقة — راجع القائمة أدناه.`
            : `${pendingCount} user(s) are awaiting your approval.`}
        </Alert>
      )}

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)' }}>
        <DataGrid
          getRowId={(row) => row.id}
          rows={users}
          columns={columns}
          loading={loading}
          autoHeight
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          localeText={isRTL ? AR_GRID : undefined}
          sx={{
            border: 'none',
            minHeight: 400,
            '& .MuiDataGrid-columnHeaders': { bgcolor: '#F8FAFC', fontWeight: 700 },
            '& .MuiDataGrid-footerContainer': { borderTop: '1px solid rgba(148,163,184,0.15)' },
            '& .MuiDataGrid-cell': { alignItems: 'center' },
            '& .MuiDataGrid-overlayWrapper': { minHeight: 200 },
          }}
        />
      </Paper>

      {/* Confirm dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirm({ open: false })}
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle fontWeight={700}>{isRTL ? 'تأكيد الإجراء' : 'Confirm Action'}</DialogTitle>
        <DialogContent>
          <Typography>
            {isRTL
              ? `هل تريد ${confirmDialog.labelAr} هذا المستخدم؟`
              : `Are you sure you want to ${confirmDialog.labelEn} this user?`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirm({ open: false })} variant="outlined" sx={{ borderRadius: 2 }}>
            {isRTL ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="contained" color="success"
            onClick={() => handleStatus(confirmDialog.userId, confirmDialog.action)} sx={{ borderRadius: 2 }}>
            {isRTL ? confirmDialog.labelAr : confirmDialog.labelEn}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: isRTL ? 'left' : 'right' }}>
        <Alert severity={snackbar.severity} sx={{ borderRadius: 2.5 }}
          onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}


export async function getServerSideProps() {
  return { props: {} };
}
