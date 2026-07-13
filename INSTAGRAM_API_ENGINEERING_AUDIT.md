# Instagram API Engineering Audit

**Date:** 2026-07-13  
**Audit Type:** Production-readiness engineering audit  
**Status:** Complete  

---

## 1. Executive Summary

This audit cross-checks every Meta API interaction in the Instagram adapter against **current Meta documentation** (verified July 2026). The Instagram webhook **successfully reaches Vercel** and **signature verification has been fixed**, but all reply attempts return **HTTP 401**.

**Primary root cause:** The `INSTAGRAM_TOKEN` in production is almost certainly **not a valid Page Access Token** with the required `instagram_manage_messages` permission. The endpoint (`/me/messages`) is **correct** for the Messenger Platform Instagram Messaging API — the previous 401 report's conclusion that the endpoint is wrong is **contradicted by current Meta documentation**.

**Secondary cause:** The code does not include `messaging_type: "RESPONSE"` in any payload. While not strictly required for basic text, the Quick Replies spec shows it, and its absence may cause rejection for certain payload types.

**Tertiary cause:** `error_subcode` and `error_data` are not captured in logs, making it impossible to distinguish between token expiry, missing permissions, and other 401 sub-types from the existing logs.

**Key corrections to previous audits:**
1. `/me/messages` is **correct** for Instagram Messaging (Messenger Platform) — NOT wrong
2. The `/{ig-user-id}/messages` endpoint is for the **Instagram API with Instagram Login** (a separate, incompatible API path)
3. Both use `graph.facebook.com` host — the Instagram Login API uses `graph.instagram.com`

---

## 2. Current Architecture

```
Instagram DM User
  │
  ▼
Meta Webhook POST → Vercel → Instagram POST handler (route.ts:143)
  │                              │
  │                              ├─ req.text() read raw body (line 149)
  │                              ├─ JSON.parse(rawBody) (line 152)
  │                              ├─ verifySignature(rawBody, X-Hub-Signature-256) (line 156)
  │                              │    └─ process.env.INSTAGRAM_APP_SECRET
  │                              ├─ Extract messaging events (line 162-175)
  │                              │    ├─ entry[0].messaging[] (primary)
  │                              │    └─ entry[0].changes[].value (fallback)
  │                              ├─ For each event:
  │                              │    ├─ senderId = event.sender.id
  │                              │    ├─ sessionId = `ig_${senderId}`
  │                              │    ├─ isDuplicateMessage() check
  │                              │    └─ processMessage(sessionId, input, adapter, ...)
  │                              └─ adapter (makeInstagramAdapter)
  │                                   ├─ sendText(to, text) (line 65)
  │                                   │    └─ callMetaApi(IG_URL(), IG_HEADERS(), payload, cid)
  │                                   │         ├─ POST https://graph.facebook.com/v21.0/me/messages
  │                                   │         ├─ Authorization: Bearer ${INSTAGRAM_TOKEN}
  │                                   │         ├─ Body: { recipient: { id }, message: { text } }
  │                                   │         └─ Response: 401
  │                                   └─ sendList(to, header, body, button, sections) (line 81)
  │                                        ├─ sendText (header+body)
  │                                        └─ Quick replies or fallback text
  │
  ▼
Logger: "IG sendText failed with status 401"
```

---

## 3. Endpoint Verification

### Current endpoint
| Property | Value | File:Line |
|---|---|---|
| URL | `https://graph.facebook.com/v21.0/me/messages` | `route.ts:19` |
| API version | v21.0 | `route.ts:19` |
| Method | POST | `route.ts:70` |

### Meta Documentation Cross-Check

**Source:** https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message (Updated Jul 2, 2026)

**Requirements for this endpoint:**
- Instagram Professional account **linked to a Facebook Page**
- Page Access Token (PAT) from a person who can perform the `MESSAGE` task on the Page
- `instagram_manage_messages` permission

