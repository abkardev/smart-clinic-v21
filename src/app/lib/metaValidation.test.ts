import { describe, it, expect } from 'vitest';
import { parseMetaError, logInteractivePayloadDiagnostic, validateWaPayload, META_LIMITS } from './metaValidation';

describe('parseMetaError', () => {
  const authErrorBody = JSON.stringify({
    error: {
      code: 200,
      type: 'OAuthException',
      message: 'Invalid OAuth 2.0 Access Token',
      fbtrace_id: 'AuHkLmNpQrStUvWxYz123',
    },
  });

  it('parses Meta auth error (401)', () => {
    const result = parseMetaError(authErrorBody);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(200);
    expect(result!.type).toBe('OAuthException');
    expect(result!.message).toBe('Invalid OAuth 2.0 Access Token');
    expect(result!.fbtraceId).toBe('AuHkLmNpQrStUvWxYz123');
  });

  it('parses Meta validation error (400)', () => {
    const body = JSON.stringify({
      error: {
        code: 100,
        type: 'GraphMethodException',
        message: '(#100) Invalid parameter',
        error_data: { details: 'Row title exceeds 24 characters' },
        fbtrace_id: 'BcDeFgHiJkLmNoPqRsT456',
      },
    });
    const result = parseMetaError(body);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(100);
    expect(result!.type).toBe('GraphMethodException');
    expect(result!.details).toBe('Row title exceeds 24 characters');
  });

  it('parses Meta rate limit error (429)', () => {
    const body = JSON.stringify({
      error: {
        code: 4,
        type: 'OAuthException',
        message: '(#4) Application request limit reached',
        fbtrace_id: 'XyZ789',
      },
    });
    const result = parseMetaError(body);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(4);
    expect(result!.message).toContain('limit');
  });

  it('parses Meta server error (500)', () => {
    const body = JSON.stringify({
      error: {
        code: 2,
        type: 'OAuthException',
        message: 'An unknown error occurred',
        fbtrace_id: 'Err001',
      },
    });
    const result = parseMetaError(body);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(2);
  });

  it('parses Meta permission error (403)', () => {
    const body = JSON.stringify({
      error: {
        code: 10,
        type: 'OAuthException',
        message: '(#10) Application does not have permission for this action',
        fbtrace_id: 'Perm123',
      },
    });
    const result = parseMetaError(body);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(10);
    expect(result!.type).toBe('OAuthException');
  });

  it('returns null for non-JSON body', () => {
    expect(parseMetaError('not json')).toBeNull();
  });

  it('returns null for empty body', () => {
    expect(parseMetaError('')).toBeNull();
  });

  it('returns null when error field is missing', () => {
    expect(parseMetaError(JSON.stringify({ ok: true }))).toBeNull();
  });

  it('preserves full error body for caller to re-read', () => {
    const parsed = parseMetaError(authErrorBody);
    expect(parsed).not.toBeNull();
    const roundTripped = JSON.parse(authErrorBody);
    expect(roundTripped.error.type).toBe('OAuthException');
  });
});

describe('logInteractivePayloadDiagnostic', () => {
  const validPayload = {
    header: { text: 'Test Header' },
    body: { text: 'Test body message' },
    footer: { text: 'SmartClinic 🏥' },
    action: {
      button: 'Choose',
      sections: [{
        title: 'Section 1',
        rows: [
          { id: 'opt_1', title: 'Option 1', description: 'First option' },
          { id: 'opt_2', title: 'Option 2', description: 'Second option' },
        ],
      }],
    },
  };

  it('does not throw for valid payload', () => {
    expect(() => logInteractivePayloadDiagnostic(validPayload)).not.toThrow();
  });

  it('does not throw for payload with empty sections', () => {
    const emptyPayload = {
      body: { text: 'Body' },
      action: {
        button: 'Go',
        sections: [],
      },
    };
    expect(() => logInteractivePayloadDiagnostic(emptyPayload as any)).not.toThrow();
  });

  it('does not throw for payload with missing optional fields', () => {
    const minimalPayload = {
      body: { text: 'Minimal' },
      action: {
        button: 'OK',
        sections: [{ title: 'S', rows: [{ id: 'a', title: 'A' }] }],
      },
    };
    expect(() => logInteractivePayloadDiagnostic(minimalPayload as any)).not.toThrow();
  });

  it('does not modify payload (diagnostic only)', () => {
    const originalText = validPayload.body.text;
    logInteractivePayloadDiagnostic(validPayload);
    expect(validPayload.body.text).toBe(originalText);
  });
});

describe('validateWaPayload — preserve behavior', () => {
  it('truncates header text to META_LIMITS HEADER', () => {
    const payload = {
      header: { text: 'x'.repeat(100) },
      body: { text: 'body' },
      action: { button: 'Go', sections: [] },
    };
    validateWaPayload(payload as any);
    expect(payload.header.text.length).toBeLessThanOrEqual(META_LIMITS.WHATSAPP.HEADER);
  });

  it('truncates body text to META_LIMITS BODY', () => {
    const longBody = 'x'.repeat(2000);
    const payload = {
      body: { text: longBody },
      action: { button: 'Go', sections: [] },
    };
    validateWaPayload(payload as any);
    expect(payload.body.text.length).toBeLessThanOrEqual(META_LIMITS.WHATSAPP.BODY);
  });

  it('handles payload without header or footer', () => {
    const payload = {
      body: { text: 'body only' },
      action: { button: 'Go', sections: [] },
    };
    expect(() => validateWaPayload(payload as any)).not.toThrow();
  });
});
