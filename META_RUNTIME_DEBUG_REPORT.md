# Meta Runtime Debug Report — SmartClinic

**Date:** 2026-07-11  
**Scope:** WhatsApp interactive message failure + Instagram webhook silence  
**Methodology:** Static code analysis, execution path tracing, Meta Cloud API specification cross-reference

---

## Section 1 — WhatsApp Interactive Message Investigation

### 1.1 Call Hierarchy

```
User selects date (interactive list_reply)
  → WhatsApp webhook POST (whatsapp/route.ts:129)
    → processMessage() (botEngine.ts:626)
      → DateHandler.handle() (botEngine.ts:359)
        → adapter.sendList() (whatsapp/route.ts:73)
          → validateWaPayload() (metaValidation.ts:144)
          → callMetaApi() (whatsapp/route.ts:26 / retry.ts:24)
            → fetch() → Meta Graph API
          ← Response (body consumed by callMetaApi on error)
          → res.text() (SECOND read — returns "" on error)
          → registerFallbackRows()
          → adapter.sendText() with numbered fallback
      ← session updated to 'select_time'
```

### 1.2 Functions Involved

| Function | File | Line | Role |
|---|---|---|---|
| `POST()` (webhook) | `whatsapp/route.ts` | 129 | Entry — parses incoming message, calls `processMessage` |
| `processMessage()` | `botEngine.ts` | 626 | Main engine — session, routing, handler dispatch |
| `DateHandler.handle()` | `botEngine.ts` | 359 | Handles date_* input, calls `adapter.sendList()` for time picker |
| `sendList()` (WhatsApp adapter) | `whatsapp/route.ts` | 73 | Constructs interactive payload, sends to Meta, handles fallback |
| `validateWaPayload()` | `metaValidation.ts` | 144 | Truncates fields to Meta limits, logs integrity warnings |
| `callMetaApi()` | `whatsapp/route.ts` | 26 | POST to Graph API, reads & logs response body |
| `fetchWithRetry()` | `retry.ts` | 24 | HTTP fetch with exponential backoff (retry only 429, 5xx) |
| `registerFallbackRows()` | `botEngine.ts` | 41 | Persists row mapping for numbered fallback |
| `resolveFallbackInput()` | `botEngine.ts` | 51 | Maps typed number → row ID from persisted mapping |

---

## Section 2 — Interactive JSON Validation

### 2.1 Payload Construction (whatsapp/route.ts:74-80)

```typescript
const interactivePayload = {
  type: 'list',
  header: { type: 'text', text: header },     // header = waHeader(bi('...', '...'))
  body: { text: body },                        // body = MSG.selectTime(...)
  footer: { text: 'SmartClinic 🏥' },
  action: { button, sections },               // button = waButtonLabel('اختر', 'Choose')
};
```

### 2.2 Meta Cloud API Specification (v21.0)

| Field | Meta Limit | Actual (time picker) | Status |
|---|---|---|---|
| `header.text` | 60 chars | ~30 chars (bilingual) | ✅ OK |
| `body.text` | 1024 chars | ~100 chars | ✅ OK |
| `footer.text` | 60 chars | ~18 chars | ✅ OK |
| `action.button` | 20 chars | "اختر" (4 chars) | ✅ OK |
| Sections | 1–10 | 2 (time + navigation) | ✅ OK |
| Section title | 24 chars | ~20 chars (Arabic date) | ✅ OK |
| Rows per section | 10 | Section 1: up to 10, Section 2: 3 | ✅ OK per-section |
| **Total rows** | **10 (Meta limit)** | **up to 13** | **❌ EXCEEDS** |
| Row title | 24 chars | time: 5 chars, nav: 4–9 chars | ✅ OK |
| Row description | 72 chars | ~40 chars | ✅ OK |
| Row ID | 200 chars | "time_09:00" (10 chars) | ✅ OK |

### 2.3 Critical Finding: Response Body Double-Consumption

**File:** `whatsapp/route.ts`  
**Call 1 (line 33):** Inside `callMetaApi()`:
```typescript
const resBody = res.ok ? '' : await res.text().catch(() => '');
```
When `res.ok === false`, the response body stream is consumed and the text is stored in `resBody`. The `res` Response object is then returned to the caller.

**Call 2 (line 93):** Inside `sendList()`:
```typescript
const errBody = await res.text().catch(() => '');
```
The `Response.text()` method can only be called **once**. The second call on an already-consumed stream returns an empty string (`''`).

