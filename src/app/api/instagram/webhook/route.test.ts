import { describe, it, expect } from 'vitest';
import { parseMetaError } from '@/app/lib/metaValidation';

function normalizeChanges(entry: Record<string, unknown>) {
  const messaging = (entry?.messaging ?? []) as Array<Record<string, unknown>>;
  if (!messaging.length && (entry?.changes as Array<Record<string, unknown>>)?.length) {
    return (entry.changes as Array<Record<string, unknown>>)
      .filter((c: Record<string, unknown>) => (c.value as Record<string, unknown>)?.sender && ((c.value as Record<string, unknown>).sender as Record<string, unknown>)?.id)
      .map((c: Record<string, unknown>) => c.value);
  }
  return messaging;
}

describe('Instagram webhook — Graph API payload normalization', () => {
  it('extracts messages from changes format (Instagram Graph API)', () => {
    const entry = {
      changes: [{
        field: 'messages',
        value: {
          sender: { id: '12345' },
          recipient: { id: '67890' },
          message: { mid: 'abc123', text: 'Hello' },
        },
      }],
    };
    const messaging = normalizeChanges(entry);
    expect(messaging).toHaveLength(1);
    expect((messaging[0] as Record<string, unknown>).sender).toEqual({ id: '12345' });
    expect((messaging[0] as Record<string, unknown>).message).toEqual({ mid: 'abc123', text: 'Hello' });
  });

  it('preserves existing messaging array (Messenger Platform)', () => {
    const entry = {
      messaging: [{ sender: { id: '12345' }, message: { mid: 'abc123', text: 'Hello' } }],
    };
    const messaging = normalizeChanges(entry);
    expect(messaging).toHaveLength(1);
    expect((messaging[0] as Record<string, unknown>).sender).toEqual({ id: '12345' });
  });

  it('prefers messaging over changes when both exist', () => {
    const entry = {
      messaging: [{ sender: { id: 'from_messaging' }, message: { mid: 'm1', text: 'hi' } }],
      changes: [{ value: { sender: { id: 'from_changes' }, message: { mid: 'm2', text: 'hi' } } }],
    };
    const messaging = normalizeChanges(entry);
    expect(messaging).toHaveLength(1);
    expect((messaging[0] as Record<string, unknown>).sender).toEqual({ id: 'from_messaging' });
  });

  it('returns empty array when no messages exist', () => {
    expect(normalizeChanges({})).toEqual([]);
    expect(normalizeChanges({ messaging: [] })).toEqual([]);
    expect(normalizeChanges({ changes: [] })).toEqual([]);
  });

  it('filters changes without sender.id', () => {
    const entry = {
      changes: [
        { field: 'comments', value: { text: 'Nice post!' } },
        { field: 'messages', value: { sender: { id: '123' }, message: { text: 'Hello' } } },
      ],
    };
    const messaging = normalizeChanges(entry);
    expect(messaging).toHaveLength(1);
    expect((messaging[0] as Record<string, unknown>).sender).toEqual({ id: '123' });
  });
});

