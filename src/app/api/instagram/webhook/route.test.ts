import { describe, it, expect } from 'vitest';

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