**Impact:** `parseMetaError('')` returns `null`. The Meta error details (`error.code`, `error.type`, `error.message`, `error.error_data.details`, `error.fbtrace_id`) are silently lost. The log only shows `status=400` with `error: ''`.

### 2.4 Validation Gap

`validateListIntegrity()` (`metaValidation.ts:106`) only logs warnings — it does NOT throw or prevent sending a payload that violates Meta limits. This means payloads exceeding row limits are sent to Meta unconditionally.

---

## Section 3 — Meta API Request Investigation

### 3.1 Request Details

| Attribute | Value | Source |
|---|---|---|
| HTTP Method | `POST` | `retry.ts:35` |
| URL | `https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_ID}/messages` | `whatsapp/route.ts:20` |
| Bearer Token | `WHATSAPP_TOKEN` from env | `whatsapp/route.ts:22` |
| Content-Type | `application/json` | `whatsapp/route.ts:23` |
| Body | `JSON.stringify(payload)` | `retry.ts:28` |
| Timeout | Default (no custom timeout set) | — |
| Retry | 3 attempts, exponential backoff (500ms–8s) | `retry.ts:17-18` |
| Retry on | Only 429, 500, 502, 503, 504 | `retry.ts:8` |

### 3.2 Missing Timeout

`fetchWithRetry()` calls `fetch(url, options)` without a `signal` or `AbortController`. The default Node.js fetch timeout applies (which can be very long). A slow Meta response could tie up the Vercel serverless function for up to 60s (the `maxDuration` setting).

### 3.3 Bearer Token Source

The token is from `process.env.WHATSAPP_TOKEN` at module load time. If the token is rotated, the server must be restarted — there is no token refresh or auto-renewal mechanism.

---

## Section 4 — Meta Response Investigation

### 4.1 Why Only `status=400` Is Logged

**Root cause chain:**

1. `callMetaApi()` (`whatsapp/route.ts:33`) reads `res.text()` when `!res.ok`
2. `sendList()` (`whatsapp/route.ts:93`) calls `res.text()` **a second time**
3. The response body stream is a **single-use ReadableStream** — already consumed in step 1
4. Second `res.text()` resolves to `""` (empty string) or rejects with `TypeError: body stream already read`
5. `.catch(() => '')` turns the rejection into `''`
6. `parseMetaError('')` returns `null`
7. The `metaErr` spread (`metaCode`, `metaType`, `metaMessage`, `metaTrace`) is **absent** from the log
8. Only `error: ''` is logged alongside `status: 400`

### 4.2 Exact Code Responsible

| Line | File | Code | Problem |
|---|---|---|---|
| 33 | `whatsapp/route.ts` | `const resBody = res.ok ? '' : await res.text().catch(() => '');` | First consumption — correct here |
| 93 | `whatsapp/route.ts` | `const errBody = await res.text().catch(() => '');` | Second consumption — **returns empty** |

### 4.3 Meta Error Shape (Expected)

When Meta rejects, the response body looks like:
```json
{
  "error": {
    "message": "(#130429) Rate limit hit",
    "type": "OAuthException",
    "code": 130429,
    "error_data": { "details": "..." },
    "fbtrace_id": "ABC123..."
  }
}
```

Without the response body, the exact error code, type, and message are **permanently lost** for every 400 response.

### 4.4 Recommended Runtime Logging Pattern

The logging should:
1. Read the response body exactly **once** in a shared utility
2. Log the full error with `error.code`, `error.type`, `error.message`, `error.error_data.details`, `error.fbtrace_id`
3. Return or throw a structured error object containing all parsed fields
4. Never call `res.text()` after it has already been consumed

---

## Section 5 — Interactive Limits Validation

### 5.1 Meta WhatsApp Cloud API Limits (v21.0)

From the official specification:

| Constraint | Limit |
|---|---|
| Button label | 20 characters |
| Sections per list | 1–10 |
| Section title | 24 characters |
| **Rows per section** | **10** |
| Row title | 24 characters |
| Row description | 72 characters |
| Row ID | 200 characters |
| Header text | 60 characters |
| Body text | 1024 characters |
| Footer text | 60 characters |

**Note on total rows:** The Meta specification for WhatsApp Cloud API list messages states a limit of **10 rows per section**. There is no explicit limit on total rows across sections. However, different Meta documentation sources have conflicting information, and enforcement may vary by API version.

