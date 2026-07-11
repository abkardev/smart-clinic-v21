# Diagnostic Wave 1 — Implementation Report

**Date:** 2026-07-11  
**Status:** ✅ All 10 tasks implemented, 58 tests passing  

---

## Task 1 — Fix Meta Response Body Double-Consumption

**Files changed:** `whatsapp/route.ts`, `instagram/route.ts`

### Problem
`callMetaApi()` called `await res.text()` on error responses to log the body (line 33 both files). This consumed the `Response` body stream. When callers (`sendList`, `sendText`) then called `res.text()` again, it returned an empty string `""`. The real Meta error details were permanently lost, causing `parseMetaError("")` to return `null` and `errBody` to be `""`.

### Fix
Replace `await res.text()` with `await res.clone().text()` in both `callMetaApi` functions. `res.clone()` creates a copy of the response with a fresh body stream. The clone's text is read for logging, while the original `res` body remains intact for callers.

```diff
- const resBody = res.ok ? '' : await res.text().catch(() => '');
+ const resBody = res.ok ? '' : await res.clone().text().catch(() => '');
```

### Verification
- `parseMetaError()` now receives the real error JSON body
- `sendList` at line 93 can read the body a second time and get the actual Meta error
- Unit tests cover 400, 401, 403, 429, 500 error body parsing

---

## Task 2 — Log Exact JSON Payload Sent to Meta

**Files changed:** `whatsapp/route.ts`, `instagram/route.ts`

### Changes
- **`callMetaApi` (both files):** Added `logger.debug` line right before `fetchWithRetry` logging `correlationId`, `url`, `payloadSize`, and full `payload` (truncated to 2000 chars)
- **`sendList` (whatsapp):** Added `logger.info` before `callMetaApi` with structured details: `to`, `header`, `bodyPreview`, `button`, `sectionCount`, `rowCount`, `rowIds` — enabling correlation between failed sendList calls and the exact row configuration

---

## Task 3 — Instagram Runtime Entry Logging

**File changed:** `instagram/route.ts`

Added at the first executable line of POST handler:
```typescript
logger.info('[Webhook] Instagram POST entered', { webhookId });
logger.debug('[Webhook] Instagram raw body', { webhookId, rawBodySize, rawBodyPreview });
```

Also added catch-block logging for JSON parse failure:
```typescript
logger.warn('[Webhook] Instagram — invalid JSON body, returning EVENT_RECEIVED', { webhookId, rawBodySize });
```

---

## Task 4 — Instagram Early Exit Logging

**File changed:** `instagram/route.ts`

Every early return/continue path now has an explanatory log:

| Exit Point | Reason | Log Level | Log Message |
|---|---|---|---|
| Signature mismatch | `return 403` | warn | `invalid signature, rejecting` |
| No messaging array | `return EVENT_RECEIVED` | info | `no messaging events, returning EVENT_RECEIVED` |
| Echo message | `continue` | debug | `echo message, skipped` |
| No sender ID | `continue` | debug | `no sender ID, skipped` |
| Empty user input | `continue` | debug | `empty user input, skipped` |
| POST completed | `return EVENT_RECEIVED` | info | `Instagram POST completed` (with duration) |

---

## Task 5 — WhatsApp Runtime Logging

**File changed:** `whatsapp/route.ts`

Added logging for previously silent paths:

| Exit Point | Reason | Log Level | Log Message |
|---|---|---|---|
| No messages array | `return 200` | info | `no messages, acked` (with duration) |
| Empty userInput | `continue` | debug | `empty input, skipped` (with phone, messageId, messageType) |
| POST completed | `return 200` | info | `POST completed` (with duration) |

The webhook already had extensive logging for duplicate detection, message processing, and errors — these additions fill the remaining silent paths.

---

## Task 6 — Interactive Payload Validation Logging

**File added:** `metaValidation.ts:91-118`

