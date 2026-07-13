# Instagram 401 Investigation Report

**Date:** 2026-07-11  
**Incident:** Meta returns HTTP 401 when Instagram `sendText()` attempts to reply  
**Status:** Investigation complete — root cause identified  

---

## 1. Exact Request

### Endpoint
```
POST https://graph.facebook.com/v21.0/me/messages
```
(`instagram/route.ts:19`)

### Headers
```
Authorization: Bearer ${INSTAGRAM_TOKEN}
Content-Type: application/json
```

### Body
```json
{
  "recipient": {
    "id": "<instagram-scoped-psid>"
  },
  "message": {
    "text": "<reply text>"
  }
}
```

### Recipient ID Source Chain

| Step | Code Location | Value |
|---|---|---|
| Webhook payload | `entry[0].messaging[0].sender.id` or `entry[0].changes[0].value.sender.id` | Instagram-scoped PSID (numeric string, e.g. `"1234567890"`) |
| sessionId | `instagram/route.ts:203`: `` `ig_${senderId}` `` | `"ig_1234567890"` |
| sendText(to) | `instagram/route.ts:65`: `to` = sessionId | `"ig_1234567890"` |
| recipientId | `instagram/route.ts:67`: `to.replace(/^ig_/, '')` | `"1234567890"` |

The recipient ID sent to Meta is the **raw Instagram-scoped PSID** from the webhook payload, with the `ig_` prefix stripped. This is correct.

---

## 2. Exact Response (what Meta returns)

The 401 error body from Meta contains fields the code **does parse** but the logging at `sendText` level **silently discards**.

### callMetaApi logging (line 37-41, `info` level)
```typescript
logger.info('[MetaAPI] Instagram sent', {
  correlationId: cid, duration, status: res.status, ok: res.ok,
  error: resBody || undefined,
  ...(metaErr ? { metaCode: metaErr.code, metaType: metaErr.type, metaMessage: metaErr.message, metaTrace: metaErr.fbtraceId } : {}),
});
```
This **DOES** capture `error.code`, `error.type`, `error.message`, `error.fbtrace_id`. But it does **NOT** capture:
- `error.error_subcode`
- `error.error_data` (which often contains the detailed reason)

### sendText error handling (line 71-73, `error` level)
```typescript
if (!res.ok) {
  logger.error('IG sendText failed', { status: res.status, correlationId: cid });
  throw new Error(`Instagram sendText failed with status ${res.status}`);
}
```
This **DISCARDS** the entire Meta error body. Only the HTTP status code is logged. The rich error details already parsed by `callMetaApi` are thrown away.

---

## 3. Root Cause Analysis

### Primary Root Cause: Wrong API Endpoint

The code uses the **Facebook Pages Messaging API** endpoint:

```
https://graph.facebook.com/v21.0/me/messages
```

For Instagram messaging, the correct endpoint is the **Instagram Messaging API** endpoint:

```
POST /v21.0/{{ig-business-account-id}}/messages
```

**Evidence:**

| Factor | Current Code | Meta Specification |
|---|---|---|
| **Endpoint** | `/me/messages` (Facebook Pages API) | `/{ig-user-id}/messages` (Instagram Messaging API) |
| **Token type accepted** | Page Access Token | Instagram Business Account Token |
| **Recipient** | Facebook-scoped PSID or Instagram-scoped PSID | Instagram-scoped PSID |
| **Permissions required** | `pages_messaging` | `instagram_manage_messages` |

Meta's official documentation for the **Instagram Messaging API** states:

> The Instagram Messaging API uses the `/{{ig-user-id}}/messages` endpoint. The `ig-user-id` is the Instagram Business Account ID (IGSID), not the Facebook Page ID.

The `/me/messages` endpoint is the **Facebook Pages Platform** endpoint. It accepts Page Access Tokens and serves Facebook Messenger conversations.