### 5.2 Current Implementation Row Count

The time picker `DateHandler.handle()` at `botEngine.ts:371-374`:
```
Section 1 (time):  available.slice(0, 10)    → up to 10 rows
Section 2 (nav):    navigationSection()       → 3 rows
Total:                                          up to 13 rows
```

### 5.3 Analysis

- **Section 1 rows (≤10):** Within per-section limit ✅
- **Section 2 rows (3):** Within per-section limit ✅
- **Total rows (≤13):** Exceeds if Meta enforces a TOTAL row limit of 10 ❌
- **Without the error body** (Section 4), the exact Meta rejection reason **cannot be confirmed** — but row count exceeding a total limit is the most probable cause given `rowCount = 13` in the fallback log

### 5.4 Other `sendList` Calls With High Row Count

| Call Site | File:Line | Rows | Exceeds 10 total? |
|---|---|---|---|
| `sendDoctorsList` | `botEngine.ts:132-138` | N doctors + 3 nav | **Yes if >7 doctors** |
| `sendServicesList` | `botEngine.ts:142-145` | 4 services + 3 nav = 7 | ✅ OK |
| `sendDatePicker` | `botEngine.ts:154-161` | N dates + 3 nav | **Yes if >7 dates** |
| `sendCallTimesList` | `botEngine.ts:193-201` | 3 call times + 3 nav = 6 | ✅ OK |
| `sendBookingSummaryScreen` | `botEngine.ts:204-219` | 3 rows | ✅ OK |
| `sendMainMenu` | `botEngine.ts:114-125` | 5 menu + 0 nav = 5 | ✅ OK |
| `sendTextWithNav` | `botEngine.ts:106-108` | 3 nav only | ✅ OK |

---

## Section 6 — Fallback Investigation

### 6.1 Fallback Execution Path

```
sendList() fails (400)
  → catch block (whatsapp/route.ts:101-110)
    → registerFallbackRows(to, sections.flatMap(s => s.rows))
    → logger.warn('WA sendList failed, falling back to plain text')
    → const items = rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n')
    → const fallback = `${body}\n\n${items}\n\nأرسل رقم اختيارك / Send the number of your choice.`
    → this.sendText(to, fallback)
```

### 6.2 Fallback Behavior

The fallback sends:
```
<original body text>

1. 09:00
2. 09:30
3. 10:00
...

أرسل رقم اختيارك / Send the number of your choice.
```

The user sees plain text with numbered options and is asked to send a number.

### 6.3 Why "Please use the buttons below to continue" Appears

**Root cause:** Event type determined before fallback mapping.

In `botEngine.ts`:

| Step | Line | What happens |
|---|---|---|
| User types "1" | — | WhatsApp delivers a text message |
| `normInput = "1"` | 638 | Raw input |
| `eventType = determineEventType("1", isText=true)` | 639 | Returns `EventType.TEXT` |
| `isText=true` | — | Preserved from webhook parsing |
| Fallback mapping: `"1"` → `"time_09:00"` | 705-711 | `normInput` is updated, but **`eventType` is NOT recalculated** |
| Navigation check | 716 | Not navigation |
| TEXT in non-text step check: `eventType === EventType.TEXT && select_time not in ['ask_name','ask_whatsapp']` | 779 | **TRUE** |
| `adapter.sendText(userId, MSG.pleaseUseButtons)` | 788 | User sees "Please use the buttons below to continue" |
| No buttons exist | — | Meta rejected the interactive list, and the fallback asked for a number, but the typed number is rejected |

### 6.4 The Sequence of Events

1. ✅ User selects date via interactive list → `DateHandler` fires
2. ❌ `sendList()` for time picker → Meta returns 400
3. ✅ Fallback fires → numbered text sent to user
4. ❌ User types "1" → **TEXT-in-non-text-step guard blocks it** → "Please use the buttons below"
5. ❌ User is stuck — no list, no buttons, and typing numbers is blocked

### 6.5 Root Cause of the Block

The `eventType` is computed at line 639 **before** the fallback mapping at line 705. When the fallback mapping converts "1" to "time_09:00", `normInput` is updated but the already-computed `eventType` remains `TEXT`. The guard at line 779 fires because the step (`select_time`) is not in the text-allowed steps (`ask_name`, `ask_whatsapp`).