New function `logInteractivePayloadDiagnostic()`:
- Logs every field of the interactive payload: `headerText`, `headerLength`, `bodyText`, `bodyLength`, `footerText`, `footerLength`, `buttonLabel`, `buttonLength`
- Per-section breakdown: `sectionTitles` (title, length, rowCount)
- Row analysis: `rowIds`, `rowTitleLengths`, `rowDescLengths`, `maxRowTitleLength`
- Metadata: `sectionCount`, `rowCount`, `duplicateIds`
- **Pure diagnostic** — does NOT modify the payload (unlike `validateWaPayload` which truncates fields)

Called from WhatsApp `sendList` immediately after `validateWaPayload`.

---

## Task 7 — Runtime Trace IDs

**Files reviewed:** `whatsapp/route.ts`, `instagram/route.ts`, `botEngine.ts`, `logger.ts`, `correlation.ts`

### Existing pattern (unchanged, already correct)
- `generateWebhookId()` creates `wh_<timestamp>_<random>` at POST handler start
- `getOrCreateCorrelationId(webhookId)` creates/fetches `cid_<timestamp>_<random>` mapped 1:1 to webhookId
- Both `webhookId` and `correlationId` are passed through every function: POST → `processMessage` → handler → adapter → `callMetaApi`
- Every log line in `logger.ts` prepends `[correlationId]` before the message when present

### Audit result
Every `logger.*` call in the diagnostic-critical paths includes at least one of `{webhookId, correlationId}`. No changes needed beyond the existing implementation.

---

## Task 8 — Error Object Preservation

**Fixed by Task 1.**

Before this wave, `parseMetaError("")` returned `null` because the body was empty (double-consumed). After Task 1's `res.clone()` fix, the body is available for both `callMetaApi`'s logging and the caller's `parseMetaError()`.

The error object is now preserved through the full lifecycle:
1. Meta returns `{error: {code, type, message, fbtrace_id}}`
2. `callMetaApi` clones response, reads body for logging
3. Original `res` is returned to caller
4. Caller reads `res.text()` → gets the real body
5. `parseMetaError(body)` → returns `{code, type, message, fbtraceId}`

---

## Task 9 — Automated Tests for Meta Error Responses

**File created:** `src/app/lib/metaValidation.test.ts` (16 tests)

### Test coverage

**`parseMetaError` (9 tests):**
- Meta auth error (401) — `OAuthException` with code 200
- Meta validation error (400) — `GraphMethodException` with `error_data.details`
- Meta rate limit error (429) — code 4
- Meta server error (500) — code 2
- Meta permission error (403) — code 10
- Non-JSON body → returns `null`
- Empty body → returns `null`
- Missing `error` field → returns `null`
- Round-trip verification — parsed JSON body matches original

**`logInteractivePayloadDiagnostic` (4 tests):**
- Valid payload does not throw
- Empty sections does not throw
- Missing optional fields does not throw
- Payload is not modified (diagnostic-only guarantee)

**`validateWaPayload` (3 tests):**
- Truncates header to `META_LIMITS.HEADER`
- Truncates body to `META_LIMITS.BODY`
- Handles payload without optional header/footer

---

## Task 10 — This Report

✅ Complete.

---

## Summary of Changes

| File | Lines Changed | Type |
|---|---|---|
| `whatsapp/route.ts` | 6 edits | Diagnostic |
| `instagram/route.ts` | 7 edits | Diagnostic |
| `metaValidation.ts` | +28 lines | Diagnostic (no behavioral change) |
| `metaValidation.test.ts` | +178 lines (new) | Test |
| `DIAGNOSTIC_WAVE1_REPORT.md` | +149 lines (new) | Report |

### Design invariants preserved
- Zero behavioral changes to conversation flow, booking logic, session management, event routing, fallback behaviour, or API contracts
- All logging is additive — never blocks, never throws
- `logInteractivePayloadDiagnostic` explicitly documented as diagnostic-only (no side effects)
- Meta API body fix uses `res.clone()` — minimal, no refactoring

### Test results
```
Test Files  3 passed (3)
     Tests  58 passed (58)
```
