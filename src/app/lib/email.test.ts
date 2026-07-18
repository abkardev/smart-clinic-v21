import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockResendSend = vi.fn();

vi.mock('resend', () => {
  const mockInstance = {
    emails: { send: mockResendSend },
  };
  return {
    Resend: function Resend() { return mockInstance; },
  };
});

function setEnv(overrides: Record<string, string>) {
  vi.stubEnv('RESEND_API_KEY', overrides.RESEND_API_KEY ?? 're_test_key');
  vi.stubEnv('EMAIL_FROM', overrides.EMAIL_FROM ?? 'noreply@smartclinic.com');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', overrides.NEXT_PUBLIC_APP_URL ?? 'https://app.smartclinic.com');
}

describe('sendPasswordResetEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends email successfully', async () => {
    vi.resetModules();
    setEnv({});
    mockResendSend.mockResolvedValueOnce({ data: { id: 'email_123' }, error: null });

    const { sendPasswordResetEmail } = await import('./email');

    await expect(
      sendPasswordResetEmail('user@example.com', 'Ahmed', 'token123', 'en'),
    ).resolves.toBeUndefined();

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.from).toBe('noreply@smartclinic.com');
    expect(callArgs.to).toBe('user@example.com');
    expect(callArgs.subject).toContain('Reset Your Password');
    expect(callArgs.html).toContain('Hello Ahmed');
    expect(callArgs.html).toContain('https://app.smartclinic.com/reset-password/token123');
  });

  it('sends bilingual Arabic email when lang is ar', async () => {
    vi.resetModules();
    setEnv({});
    mockResendSend.mockResolvedValueOnce({ data: { id: 'email_123' }, error: null });

    const { sendPasswordResetEmail } = await import('./email');

    await sendPasswordResetEmail('user@example.com', 'أحمد', 'token456', 'ar');

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.subject).toContain('إعادة تعيين كلمة المرور');
    expect(callArgs.html).toContain('مرحباً أحمد');
    expect(callArgs.html).toContain('dir="rtl"');
  });

  it('throws when Resend provider rejects', async () => {
    vi.resetModules();
    setEnv({});
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid email address' },
    });

    const { sendPasswordResetEmail } = await import('./email');

    await expect(
      sendPasswordResetEmail('bad@example.com', 'User', 'tok', 'en'),
    ).rejects.toThrow('Failed to send password reset email: Invalid email address');
  });

  it('throws when RESEND_API_KEY is missing', async () => {
    vi.resetModules();
    setEnv({ RESEND_API_KEY: '' });

    const { sendPasswordResetEmail } = await import('./email');

    await expect(
      sendPasswordResetEmail('user@example.com', 'User', 'tok', 'en'),
    ).rejects.toThrow('Email service is not configured');
  });

  it('throws when EMAIL_FROM is missing', async () => {
    vi.resetModules();
    setEnv({ EMAIL_FROM: '' });

    const { sendPasswordResetEmail } = await import('./email');

    await expect(
      sendPasswordResetEmail('user@example.com', 'User', 'tok', 'en'),
    ).rejects.toThrow('Email service is not configured');
  });

  it('throws when Resend.send throws unexpectedly', async () => {
    vi.resetModules();
    setEnv({});
    mockResendSend.mockRejectedValueOnce(new Error('Network error'));

    const { sendPasswordResetEmail } = await import('./email');

    await expect(
      sendPasswordResetEmail('user@example.com', 'User', 'tok', 'en'),
    ).rejects.toThrow('Failed to send password reset email. Please try again later.');
  });

  it('includes reset token in URL', async () => {
    vi.resetModules();
    setEnv({});
    mockResendSend.mockResolvedValueOnce({ data: { id: 'email_123' }, error: null });

    const { sendPasswordResetEmail } = await import('./email');

    await sendPasswordResetEmail('user@example.com', 'User', 'abc-xyz-123', 'en');

    const html = mockResendSend.mock.calls[0][0].html;
    expect(html).toContain('https://app.smartclinic.com/reset-password/abc-xyz-123');
  });

  it('falls back to localhost when NEXT_PUBLIC_APP_URL is not set', async () => {
    vi.resetModules();
    setEnv({ NEXT_PUBLIC_APP_URL: '' });
    mockResendSend.mockResolvedValueOnce({ data: { id: 'email_123' }, error: null });

    const { sendPasswordResetEmail } = await import('./email');

    await sendPasswordResetEmail('user@example.com', 'User', 'tok', 'en');

    const html = mockResendSend.mock.calls[0][0].html;
    expect(html).toContain('http://localhost:3000/reset-password/tok');
  });
});