The intended behavior (based on the fallback architecture) is:
- User types a number → fallback mapping converts to row ID → the mapped ID should be treated as a list_reply (non-text) event → route to handler

But the implementation:
- Computes `eventType` from **original input** and **original `isText` flag**
- Does NOT recompute `eventType` after fallback mapping changes `normInput`

---

## Section 7 — Instagram Runtime Investigation

### 7.1 Execution Path Trace

```
Incoming request
  → Vercel Route: src/app/api/instagram/webhook/route.ts
    → GET handler (verification): line 126
      → logger.info('Instagram webhook GET (verification)')
      → Compare token === INSTAGRAM_VERIFY_TOKEN
      → Return challenge (200) or Forbidden (403)
    → POST handler: line 140
      → webhookStart = Date.now()
      → webhookId = generateWebhookId()
      → rawBody = await req.text()
      → body = JSON.parse(rawBody)
      → verifySignature()
        → logger.warn('Instagram webhook — invalid signature')
        → return 403 if invalid
      → logger.info('Instagram webhook POST')  ← ONLY if messages found
      → processMessage()
      → adapter.sendText/to → callMetaApi()
```

### 7.2 Where Execution STOPS

**The execution stops BEFORE entering the POST handler.** The problem statement confirms: "No request appears in Vercel logs. No POST request. No webhook handler log."

This means **Meta is not sending webhook requests to the Instagram webhook URL at all**. The issue is NOT in the code — it is in the Meta Business Suite / App configuration.

### 7.3 Possible Causes (Infrastructure/Configuration)

| Cause | Evidence Required | How to Verify |
|---|---|---|
| Webhook URL not configured | No GET or POST logs | Check Meta App → Webhook → Instagram section |
| Webhook verification (GET) never succeeded | No GET log | Deploy a test service that logs ALL requests to the webhook URL |
| Webhook subscription expired | No POST logs | Re-verify webhook in Meta Business Suite |
| Instagram Business Account not linked | No POST logs | Check Meta Business Suite → Instagram Accounts |
| App in development mode | No POST logs for non-test users | Toggle to "Live" or add test users |
| Wrong webhook fields subscribed | No POST logs | Must subscribe `messages`, `messaging_optins`, etc. |
| Webhook callback URL changed after deployment | No POST logs | Verify URL matches Meta configuration exactly |
| Vercel URL changed | No logs | Check Vercel deployment URL matches Meta configuration |
| `INSTAGRAM_VERIFY_TOKEN` env var not set | GET returns 403 | Check env var is set in Vercel dashboard |

---

## Section 8 — Webhook Registration Investigation

### 8.1 Expected Configuration

| Attribute | Required Value |
|---|---|
| Webhook URL | `https://{domain}/api/instagram/webhook` |
| Verify Token | Same as `INSTAGRAM_VERIFY_TOKEN` env var |
| Subscribe Fields | `messages`, `messaging_optins`, `message_deliveries`, `message_reads` |
| API Version | v21.0 |

### 8.2 GET Handler (Verification)

File: `instagram/webhook/route.ts:126-137`

```typescript
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}
```

**Issues:**
- The token comparison uses `===` which is case-sensitive
- `INSTAGRAM_VERIFY_TOKEN` must be set in Vercel env vars
- If the token is not set, all requests return 403
- There is no log when verification fails (beyond the info line that logs `tokenMatch: false`)

### 8.3 POST Handler Flow

File: `instagram/webhook/route.ts:140-235`

After Phase 1 fix, the POST handler supports two payload formats:
1. `entry[0].messaging[]` (Messenger Platform format)
2. `entry[0].changes[].value` (Instagram Graph API format)

**First log line occurs at line 163** (`logger.info('[Webhook] Graph API format detected')`) or **line 174** (`logger.info('Instagram webhook POST')`). 

If `messaging` and `changes` are BOTH empty, the handler returns `200 EVENT_RECEIVED` at line 169 **WITHOUT any log entry** — this is a **logging gap**.

---

## Section 9 — Runtime Logging Audit

### 9.1 WhatsApp — Existing Logs