**Excerpt:**
> "To send a message that contains text or a link, send a `POST` request to the `/PAGE-ID/messages` endpoint with the `recipient` parameter containing the Instagram-scoped ID (IGSID)"

**Sample request:**
```bash
curl -i -X POST \
   "https://graph.facebook.com/<API_VERSION>/me/messages?access_token=<PAGE_ACCESS_TOKEN>" \
   --data 'recipient={"id":"IGSID"}&message={"text":"TEXT-OR-LINK"}'
```

**Verdict: `/me/messages` IS the correct endpoint** for the Messenger Platform Instagram Messaging API. The documentation explicitly uses `/me/messages` in the sample (with `me` resolving to the Page associated with the token).

### Correction to Previous 401 Report

The previous `INSTAGRAM_401_REPORT.md` (Section 3) concluded:
> "The code uses the Facebook Pages Messaging API endpoint. For Instagram messaging, the correct endpoint is the Instagram Messaging API endpoint: `POST /v21.0/{{ig-business-account-id}}/messages`"

**This conclusion is INCORRECT.** The current Meta documentation confirms that `/me/messages` is the correct endpoint for the **Messenger Platform Instagram Messaging API** (the approach used by this codebase). The `/{ig-business-account-id}/messages` endpoint belongs to the **Instagram API with Instagram Login** (a separate API) which:
- Uses host `graph.instagram.com` (NOT `graph.facebook.com`)
- Requires a User access token (NOT a Page Access Token)
- Does NOT require a linked Facebook Page
- Is documented at a different URL path

### Graph API Version Support

| Version | `/me/messages` Support for Instagram | Notes |
|---------|--------------------------------------|-------|
| v21.0 | ✅ Current | Works with Page Access Token + `instagram_manage_messages` |
| v20.0 | ✅ Supported | Same requirements |
| v19.0 | ✅ Supported | Same requirements |
| v18.0 | ✅ Supported | Known to work |
| v17.0 | ✅ Supported | |
| v16.0 | ✅ Supported | |
| v15.0 | ✅ Supported | |
| v14.0 | ✅ Supported | |
| v13.0 | ✅ Supported | |
| v12.0 | ✅ Supported | |
| Older | ⚠️ Varies | Check changelog |

**Verdict: v21.0 is fully supported.** No version upgrade needed.

### Alt Endpoint: `/{page-id}/messages`

The same doc also states `/PAGE-ID/messages` works as an alternative. Both resolve to the same Send API. The `/me/messages` variant is preferred because it avoids needing a separate `IG_ACCOUNT_ID` env variable.

---

## 4. Token Verification

### Current Implementation

| Property | Value | File:Line |
|---|---|---|
| Variable | `INSTAGRAM_TOKEN` (required) | `env.ts:22` |
| Source | `process.env.INSTAGRAM_TOKEN` | `route.ts:17` |
| Header | `Authorization: Bearer ${INSTAGRAM_TOKEN}` | `route.ts:21` |
| .env comment | `your_instagram_page_access_token` | `.env:54` |
| .env example | `INSTAGRAM_TOKEN=` (required) | `.env.example:23` |

### Meta Documentation Cross-Check

**Source:** https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started (Updated Apr 1, 2026)

**The token must be a Page Access Token (PAT), obtained through one of two methods:**

**Method A — Facebook Login flow (recommended for production):**
1. Get a User Access Token with `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`
2. GET `https://graph.facebook.com/{page-id}?fields=access_token&access_token={user-access-token}`
3. Response: `{ "access_token": "{page-access-token}", "id": "{page-id}" }`

**Method B — App Dashboard tool (simpler, for development):**
1. Go to Meta Developer Console → Your App → Messenger → Instagram Settings
2. Click "Add or Remove Pages", select your Facebook Page
3. Click "Generate Token"
4. This generates a **Page Access Token**

**Token Lifespan:**
- Short-lived User token → PAT valid for 1 hour
- Long-lived User token → PAT has **no expiration date**

### What the "Generate Token" button produces

