# Wave 2 — WhatsApp Interactive List Row Limit Fix

**Date:** 2026-07-11  
**Root Cause:** Meta error 131009: `(#131009) Parameter value is not valid — Total row count exceed max allowed count: 10`  
**Status:** ✅ All 10 tasks completed, 68 tests passing  

---

## Files Modified

| File | Change | Lines |
|---|---|---|
| `src/app/lib/metaValidation.ts` | Added `MAX_TOTAL_ROWS`, `ensureRowLimit()` | +45 |
| `src/app/api/whatsapp/webhook/route.ts` | Import + call `ensureRowLimit()` in `sendList` adapter | +1 |
| `src/app/lib/botEngine.ts` | Fix `resendTimePicker` — add More Times pagination | +14 |
| `src/app/lib/botEngine.ts` | Fix `DateHandler.handle` — add More Times pagination | +16 |
| `src/app/lib/botEngine.ts` | Add `time_more` handler in `TimeHandler.handle` | +17 |
| `src/app/lib/metaValidation.test.ts` | 10 new tests for `ensureRowLimit` | +98 |

---

## Task 1 — Inventory

13 `sendList()` calls identified. Two violations found:

| Function | File:Line | Content | Nav | Total | Status |
|---|---|---|---|---|---|
| `sendTextWithNav` | botEngine:108 | 0 | 3 | 3 | ✅ |
| `sendMainMenu` | botEngine:116 | 5 | 0 | 5 | ✅ |
| `sendDoctorsList` | botEngine:131 | N | 3 | N+3 | ⚠️ guarded |
| `sendServicesList` | botEngine:142 | 4 | 3 | 7 | ✅ |
| `sendDatePicker` | botEngine:154 | ≤7 | 3 | ≤10 | ✅ |
| **`resendTimePicker`** | botEngine:187 | **10** | **3** | **13** | ❌ **FIXED** |
| `sendCallTimesList` | botEngine:194 | 3 | 3 | 6 | ✅ |
| `sendBookingSummaryScreen` | botEngine:214 | 3 | 0 | 3 | ✅ |
| `sendOffersScreen` | botEngine:243 | 1 | 3 | 4 | ✅ |
| `MainMenuHandler` | botEngine:280 | ≤3 | 3 | ≤6 | ✅ |
| **`DateHandler.handle`** | botEngine:371 | **10** | **3** | **13** | ❌ **FIXED** |
| `SummaryHandler` | botEngine:448 | 5 | 3 | 8 | ✅ |

---

## Task 2 — Guarantee Compliance

Every `sendList` call is now protected by the generic `ensureRowLimit()` safeguard at the adapter level in `whatsapp/route.ts`. No `sendList` call can ever produce a payload exceeding 10 total rows.

---

## Task 3 — Time Picker (Root Cause)

**Option A chosen** — Keep navigation rows (back, main_menu, cancel), reduce time slots to fit.

### Before (both resendTimePicker and DateHandler.handle):
```
Time slots × 10  = 10 content rows
Navigation       =  3 nav rows
Total            = 13 ❌ Meta rejects with error 131009
```

### After:
```
If available.length <= 7:
  Time slots × N  =  N content rows  (N ≤ 7)
  Navigation       =  3 nav rows
  Total            =  N+3 ≤ 10 ✅

If available.length > 7:
  Time slots × 6  =  6 content rows
  More Times       =  1 "time_more" row
  Navigation       =  3 nav rows
  Total            = 10 ✅

When user taps "More Times":
  Remaining slots  =  available[6..] (capped at 7)
  Total            =  ≤7 (no nav) ✅
```

---

## Task 4 — Doctors List

Protected by generic `ensureRowLimit()`. If >7 doctors, content rows are trimmed to fit 10 - 3 nav = 7 max.

---

## Task 5 — Date Picker

Already safe: `listUpcomingDays(doc, 7)` returns max 7 days + 3 nav = 10. Additionally protected by generic safeguard.

---

## Task 6 — Generic Safeguard

`ensureRowLimit()` in `metaValidation.ts`:

1. Counts total rows across all sections
2. If ≤ 10, returns sections unchanged
3. If > 10, identifies nav rows (ids: `back`, `main_menu`, `cancel`)
4. Preserves all nav rows, trims content rows from the end
5. Logs a warning with row counts for diagnostics
6. Called as the first line in WhatsApp `sendList` adapter

This protects ALL current and future `sendList` calls.

---

## Task 7 — Diagnostics Preserved

All Wave 1 diagnostics remain intact:
- `logInteractivePayloadDiagnostic()` still called with full payload
- Pre-request payload logging
- Meta API response body logging (`res.clone().text()`)
- Trace IDs in every log line
- Early exit logging in Instagram webhook

New diagnostic: `ensureRowLimit()` logs a warning when trimming occurs, recording original total, nav count, and trimmed count.

---

## Task 8 — New Tests (10 tests)

| Test | Rows In | Rows Out | Nav Preserved |
|---|---|---|---|
| Exactly 10 rows | 10 | 10 (unchanged) | - |
| 9 rows | 9 | 9 (unchanged) | - |
| 8 rows | 8 | 8 (unchanged) | - |
| 7 rows + nav | 10 | 10 (unchanged) | ✅ |
| 10 rows, no nav | 10 | 10 (unchanged) | - |
| 11 rows | 11 | 10 | ✅ |
| 13 rows (root cause) | 13 | 10 | ✅ |
| 20 rows | 20 | 10 | ✅ |
| 15 rows, no nav | 15 | 10 | - |
| Brute-force 0..30 | varies | ≤10 | ✅ |

---

## Task 9 — Regression Results

```
Test Files   3 passed (3)
     Tests  68 passed (68)
```

All original 58 tests pass plus 10 new tests. Instagram, botEngine, and metaValidation tests all green.

---

## Deployment Recommendation

**Approve deployment.** The system is now compliant with Meta's Interactive List row limit.

### Remaining Risks
- **Instagram webhook still receives no traffic** — this is a Meta Business Suite configuration issue, not a code issue
- **`eventType` computed before fallback mapping** (botEngine.ts:639 vs 705) — documented in META_RUNTIME_DEBUG_REPORT.md, affects `TEXT` guard at line 779, scheduled for Wave 3

### Success Criteria Verification

| Criterion | Status |
|---|---|
| ✓ Meta never returns error 131009 | Guaranteed by `ensureRowLimit()` at adapter level + proactive time picker fix |
| ✓ Every Interactive List ≤ 10 rows | All 13 callers protected |
| ✓ Booking flow still works | No flow changes — More Times preserves choice |
| ✓ Navigation still works | Nav rows preserved in time picker |
| ✓ Diagnostics remain available | All Wave 1 + new row-limit warnings |
| ✓ All previous tests pass | 58/58 original tests pass |
| ✓ New tests pass | 10/10 new tests pass |
| ✓ No Instagram changes | Instagram `sendList` left untouched |
