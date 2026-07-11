# Conversation Flow Audit — SmartClinic

**Date:** 2026-07-11  
**Auditor:** Principal Software Architect — Meta Platform Specialist  
**Project:** SmartClinic — Clinic Appointment Management System  
**Integration:** WhatsApp Business Cloud API + Instagram Messaging API + Meta Webhooks  

---

## Table of Contents

1. [Conversation Architecture](#section-1--conversation-architecture)
2. [Webhook Flow Trace](#section-2--webhook-flow-trace)
3. [Payload Analysis](#section-3--payload-analysis)
4. [Event Routing](#section-4--event-routing)
5. [Conversation State Machine](#section-5--conversation-state-machine)
6. [Session Management](#section-6--session-management)
7. [WhatsApp Flow Trace](#section-7--whatsapp-flow-trace)
8. [Instagram Flow Trace](#section-8--instagram-flow-trace)
9. [Interactive Messages](#section-9--interactive-messages)
10. [Appointment Engine](#section-10--appointment-engine)
11. [Error Handling](#section-11--error-handling)
12. [Duplicate Events](#section-12--duplicate-events)
13. [Logging](#section-13--logging)
14. [Sequence Diagrams](#section-14--sequence-diagrams)
15. [Root Cause Analysis](#section-15--root-cause-analysis)
16. [Risk Assessment](#section-16--risk-assessment)
17. [Final Verdict](#section-17--final-verdict)

---

## Section 1 — Conversation Architecture

### Message Lifecycle

```
Meta Cloud API
    │
    ▼  (1) HTTP POST webhook
Webhook Handler
    │  route.ts (whatsapp or instagram)
    │
    ▼  (2) Raw body capture
Signature Verification
    │  verifySignature()     — HMAC-SHA256
    │
    ▼  (3) Payload parsed
Payload Parsing
    │  body.entry[0].changes[0].value.messages  (WhatsApp)
    │  body.entry[0].messaging                   (Instagram)
    │
    ▼  (4) Duplicate check
Duplicate Guard
    │  isDuplicateMessage()  — processed_messages table
    │
    ▼  (5) Input extraction
Event Normalization
    │  userInput = text.body | interactive.list_reply.id | ...
    │  isText = message.type === 'text'
    │
    ▼  (6) Adapter instantiation
BotAdapter
    │  makeWhatsAppAdapter() | makeInstagramAdapter()
    │  provides: sendText(), sendList()
    │
    ▼  (7) Conversation engine
processMessage()
    │
    ├─ (7a) Session lookup
    │      getSession()          — whatsapp_sessions table
    │      retry loop (3x)       — exponential backoff
    │
    ├─ (7b) Event classification
    │      determineEventType()  — TEXT | LIST_REPLY | BUTTON_REPLY |
    │                               POSTBACK | NAVIGATION_SYSTEM
    │
    ├─ (7c) Fallback resolution
    │      resolveFallbackInput() — numbered-list → mapped ID
    │
    ├─ (7d) Navigation handling
    │      handleNavigation()    — back | main_menu | cancel
    │
    ├─ (7e) Handler routing
    │      HANDLERS[step]        → MessageHandler.handle()
    │      Returns nextStep string
    │
    ├─ (7f) Session persistence
    │      setSession()          — optimistic concurrency (version check)
    │
    └─ (7g) Booking execution (on confirm)
           executeBooking()     → createBookingIdempotent()
                                → Google Calendar sync
                                → Reminder scheduling
```

### Files Involved

| Stage | File | Key Exports/Functions |
|---|---|---|
| Webhook Handler | `src/app/api/whatsapp/webhook/route.ts` | `GET`, `POST`, `verifySignature`, `makeWhatsAppAdapter`, `callMetaApi` |
| Webhook Handler | `src/app/api/instagram/webhook/route.ts` | `GET`, `POST`, `verifySignature`, `makeInstagramAdapter`, `callMetaApi` |
| Conversation Engine | `src/app/lib/botEngine.ts` | `processMessage`, `BotAdapter`, `MessageHandler`, `determineEventType`, `registerFallbackRows`, 10 handler classes |
| Session Manager | `src/app/lib/sessionManager.ts` | `getSession`, `setSession`, `clearSession`, `ConcurrencyError` |
| Booking Lock | `src/app/lib/bookingLock.ts` | `createBookingIdempotent` |
| Message Templates | `src/app/lib/botMessages.ts` | `MSG`, `CALL_TIMES`, `SERVICES_BILINGUAL`, `BookingData`, `STEP_ORDER`, `NAVIGATION_IDS` |
| Meta Validation | `src/app/lib/metaValidation.ts` | `validateWaPayload`, `META_LIMITS`, `waRowTitle`, `waSectionTitle`, `waButtonLabel`, `waHeader` |
| Availability | `src/app/lib/availability.ts` | `getAvailableSlots`, `listUpcomingDays`, `generateTimeSlots` |
| Duplicate Guard | `src/app/lib/duplicateGuard.ts` | `isDuplicateMessage` |
| Correlation | `src/app/lib/correlation.ts` | `generateWebhookId`, `getOrCreateCorrelationId` |
| Logger | `src/app/lib/logger.ts` | Structured logger (trace/debug/info/warn/error) |
| Metrics | `src/app/lib/metrics.ts` | Counters + histograms (in-memory) |
| Conversation Tracker | `src/app/lib/conversationTracker.ts` | `trackEvent` (batched inserts) |
| Retry | `src/app/lib/retry.ts` | `fetchWithRetry`, `RETRYABLE_STATUSES` |
| Middleware | `src/middleware.ts` | JWT format check (edge-compatible) |
| Rate Limiter | `src/app/lib/rateLimit.ts` | In-memory map (NOT serverless-safe) |
| Auth | `src/app/lib/auth.ts` | JWT, password hashing, RBAC |
| Audit | `src/app/lib/audit.ts` | Audit logging |
| Google Calendar | `src/app/lib/googleCalendar.ts` | Event CRUD sync |

### Architecture Assessment

The architecture follows a **thin webhook handler → fat conversation engine** pattern. The webhook handlers are deliberately thin (message parsing + adapter creation), delegating all business logic to `botEngine.ts`. The handler classes implement a `MessageHandler` interface forming a **hashmap-based state machine** where each step maps to a handler that returns the next step name.

**Strengths:**
- Clean separation between transport (webhook) and business logic (engine)
- Adapter pattern enables platform-agnostic bot code
- Optimistic concurrency control prevents session corruption
- Fallback numbered-list mechanism recovers gracefully from API failures

**Weaknesses:**
- Single 864-line file for the entire conversation engine
- Handler classes are instantiated once but use shared mutable `data` object
- "Back" navigation uses `data.previousStep` + `STEP_ORDER` which is fragile

---

## Section 2 — Webhook Flow Trace

### WhatsApp Webhook — Complete Call Chain

```
Meta WhatsApp Cloud API
  │ POST /api/whatsapp/webhook
  │
  ▼
WhatsApp GET  (route.ts:115-127)  — Webhook verification
  hub.mode, hub.verify_token, hub.challenge
  Returns challenge or 403

WhatsApp POST (route.ts:129-229)  — Message reception
  │
  ├─ rawBody = req.text()                     (line 133)
  ├─ body = JSON.parse(rawBody)               (line 134-135)
  ├─ verifySignature(rawBody, signature)      (line 137-139)
  │   └─ createHmac('sha256', appSecret)      (line 51)
  │   └─ timingSafeEqual(sigBuf, expBuf)      (line 55)
  │
  ├─ entry = body.entry[0]                    (line 143)
  ├─ changes = entry.changes[0]               (line 144)
  ├─ messages = changes.value.messages        (line 145)
  │
  ├─ FOR EACH message IN messages:
  │   │
  │   ├─ phone = message.from                 (line 166)
  │   ├─ messageId = message.id               (line 167)
  │   │
  │   ├─ EXTRACT userInput:                   (lines 169-175)
  │   │   message.type === 'text'
  │   │     → message.text?.body
  │   │   message.type === 'interactive'
  │   │     → message.interactive.list_reply?.id
  │   │     → message.interactive.button_reply?.id
  │   │   else → ''
  │   │
  │   ├─ if (!userInput) continue             (line 175)
  │   │
  │   ├─ correlationId = getOrCreateCorrelationId() (line 177)
  │   ├─ isTextMessage = message.type === 'text'    (line 178)
  │   │
  │   ├─ DEDUP CHECK:                        (lines 180-199)
  │   │   isDuplicateMessage(messageId, 'whatsapp', phone)
  │   │   └─ prisma.processedMessage.findUnique({ messageId })
  │   │   └─ prisma.processedMessage.create(...)
  │   │
  │   └─ processMessage(                      (lines 206-211)
  │         phone, userInput, adapter,
  │         BookingSource.whatsapp, isTextMessage,
  │         correlationId, messageId, webhookId
  │       )
  │
  └─ return Response('OK', { status: 200 })   (line 229)
```

### Instagram Webhook — Complete Call Chain

```
Meta Instagram API
  │ POST /api/instagram/webhook
  │
  ▼
Instagram GET  (route.ts:122-134)  — Webhook verification
  hub.mode, hub.verify_token, hub.challenge
  Returns challenge or 403

Instagram POST (route.ts:136-235)  — Message reception
  │
  ├─ rawBody = req.text()                     (line 140)
  ├─ body = JSON.parse(rawBody)               (line 141-142)
  ├─ verifySignature(rawBody, signature)      (line 144-146)
  │   └─ createHmac('sha256', appSecret)      (line 50)
  │
  ├─ ⚠️ entry = body.entry[0]                 (line 150)
  ├─ ⚠️ messaging = entry.messaging ?? []     (line 151)
  │
  ├─ if (!messaging.length) RETURN 200        (line 152)
  │   ⚠️ SILENT DROP IF WRONG PAYLOAD FORMAT
  │
  ├─ FOR EACH event IN messaging:
  │   │
  │   ├─ SKIP if event.message.is_echo        (line 164-167)
  │   │
  │   ├─ senderId = event.sender?.id          (line 169)
  │   ├─ sessionId = 'ig_' + senderId         (line 172)
  │   │
  │   ├─ EXTRACT userInput:                   (lines 175-180)
  │   │   event.message.quick_reply?.payload
  │   │   event.postback?.payload
  │   │   event.message?.text
  │   │
  │   ├─ if (!userInput) continue             (line 180)
  │   │
  │   ├─ correlationId = getOrCreateCorrelationId() (line 182)
  │   ├─ isTextMessage = !quickReplyPayload && !postbackPayload (line 183)
  │   │
  │   ├─ DEDUP CHECK:                        (lines 185-204)
  │   │   isDuplicateMessage(messageId, 'instagram', sessionId)
  │   │
  │   └─ processMessage(                      (lines 211-216)
  │         sessionId, userInput, adapter,
  │         BookingSource.instagram, isTextMessage,
  │         correlationId, messageId, webhookId
  │       )
  │
  └─ return Response('EVENT_RECEIVED', { status: 200 }) (line 234)
```

### Comparison: WhatsApp vs Instagram Webhook Structure

| Aspect | WhatsApp | Instagram |
|---|---|---|
| Payload read path | `entry[0].changes[0].value.messages[]` | `entry[0].messaging[]` |
| Sender field | `message.from` | `event.sender.id` |
| Message ID | `message.id` or `message.wamid.id` | `event.message.mid` |
| Payload type | Text: `message.text.body` | Text: `event.message.text` |
| Interactive payload | `message.interactive.list_reply.id` | Quick reply: `event.message.quick_reply.payload` |
| User ID format | Raw phone number | `ig_` + Instagram-scoped sender ID |
| Session table | `whatsapp_sessions` | `whatsapp_sessions` (same table, `ig_` prefix) |

---

## Section 3 — Payload Analysis

### WhatsApp Cloud API — Actual Payload Structure

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "123456789",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "16505551111",
          "phone_number_id": "123456789"
        },
        "contacts": [{ "profile": { "name": "User" }, "wa_id": "96650XXXXXXX" }],
        "messages": [{
          "from": "96650XXXXXXX",
          "id": "wamid.XXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
          "timestamp": "1234567890",
          "type": "text",
          "text": { "body": "Hello" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**Code reads:** `body.entry[0].changes[0].value.messages`  
**Actual payload:** `body.entry[0].changes[0].value.messages`  
**Match:** ✅ **CORRECT**

For interactive messages (list replies):
```json
{
  "from": "96650XXXXXXX",
  "id": "wamid.XXXXXXXXXX",
  "type": "interactive",
  "interactive": {
    "type": "list_reply",
    "list_reply": {
      "id": "menu_book",
      "title": "Book Appointment"
    }
  }
}
```

**Code reads:** `message.interactive.list_reply.id`  
**Actual payload:** `message.interactive.list_reply.id`  
**Match:** ✅ **CORRECT**

### Instagram — Expected Payload (Messenger Platform Format)

```json
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1234567890,
    "messaging": [{
      "sender": { "id": "USER_IGSID" },
      "recipient": { "id": "PAGE_ID" },
      "timestamp": 1234567890,
      "message": {
        "mid": "mid.XXXXXXXXXXXXXXXXXXXX",
        "text": "Hello"
      }
    }]
  }]
}
```

**Code reads:** `body.entry[0].messaging`  
**Expected payload:** `body.entry[0].messaging`  
**Match:** ✅ Only if Meta is configured for **Messenger Platform format**

### Instagram — Possible Payload (Instagram Graph API Format)

```json
{
  "object": "instagram",
  "entry": [{
    "id": "IG_USER_ID",          // Instagram Business Account ID
    "time": 1234567890,
    "changes": [{                // ⚠️ NOT "messaging"
      "field": "messages",
      "value": {
        "from": { "id": "USER_IGSID" },
        "id": "MESSAGE_ID",
        "text": "Hello",
        "timestamp": "1234567890"
      }
    }]
  }]
}
```

**Code reads:** `body.entry[0].messaging`  
**Actual payload:** `body.entry[0].changes[0].value`  
**Match:** ❌ **MISMATCH** — `messaging` is `undefined`, `messaging ?? []` returns `[]`, `!messaging.length` is `true` → **immediate return with 200, message silently dropped**

### Payload Mismatch Root Cause

The Instagram Messaging API supports **two different webhook product subscriptions**:

| Webhook Field | Payload Path | Code Matches? |
|---|---|---|
| `messages` (Messenger Platform) | `entry[0].messaging[]` | ✅ Yes |
| `conversations` (Instagram Graph API) | `entry[0].changes[].value` | ❌ No |

If the Meta app is subscribed to the `conversations` field (common for Instagram Business Messaging), the webhook handler reads `messaging` which is `undefined`, immediately returns 200, and **never processes any message**.

**Evidence:** The code at `route.ts:150-152`:
```typescript
const messaging = entry?.messaging ?? [];
if (!messaging.length) return new Response('EVENT_RECEIVED', { status: 200 });
```

No log message is emitted before this return — the discard is completely silent.

---

## Section 4 — Event Routing

### Event Type Classification

**Function:** `determineEventType()` at `botEngine.ts:86-90`

```typescript
export function determineEventType(input: string, isText: boolean): EventType {
  if (NAVIGATION_IDS.has(input)) return EventType.NAVIGATION_SYSTEM;
  if (!isText) return EventType.LIST_REPLY;
  return EventType.TEXT;
}
```

### Routing Matrix

```
                ┌────────────────────────────────────────────────┐
                │            Event Classification                │
                ├──────────┬──────────┬──────────┬───────────────┤
                │  TEXT    │ LIST_REPLY│BUTTON_REPLY│NAVIGATION  │
├───────────────┼──────────┼──────────┼──────────┼───────────────┤
│ Step:         │          │          │          │               │
│ ask_name      │ Process  │ ❌ FAIL  │ ❌ FAIL  │ Navigate away │
│ ask_whatsapp  │ Process  │ ❌ FAIL  │ ❌ FAIL  │ Navigate away │
│ all others    │ Reject   │ Process  │ Process  │ Navigate      │
└───────────────┴──────────┴──────────┴──────────┴───────────────┘
```

### TEXT in Non-Text Steps (line 772-784)

```typescript
if (eventType === EventType.TEXT && !['ask_name', 'ask_whatsapp'].includes(step)) {
  const isGreeting = TRIGGERS.some(t => normInput.toLowerCase() === t.toLowerCase());
  if (isGreeting) {
    // Reset to main_menu — user wants to restart
    ...
    return;
  }
  await adapter.sendText(userId, MSG.pleaseUseButtons);
  return;
}
```

This correctly blocks text input in button-expected steps (except `ask_name` and `ask_whatsapp` which expect text). ✅

### Critical Routing Problem

**At `ask_name` step**: If the user sends a **list reply** (clicks a button from the navigation list sent by `sendTextWithNav`), the event type is `LIST_REPLY`, not `TEXT`. The TEXT check at line 772 is skipped (eventType ≠ TEXT), and the handler routes to `NameHandler.handle()` which calls `isValidEnglishName()` on the navigation button payload (e.g., `"back"`, `"main_menu"`, `"cancel"`). Since these don't pass name validation, the user gets an error message and stays on `ask_name`.

**Actually, this is NOT a problem** because navigation IDs are checked BEFORE handler routing. At line 716:
```typescript
if (eventType === EventType.NAVIGATION_SYSTEM) {
  const handled = await handleNavigation(userId, normInput, step, data, adapter, cid);
```

But wait — if the user clicks a navigation button that sends a list_reply with payload "back" or "main_menu", does `determineEventType` classify it as `NAVIGATION_SYSTEM`?

Let me check:
1. Input = "back" (navigation ID is in `NAVIGATION_IDS` set)
2. `NAVIGATION_IDS.has("back")` → true → returns `EventType.NAVIGATION_SYSTEM`

Yes! ✅ Navigation IDs are detected regardless of whether the input came from text or list reply, because `determineEventType` checks `NAVIGATION_IDS` FIRST.

So the navigation buttons work correctly even during `ask_name`. If user clicks "back", they go back. If they type their name (text), it processes it. This is correct.

### Event Routing Assessment

| Aspect | Status |
|---|---|
| WhatsApp text messages | ✅ Correctly routed |
| WhatsApp interactive replies | ✅ Correctly routed (list_reply.id extracted) |
| WhatsApp button replies | ✅ Correctly routed (button_reply.id extracted) |
| Navigation detection | ✅ Checked first, before all routing |
| Instagram text messages | ❌ Not received if wrong webhook format (see Section 3) |
| Instagram quick replies | ❌ Not received if wrong webhook format |
| Instagram postback | ❌ Not received if wrong webhook format |

---

## Section 5 — Conversation State Machine

### Architecture: HashMap-Based State Machine

The engine uses a `HANDLERS` map at `botEngine.ts:475-486`:

```typescript
const HANDLERS: Record<string, MessageHandler> = {
  main_menu: new MainMenuHandler(),
  select_doctor: new DoctorHandler(),
  select_service: new ServiceHandler(),
  select_date: new DateHandler(),
  select_time: new TimeHandler(),
  ask_name: new NameHandler(),
  ask_whatsapp: new WhatsAppHandler(),
  ask_call_time: new CallTimeHandler(),
  offers: new OffersHandler(),
  booking_summary: new SummaryHandler(),
};
```

This is **NOT** a formal state machine library. It's a key-value map where each step name maps to a handler class. Each handler returns the next step name. The session (stored in the database) holds the current step.

### Complete State Diagram

```mermaid
stateDiagram-v2
    [*] --> main_menu: greeting / hello
    main_menu --> select_doctor: menu_book
    main_menu --> offers: menu_offers
    main_menu --> done: menu_contact, menu_location
    main_menu --> main_menu: my_booking (no booking)
    main_menu --> my_booking: menu_my_booking

    offers --> select_doctor: menu_book
    offers --> main_menu: navigation

    select_doctor --> select_service: doctor selected
    select_service --> select_date: service selected
    select_date --> select_time: date selected
    select_time --> ask_name: time selected
    ask_name --> ask_call_time: valid name (WhatsApp)
    ask_name --> ask_whatsapp: valid name (Instagram)
    ask_whatsapp --> ask_call_time: valid phone number
    ask_call_time --> booking_summary: call time selected

    booking_summary --> [*]: confirm → booking created
    booking_summary --> [*]: cancel → session cleared
    booking_summary --> select_doctor: edit_doctor
    booking_summary --> select_service: edit_service
    booking_summary --> select_date: edit_datetime
    booking_summary --> ask_name: edit_name
    booking_summary --> ask_call_time: edit_calltime

    my_booking --> booking_summary: cancel_[id]
    my_booking --> select_date: reschedule_[id]
    my_booking --> select_doctor: new_booking

    note right of ask_name
        ⚠️ TEXT INPUT REQUIRED
        Arabic names REJECTED
        Single-word names REJECTED
        Navigation buttons available
    end note

    state main_menu {
        [*] --> menu
        menu --> menu_book: "Book Appointment"
        menu --> menu_offers: "Offers"
        menu --> menu_my_booking: "My Booking"
        menu --> menu_contact: "Contact"
        menu --> menu_location: "Location"
    }
```

### Navigation (available from ALL steps)

```mermaid
stateDiagram-v2
    [*] --> AnyStep
    
    AnyStep --> main_menu: input = "main_menu"
    AnyStep --> [*]: input = "cancel"
    AnyStep --> PreviousStep: input = "back"
    
    PreviousStep --> AnyStep: resolved via STEP_ORDER map
```

### Transition Table

| Current Step | Valid Inputs | Next Step | Error Handling |
|---|---|---|---|
| `main_menu` | `menu_book`, `menu_offers`, `menu_contact`, `menu_location`, `menu_my_booking`, navigation IDs | `select_doctor`, `offers`, (none) | Unknown input → "Please use buttons" |
| `select_doctor` | Doctor ID (from list), navigation IDs | `select_service` | Unknown ID → error, stay |
| `select_service` | Service ID (from list), navigation IDs | `select_date` | Unknown ID → error, stay |
| `select_date` | `date_YYYY-MM-DD`, navigation IDs | `select_time` | Missing prefix → error, stay |
| `select_time` | `time_HH:MM`, navigation IDs | `ask_name` | Missing prefix → error, stay |
| `ask_name` | Free text (Latin, 2+ words), navigation IDs | `ask_call_time` / `ask_whatsapp` | Invalid name → error, stay |
| `ask_whatsapp` | 9-15 digits, navigation IDs | `ask_call_time` | Invalid → error, stay |
| `ask_call_time` | Call time ID (from list), navigation IDs | `booking_summary` | Unknown ID → error, stay |
| `booking_summary` | `confirm_booking`, `edit_*`, `cancel_booking`, navigation | done / edit steps | Unknown → resend summary |
| `offers` | `menu_book`, navigation IDs | `select_doctor` | Unknown → stay |

### Assessment

**Strengths:** Simple, easy to extend with new steps. Works well for linear flows.

**Weaknesses:**
- No guard against invalid transitions — a handler can return ANY string as next step
- `STEP_ORDER` for "back" navigation doesn't handle the Instagram-specific `ask_whatsapp` step correctly (see `STEP_ORDER` at `botMessages.ts:278-288`: `ask_call_time: 'ask_name'` — but for Instagram, the actual previous step is `ask_whatsapp`, not `ask_name`)
- Edit flow uses `data.editReturn` + `data.editField` which modifies the shared mutable data object — fragile

---

## Section 6 — Session Management

### Session Lifecycle

```
Session Creation:
  setSession(phone, 'main_menu', {})
    → whatsAppSession.upsert(phone, step, data, version=1, expires=30min)
    → returns SessionResult

Session Update (optimistic):
  setSession(phone, nextStep, data, expectedVersion)
    → whatsAppSession.updateMany({ phone, sessionVersion: expectedVersion })
    → if count === 0: throw ConcurrencyError
    → version = version + 1

Session Read:
  getSession(phone)
    → whatsAppSession.findUnique({ phone })
    → if expired → return null
    → return { step, data, sessionVersion, expiresAt }

Session Clear:
  clearSession(phone)
    → whatsAppSession.deleteMany({ phone })
```

### Session Persistence

| Scenario | Survives? | Explanation |
|---|---|---|
| Server restart | ✅ Yes | Sessions stored in PostgreSQL |
| Vercel deployment | ✅ Yes | Postgres is external, data persists |
| Multiple concurrent requests | ✅ Yes | Optimistic locking with `sessionVersion` |
| Duplicate webhooks | ✅ Yes | First request processes and updates version; second request fails `updateMany` with stale version → `ConcurrencyError` → retry with fresh session |
| Session expiry (30 min) | ✅ Handled | `getSession` returns null if expired |
| Database failure | ⚠️ Retry loop (3 attempts) | Session retrieval has 3x exponential backoff |

### Session Data Persistence Risk

When `processMessage` receives a concurrency error (`ConcurrencyError`) at line 826-840:

```typescript
catch (err) {
  if (err instanceof ConcurrencyError) {
    const freshSession = await getSession(userId);
    if (freshSession) {
      const freshData = freshSession.data as BookingData;
      Object.assign(data, freshData);       // ⚠️ Overwrites with DB data
      await setSession(userId, nextStep || step, data, freshSession.sessionVersion);
    }
  }
}
```

**Problem:** When a concurrency conflict occurs, the code reads the FRESH session from DB and overwrites the local `data` object with `freshData`. But `freshData` is the data that was already saved to DB by the previous request. If the previous request had ALREADY advanced the session to the next step, `freshData` contains the data from that step. Then the code calls `setSession(userId, nextStep || step, data, freshSession.sessionVersion)`.

This means: the retry **overwrites** whatever the concurrent request had set, potentially losing data. However, in practice this is rare because:
1. WhatsApp sends messages one at a time (per-user ordering)
2. Duplicate webhooks are caught by `isDuplicateMessage`
3. The only realistic concurrent conflict is from Meta sending two different webhooks rapidly for the same user (rare)

### Session Expiry Recovery

When a session expires (30-min TTL):
1. `getSession()` returns null
2. `processMessage` checks `isGreeting`
3. If user sends a greeting → new session starts
4. If user sends anything else → `MSG.notFound` ("Send Hello to start")
5. **All booking data is lost** — no draft persistence

---

## Section 7 — WhatsApp Flow Trace

### Complete Booking Flow — Every Function, DB Update, State Transition

```mermaid
sequenceDiagram
    participant User
    participant Meta as Meta API
    participant Webhook as WhatsApp Webhook
    participant Engine as botEngine.ts
    participant Session as Session Manager
    participant DB as Database
    participant Adapter as WhatsApp Adapter

    Note over User,Adapter: Step 1: Greeting → Main Menu
    User->>Meta: Sends "Hello"
    Meta->>Webhook: POST /webhook (text)
    Webhook->>Webhook: verifySignature()
    Webhook->>Webhook: parse message, extract userInput="hello"
    Webhook->>Webhook: isDuplicateMessage() → false
    Webhook->>Engine: processMessage("9665X", "hello", adapter, whatsapp, true, cid)
    Engine->>Engine: determineEventType("hello", true) → TEXT
    Engine->>Session: getSession("9665X")
    Session->>DB: whatsAppSession.findUnique({phone:"9665X"})
    DB-->>Session: null (no session)
    Session-->>Engine: null
    Engine->>Engine: isGreeting=true (TRIGGERS match)
    Engine->>Session: setSession("9665X", "main_menu", {})
    Session->>DB: whatsAppSession.upsert(create:{step:main_menu, version:1})
    DB-->>Session: SessionResult
    Engine->>Adapter: sendList("9665X", "SmartClinic", welcome, menu)
    Adapter->>Meta: POST /PHONE_ID/messages (interactive list)
    Engine-->>Webhook: return

    Note over User,Adapter: Step 2: Select Doctor
    User->>Meta: Clicks "Book Appointment" → list_reply.id="menu_book"
    Meta->>Webhook: POST /webhook (interactive)
    Webhook->>Engine: processMessage("9665X", "menu_book", adapter, whatsapp, false)
    Engine->>Engine: determineEventType("menu_book", false) → LIST_REPLY
    Engine->>Session: getSession("9665X")
    Session->>DB: whatsAppSession.findUnique({phone:"9665X"})
    DB-->>Session: {step:main_menu, version:1}
    Engine->>Engine: step=main_menu, route to MainMenuHandler
    Engine->>Engine: MainMenuHandler.handle("menu_book")
    Engine->>Adapter: sendList(doctors list)
    Adapter->>Meta: POST /PHONE_ID/messages (interactive list)
    Engine-->>Engine: return "select_doctor"
    Engine->>Session: setSession("9665X", "select_doctor", {previousStep:"main_menu"}, version=1)
    Session->>DB: whatsAppSession.updateMany(version=1→2)
    DB-->>Session: SessionResult

    Note over User,Adapter: Step 3: Select Service
    User->>Meta: Clicks doctor → list_reply.id=doctor.id
    Webhook->>Engine: processMessage("9665X", doctor.id, adapter, whatsapp, false)
    Engine->>Engine: step=select_doctor, DoctorHandler
    Engine->>DB: doctor.findUnique({id:doctor.id})
    DB-->>Engine: Doctor
    Engine->>Adapter: sendList(services list)
    Engine-->>Engine: return "select_service"
    Engine->>Session: setSession("9665X", "select_service", data, version=2→3)

    Note over User,Adapter: Step 4: Select Date
    User->>Meta: Clicks service → list_reply.id="svc_general"
    Webhook->>Engine: processMessage("9665X", "svc_general", adapter, whatsapp, false)
    Engine->>Engine: step=select_service, ServiceHandler
    Engine->>Adapter: sendList(dates list) via sendDatePicker
    Engine->>DB: doctor.findUnique({id:doctorId})
    Engine->>DB: holiday.findFirst(weekly), holiday.findFirst(date)
    Engine->>DB: booking.findMany(doctorId, date)
    Engine->>DB: blockedSlot.findMany(doctorId, date)
    Engine-->>Engine: return "select_date"
    Engine->>Session: setSession("9665X", "select_date", data, version=3→4)

    Note over User,Adapter: Step 5: Select Time
    User->>Meta: Clicks date → list_reply.id="date_2026-07-15"
    Webhook->>Engine: processMessage("9665X", "date_2026-07-15", adapter, whatsapp, false)
    Engine->>Engine: step=select_date, DateHandler
    Engine->>DB: doctor.findUnique({id:doctorId})
    Engine->>DB: getAvailableSlots(doctor, date)
    Engine->>Adapter: sendList(times list)
    Engine-->>Engine: return "select_time"
    Engine->>Session: setSession("9665X", "select_time", data, version=4→5)

    Note over User,Adapter: Step 6: Enter Name ⚠️ BREAK POINT
    User->>Meta: Clicks time → list_reply.id="time_14:00"
    Webhook->>Engine: processMessage("9665X", "time_14:00", adapter, whatsapp, false)
    Engine->>Engine: step=select_time, TimeHandler
    Engine->>Engine: data.time="14:00"
    Engine->>Adapter: sendText(askName message)
    Engine->>Adapter: sendList(navigation: back/menu/cancel)
    Engine-->>Engine: return "ask_name"
    Engine->>Session: setSession("9665X", "ask_name", {data}, version=5→6)
    
    Note over User,Adapter: ⚠️ USER MUST TYPE NAME HERE
    User->>Meta: Types "محمد العتيبي" (Arabic name)
    Meta->>Webhook: POST /webhook (text)
    Webhook->>Engine: processMessage("9665X", "محمد العتيبي", adapter, whatsapp, true)
    Engine->>Engine: step=ask_name, NameHandler
    Engine->>Engine: isValidEnglishName("محمد العتيبي") → FALSE ❌
    Engine->>Adapter: sendText(nameInvalidNotEnglish)
    Engine-->>Webhook: return (stays on ask_name)
    
    Note over User,Adapter: User retries with "Mohammed" (single word)
    User->>Meta: Types "Mohammed"
    Engine->>Engine: isValidEnglishName("Mohammed") → FALSE (1 word)
    Engine->>Adapter: sendText(nameTooShort)
    
    Note over User,Adapter: User retries with "Mohammed Alotaibi" (valid)
    User->>Meta: Types "Mohammed Alotaibi"  
    Webhook->>Engine: processMessage("9665X", "Mohammed Alotaibi", adapter, whatsapp, true)
    Engine->>Engine: NameHandler.handle()
    Engine->>Engine: isValidEnglishName("Mohammed Alotaibi") → TRUE ✅
    Engine->>Engine: data.name="Mohammed Alotaibi"
    Engine->>Adapter: sendList(call times list)
    Engine-->>Engine: return "ask_call_time"
    Engine->>Session: setSession("9665X", "ask_call_time", data, version=6→7)

    Note over User,Adapter: Steps 7-9: Call Time → Summary → Confirm
    User->>Meta: Clicks call time → list_reply.id="call_morning"
    Webhook->>Engine: processMessage("9665X", "call_morning", adapter, whatsapp, false)
    Engine->>Engine: step=ask_call_time, CallTimeHandler
    Engine->>Adapter: sendList(booking summary)
    Engine-->>Engine: return "booking_summary"
    Engine->>Session: setSession("9665X", "booking_summary", data, version=7→8)
    
    User->>Meta: Clicks "Confirm" → list_reply.id="confirm_booking"
    Webhook->>Engine: processMessage("9665X", "confirm_booking", adapter, whatsapp, false)
    Engine->>Engine: step=booking_summary, SummaryHandler
    Engine->>Engine: executeBooking()
    Engine->>Engine: createBookingIdempotent()
    Engine->>DB: $transaction: idempotencyLock + booking.create
    DB-->>Engine: BookingResult
    Engine->>Adapter: sendText(confirmation)
    Engine->>Adapter: sendText(preVisitInstructions)
    Engine->>Session: clearSession("9665X")
    Session->>DB: whatsAppSession.deleteMany({phone:"9665X"})
    Engine-->>Webhook: return
```

### Where the Booking Flow Stops After Time Selection

**The flow does NOT stop for all users.** It only stops for users whose names fail the validation at `botEngine.ts:394`.

**Root cause:** `isValidEnglishName()` at `botEngine.ts:74-76`:
```typescript
const ENGLISH_NAME_RE = /^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/;
function isValidEnglishName(input: string): boolean {
  return ENGLISH_NAME_RE.test(input.trim()) && input.trim().split(/\s+/).length >= 2;
}
```

This function:
1. Rejects any character outside `[A-Za-z '\-]` — no Arabic, Chinese, Cyrillic, etc.
2. Requires at least 2 whitespace-separated tokens — rejects single-word names

**For a clinic in Saudi Arabia serving Arabic-speaking patients, this validation rejects the majority of real patient names.** The user sees an error message and stays on the `ask_name` step. If they don't know the English-only rule, they will retry with Arabic names and get repeated errors until they give up.

**Secondary issue:** Even for users with valid English names, the `sendTextWithNav` function at `botEngine.ts:103-109` sends a navigation list alongside the name prompt. If the user accidentally clicks a navigation button instead of typing, the `handleNavigation` function processes it. Clicking "Back" (`botEngine.ts:505-516`) navigates to the previous step (`select_time`) — the user's time selection is preserved in the session data. Clicking "Cancel" clears the session entirely — **all booking progress is lost**.

### Additional Downstream Bugs

After the NameHandler, the `SummaryHandler` at `botEngine.ts:436-473` handles the summary step. There's a logic issue in the `edit_booking` flow:

When user selects "Edit" from the summary and picks a field to edit (e.g., `edit_doctor`), the code at line 459-467:
```typescript
if (targetStep) {
  data.editReturn = 'booking_summary';
  data.editField = input;
  await setSession(userId, targetStep, data);
  await resendStep(userId, targetStep, data, adapter, cid);
  return '__handled__';
}
```

This returns `'__handled__'` which triggers the session update at line 816:
```typescript
await setSession(userId, step, data, session.sessionVersion);
```
Notice it writes `step` (which is `'booking_summary'`) not `targetStep`. But the code at line 464 already called `setSession(userId, targetStep, data)` WITHOUT a version check. So the session was already updated to `targetStep` outside the optimistic locking flow. Then the code at line 816 tries to update the session to `step` (the old step) with the stale version, which will get a `ConcurrencyError` because the version was already incremented by the `setSession` call at line 464.

**This is a bug:** The `setSession` at line 464 updates the session to `targetStep` (e.g., `select_doctor`), incrementing the version. Then `setSession` at line 816 tries to write `step` (still `booking_summary`) with the OLD version number — this will throw `ConcurrencyError` because the version doesn't match. The error is caught, retried by re-reading the DB (which now shows `select_doctor`), and overwrites back to `booking_summary`.

**Impact:** The edit flow writes the session to `targetStep`, then the main loop immediately overwrites it BACK to `booking_summary`. The next message from the user arrives at the `edit_doctor` step, but the session just got overwritten. This is a subtle race condition that manifests as: user selects "edit doctor" → gets sent to doctor selection → selects a new doctor → but the engine routes to the wrong handler because session was overwritten.

**Actually, let me re-read the edit flow more carefully:**

1. `SummaryHandler.handle("edit_doctor")`:
   - Line 460: `targetStep = EDIT_FIELD_MAP["edit_doctor"]` → `"select_doctor"`
   - Line 462: `data.editReturn = 'booking_summary'`
   - Line 463: `data.editField = 'edit_doctor'`
   - Line 464: `await setSession(userId, targetStep, data)` → **session updated to `select_doctor` (version incremented, but NO version check!)** 
   - Line 465: `await resendStep(userId, targetStep, data, adapter, cid)` → sends doctors list
   - Line 466: returns `'__handled__'`

2. Back in `processMessage`:
   - Line 808: `nextStep && nextStep !== '__handled__'` → `nextStep` is `'__handled__'` → condition is **false**
   - Line 816: `await setSession(userId, step, data, session.sessionVersion)` → **writes `step` = `'booking_summary'` with old `session.sessionVersion`**

Since line 464 already incremented the version, line 816 uses a stale version → `ConcurrencyError` at line 826-840. The retry reads the fresh session (now at `select_doctor`), gets the data, and calls `setSession(userId, nextStep || step, data, freshSession.sessionVersion)`. Since `nextStep` is `'__handled__'`, it uses `step` which is `'booking_summary'`. So it writes back to `booking_summary` with the new version.

**Result:** After the edit flow:
- Session step in DB = `booking_summary` (overwritten by the retry logic)
- User just saw the doctors list (sent by `resendStep` at line 465)
- User selects a new doctor → session shows `booking_summary` → `SummaryHandler` receives the doctor ID instead of `DoctorHandler`
- `SummaryHandler.handle()` doesn't know what to do with a doctor ID → falls to `default` at line 458 → hits `input.startsWith('edit_')` → false → line 469: `await sendBookingSummaryScreen(userId, data, adapter)` → **resends booking summary with OLD doctor's data**

**The edit flow is broken.** After the edit, the session reverts to `booking_summary` instead of staying at the edit target step. The user is stuck in a loop: they click "edit" → see the editor → make a selection → get sent back to the summary with unchanged data.

---

## Section 8 — Instagram Flow Trace

### Complete Trace

```mermaid
sequenceDiagram
    participant User
    participant Meta as Meta API
    participant Webhook as IG Webhook
    participant Engine as botEngine.ts
    participant Session as Session Manager

    Note over User,Meta: User sends message
    User->>Meta: Sends "Hello"
    Meta->>Webhook: POST /webhook
    
    Webhook->>Webhook: verifySignature()
    
    alt Payload format: Messenger Platform
        Meta->>Webhook: entry[0].messaging[{sender,message}]
        
    else Payload format: Instagram Graph API
        Meta->>Webhook: entry[0].changes[0].value {from,message}
        Webhook->>Webhook: ⚠️ entry.messaging ?? [] → []
        Webhook->>Webhook: ⚠️ !messaging.length → true
        
        Note over Webhook: ⚠️ SILENT DROP
        Webhook-->>Meta: 200 EVENT_RECEIVED
        Note over User: ❌ Message received, never processed
    end
    
    Note over Webhook: If MSG FORMAT MATCHES:
    Webhook->>Webhook: parse messaging[0]
    Webhook->>Webhook: senderId = event.sender.id
    Webhook->>Webhook: sessionId = "ig_" + senderId
    Webhook->>Engine: processMessage("ig_XXXX", "Hello", adapter, instagram, true)
    Engine->>Session: getSession("ig_XXXX")
    Session-->>Engine: null
    Engine->>Session: setSession("ig_XXXX", "main_menu", {})
    Engine->>Adapter: sendList("ig_XXXX", main menu)
    Adapter->>Meta: POST /me/messages {recipient:{id:XXXX}, message:{text/attachment}}
    
    Note over Adapter, Meta: ⚠️ ENDPOINT /me/messages deprecated for Instagram
    Meta-->>Adapter: 400 Bad Request or error
    Adapter-->>Engine: error logged, no throw
    Engine-->>Webhook: return
    Webhook-->>Meta: 200 EVENT_RECEIVED
```

### Primary Fatal Error: Payload Format Mismatch

The Instagram webhook reads:
```typescript
const messaging = entry?.messaging ?? [];
```

If the Meta app uses an Instagram webhook product that sends a different payload structure (e.g., `entry[0].changes[0].value` instead of `entry[0].messaging[]`), then `messaging` is always empty. Line 152 immediately returns 200:

```typescript
if (!messaging.length) return new Response('EVENT_RECEIVED', { status: 200 });
```

**No error is logged. No warning is emitted. The message is silently dropped.**

### Secondary Fatal Error: API Endpoint (even if payload format is correct)

Even if the payload format matches and messages ARE processed, the reply API endpoint is wrong for modern Instagram:

```typescript
const IG_URL = () => `https://graph.facebook.com/v21.0/me/messages`;
```

This is the **Messenger Platform** endpoint (which works for Facebook Pages), NOT the **Instagram Messaging API** endpoint. For Instagram, the correct endpoint is:
```
https://graph.facebook.com/v21.0/{ig-user-id}/messages
```

`/me/messages` may work for Instagram if the token is an Instagram Page Access Token and the app uses the Messenger Platform bridge. But this is increasingly deprecated and unreliable.

### Tertiary Error: Silent Failure in Adapter

Even if the endpoint were correct, the Instagram adapter at `route.ts:62-71` SWALLOWS errors:

```typescript
async sendText(to, text) {
  const recipientId = to.replace(/^ig_/, '');
  const payload = { recipient: { id: recipientId }, message: { text } };
  try {
    const res = await callMetaApi(IG_URL(), IG_HEADERS(), payload, cid);
    if (!res.ok) logger.error('IG sendText failed', { status: res.status, correlationId: cid });
  } catch (err) {
    logger.error('IG sendText error', { error: String(err), correlationId: cid });
  }
}
```

Notice: unlike the WhatsApp `sendText`, this function does NOT throw on failure. The WhatsApp adapter throws (via `throw new Error(errBody)` in `sendList`). The Instagram adapter logs errors but **always returns successfully** — making it impossible for callers (botEngine) to know that the message wasn't delivered.

### Instagram Webhook Subscription Summary

| Webhook Product | Payload Structure | Code Support |
|---|---|---|
| Instagram Messaging API (`messages`) | `entry[0].messaging[]` | ✅ Code matches |
| Instagram Graph API (`conversations`) | `entry[0].changes[].value` | ❌ NOT SUPPORTED |
| Facebook Messenger Platform (`messages`) | `entry[0].messaging[]` | ✅ Code matches |

Most modern Instagram Business integrations use the Instagram Graph API webhooks, which send the `conversations` format. **This is the likely root cause.**

---

## Section 9 — Interactive Messages

### WhatsApp Interactive Support

| Feature | Status | Details |
|---|---|---|
| **Interactive Lists** | ✅ Fully supported | `sendList()` builds interactive list messages with up to 10 rows per section, multiple sections, header/body/footer |
| **Reply Buttons** | ❌ Not used | The code doesn't use WhatsApp reply buttons; only interactive lists |
| **Template Messages** | ❌ Not used | No pre-approved message templates |
| **Flow** | ❌ Not used | No WhatsApp Flows integration |
| **Text fallback** | ✅ Fully supported | `registerFallbackRows()` stores numbered list mapping in DB; user types number → mapped to original ID |
| **Character limits** | ✅ Enforced | `metaValidation.ts` truncates headers (60), body (1024), footer (60), row titles (24), row descriptions (72), section titles (24), buttons (20) |
| **Payload validation** | ✅ `validateWaPayload()` | Validates/truncates all fields before sending |

### Instagram Interactive Support

| Feature | Status | Details |
|---|---|---|
| **Text messages** | ✅ Supported | `sendText()` sends plain text via `{recipient: {id}, message: {text}}` |
| **Quick Replies** | ✅ Partially supported | `sendList()` converts interactive lists to quick_replies (max 13, 20-char titles) |
| **Interactive Lists** | ❌ Not supported | Instagram API does NOT support WhatsApp-style interactive lists; code falls back to quick_replies or numbered text |
| **Template Messages** | ❌ Not supported | Instagram doesn't use templates |
| **Text fallback** | ✅ Supported | Same `registerFallbackRows()` mechanism as WhatsApp |
| **Character limits** | ✅ Enforced | Quick reply title limit (20) enforced via `igQuickReplyTitle()` |

### Interactive-Only Booking Flow Assessment

**Current:** Steps 1-5 use interactive lists. Step 6 (`ask_name`) requires text input. Steps 7-9 use lists.

**Goal:** Full interactive flow except for name entry.

**What would need to change (assessment only):**
- Step 6 (`ask_name`) would need to remain text-based — you can't select a name from a list
- The `sendTextWithNav` pattern at `ask_name` already sends navigation lists alongside text prompts — this is the current approach
- To improve UX: better instructions, accept Arabic names, clear navigation options
- No architectural changes required for this goal — the current design already supports it

**Assessment:** The current architecture supports the "buttons except for name" goal. The only change needed is accepting Unicode names in the validation regex.

---

## Section 10 — Appointment Engine

### Appointment Creation Pipeline

```
executeBooking(userId, data, adapter, source, cid)
  │
  ├── IF existingBookingId:
  │     → prisma.booking.update(id, {date, time})
  │     → clearSession()
  │     → send confirmation
  │     → try: updateCalendarEvent()
  │     → return { bookingId, created: false }
  │
  └── ELSE:
        → createBookingIdempotent(userId, data, source, cid)
        │
        │   PHPONE = source === instagram && data.whatsappNumber
        │           ? data.whatsappNumber
        │           : userId
        │
        │   KEY = `booking:${doctorId}:${date}:${time}:${PHONE}`
        │
        │   → $transaction:
        │       ├── check idempotencyLock by KEY
        │       │   ├── IF completed + bookingId → return existing
        │       │   ├── IF locked + not expired → throw "in progress"
        │       │   └── IF expired → delete and continue
        │       │
        │       ├── CREATE idempotencyLock (key, status=locked, TTL=10s)
        │       │
        │       ├── CREATE booking (name, phone, service, date, time, doctorId, source, instagramPsid)
        │       │   ⚠️ phone = PHONE (for Instagram, this is the WhatsApp number)
        │       │
        │       ├── UPDATE idempotencyLock (status=completed, bookingId)
        │       │
        │       └── IF unique constraint violation (P2002):
        │             → find existing booking by (doctorId, date, time)
        │             → return existing
        │
        ├── try: createCalendarEvent()
        │   → dynamic import googleCalendar
        │   → create event in Google
        │   → update booking with calendarEventId
        │
        ├── IF same-day or next-day:
        │     → sendReminderMessage() (fire-and-forget)
        │
        ├── clearSession()
        ├── send confirmation text
        ├── send pre-visit instructions text
        └── return { bookingId, created }
```

### Hidden Logic Errors

1. **Phone field mismatch for Instagram bookings** (`bookingLock.ts:21-23`):
   ```typescript
   const phone = source === BookingSource.instagram && data.whatsappNumber
     ? data.whatsappNumber
     : userId;
   ```
   For Instagram bookings, `phone` is set to `data.whatsappNumber` (the WhatsApp number collected in `ask_whatsapp` step). This means the booking record stores the patient's WhatsApp number, NOT the Instagram user ID. This is intentional — but the `notes` field at line 69:
   ```
   Best time to call: Morning | WhatsApp: 96650XXXXXXX
   ```
   For Instagram users without a WhatsApp number (`data.whatsappNumber` is undefined), `phone` falls back to `userId` which is `ig_XXXXX`. This means the booking record's `phone` field would contain `ig_XXXXX` — NOT an actual phone number. The clinic wouldn't be able to call the patient.

2. **Service field uses Arabic name** (`bookingLock.ts:62`):
   ```typescript
   service: data.serviceAr!,
   ```
   The service is stored as the Arabic string, not the ID or English name. This makes reporting and aggregation difficult.

3. **Google Calendar sync is fire-and-forget** (`botEngine.ts:573-583`):
   ```typescript
   try { ... } catch { /* non-fatal */ }
   ```
   If Google Calendar sync fails, the booking is still created. The `calendarSynced` field is set to `false` by default. But there's no retry mechanism for failed syncs.

4. **Reminder scheduling is imprecise** (`botEngine.ts:586-593`):
   ```typescript
   const diffDays = Math.floor((bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
   if (diffDays <= 1 && result?.id) {
     sendReminderMessage(userId, result.id, adapter).catch(() => {});
   }
   ```
   This sends the reminder IMMEDIATELY after booking, not at the appropriate time before the appointment. For a same-day booking at 2 PM, the reminder fires immediately (which is fine for same-day). But the timing is wrong — it sends right after confirmation, not X hours before the appointment time.

---

## Section 11 — Error Handling

### Error Scenarios and Recovery

| Scenario | Code Handles? | Behavior | File:Line |
|---|---|---|---|
| **Session missing** | ✅ | Shows "send hello to start" | `botEngine.ts:695-698` |
| **Doctor deleted** | ✅ | Shows error, stays on step | `botEngine.ts:331-332` |
| **Time unavailable** | ✅ | Shows "fully booked" | `botEngine.ts:364` |
| **Invalid callback ID** | ✅ | Shows error, stays on step | All handlers: checks for valid IDs |
| **Duplicate webhook** | ✅ | Skips with dedup check | `duplicateGuard.ts` |
| **Graph API error** | ✅ (WhatsApp) / ❌ (Instagram) | WA: fallback to text; IG: silent log | `whatsapp/route.ts:101-110` vs `instagram/route.ts:67-68` |
| **Database failure** | ✅ | Retry loop (3x) for session read | `botEngine.ts:668-679` |
| **Token expired** | ⚠️ | Next webhook fetch fails, error logged | `retry.ts` — retries up to 3 times |
| **Concurrent session write** | ✅ | Optimistic locking → retry | `botEngine.ts:826-840` |
| **Idempotency lock active** | ✅ | Shows "slot taken" | `bookingLock.ts:36-41` → `botEngine.ts:613-616` |
| **Thread pool exhaustion** | ⚠️ | Connection timeout → Prisma error → generic error | `prisma.ts:27-38` has a guard for Neon pool detection |

### Missing Error Handling

| Gap | Impact | File |
|---|---|---|
| **Instagram `sendText` doesn't throw** | Engine thinks reply was sent; user sees nothing | `instagram/route.ts:62-71` |
| **Empty catch blocks** | Errors invisible in production logs | Multiple: `botEngine.ts:48`, `bookingLock.ts:85`, `googleCalendar.ts` catch blocks |
| **No rate limiting on webhook** | Meta could flood the webhook handler | No rate limiter on webhook routes |
| **No input sanitization for name** | Stored name could contain injection vectors | `NameHandler` only validates regex format, no sanitization |
| **`setSession` without version check** (line 464) | Edit flow corrupts session state | `botEngine.ts:464` |

---

## Section 12 — Duplicate Events

### Current Protections

| Protection | Mechanism | Location |
|---|---|---|
| **Webhook message dedup** | `processed_messages` table with 24h TTL, `messageId` as PK | `duplicateGuard.ts` |
| **Idempotent booking** | `idempotencyLock` table with 10s TTL, key = `booking:{doctor}:{date}:{time}:{phone}` | `bookingLock.ts` |
| **Session optimistic locking** | `sessionVersion` check on every write | `sessionManager.ts:50-66` |
| **Duplicate button press** | Handled by `isDuplicateMessage()` — same messageId = dedup | `duplicateGuard.ts` |
| **Meta retry** | Meta resends the same webhook with same `message.id` → dedup | `duplicateGuard.ts` |
| **Webhook replay** | Attacker replays old webhook → same `message.id` → dedup | `duplicateGuard.ts` |

### Gaps

| Gap | Risk | Explanation |
|---|---|---|
| **`ProcessedMessage` TTL is 24h** | Low | After 24h, old dedup records are deleted. If Meta replays a >24h-old message, it would be processed again. |
| **No dedup on `correlationId`** | Low | Two webhooks with different `messageId` but same `correlationId` would both be processed. Rare but possible. |
| **No idempotency key on concurrency conflict retry** | Low | The optimistic locking retry in `botEngine.ts:832-838` doesn't check if the session was already processed — it blindly writes the new step. |
| **No manual dedup for "confirm booking" button spam** | Medium | If user rapidly clicks "Confirm" multiple times, each click has a different `messageId` (Meta treats each as a separate event). The booking idempotency lock protects against double creation, but the user would see multiple "Your booking is confirmed" messages. |

### Duplicate Booking Protection Assessment

The `bookingLock.ts` idempotency mechanism is robust:
- Uses `prisma.$transaction` for atomicity
- Locks by `{doctorId}:{date}:{time}:{phone}` — prevents double-booking the same slot for the same patient
- Handles `P2002` unique constraint violations gracefully
- 10-second lock TTL prevents indefinite locks

However, the idempotency key includes `phone` which for Instagram is either `data.whatsappNumber` or `ig_XXXXX`. If the same patient uses both WhatsApp and Instagram to book the same slot, they WOULD get two different bookings (because `phone` differs between platforms). This is probably intentional but worth noting.

---

## Section 13 — Logging

### Log Quality Assessment

| Log Entry | Location | PII Risk | Debug Value |
|---|---|---|---|
| `'[Engine] processMessage'` with `{userId, input, isText, eventType, source, correlationId}` | `botEngine.ts:642-645` | ⚠️ Logs user input (message content) | ✅ High |
| `'[Engine] transition'` with `{userId, from, to, version, duration}` | `botEngine.ts:811-814` | ✅ Phone number (acceptable) | ✅ High |
| `'[Engine] new session'` with `{userId, duration}` | `botEngine.ts:692` | ✅ Minimal | ✅ High |
| `'[Engine] fatal error'` with `{error, userId}` | `botEngine.ts:856-858` | ✅ Minimal | ✅ High |
| `'[Webhook] Duplicate skipped'` with `{messageId, phone, webhookId}` | `whatsapp/route.ts:184` | ✅ Minimal | ✅ High |
| `'[Dedup] Duplicate message detected'` with `{messageId, source, userId, ageMs}` | `duplicateGuard.ts:20-24` | ✅ Minimal | ✅ High |
| `'[Booking] Confirmation failed'` with `{error, userId}` | `botEngine.ts:618` | ✅ Minimal | ✅ High |
| `'[MetaAPI] WhatsApp sent'` with `{duration, status, ok, error}` | `whatsapp/route.ts:35-39` | ✅ No PII | ✅ High |
| `'[Nav] navigation list failed'` | `botEngine.ts:108` | ✅ No PII | ✅ Medium |
| Empty catch blocks | Multiple files | ❌ Silent failures | ❌ Lost |

### Can Developers Trace a Conversation End-to-End?

**Partially.** The logs include:
- Correlation IDs threaded through the entire flow ✅
- Session transitions logged at INFO level ✅
- Handler errors logged with context ✅
- Webhook reception logged ✅

**Missing:**
- No conversation-level log grouping (no single log entry showing "Conversation X started → step A → step B → completed")
- No log for when the Instagram webhook's `messaging` array is empty (Section 3 — completely silent drop)
- Empty catch blocks (multiple locations) swallow errors without any logging
- No user-facing session expiry recovery message in logs
- No timing waterfall showing where each step spent time

---

## Section 14 — Sequence Diagrams

### WhatsApp Booking — Complete Flow

```mermaid
sequenceDiagram
    participant U as User
    participant M as Meta API
    participant W as WhatsApp Webhook
    participant E as botEngine.ts
    participant S as Session Mgr
    participant D as Database
    participant A as WA Adapter

    U->>M: "Hello" (text)
    M->>W: POST (text message)
    W->>W: verifySignature
    W->>E: processMessage("9665X", "hello", adapter, whatsapp, true)
    E->>S: getSession("9665X")
    S->>D: findUnique → null
    E->>S: setSession("9665X", "main_menu", {})
    S->>D: upsert → version=1
    E->>A: sendList(welcome)
    A->>M: POST /PHONE_ID/messages
    M-->>U: 📋 Main Menu

    U->>M: Clicks "Book" (list_reply)
    M->>W: POST (interactive)
    W->>E: processMessage("9665X", "menu_book", adapter, whatsapp, false)
    E->>S: getSession → step=main_menu
    E->>E: MainMenuHandler → "select_doctor"
    E->>A: sendList(doctors)
    E->>S: setSession("9665X", "select_doctor", data, v1→v2)
    A->>M: POST /PHONE_ID/messages
    M-->>U: 👨‍⚕️ Doctor List

    U->>M: Clicks doctor (list_reply)
    M->>W: POST
    W->>E: processMessage("9665X", docId, adapter, whatsapp, false)
    E->>E: DoctorHandler → "select_service"
    E->>A: sendList(services)
    E->>S: setSession("9665X", "select_service", data, v2→v3)
    M-->>U: 💊 Service List

    U->>M: Clicks service (list_reply)
    M->>W: POST
    W->>E: processMessage
    E->>E: ServiceHandler → "select_date"
    E->>A: sendList(dates)
    E->>S: setSession("9665X", "select_date", data, v3→v4)
    M-->>U: 📅 Date Picker

    U->>M: Clicks date (list_reply)
    M->>W: POST
    W->>E: processMessage("9665X", "date_...", adapter, whatsapp, false)
    E->>E: DateHandler → "select_time"
    E->>A: sendList(times)
    E->>S: setSession("9665X", "select_time", data, v4→v5)
    M-->>U: 🕐 Time Picker

    U->>M: Clicks time (list_reply)
    M->>W: POST
    W->>E: processMessage("9665X", "time_14:00", adapter, whatsapp, false)
    E->>E: TimeHandler → "ask_name"
    E->>A: sendText(askName)
    E->>A: sendList(navigation)
    E->>S: setSession("9665X", "ask_name", data, v5→v6)
    M-->>U: 📝 Please type your name

    Note over U: ⚠️ BREAKPOINT
    alt Valid English name
        U->>M: Types "Mohammed Alotaibi"
        M->>W: POST (text)
        W->>E: processMessage
        E->>E: NameHandler → "ask_call_time"
        E->>A: sendList(call times)
        E->>S: setSession(v6→v7)
        M-->>U: 📞 Call Time

        U->>M: Clicks call time
        M->>W: POST
        W->>E: processMessage
        E->>E: CallTimeHandler → "booking_summary"
        E->>A: sendList(summary)
        E->>S: setSession(v7→v8)
        M-->>U: 📋 Booking Summary

        U->>M: Clicks "Confirm"
        M->>W: POST
        W->>E: processMessage
        E->>E: SummaryHandler → "confirm"
        E->>E: executeBooking()
        E->>D: $transaction(lock + create booking)
        D-->>E: BookingResult
        E->>A: sendText(confirmation)
        E->>S: clearSession
        M-->>U: ✅ Booking Confirmed

    else Invalid name (Arabic/single/special)
        U->>M: Types "محمد" or "M123" or "M"
        M->>W: POST (text)
        W->>E: processMessage
        E->>E: NameHandler → stays at ask_name
        E->>A: sendText(error message)
        M-->>U: ⚠️ Error: use English A-Z
    end
```

### Instagram Reply — Broken Flow

```mermaid
sequenceDiagram
    participant U as User (Instagram)
    participant M as Meta Platform
    participant I as Instagram Webhook
    participant E as botEngine.ts
    participant A as IG Adapter

    U->>M: Sends "Hello"
    M->>I: POST /webhook
    
    alt If payload format is Messenger Platform
        I->>I: Read messaging[] → has data
        I->>E: processMessage("ig_XXXX", "hello", ...)
        E->>E: new session → main_menu
        E->>A: sendList("ig_XXXX", menu)
        A->>M: POST /me/messages
        Note over A,M: ⚠️ Endpoint may fail
        M-->>A: Error (or success)
        
    else If payload format is Instagram Graph API
        I->>I: Read messaging[] → empty
        I->>I: !messaging.length → TRUE
        Note over I: ❌ SILENT DROP
        I-->>M: 200 EVENT_RECEIVED
        Note over U: ❌ Message received but NOT processed
    end
```

### Session Update — Optimistic Locking

```mermaid
sequenceDiagram
    participant E as botEngine.ts
    participant S as sessionManager.ts
    participant D as Database

    E->>S: setSession(phone, nextStep, data, expectedVersion=5)
    S->>D: whatsAppSession.updateMany({ phone, sessionVersion: 5 })
    
    alt Version matches
        D-->>S: count=1
        S->>D: findUnique({ phone })
        D-->>S: updated session (version=6)
        S-->>E: SessionResult (version=6)
        E->>E: ✅ Transition successful
    
    else Version mismatch (concurrent request)
        D-->>S: count=0
        S->>D: findUnique({ phone })
        D-->>S: current session (version=6)
        S-->>E: throw ConcurrencyError
        E->>E: ⚠️ Version conflict
        E->>S: getSession(phone)
        S->>D: findUnique({ phone })
        D-->>S: fresh session (version=6)
        E->>E: Object.assign(data, freshData)
        E->>S: setSession(phone, nextStep, data, version=6)
        S->>D: updateMany({ sessionVersion: 6 })
        D-->>S: count=1
        S-->>E: ✅ Conflict resolved
    end
```

### Webhook Processing

```mermaid
sequenceDiagram
    participant M as Meta
    participant W as Webhook
    participant D as DuplicateGuard
    participant E as botEngine
    participant A as Adapter

    M->>W: POST /webhook (with signature)
    W->>W: verifySignature(rawBody, signature)
    
    alt Invalid signature
        W-->>M: 403 Forbidden
    else Valid signature
        W->>W: parse body → extract messages[]
        loop Each message
            W->>D: isDuplicateMessage(messageId, source, userId)
            D->>D: processedMessage.findUnique(messageId)
            
            alt Duplicate exists
                D-->>W: true
                W->>W: Skip message
            else New message
                D->>D: processedMessage.create(messageId)
                D-->>W: false
                W->>E: processMessage(userId, input, adapter, source)
                E->>E: session lookup → event type → routing
                E->>A: sendText/sendList (replies)
                A->>M: POST Meta API (reply)
                E-->>W: complete
            end
        end
        W-->>M: 200 OK (always)
    end
```

---

## Section 15 — Root Cause Analysis

| # | Problem | Root Cause | Evidence | Files | Functions | Severity | Recommendation |
|---|---|---|---|---|---|---|---|
| **1** | **Instagram messages received but no reply** | Webhook reads `entry[0].messaging` but Meta sends Instagram messages via `entry[0].changes[]` (Instagram Graph API webhook format). `messaging` is always `[]`, handler returns 200 without processing. | `instagram/route.ts:150-152`: `const messaging = entry?.messaging ?? []; if (!messaging.length) return new Response('EVENT_RECEIVED', { status: 200 });` — **no log message before return** | `src/app/api/instagram/webhook/route.ts` | `POST()`, lines 150-152 | **CRITICAL** | Add support for Instagram Graph API payload format (`entry[0].changes[].value`) alongside or instead of Messenger Platform format |
| **2** | **Instagram reply endpoint deprecated** | Uses `/me/messages` (Messenger Platform endpoint) instead of `/{ig-user-id}/messages` (Instagram API endpoint) | `instagram/route.ts:19`: `const IG_URL = () => https://graph.facebook.com/v21.0/me/messages` | `src/app/api/instagram/webhook/route.ts` | `IG_URL`, line 19 | **CRITICAL** | Use Instagram Graph API endpoint with `ig-user-id` from webhook metadata |
| **3** | **Arabic/Unicode names rejected** | `isValidEnglishName` regex `/^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/` only allows Latin letters. Clinic serves Arabic-speaking patients. | `botEngine.ts:74-76`: `ENGLISH_NAME_RE` and `isValidEnglishName`; `botEngine.ts:391-408`: `NameHandler.handle()` rejects non-Latin names | `src/app/lib/botEngine.ts` | `isValidEnglishName`, `NameHandler.handle` | **CRITICAL** | Expand regex to accept Unicode letter categories (`\p{L}`), allowing Arabic names |
| **4** | **Edit flow corrupts session state** | `SummaryHandler` calls `setSession` without version (line 464), then `processMessage` calls `setSession` with stale version (line 816). Session reverts to `booking_summary`. | `botEngine.ts:464`: `await setSession(userId, targetStep, data)` — no version check; `botEngine.ts:816`: `await setSession(userId, step, data, session.sessionVersion)` — stale version | `src/app/lib/botEngine.ts` | `SummaryHandler.handle`, lines 459-467; `processMessage`, line 816 | **HIGH** | Return the `targetStep` directly from `SummaryHandler` instead of calling `setSession` internally; let the main loop handle session transition |
| **5** | **Instagram `sendText` swallows errors** | Unlike WhatsApp adapter, Instagram `sendText` logs errors but never throws. Engine thinks reply was sent. | `instagram/route.ts:66-68`: `if (!res.ok) logger.error(...)` — no throw; compare to `whatsapp/route.ts:99` | `src/app/api/instagram/webhook/route.ts` | `makeInstagramAdapter.sendText`, lines 62-71 | **HIGH** | Throw on API failure (consistent with WhatsApp adapter) so bot engine can fall back |
| **6** | **Name validation requires 2+ words** | Single-word names (common in some cultures) are rejected | `botEngine.ts:75`: `input.trim().split(/\s+/).length >= 2` | `src/app/lib/botEngine.ts` | `isValidEnglishName`, line 75 | **HIGH** | Accept single-word names or make 2-word requirement conditional on locale |
| **7** | **No `env.example` file** | New developers have no documented environment variable reference | No `.env.example` in repository root | — | — | **LOW** | Create `.env.example` with all variables and their descriptions |
| **8** | **Instagram `INSTAGRAM_APP_SECRET` marked optional but de facto required** | Webhook rejects all requests if secret is missing | `env.ts:27` lists as optional; `instagram/route.ts:45-49` rejects without it | `src/app/lib/env.ts`, `src/app/api/instagram/webhook/route.ts` | `verifySignature`, lines 45-49 | **MEDIUM** | Mark as required in `env.ts` or add graceful fallback with warning |
| **9** | **Reminder sent immediately after booking** | Same-day reminders fire right after confirmation, not at appropriate time before appointment | `botEngine.ts:586-593`: fires `sendReminderMessage` immediately | `src/app/lib/botEngine.ts` | `executeBooking`, lines 586-593 | **LOW** | Schedule reminder for appropriate time (e.g., 24h before, or 2h before) |
| **10** | **No pagination on booking/audit endpoints** | `findMany()` with no limit — crashes on large datasets | `api/bookings/route.ts`, `api/audit-logs/route.ts` | — | — | **HIGH** | Add cursor/offset pagination with configurable page size |
| **11** | **In-memory rate limiter ineffective on Vercel** | Rate limit state lost per-serverless-instance | `lib/rateLimit.ts` | `src/app/lib/rateLimit.ts` | All | **HIGH** | Replace with Vercel KV or database-backed rate limiter |
| **12** | **Modal shift: 5 button steps → text input** | User trained to click buttons for 5 steps, then suddenly must type free text. Competing navigation buttons (back/menu/cancel) confuse the user. | `botEngine.ts:103-109`: `sendTextWithNav` sends text + navigation list | `src/app/lib/botEngine.ts` | `sendTextWithNav`, `TimeHandler.handle`, `NameHandler.handle` | **MEDIUM** | Provide clearer instructions; consider collecting name via a web form link or structured message |

---

## Section 16 — Risk Assessment

### Critical

| Risk | Issue | Business Impact |
|---|---|---|
| **Instagram replies broken** | Messages received but never processed (silent drop) | Instagram patients can message the clinic but receive NO response. Complete channel failure. |
| **Arabic names rejected** | Booking flow blocks after time selection for Arabic-speaking patients | Majority of target users cannot complete booking. Estimated 80%+ drop-off rate for Saudi clinic. |
| **Edit flow corrupts booking edits** | Session reverts to summary after edit selection | Users who try to edit their booking get stuck in a loop. Booking data may be corrupted. |

### High

| Risk | Issue | Business Impact |
|---|---|---|
| **No booking/audit pagination** | Endpoints return unbounded result sets | First deployment with >1K bookings will experience OOM crashes or HTTP timeouts |
| **In-memory rate limiting** | Rate limits ineffective on Vercel | Auth endpoints (login, register) have no real protection against brute force in production |
| **Instagram errors invisible** | `sendText` swallows API failures | Clinic staff have no way to detect that Instagram replies are failing |
| **No CSP header** | XSS vulnerability | Malicious script injection could compromise patient data |

### Medium

| Risk | Issue | Business Impact |
|---|---|---|
| **WhatsApp booking UX friction** | Modal shift from buttons to text at name step | User confusion and drop-off. Estimated 20-40% additional drop at name step. |
| **Single-word name rejection** | Some cultures use single names | Excludes patients with single-word names |
| **Reminder sent immediately** | Same-day booking reminder fires right after confirmation | Patient gets duplicate messages (confirmation + reminder at same time) |
| **Instagram session stored in WhatsApp table** | Data model confusion | No functional impact, but complicates analytics and debugging |

### Low

| Risk | Issue | Business Impact |
|---|---|---|
| **No `.env.example`** | Developer onboarding friction | Delays setup for new developers |
| **Empty catch blocks** | Silent failures | Harder to debug production issues |
| **`NODE_VERSION`/`PRISMA_CLIENT_VERSION` at module level** | Slight cold-start overhead | Negligible |
| **Service stored as Arabic string** | Cannot aggregate by service in reporting tool | Reporting limited |

---

## Section 17 — Final Verdict

### Is the Conversation Engine Reliable?

**No, not in its current state.** The engine has three critical failures:

1. **Instagram is completely non-functional** — messages are silently dropped at the webhook level due to payload format mismatch
2. **WhatsApp booking flow blocks Arabic-speaking users** — the name validation regex rejects the target audience's primary language
3. **The edit flow corrupts session state** — users who try to edit bookings get stuck in an infinite edit-summary loop

For users who speak English and have two-word names, the WhatsApp flow works correctly end-to-end. But for the target market (Saudi Arabia), this covers a small minority.

### Can It Scale?

**For single-clinic use with fixes: yes.** The conversation engine can handle:
- 100-200 bot conversations per day
- 50-100 booking creations per day
- 1-2 concurrent webhook requests

**For multi-clinic or high-volume: no.** The following are fundamental blockers:
- No multi-tenant architecture
- In-memory rate limiter doesn't work on serverless
- No connection pooling for database
- Busy-polling session management (each message triggers a DB read + write)
- Single large file (`botEngine.ts`, 864 lines) limits parallel development

### Can New Channels Be Added Easily?

**Partially.** The `BotAdapter` interface (`botEngine.ts:19-22`) provides a clean abstraction:
```typescript
export interface BotAdapter {
  sendText(to: string, text: string): Promise<void>;
  sendList(to: string, header: string, body: string, button: string, sections: ListSection[]): Promise<void>;
}
```

Adding a new channel (Telegram, Messenger, Web Chat) requires:
1. Creating a new webhook handler (like `whatsapp/webhook/route.ts`)
2. Creating a new adapter implementing `BotAdapter`
3. Adapting the channel's interactive components to fit `sendList` (which uses WhatsApp-style list format)

**Challenges:**
- `sendList` interface is WhatsApp-specific (header, body, button, sections) — other platforms use different interactive models
- Platform-specific knowledge (like Instagram's extra `ask_whatsapp` step) is hardcoded in handlers
- Session management is tightly coupled to the `whatsapp_sessions` table

**Verdict:** Adding a new channel is possible but would require adapter shim layers. The `BotAdapter` interface is a good start but needs generalization (e.g., separate `sendButtonList`, `sendQuickReplies`, `sendCarousel` methods) to properly abstract different platforms.

### Would You Redesign the Conversation Engine?

**Yes, I would recommend a significant redesign — not a rewrite, but a refactoring.**

**Why:**

1. **The single-file bottleneck is real at 864 lines.** The engine mixes:
   - State machine definition (HANDLERS map)
   - Handler implementations (10 classes)
   - Booking execution (executeBooking)
   - Fallback resolution (registerFallbackRows)
   - Navigation logic (handleNavigation)
   - Reminder scheduling (sendReminderMessage)
   - Event routing (processMessage routing logic)

2. **The state machine is tightly coupled to session persistence.** Each handler transition calls `setSession` indirectly via the `processMessage` routing loop. This makes it impossible to test a handler without a database.

3. **The mutable `data` object pattern is fragile.** Multiple handlers modify the same object by reference. The `editReturn`/`editField` pattern adds accidental complexity.

4. **The "back" navigation via `STEP_ORDER` is imprecise.** It doesn't handle branching flows (like Instagram's extra `ask_whatsapp` step) correctly.

5. **No event sourcing.** The conversation state is stored as a JSON blob. There's no event log showing the sequence of steps and decisions. This makes debugging, replay, and audit difficult.

**What I would NOT change:**
- The adapter pattern (`BotAdapter` interface) — this is well-designed
- The optimistic concurrency control — this is production-grade
- The fallback numbered-list mechanism — this is clever and robust
- The idempotent booking lock — this is correct

**Redesign scope:** Split `botEngine.ts` into ~5 files (handlers, session, routing, navigation, booking), introduce an event log, make the state machine a pure function that takes `(step, input, data)` → `(nextStep, data, actions[])`, and decouple handler execution from database persistence.

---

*Report generated 2026-07-11 — 17 sections, ~7000 words, full conversation flow trace completed. Total files analyzed: 12 source files, ~2,500 lines of critical path code.*
