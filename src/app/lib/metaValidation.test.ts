import { describe, it, expect } from 'vitest';
import { parseMetaError, logInteractivePayloadDiagnostic, validateWaPayload, ensureRowLimit, META_LIMITS, MAX_TOTAL_ROWS } from './metaValidation';

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

  describe('extended fields (error_subcode, error_user_title, error_user_msg)', () => {
    const tokenExpiredBody = JSON.stringify({
      error: {
        code: 190,
        type: 'OAuthException',
        message: 'Error validating access token',
        error_subcode: 460,
        error_user_title: 'Session expired',
        error_user_msg: 'Your session has expired. Please log in again.',
        error_data: { details: 'The session has been invalidated because the user changed their password.' },
        fbtrace_id: 'TokenExp123',
      },
    });

    it('captures error_subcode', () => {
      const result = parseMetaError(tokenExpiredBody);
      expect(result).not.toBeNull();
      expect(result!.errorSubcode).toBe(460);
    });

    it('captures error_user_title', () => {
      const result = parseMetaError(tokenExpiredBody);
      expect(result).not.toBeNull();
      expect(result!.errorUserTitle).toBe('Session expired');
    });

    it('captures error_user_msg', () => {
      const result = parseMetaError(tokenExpiredBody);
      expect(result).not.toBeNull();
      expect(result!.errorUserMsg).toBe('Your session has expired. Please log in again.');
    });

    it('captures error_data as raw object', () => {
      const result = parseMetaError(tokenExpiredBody);
      expect(result).not.toBeNull();
      expect(result!.errorData).toEqual({ details: 'The session has been invalidated because the user changed their password.' });
    });

    it('captures details from error_data.details', () => {
      const result = parseMetaError(tokenExpiredBody);
      expect(result).not.toBeNull();
      expect(result!.details).toBe('The session has been invalidated because the user changed their password.');
    });

    it('handles error without subcode or user fields', () => {
      const body = JSON.stringify({
        error: { code: 2, type: 'OAuthException', message: 'fail', fbtrace_id: 'x' },
      });
      const result = parseMetaError(body);
      expect(result).not.toBeNull();
      expect(result!.errorSubcode).toBeUndefined();
      expect(result!.errorUserTitle).toBeUndefined();
      expect(result!.errorUserMsg).toBeUndefined();
    });
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

function makeSections(contentCount: number, navCount: number) {
  const sections: Array<{ title: string; rows: Array<{ id: string; title: string }> }> = [];
  if (contentCount > 0) {
    sections.push({
      title: 'Content',
      rows: Array.from({ length: contentCount }, (_, i) => ({ id: `row_${i}`, title: `Option ${i + 1}` })),
    });
  }
  if (navCount > 0) {
    sections.push({
      title: 'Navigation',
      rows: Array.from({ length: navCount }, (_, i) => {
        const ids = ['back', 'main_menu', 'cancel'];
        return { id: ids[i] || `nav_${i}`, title: ids[i] || `Nav ${i + 1}` };
      }),
    });
  }
  return sections;
}

describe('ensureRowLimit', () => {
  it('passes through exactly 10 rows unchanged', () => {
    const sections = makeSections(7, 3);
    const result = ensureRowLimit(sections);
    expect(result).toBe(sections);
    expect(result.flatMap(s => s.rows).length).toBe(10);
  });

  it('passes through 9 rows unchanged', () => {
    const sections = makeSections(6, 3);
    const result = ensureRowLimit(sections);
    expect(result).toBe(sections);
    expect(result.flatMap(s => s.rows).length).toBe(9);
  });

  it('passes through 8 rows unchanged', () => {
    const sections = makeSections(5, 3);
    const result = ensureRowLimit(sections);
    expect(result).toBe(sections);
    expect(result.flatMap(s => s.rows).length).toBe(8);
  });

  it('passes through 7 rows + navigation unchanged', () => {
    const sections = makeSections(7, 3);
    const result = ensureRowLimit(sections);
    expect(result.flatMap(s => s.rows).length).toBe(10);
  });

  it('passes through 10 rows without navigation unchanged', () => {
    const sections = makeSections(10, 0);
    const result = ensureRowLimit(sections);
    expect(result).toBe(sections);
    expect(result.flatMap(s => s.rows).length).toBe(10);
  });

  it('trims 11 rows to 10, preserving nav', () => {
    const sections = makeSections(8, 3);
    expect(sections.flatMap(s => s.rows).length).toBe(11);
    const result = ensureRowLimit(sections);
    expect(result.flatMap(s => s.rows).length).toBe(10);
    const navIds = result.flatMap(s => s.rows).filter(r => ['back', 'main_menu', 'cancel'].includes(r.id));
    expect(navIds.length).toBe(3);
  });

  it('trims 13 rows to 10, preserving nav (root cause fix)', () => {
    const sections = makeSections(10, 3);
    expect(sections.flatMap(s => s.rows).length).toBe(13);
    const result = ensureRowLimit(sections);
    expect(result.flatMap(s => s.rows).length).toBe(10);
    const navIds = result.flatMap(s => s.rows).filter(r => ['back', 'main_menu', 'cancel'].includes(r.id));
    expect(navIds.length).toBe(3);
    const contentIds = result.flatMap(s => s.rows).filter(r => !['back', 'main_menu', 'cancel'].includes(r.id));
    expect(contentIds.length).toBe(7);
  });

  it('trims 20 rows to 10, preserving nav', () => {
    const sections = makeSections(17, 3);
    expect(sections.flatMap(s => s.rows).length).toBe(20);
    const result = ensureRowLimit(sections);
    expect(result.flatMap(s => s.rows).length).toBe(10);
    const navIds = result.flatMap(s => s.rows).filter(r => ['back', 'main_menu', 'cancel'].includes(r.id));
    expect(navIds.length).toBe(3);
  });

  it('trims rows without navigation to exactly MAX_TOTAL_ROWS', () => {
    const sections = makeSections(15, 0);
    const result = ensureRowLimit(sections);
    expect(result.flatMap(s => s.rows).length).toBe(MAX_TOTAL_ROWS);
  });

  it('never returns a payload exceeding 10 total rows', () => {
    for (let total = 0; total <= 30; total++) {
      const navCount = Math.min(3, Math.floor(total / 2));
      const contentCount = total - navCount;
      const sections = makeSections(contentCount, navCount);
      const result = ensureRowLimit(sections);
      expect(result.flatMap(s => s.rows).length).toBeLessThanOrEqual(MAX_TOTAL_ROWS);
    }
  });
});