| Event | File:Line | Log Level | Present? |
|---|---|---|---|
| Incoming webhook POST | `whatsapp/route.ts:159` | `info` | ✅ |
| Webhook body parsed | — | — | ❌ **Missing** — no structured log of the raw webhook body |
| Message type + payload | `whatsapp/route.ts:201` | `debug` | ✅ (only if message found) |
| Duplicate detection | `whatsapp/route.ts:184` | `info` | ✅ |
| Session read | `botEngine.ts:642` | `info` | ✅ |
| Engine routing | `botEngine.ts:642` | `info` | ✅ |
| Handler dispatch | `botEngine.ts:794-801` | `warn`/`error` | ✅ |
| Session transition | `botEngine.ts:818-820` | `info` | ✅ |
| Meta API request (sent) | `whatsapp/route.ts:35` | `info` | ✅ |
| Meta API error body | `whatsapp/route.ts:95-98` | `error` | ❌ **Broken** — body empty due to double consumption |
| Fallback execution | `whatsapp/route.ts:104-106` | `warn` | ✅ |
| Fallback mapping hit | `botEngine.ts:708` | `info` | ✅ |
| TEXT-in-non-text-step guard | — | — | ❌ **Missing** — no log when `MSG.pleaseUseButtons` is sent |

### 9.2 Instagram — Existing Logs

| Event | File:Line | Log Level | Present? |
|---|---|---|---|
| GET verification | `instagram/route.ts:132` | `info` | ✅ |
| POST webhook received | — | — | ❌ **Missing** — no log at function entry |
| Raw body received | — | — | ❌ **Missing** — no log when `req.text()` is called |
| JSON parse result | — | — | ❌ **Missing** — no log if body is `null` after parse |
| Signature verification | `instagram/route.ts:148-150` | `warn` | ✅ (only on failure) |
| No messages → early return | — | — | ❌ **Missing** — no log when `messaging.length === 0` at line 169 |
| Graph API format detected | `instagram/route.ts:163` | `info` | ✅ (only when changes found) |
| Processing message | `instagram/route.ts:174` | `info` | ✅ |
| Meta API request | `instagram/route.ts:35` | `info` | ✅ |
| Meta API error | `instagram/route.ts:68-71` | `error` | ✅ |

### 9.3 Critical Missing Logs

| Missing Log | Impact |
|---|---|
| `callMetaApi` should NOT consume `res.text()` on error — or should pass it through | Meta error details lost — can't diagnose 400 |
| No log for TEXT-in-non-text-step guard | Can't trace why user sees "use buttons" |
| No log when Instagram webhook returns early at line 169 | No visibility into empty payloads |
| No Instagram POST entry log | If webhook reaches Vercel but no handler log, no way to know |

---

## Section 10 — Runtime Trace

### 10.1 WhatsApp Trace

```
User          → Selects date via interactive list
WhatsApp      → POST /api/whatsapp/webhook
Webhook       → Parses message, type=interactive, list_reply.id="date_2026-07-15"
Parser        → userInput = "date_2026-07-15", isText = false
Engine        → processMessage() → step='select_date', eventType=LIST_REPLY
DateHandler   → Gets available slots, calls adapter.sendList()
  sendList()  → Constructs interactive payload (10 time rows + 3 nav rows = 13)
  validateWaPayload() → Truncates fields, logs warnings (but doesn't block)
  callMetaApi() → POST to Graph API → 400 Bad Request
    callMetaApi() → res.text() → reads body (FIRST read) ✅
    callMetaApi() → logs status=400, body=... ✅
    callMetaApi() → returns res  (body stream is now consumed)
  sendList()   → res.text() → "" (SECOND read, stream empty) ❌
  sendList()   → parseMetaError("") → null ❌
  sendList()   → logger.error('WA sendList rejected by Meta', status=400, error='') ❌
  sendList()   → throw new Error('')
  sendList()   → catch → registerFallbackRows()
  sendList()   → sendText(fallback) → "أرسل رقم اختيارك / Send the number..."
  DateHandler  → returns 'select_time'
  Engine       → setSession(phone, 'select_time', data, version)

═══ FIRST FAILING STEP: sendList() → Meta 400 → body lost ═══

User          → Types "1"
WhatsApp      → POST /api/whatsapp/webhook
Webhook       → Parses message, type=text, text.body="1"
Parser        → userInput = "1", isText = true
Engine        → normInput = "1"
              → eventType = determineEventType("1", true) = TEXT  ⚠️ computed BEFORE mapping
              → /^\d+$/ matches "1" → resolveFallbackInput() → "time_09:00"
              → normInput = "time_09:00"
              → step = 'select_time'
              → eventType === TEXT && 'select_time' not in allowed → TRUE
              → sendText(MSG.pleaseUseButtons) → "Please use the buttons below..."

═══ SECOND FAILING STEP: TEXT guard blocks fallback-mapped input ═══
```