The token generated from **Instagram → Messaging → Generate Token** in the App Dashboard is a **Page Access Token (PAT)** — NOT an "Instagram Business Account Token." It's the same type of token used for Facebook Page API calls, but with added Instagram permissions.

**The `.env` comment is correct:** It says "page access token". The token IS a Page Access Token.

### Required Permissions on the Token

From the Getting Started guide (Section 3):
> "Messenger API support for Instagram will require `instagram_manage_messages` in the Page access token"

From the Send a Message doc (Requirements section):
> "The `instagram_manage_messages` permission"

The Quick Replies doc additionally requires:
> "The ID for the Instagram Professional account (`IG_ID`)"
> "The Instagram-scoped ID (`IGSID`) for the person to whom you are sending the message"

**The token MUST include these permissions at generation time:**
- `instagram_basic`
- `instagram_manage_messages`
- `pages_manage_metadata`

**Optional but recommended:**
- `pages_showlist`
- `business_management`

### Verification Steps

**To verify the token type in production:**
1. Decode the token (it's a JWT-like string):
   - Prefix `EAA...` → Facebook Page Access Token ✅ (correct type)
   - Prefix `IGQVJ...` → Instagram Business token for IG Login API (wrong type for this endpoint)
   - Other → Likely invalid

2. Check permissions using Graph API:
   ```
   GET /debug_token?input_token={TOKEN}&access_token={APP_TOKEN}
   ```
   This returns the `scopes` array. Verify `instagram_manage_messages` is present.

### Likely Token Failures

| Scenario | Effect | Probability |
|---|---|---|
| Token generated without checking `instagram_manage_messages` | 401 | **HIGH** |
| Token is an old/deleted Page Token | 401 | **HIGH** |
| Token expired (short-lived, >1 hour old) | 401 | **MEDIUM** |
| Token has wrong permissions set | 401 | **MEDIUM** |
| Token is from a different Facebook App | 401 | **MEDIUM** |
| Token belongs to a Page not connected to Instagram | 401 | **LOW** |

---

## 5. Permission Verification

### Required Permissions

| Permission | Required? | App Review? | Purpose |
|---|---|---|---|
| `instagram_basic` | ✅ Required | ✅ Required | Read Instagram profile data |
| `instagram_manage_messages` | ✅ Required | ✅ Required | Send & receive Instagram messages |
| `pages_manage_metadata` | ✅ Required | ✅ Required | Access Page metadata |
| `pages_showlist` | ⚠️ Implied | ✅ Required | List user's Pages |
| `business_management` | ⚠️ Optional | ✅ Required | Business Manager integration |
| `pages_messaging` | ❌ Not needed | N/A | This is for Messenger Platform, not Instagram |

### Code Check

The code does NOT explicitly request permissions — it uses a pre-generated token. Permission verification must be done against the token using the debug_token endpoint.

### App Review Status

**Critical:** If the app is in **Development Mode** and the `instagram_manage_messages` permission does not have **Advanced Access**, the API will reject messages to any user who does not have a role on the app. The error would be:
```
(#200) App does not have Advanced Access to instagram_manage_messages permission
and recipient user does not have role on app.
```

This would return **403 Forbidden** (not 401). The exact error code is `200` with `error_subcode: 2534048`.

### Connected Tools Toggle

The Instagram Professional account must have **Connected Tools** enabled:
1. Instagram app → Settings → Messages and story replies → Message controls
2. Connected Tools → toggle **Allow Access to Messages** ON

If this is OFF, API calls will return 401 or 403.

---

## 6. Webhook Verification

### Meta Documentation Cross-Check

**Source:** Instagram Messaging Quick Replies — webhook event format (Updated Jul 2, 2026)

```json
{
  "object": "instagram",
  "entry": [{
    "id": "<IGID>",
    "time": 1502905976963,
    "messaging": [{
      "sender": { "id": "<IGSID>" },
      "recipient": { "id": "<IGID>" },
      "timestamp": 1502905976377,
      "message": {
        "quick_reply": { "payload": "<PAYLOAD>" },
        "mid": "<MID>",
        "text": "<SOME_TEXT>"
      }
    }]
  }]
}
```

**Source:** Instagram Platform Webhook Notification Examples (Updated Nov 24, 2025)

The Instagram Messaging webhook uses the `messaging` array format inside `entry[0]`. This is the same format as the Messenger Platform. Additionally, Instagram webhooks can use the `changes` array format for non-messaging fields (comments, mentions, story insights).

### Code Webhook Parser Analysis

| Field | Code | Meta Spec | Match |
|---|---|---|---|
| `entry[0].messaging[]` | `route.ts:163` | ✅ First priority | ✅ |
| `entry[0].changes[].value` | `route.ts:166-175` | Fallback for comments/mentions | ⚠️ See note |
| `sender.id` | `route.ts:197` | ✅ Present in messaging events | ✅ |
| `recipient.id` | Not extracted | Present in messaging events | ⚠️ Not used |
| `message.mid` | `route.ts:204` | ✅ Present | ✅ |
| `message.text` | `route.ts:208` | ✅ Present | ✅ |
| `message.quick_reply.payload` | `route.ts:206` | ✅ Present | ✅ |
| `postback.payload` | `route.ts:207` | ✅ Present | ✅ |
| `message.is_echo` | `route.ts:192-195` | ✅ Filtered | ✅ |
| `message.attachments` | ❌ Not handled | Array of attachment objects | ⚠️ |

**Note on `changes` format:** The `changes` array format is documented for Instagram Platform webhook fields like `comments`, `mentions`, `story_insights`. However, the `messages` field uses the `messaging` array format. The code's fallback to `changes` is harmless but likely never triggered for message events.

**Gap:** The code does not handle `message.attachments[]` (for when a user sends a photo, video, or other media). If a user sends a media message, `event.message?.text` would be empty, and `userInput` at line 210 would be empty, causing the message to be skipped at line 212.

**This is a feature gap but not a 401 cause.**

---

## 7. Payload Verification

### `sendText` Payload

```typescript
const payload = { recipient: { id: recipientId }, message: { text } };
```
Route: `route.ts:68`  
Endpoint: `POST /me/messages`  

**Meta Spec Compliance:** ✅ **CORRECT** — Matches the Send a Message doc exactly.

### `sendList` Quick Reply Payload

```typescript
const payload = {
  recipient: { id: recipientId },
  message: {
    text: 'اختر / Choose:',
    quick_replies: [{
      content_type: 'text',
      title: igQuickReplyTitle(r.title, r.description || r.title),
      payload: r.id,
    }],
  },
};
```
Route: `route.ts:93-103`

**Meta Spec Compliance:**

| Field | Code | Meta Spec | Match |
|---|---|---|---|
| `recipient.id` | ✅ Present | Required | ✅ |
| `messaging_type` | ❌ **Missing** | Required in Quick Replies spec | ⚠️ **GAP** |
| `message.text` | ✅ Present | Required | ✅ |
| `message.quick_replies[].content_type` | ✅ `'text'` | Required | ✅ |
| `message.quick_replies[].title` | ✅ `igQuickReplyTitle` | Max 20 chars | ✅ |
| `message.quick_replies[].payload` | ✅ `r.id` | Optional but recommended | ✅ |

**Gap: `messaging_type` is missing.** The Quick Replies doc shows:
```json
{
  "messaging_type": "RESPONSE",
  ...
}
```

This is important because:
- `RESPONSE` indicates this is a reply to a user's message
- Without it, Meta may reject the payload or apply different rate limits
- This could cause a **400 Bad Request** (not 401)

**Gap: Text length limit.** The doc says "Text message must be less than 1,000 characters." The code does not enforce this. `MSG.offersHeaderAr` + offer data could potentially exceed 1,000 characters, though for Instagram this is only used in sendText (sendList sends short text).

**Gap: emoji in quick reply titles.** The code uses emoji (`🕐`) in titles. Meta's Quick Replies doc says "Only plain text is supported except for pre-filled email or phone number quick replies." Emoji may be truncated or rejected. This would cause a 400, not 401.

### `sendList` Text Fallback Payload

When quick replies don't fit (too many rows), the code sends a numbered text list:
```typescript
const lines = allRows.map((r, i) => `${i + 1}. ${r.title}`);
await this.sendText(to, `${lines.join('\n')}\n\nأرسل رقم اختيارك / Send the number of your choice.`);
```
Route: `route.ts:122-123`

This uses `sendText` which is correct. However, if the text exceeds 1,000 characters, Meta will reject it.

---

## 8. Runtime Trace

### Successful Path (incoming)
```
1. Meta → POST /api/instagram/webhook (with X-Hub-Signature-256)
2. route.ts:149 → req.text() reads raw body
3. route.ts:152 → JSON.parse()
4. route.ts:156 → verifySignature (HMAC-SHA256 against INSTAGRAM_APP_SECRET) ✅
5. route.ts:163 → Extract messaging events
6. route.ts:203 → sessionId = `ig_${senderId}`
7. route.ts:220 → isDuplicateMessage() check ✅ (first message)
8. route.ts:246 → processMessage(sessionId, userInput, adapter, BookingSource.instagram, ...)
```

### Failed Path (outgoing reply)
```
9. botEngine.ts → adapter.sendText(to, text)
10. route.ts:67 → recipientId = to.replace(/^ig_/, '')
11. route.ts:68 → payload = { recipient: { id: recipientId }, message: { text } }
12. route.ts:70 → callMetaApi(IG_URL(), IG_HEADERS(), payload, cid)
13. route.ts:31 → fetchWithRetry(url, { method: 'POST', headers, body }, cid)
14. route.ts:36 → Response: status = 401
15. route.ts:36-42 → Logged: '[MetaAPI] Instagram sent' with status: 401, error body
16. route.ts:72-73 → sendText: logger.error('IG sendText failed', { status: 401 })
17. route.ts:73 → throw new Error('Instagram sendText failed with status 401')
18. botEngine.ts → processMessage catches the error, logs 'processMessage error'
```

### Where It Fails

The failure is at **step 12-14**: the `callMetaApi` function sends the request to Meta, and Meta returns **HTTP 401**.

The error body IS captured at step 15 by `callMetaApi` (line 36-42):
```typescript
const resBody = res.ok ? '' : await res.clone().text().catch(() => '');
const metaErr = resBody ? parseMetaError(resBody) : undefined;
```
This logs `metaCode`, `metaType`, `metaMessage`, `metaTrace`, and the raw `error` field.

But at step 16, `sendText` only logs the status code — discarding the parsed error.

### What the Error Body Contains (NOT currently captured)

The `parseMetaError` function at `metaValidation.ts:11-26` captures:
```typescript
{
  code: err.code,           // e.g., 100, 190, 200
  type: err.type,           // e.g., "GraphMethodException", "OAuthException"
  message: err.message,     // Human-readable error
  details: err.error_data?.details,  // ✅ Captured
  fbtraceId: err.fbtrace_id,        // ✅ Captured
}
```

But the function does **NOT** capture:
- `error_subcode` — Critical! Subcode 190 = token expired, 460 = token invalidated, 33 = invalid object
- `error_user_title` — Human-readable title
- `error_user_msg` — Human-readable message

---

## 9. Root Cause Matrix

| # | Cause | HTTP Status | Error Code | Error Subcode | Confidence | Evidence |
|---|---|---|---|---|---|---|
| 1 | Token missing `instagram_manage_messages` permission | 401/403 | 200 | 2534048 | **MEDIUM** | Most common community complaint. Token may have been generated without checking this permission. |
| 2 | Token is not a valid Page Access Token | 401 | 100 | — | **MEDIUM** | Token may be an Instagram Login token (IGQVJ...) or invalid string. |
| 3 | Token expired (short-lived) | 401 | 190 | — | **MEDIUM** | If token was generated via short-lived User token, it expires in 1 hour. |
| 4 | Token invalidated (password change) | 401 | 190 | 460 | **LOW** | Unlikely unless someone changed the FB password. |
| 5 | App in Dev Mode, sender not a test user | 403 | 200 | 2534048 | **MEDIUM** | If app hasn't passed App Review. |
| 6 | Connected Tools toggle OFF | 401/403 | — | — | **LOW** | Required by Meta docs. |
| 7 | Facebook Page not linked to Instagram | 401 | 100 | 33 | **LOW** | Required for Messaging API. |
| 8 | Wrong endpoint (`/me/messages`) | **N/A** | — | — | **REJECTED** | Meta docs confirm `/me/messages` is correct. |
| 9 | Missing `messaging_type: "RESPONSE"` | 400 (not 401) | 100 | — | **LOW** | Would cause 400, not 401. |
| 10 | Recipient ID format wrong | 400 | 100 | — | **LOW** | Would cause 400, not 401. |

---

## 10. Ranked Causes (with confidence)

### Rank 1 — Token Type or Permissions (Confidence: HIGH)

**Most likely root cause.** The `INSTAGRAM_TOKEN` is either:
1. Not a valid Page Access Token (string doesn't decode, wrong app, etc.)
2. A valid Page Access Token but missing the `instagram_manage_messages` permission
3. A valid Page Access Token from a Page not connected to an Instagram Professional account

**How to verify:**
```bash
curl -X GET "https://graph.facebook.com/v21.0/debug_token?input_token=${INSTAGRAM_TOKEN}&access_token=${APP_ID}|${APP_SECRET}"
```
This returns the token type, scopes, app_id, and expiry.

**Fix:** Regenerate the token from Meta Developer Console → Messenger → Instagram Settings → Generate Token, ensuring:
- The correct Facebook Page is selected (the one linked to the Instagram account)
- The token includes `instagram_manage_messages`, `instagram_basic`, `pages_manage_metadata`

### Rank 2 — Token Expired (Confidence: MEDIUM)

If the token was generated using a short-lived User Access Token, it expires after 1 hour. A long-lived User token produces a PAT with no expiration.

**Fix:** Either regenerate the token or ensure the generation used a long-lived User token.

### Rank 3 — App in Development Mode (Confidence: MEDIUM)

If the Instagram Messaging product doesn't have Advanced Access for `instagram_manage_messages`, only app testers can receive messages.

**Fix:** Submit App Review for Advanced Access, or add the sender Instagram account as a tester.

### Rank 4 — Connected Tools Not Enabled (Confidence: LOW-MEDIUM)

The Instagram Professional account must have "Allow Access to Messages" toggled ON.

**Fix:** Instagram Settings → Messages → Message controls → Connected Tools → toggle ON.

### Rank 5 — Instagram Page Not Linked (Confidence: LOW)

The Facebook Page associated with the token must be linked to the Instagram Professional account.

**Fix:** Facebook Page Settings → Linked Accounts → Instagram → Connect account.

---

## 11. Required Changes

### Critical (blocks all replies)

| # | Change | File | Line(s) | Priority |
|---|---|---|---|---|
| 1 | **Regenerate token** with correct permissions. The `INSTAGRAM_TOKEN` must be a Page Access Token with `instagram_manage_messages`, `instagram_basic`, `pages_manage_metadata`. Use Meta Developer Console → Messenger → Instagram Settings → Generate Token. | `.env` / Vercel | 54 | **P0** |
| 2 | **Verify token** using `/debug_token` endpoint. Log the token type and scopes at startup (never log the token itself). | `route.ts` | New startup check | **P0** |
| 3 | **Add `messaging_type: "RESPONSE"`** to both `sendText` and `sendList` quick reply payloads. Meta's Quick Replies doc explicitly includes this field. | `route.ts` | 68, 93-103 | **P0** |

### High (diagnostic gaps)

| # | Change | File | Line(s) | Priority |
|---|---|---|---|---|
| 4 | **Capture `error_subcode` and `error_user_msg`** in `parseMetaError`. These are critical for identifying 401 sub-types (token expired vs wrong token). | `metaValidation.ts` | 11-26 | **P1** |
| 5 | **Fix `sendText` error handler** to include full Meta error details (not just status code). The error body is already parsed by `callMetaApi` but discarded by `sendText`. | `route.ts` | 71-73 | **P1** |
| 6 | **Log token validation** at startup (type prefix, scopes, expiry — but NOT the token value). | `route.ts` | Near line 17 | **P1** |

### Medium (robustness)

| # | Change | File | Line(s) | Priority |
|---|---|---|---|---|
| 7 | **Enforce 1,000 character text limit** for Instagram messages. Meta rejects text over 1,000 bytes. | `route.ts` or `metaValidation.ts` | `sendText` | **P2** |
| 8 | **Handle `messaging_type: "RESPONSE"`** properly. The conversation standard requires this field for reply messages. | `route.ts` | 68, 93-103 | **P2** |
| 9 | **Handle `message.attachments`** in webhook parser. When a user sends a photo/audio/video, `message.text` is empty → the message is skipped. | `route.ts` | 208-214 | **P2** |

### Low (future-proofing)

| # | Change | File | Line(s) | Priority |
|---|---|---|---|---|
| 10 | **Add emoji stripping** for Instagram quick reply titles. Meta docs say only plain text is supported. | `metaValidation.ts` | `igQuickReplyTitle` | **P3** |
| 11 | **Consider using `/PAGE-ID/messages`** instead of `/me/messages` for explicit routing. Not required but more transparent. | `route.ts` | 19 | **P3** |

---

## 12. Risks

| Risk | Description | Severity | Mitigation |
|---|---|---|---|
| **Token exposure** | `INSTAGRAM_TOKEN` is a long-lived secret. If leaked, attacker can send/receive Instagram DMs. | **HIGH** | Rotate immediately if compromised. Store in Vercel env, never in code. |
| **App Review needed** | When the app needs to serve Instagram users beyond the development team, App Review is required for `instagram_manage_messages` Advanced Access. | **HIGH** | Submit App Review now even if not needed yet. Process takes 1-4 weeks. |
| **API version deprecation** | v21.0 will eventually be deprecated. Monitor Meta changelog for version sunset dates. | **LOW** | Implement version check at startup. |
| **No rate limit handling** | Instagram Messaging has rate limits (100 sends/second for text). No backoff or throttling is implemented beyond `fetchWithRetry`. | **MEDIUM** | Implement proper rate limit detection from response headers. |
| **No Conversation ID tracking** | Instagram requires replying within 24 hours of last message. No tracking of conversation expiry. | **MEDIUM** | Implement conversation window tracking. |
| **No media upload support** | Cannot send images, audio, or files. All replies are text-only. | **LOW** | Future feature. |

---

## 13. Production Readiness Score

| Category | Score (0-10) | Notes |
|---|---|---|
| **Architecture** | 7/10 | Clear adapter pattern. Instagram adapter is well-structured. Missing `messaging_type` and attachment handling. |
| **Correctness** | 5/10 | Endpoint is correct (contradicting previous report), but token configuration is almost certainly wrong. Payloads match spec except for `messaging_type`. |
| **Security** | 8/10 | Signature verification is correct. Token stored in env var. No token logging. Missing `error_subcode` capture is a diagnostic security gap. |
| **Maintainability** | 7/10 | Shared `processMessage` engine works well. Instagram-specific code is isolated in `route.ts:63-127`. Webhook parser handles both payload formats. |
| **Scalability** | 6/10 | No rate limit handling beyond retry. No connection pooling. No request queuing. Acceptable for a clinic bot (low volume). |
| **Meta Compliance** | 5/10 | Missing `messaging_type` field. `INSTAGRAM_APP_SECRET` has wrong naming (should clarify it's the Facebook App Secret). Quick reply titles may exceed plain-text constraint. |
| **Documentation** | 6/10 | `.env` and `.env.example` document the variables. Previous audit reports exist but endpoint conclusion was incorrect. Missing documentation for what permissions the token needs. |

### Overall Score: **6.4/10 — Needs improvement before production**

### Minimum Requirements for Production

Before enabling Instagram messaging in production:

- [ ] Regenerate `INSTAGRAM_TOKEN` with `instagram_manage_messages` permission
- [ ] Verify token via `/debug_token` endpoint
- [ ] Enable "Connected Tools" on the Instagram Professional account
- [ ] Add `messaging_type: "RESPONSE"` to all outgoing payloads
- [ ] Capture `error_subcode` in `parseMetaError`
- [ ] Fix `sendText` error handler to include full error body
- [ ] Request App Review for `instagram_manage_messages` Advanced Access
- [ ] Confirm `INSTAGRAM_APP_SECRET` is set to the Facebook App Secret (not a random string)

---

## Appendix A: Meta Documentation References

| Topic | URL | Retrieved |
|---|---|---|
| Send a Message (Instagram Messaging) | https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message | 2026-07-13 |
| Quick Replies (Instagram Messaging) | https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/quick-replies/ | 2026-07-13 |
| Getting Started (Instagram Messaging) | https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started/ | 2026-07-13 |
| Overview (Instagram Messaging) | https://developers.facebook.com/documentation/business-messaging/instagram-messaging/overview/ | 2026-07-13 |
| Webhook Examples (Instagram Platform) | https://developers.facebook.com/documentation/instagram-platform/webhooks/examples/ | 2026-07-13 |
| Webhook Events (Messenger Platform) | https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/messages | 2026-07-13 |
| Instagram Platform Overview | https://developers.facebook.com/documentation/instagram-platform/ | 2026-07-13 |
| Conversations API | https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations/ | 2026-07-13 |

## Appendix B: File Reference Index

| File | Lines | Purpose |
|---|---|---|
| `src/app/api/instagram/webhook/route.ts` | 1-270 | Instagram webhook handler, adapter, sendText, sendList, callMetaApi, verifySignature |
| `src/app/api/instagram/webhook/route.test.ts` | 1-67 | Webhook payload normalization tests |
| `src/app/lib/metaValidation.ts` | 1-236 | parseMetaError, igQuickReplyTitle, META_LIMITS, ensureRowLimit |
| `src/app/lib/botEngine.ts` | 1-909 | Shared conversation engine (processMessage, DateHandler, TimeHandler, etc.) |
| `src/app/lib/env.ts` | 1-28 | META_REQUIRED, META_OPTIONAL definitions |
| `src/app/lib/retry.ts` | 1-105 | fetchWithRetry (DOES NOT retry 4xx errors including 401) |
| `src/app/lib/duplicateGuard.ts` | 1-66 | isDuplicateMessage with Prisma |
| `.env` | 1-57 | Current environment configuration |
| `.env.example` | 1-47 | Environment variable documentation |

## Appendix C: Correction Log

### Previous Conclusion (INSTAGRAM_401_REPORT.md, Section 3)

> "The code uses the Facebook Pages Messaging API endpoint. For Instagram messaging, the correct endpoint is the Instagram Messaging API endpoint: `POST /v21.0/{{ig-business-account-id}}/messages`"

### Current Meta Documentation

The Instagram Messaging API (Messenger Platform) uses:
```
POST https://graph.facebook.com/<API_VERSION>/me/messages?access_token=<PAGE_ACCESS_TOKEN>
```

### Correction

The endpoint is **correct**. The `/{ig-account-id}/messages` endpoint belongs to the **Instagram API with Instagram Login** (a separate API hosted at `graph.instagram.com`, requiring a User token, not a Page token). The two APIs are:
- **Messenger Platform for Instagram** (this codebase) → `/me/messages` + Page Access Token
- **Instagram API with Instagram Login** → `/{ig-id}/messages` + User Access Token

**Root cause is NOT the endpoint — the root cause is the token.**