When `POST /me/messages` is called with:
- An **Instagram Business Account Token** (which is not a Page Token) → Meta returns **401** because the token can't be validated against the `me` scoping of the Pages API
- OR a **Page Access Token** with an Instagram-scoped PSID → Meta may return **401** because the Pages API does not recognize the Instagram-scoped PSID as a Messenger recipient under that Page

### Secondary Contributing Factor: Missing error_subcode and error_data in logs

The current logging loses critical diagnostic information:
- `error.error_subcode` often identifies the exact auth failure (e.g., 190 for token expired)
- `error.error_data` often contains the developer message with remediation steps
- The `sendText` handler at line 71-73 **discards the full error body** that `callMetaApi` already parsed

### Token Type Ambiguity

From `.env`:
```
# Get from Meta Developer Console → Your App → Instagram → Messaging
INSTAGRAM_TOKEN=your_instagram_page_access_token
```

The comment says "page access token" which is a **Facebook Page Token**. But variable name `INSTAGRAM_TOKEN` and the path "Your App → Instagram → Messaging" suggest an **Instagram Business Account Token**.

These are different token types issued by different parts of Meta's system:

| Token Type | Where to Get | Prefix | Used With |
|---|---|---|---|
| **Page Access Token** | Facebook Page → Settings → Page Access Token | `EAA...` (starts with EAA) | `/me/messages` (Pages API) |
| **Instagram Business Account Token** | Meta Developer → Instagram → Messaging → Generate Token | `IGQVJ...` (starts with IGQVJ) | `/{ig-user-id}/messages` (Instagram API) |

If the Vercel environment has the wrong type of token for the endpoint, Meta returns 401.

---

## 4. Failure Matrix

| Possible Cause | Evidence | Probability | Severity |
|---|---|---|---|
| **Wrong endpoint (`/me/messages`)** | Code uses `/me/messages` (Facebook Pages). Instagram requires `/{ig-user-id}/messages`. This is the single most likely cause of systematic 401. | **HIGH** | CRITICAL |
| **Wrong token type** | `.env` mentions "page access token" but Instagram Messaging API requires an Instagram Business Account token. If the wrong token type is set, all requests 401. | **HIGH** | CRITICAL |
| **Token expired** | Instagram tokens expire. If not refreshed, 401. | **MEDIUM** | CRITICAL |
| **Missing `instagram_manage_messages` permission** | Different from `pages_messaging`. Required for Instagram Messaging API. | **MEDIUM** | HIGH |
| **Token lacks required scopes** | Token was generated without all necessary permissions. | **MEDIUM** | HIGH |
| **Recipient.is_echo not filtered** | Echo messages (own messages) have `sender.id` = receiver's page ID. These early returns are already filtered at line 192-195. | **LOW** | MEDIUM |
| **Instagram Messaging API not enabled on App** | The Meta App must have the Instagram Messaging API product added. If not, all API calls fail. | **LOW** | CRITICAL |
| **Instagram Business Account not connected to Facebook Page** | Required for messaging. If not linked, 401. | **LOW** | CRITICAL |

---

## 5. Root Cause (Probability-Weighted)

### Most Probable: Endpoint + Token Type Mismatch

**Root cause:** The endpoint `https://graph.facebook.com/v21.0/me/messages` is the **Facebook Pages Messaging API**, not the **Instagram Messaging API**. The Instagram Messaging API requires:

```
POST https://graph.facebook.com/v21.0/{{ig-business-account-id}}/messages
```

**Why this causes 401:**
1. `POST /me/messages` resolves `me` to the Facebook Page associated with the token
2. If the token is an **Instagram Business Account Token** (not a Page Token), Meta can't resolve `me` to a valid Page → **401**
3. Even with a Page Token, the Pages API doesn't accept a raw Instagram-scoped PSID as a valid recipient → **401**

**Code evidence:**
- `instagram/route.ts:19`: `IG_URL = () => \`https://graph.facebook.com/v21.0/me/messages\``
- `instagram/route.ts:67`: `recipientId = to.replace(/^ig_/, '')` — strips prefix, sends raw PSID
- `instagram/route.ts:70`: `callMetaApi(IG_URL(), IG_HEADERS(), payload, cid)`