### 10.2 Instagram Trace

```
Meta (Instagram)
  → POST https://{domain}/api/instagram/webhook
  ❌ NEVER REACHES VERCEL — no request in logs

═══ FAILING STEP: Webhook not configured or not subscribed ═══

HYPOTHETICAL (if webhook arrived):
  POST handler → webhookId, rawBody, JSON.parse
  → verifySignature → logger.warn if invalid → 403
  → entry[0].messaging or entry[0].changes
  → processMessage → sendText → callMetaApi
```

---

## Section 11 — Root Cause Matrix

| # | Problem | Evidence | File:Line | Runtime State | Meta Requirement | Severity | Root Cause | Fix (no code) |
|---|---|---|---|---|---|---|---|---|
| 1 | Meta error details lost | `res.text()` called twice; second call returns `""` | `whatsapp/route.ts:33` + `:93` | `res.ok === false`, body stream consumed | Response body is single-use ReadableStream | **CRITICAL** | `callMetaApi()` reads body, then `sendList()` reads again | Read body once; pass parsed error to caller; never call `res.text()` after consumption |
| 2 | Typed number blocked after fallback | `eventType` computed before fallback mapping; TEXT guard fires incorrectly | `botEngine.ts:639` + `:779` | `normInput="1"`, `eventType=TEXT`, mapping runs but eventType stale | Fallback-mapped input should behave as list_reply | **CRITICAL** | `eventType` determined from original input, not after fallback remapping | Recompute `eventType` after fallback mapping, or set `isText=false` for mapped numeric input |
| 3 | Row count may exceed Meta total limit | 10 time rows + 3 nav rows = 13 total rows | `botEngine.ts:371-374` | Section has 10+3 rows | Meta total row limit may be 10 | **HIGH** | Navigation section always appended, pushing total over limit | Remove navigation from time picker, or reduce time rows to ≤7 |
| 4 | No Instagram webhook logs at all | No GET or POST request reaches Vercel | Infrastructure | Meta does not call the webhook URL | Webhook must be registered and subscribed | **CRITICAL** | Webhook not configured, or token mismatch, or subscription expired | Verify Meta Business Suite webhook configuration |
| 5 | No log when Instagram POST returns early | `if (!messaging.length) return 200` without logging | `instagram/route.ts:169` | `entry.messaging` and `entry.changes` both empty | — | **MEDIUM** | Missing log for empty-payload webhook calls | Add `logger.info` before early return |
| 6 | No log when TEXT guard blocks input | `adapter.sendText(MSG.pleaseUseButtons)` without logging | `botEngine.ts:788` | `eventType === TEXT` and step not in allowed list | — | **LOW** | Missing log for user-blocking event | Add `logger.info` with step and input |

---

## Section 12 — Required Fixes

### Critical

| # | Fix | Affected Files | Regression Risk | Testing Required | Dependencies |
|---|---|---|---|---|---|
| C1 | Fix double body read: `callMetaApi` should NOT consume `res.text()` when `!res.ok`, OR `sendList` should use the already-parsed error | `whatsapp/route.ts` | **Low** — only affects error path | Mock Meta 400 → verify `errBody` contains expected JSON | None |
| C2 | Recompute `eventType` after fallback mapping, or set `isText=false` when mapping succeeds | `botEngine.ts` | **Medium** — changes routing for mapped numeric input | Unit test: type "1" → fallback maps to "time_09:00" → enters TimeHandler, not blocked | None |

### High

| # | Fix | Affected Files | Regression Risk | Testing Required | Dependencies |
|---|---|---|---|---|---|
| H1 | Remove navigation section from time picker to stay under total row limit (or add conditional: only show nav if rows ≤ 7) | `botEngine.ts` | **Low** — removes navigation from one list; user can still navigate via main_menu/cancel after | Verify time picker works with 10 slots; verify fallback still works | C1 (to verify fix worked) |
| H2 | Verify Instagram webhook registration in Meta Business Suite | Infrastructure (no code) | None | Check Meta App Dashboard → Webhooks → Instagram | — |

### Medium