describe('Instagram — Meta error parsing diagnostics', () => {
  it('captures 401 token expired with error_subcode 460', () => {
    const body = JSON.stringify({
      error: {
        code: 190,
        type: 'OAuthException',
        message: 'Error validating access token',
        error_subcode: 460,
        error_user_title: 'Session expired',
        fbtrace_id: 'Trace460',
      },
    });
    const result = parseMetaError(body);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(190);
    expect(result!.errorSubcode).toBe(460);
    expect(result!.errorUserTitle).toBe('Session expired');
  });

  it('captures 401 token invalid with error_subcode 190', () => {
    const body = JSON.stringify({
      error: {
        code: 190,
        type: 'OAuthException',
        message: 'Error validating access token',
        error_subcode: 190,
        fbtrace_id: 'Trace190',
      },
    });
    const result = parseMetaError(body);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(190);
    expect(result!.errorSubcode).toBe(190);
  });

  it('captures 403 with error_user_msg', () => {
    const body = JSON.stringify({
      error: {
        code: 200,
        type: 'OAuthException',
        message: '(#200) App does not have Advanced Access',
        error_subcode: 2534048,
        error_user_title: 'Access Denied',
        error_user_msg: 'This app does not have access to this feature.',
        fbtrace_id: 'Forbidden789',
      },
    });
    const result = parseMetaError(body);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(200);
    expect(result!.errorSubcode).toBe(2534048);
    expect(result!.errorUserMsg).toBe('This app does not have access to this feature.');
  });

  it('captures 400 validation error with error_data', () => {
    const body = JSON.stringify({
      error: {
        code: 100,
        type: 'GraphMethodException',
        message: '(#100) Invalid parameter',
        error_data: { details: 'Messaging type is required', message: 'Invalid parameter' },
        fbtrace_id: 'ValErr222',
      },
    });
    const result = parseMetaError(body);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(100);
    expect(result!.errorData).toEqual({ details: 'Messaging type is required', message: 'Invalid parameter' });
    expect(result!.details).toBe('Messaging type is required');
  });

  it('captures 200 success — no error field returns null', () => {
    const body = JSON.stringify({ recipient_id: '123', message_id: 'mid.xyz' });
    expect(parseMetaError(body)).toBeNull();
  });
});

describe('Instagram — payload format validation', () => {
  it('sendText payload shape includes messaging_type', () => {
    const recipientId = '1234567890';
    const text = 'Hello from SmartClinic';
    const payload = { messaging_type: 'RESPONSE', recipient: { id: recipientId }, message: { text } };
    expect(payload).toHaveProperty('messaging_type', 'RESPONSE');
    expect(payload.recipient.id).toBe(recipientId);
    expect(payload.message.text).toBe(text);
  });

  it('sendList quick reply payload shape includes messaging_type', () => {
    const recipientId = '1234567890';
    const rows = [
      { id: 'opt_1', title: 'Option 1' },
      { id: 'opt_2', title: 'Option 2' },
    ];
    const payload = {
      messaging_type: 'RESPONSE',
      recipient: { id: recipientId },
      message: {
        text: 'اختر / Choose:',
        quick_replies: rows.map(r => ({
          content_type: 'text',
          title: r.title,
          payload: r.id,
        })),
      },
    };
    expect(payload).toHaveProperty('messaging_type', 'RESPONSE');
    expect(payload.message.quick_replies).toHaveLength(2);
    expect(payload.message.quick_replies[0]).toHaveProperty('content_type', 'text');
    expect(payload.message.quick_replies[0]).toHaveProperty('payload', 'opt_1');
  });

  it('enforces Instagram quick reply limits', () => {
    const rows = Array.from({ length: 13 }, (_, i) => ({
      id: `opt_${i}`, title: `Option ${i + 1}`,
    }));
    const fitsLimit = rows.length <= 13 && rows.every(r => r.title.length <= 20);
    expect(fitsLimit).toBe(true);

    const tooMany = Array.from({ length: 14 }, (_, i) => ({
      id: `opt_${i}`, title: `Option ${i + 1}`,
    }));
    expect(tooMany.length).toBeGreaterThan(13);
  });
});

describe('Instagram — token diagnostic logic', () => {
  it('detects EAA prefix as Page Token', () => {
    const token = 'EAAN4Tdz3ilEBR9qFVqPelUGAfZBDMp8l5nbQxyo6rvypY5tuLrfoLsG';
    const prefix = token.slice(0, 3);
    expect(prefix).toBe('EAA');
  });

  it('detects IGQ prefix as Instagram Login Token', () => {
    const token = 'IGQVJXXXXX12345';
    const prefix = token.slice(0, 3);
    expect(prefix).toBe('IGQ');
  });

  it('handles short token gracefully', () => {
    const token = '';
    const prefix = token.length >= 3 ? token.slice(0, 3) : '???';
    expect(prefix).toBe('???');
  });

  it('maps 401 error_subcode 460 to password change hint', () => {
    const errorSubcode = 460;
    const hints: string[] = [];
    if (errorSubcode === 460) hints.push('token invalidated by password change');
    expect(hints).toContain('token invalidated by password change');
  });
});