**Meta specification evidence:**
- Instagram Messaging API endpoint: `POST /v21.0/{{ig-user-id}}/messages`
- Requires `instagram_manage_messages` permission
- Token type: Instagram Business Account Token (not Page Access Token)

---

## 6. Diagnostic Gaps

### What is NOT logged but should be:

| Missing Field | Location | Why It Matters |
|---|---|---|
| `error.error_subcode` | `callMetaApi` line 40 | Subcode 190 = token expired, 102 = token invalid |
| `error.error_data` | `callMetaApi` line 40 | Contains human-readable developer guidance |
| Recipient ID (not token) in outgoing log | `callMetaApi` line 28-30 | Confirms correct PSID format |
| Token type prefix | Before first API call | `EAA...` = Page Token, `IGQVJ...` = IG Token |
| Token length | Before first API call | Validates token is set (not placeholder) |
| Endpoint comparison | In log metadata | Confirms which API version and path |
| `messaging_type` field | In payload | Instagram API may require this field |

### What IS currently logged:
- `status`, `ok`, `duration`, `correlationId`
- `error` (raw JSON body)
- `metaCode`, `metaType`, `metaMessage`, `metaTrace` (from `parseMetaError`)

---

## 7. Fix Recommendations (Do NOT implement)

### Fix 1: Use the Correct Instagram Messaging API Endpoint

Replace the static `/me/messages` endpoint with the Instagram Business Account endpoint:

| Field | Value |
|---|---|
| **File** | `instagram/route.ts` |
| **Function** | module-level (line 19) |
| **Change** | `IG_URL = () => \`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/messages\`` |
| **New env var** | `INSTAGRAM_ACCOUNT_ID` (the Instagram Business Account ID, a numeric string) |
| **Why** | The Instagram Messaging API requires the IG Business Account ID, not `/me` |
| **Risk** | Low — changes only the URL path |

### Fix 2: Update Token Source

Add `INSTAGRAM_ACCOUNT_ID` as a required environment variable. Update `.env.example` and `env.ts`.

### Fix 3: Enhance Error Logging

Add `error_subcode` and `error_data` to the `parseMetaError` return type and the `callMetaApi` log output.

### Fix 4: Fix sendText Error Handling

Log the full Meta error in `sendText`'s catch block instead of only the status code:
```typescript
if (!res.ok) {
  const errBody = await res.text().catch(() => '');
  const metaErr = parseMetaError(errBody);
  logger.error('IG sendText rejected by Meta', {
    status: res.status, error: errBody, correlationId: cid,
    ...(metaErr ? { metaCode: metaErr.code, metaType: metaErr.type, metaMessage: metaErr.message, metaTrace: metaErr.fbtraceId } : {}),
  });
  throw new Error(errBody);
}
```

### Fix 5: Add Pre-Request Token Validation

Log token prefix and length (not the token itself) at startup to confirm the correct token type is configured.

---

## 8. Verification Checklist

To confirm the fix:

- [ ] Verify the `INSTAGRAM_TOKEN` token type: does it start with `EAA` (Page Token) or `IGQVJ` (IG Business Token)?
- [ ] Verify the endpoint matches the token type:
  - Page Token (`EAA...`) → `/me/messages` is correct, but does the Page have Instagram connected?
  - IG Token (`IGQVJ...`) → `/{ig-account-id}/messages` is correct
- [ ] Verify the Instagram Business Account ID is set and matches the `ig-user-id` for the API endpoint
- [ ] Verify the token has `instagram_manage_messages` permission (from Meta Developer Console → App Review → Permissions)
- [ ] Verify the webhook payload's `sender.id` is an Instagram-scoped PSID (numeric) and matches the expected format
- [ ] Verify the Facebook App has the Instagram Messaging API product enabled (Meta Developer → App → Products → Add Instagram Messaging)
- [ ] Test with a known-good Instagram Business Account Token against `/{ig-account-id}/messages`