| # | Fix | Affected Files | Regression Risk | Testing Required | Dependencies |
|---|---|---|---|---|---|
| M1 | Add `logger.info` before Instagram POST early return at line 169 | `instagram/route.ts` | None | Verify empty payload log appears | None |
| M2 | Add `logger.warn` when TEXT guard blocks input at line 788 | `botEngine.ts` | None | Verify blocking log appears when user types text in interactive step | None |
| M3 | Remove navigation section from ALL `sendList` calls that exceed 7 data rows, or consolidate into single section | `botEngine.ts:132`, `:154`, `:371` | **Low** — removes navigation; user can type "main_menu" or "cancel" as text | Verify text-based navigation still works | None |

### Low

| # | Fix | Affected Files | Regression Risk | Testing Required |
|---|---|---|---|---|
| L1 | Set `AbortSignal.timeout(15000)` on Meta API fetch calls | `whatsapp/route.ts:26`, `retry.ts:24` | **Low** — only affects timeout behavior | Verify 15s timeout doesn't break during slow API responses |

---

## Section 13 — Verification Checklist

### WhatsApp

- [ ] Interactive list appears after date selection (time picker)
- [ ] No Meta 400 errors in logs
- [ ] Meta error body is logged when errors occur
- [ ] Arabic text in header, body, section titles, row titles renders correctly
- [ ] Fallback: user types "1" → time slot "09:00" selected → booking continues
- [ ] Fallback: user types number out of range → error message
- [ ] All sendList calls with navigation section work (doctor list, service list, date picker, time picker, call times, booking summary)
- [ ] Booking flow completes end-to-end: main menu → doctor → service → date → time → name → call time → summary → confirm
- [ ] Navigation (back, main_menu, cancel) works from every step

### Instagram

- [ ] GET `/api/instagram/webhook` returns 200 with challenge token
- [ ] POST webhook reaches Vercel (log appears)
- [ ] Webhook body is logged
- [ ] Payload parser executes
- [ ] Session is created (`ig_XXXX` entry in `whatsapp_sessions`)
- [ ] Reply is sent via Instagram Graph API
- [ ] Reply is delivered to Instagram user
- [ ] No duplicate processing (duplicate guard works)
- [ ] Empty payload returns 200 with log

### Meta Business Configuration (Instagram)

- [ ] Webhook URL is `https://{domain}/api/instagram/webhook`
- [ ] Verify token matches `INSTAGRAM_VERIFY_TOKEN` env var
- [ ] Subscribe fields include `messages`
- [ ] App is in "Live" mode (not Development)
- [ ] Instagram Business Account is connected to the Meta app
- [ ] `INSTAGRAM_TOKEN` has `instagram_business_messaging` permission
- [ ] Token has not expired

---

## Appendix — Key Code References

| File | Line(s) | Description |
|---|---|---|
| `whatsapp/route.ts` | 26-42 | `callMetaApi()` — first `res.text()` consumption |
| `whatsapp/route.ts` | 73-111 | `sendList()` — second `res.text()` consumption + fallback |
| `whatsapp/route.ts` | 33 | `const resBody = res.ok ? '' : await res.text()` — first read |
| `whatsapp/route.ts` | 93 | `const errBody = await res.text()` — second read (always empty on error) |
| `botEngine.ts` | 638-639 | `eventType` computed before fallback mapping |
| `botEngine.ts` | 705-711 | Fallback mapping runs but `eventType` stale |
| `botEngine.ts` | 778-791 | TEXT-in-non-text-step guard blocks mapped input |
| `botEngine.ts` | 371-374 | Time picker: 10 time rows + 3 nav rows = 13 |
| `botEngine.ts` | 154-161 | Date picker: N date rows + 3 nav rows (exceeds if N > 7) |
| `instagram/route.ts` | 126-137 | GET handler (verification) |
| `instagram/route.ts` | 140-235 | POST handler |
| `instagram/route.ts` | 169 | Early return without log when `messaging.length === 0` |
| `metaValidation.ts` | 90-97 | `validateWaRow()` — truncates but doesn't enforce limit |
| `metaValidation.ts` | 106-142 | `validateListIntegrity()` — warns only, doesn't block |
| `metaValidation.ts` | 28-42 | `META_LIMITS` — defined limits |
| `retry.ts` | 8 | Only retries 429, 5xx — 400 is not retried |
| `retry.ts` | 24-72 | `fetchWithRetry()` — no timeout signal |
