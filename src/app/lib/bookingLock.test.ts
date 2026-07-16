import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBookingIdempotent } from './bookingLock';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockTx = {
  idempotencyLock: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  booking: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
};

vi.mock('./prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
  },
}));

vi.mock('./metrics', () => ({
  metrics: {},
}));

// Use plain strings so the test has zero dependency on Prisma-generated enums.
// The production function receives these at runtime and compares them with
// BookingSource.instagram / BookingSource.whatsapp via ===, so passing the
// matching string literals is correct.
const WHATSAPP = 'whatsapp';
const INSTAGRAM = 'instagram';

// ─── Test Data ──────────────────────────────────────────────────────────────────

const DEFAULT_DATA = {
  doctorId: 'doc-1',
  doctorNameAr: 'دكتور',
  doctorNameEn: 'Doctor',
  serviceAr: 'استشارة',
  serviceEn: 'Consultation',
  date: '2026-07-20',
  time: '10:00',
  name: 'Test Patient',
  callTimeAr: 'الصباح',
  callTimeEn: 'Morning',
};

const PHONE_A = '966501234567';
const PHONE_B = '966507654321';
const BOOKING_ID_A = 'booking-id-a';
const CID = 'test-cid-001';

function resetMocks() {
  vi.clearAllMocks();
  mockTx.idempotencyLock.findUnique.mockResolvedValue(null);
  mockTx.idempotencyLock.create.mockResolvedValue({});
  mockTx.idempotencyLock.update.mockResolvedValue({});
  mockTx.idempotencyLock.delete.mockResolvedValue({});
  mockTx.booking.create.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });
  mockTx.booking.findFirst.mockResolvedValue(null);
}

// ─── P2002 Handler Tests (the security-critical fix) ────────────────────────────

describe('createBookingIdempotent — P2002 handler', () => {
  beforeEach(resetMocks);

  it('Scenario 1: same patient same slot — returns existing booking idempotently', async () => {
    mockTx.booking.create.mockRejectedValue({ code: 'P2002' });
    mockTx.booking.findFirst.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });

    const result = await createBookingIdempotent(PHONE_A, DEFAULT_DATA, WHATSAPP, CID);

    expect(result).toEqual({ id: BOOKING_ID_A, created: false, existing: true });
  });

  it('Scenario 2: different phone same slot — throws "This time slot is already booked"', async () => {
    mockTx.booking.create.mockRejectedValue({ code: 'P2002' });
    mockTx.booking.findFirst.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });

    await expect(
      createBookingIdempotent(PHONE_B, DEFAULT_DATA, WHATSAPP, CID)
    ).rejects.toThrow('This time slot is already booked');
  });

  it('Scenario 3: Patient B never receives Patient A booking id', async () => {
    mockTx.booking.create.mockRejectedValue({ code: 'P2002' });
    mockTx.booking.findFirst.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });

    let error: unknown = null;
    try {
      await createBookingIdempotent(PHONE_B, DEFAULT_DATA, WHATSAPP, CID);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('This time slot is already booked');
  });

  it('Scenario 4: concurrent duplicate — only one booking created, second gets conflict', async () => {
    // First booking (Patient A) succeeds
    const resultA = await createBookingIdempotent(PHONE_A, DEFAULT_DATA, WHATSAPP, CID);
    expect(resultA.created).toBe(true);
    expect(resultA.id).toBe(BOOKING_ID_A);

    resetMocks();

    // Second booking (Patient B, same slot) — P2002
    mockTx.booking.create.mockRejectedValue({ code: 'P2002' });
    mockTx.booking.findFirst.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });

    await expect(
      createBookingIdempotent(PHONE_B, DEFAULT_DATA, WHATSAPP, CID)
    ).rejects.toThrow('This time slot is already booked');
  });

  it('Scenario 5: expired lock + same phone + P2002 — returns existing booking', async () => {
    // Lock existed but expired
    mockTx.idempotencyLock.findUnique.mockResolvedValue({
      key: `booking:doc-1:2026-07-20:10:00:${PHONE_A}`,
      status: 'locked',
      expiresAt: new Date(Date.now() - 1000),
      bookingId: null,
    });
    // Booking already exists (was created by the expired-lock request)
    mockTx.booking.create.mockRejectedValue({ code: 'P2002' });
    mockTx.booking.findFirst.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });

    const result = await createBookingIdempotent(PHONE_A, DEFAULT_DATA, WHATSAPP, CID);

    // Same patient, same slot — idempotent return
    expect(result).toEqual({ id: BOOKING_ID_A, created: false, existing: true });
  });

  it('Scenario 6: expired lock + different phone + P2002 — throws conflict, no booking leak', async () => {
    mockTx.idempotencyLock.findUnique.mockResolvedValue({
      key: `booking:doc-1:2026-07-20:10:00:${PHONE_B}`,
      status: 'locked',
      expiresAt: new Date(Date.now() - 1000),
      bookingId: null,
    });
    mockTx.booking.create.mockRejectedValue({ code: 'P2002' });
    mockTx.booking.findFirst.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });

    await expect(
      createBookingIdempotent(PHONE_B, DEFAULT_DATA, WHATSAPP, CID)
    ).rejects.toThrow('This time slot is already booked');
  });

  it('Instagram: P2002 with same whatsappNumber — returns existing booking', async () => {
    const igData = { ...DEFAULT_DATA, whatsappNumber: PHONE_A };
    mockTx.booking.create.mockRejectedValue({ code: 'P2002' });
    mockTx.booking.findFirst.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });

    const result = await createBookingIdempotent('ig_psid_abc', igData, INSTAGRAM, CID);

    expect(result).toEqual({ id: BOOKING_ID_A, created: false, existing: true });
  });

  it('Instagram: P2002 with different whatsappNumber — throws conflict', async () => {
    const igData = { ...DEFAULT_DATA, whatsappNumber: PHONE_B };
    mockTx.booking.create.mockRejectedValue({ code: 'P2002' });
    mockTx.booking.findFirst.mockResolvedValue({ id: BOOKING_ID_A, phone: PHONE_A });

    await expect(
      createBookingIdempotent('ig_psid_abc', igData, INSTAGRAM, CID)
    ).rejects.toThrow('This time slot is already booked');
  });
});

// ─── Normal Flow Tests (no P2002) ──────────────────────────────────────────────

describe('createBookingIdempotent — normal flow', () => {
  beforeEach(resetMocks);

  it('creates a new booking successfully', async () => {
    const result = await createBookingIdempotent(PHONE_A, DEFAULT_DATA, WHATSAPP, CID);

    expect(result.created).toBe(true);
    expect(result.id).toBe(BOOKING_ID_A);
    expect(mockTx.booking.create).toHaveBeenCalledOnce();
  });

  it('returns existing booking from completed lock (idempotent)', async () => {
    mockTx.idempotencyLock.findUnique.mockResolvedValue({
      key: `booking:doc-1:2026-07-20:10:00:${PHONE_A}`,
      status: 'completed',
      expiresAt: new Date(Date.now() + 30000),
      bookingId: BOOKING_ID_A,
    });

    const result = await createBookingIdempotent(PHONE_A, DEFAULT_DATA, WHATSAPP, CID);

    expect(result).toEqual({ id: BOOKING_ID_A, created: false, existing: true });
    expect(mockTx.booking.create).not.toHaveBeenCalled();
  });

  it('throws "Booking already in progress" when lock is active', async () => {
    mockTx.idempotencyLock.findUnique.mockResolvedValue({
      key: `booking:doc-1:2026-07-20:10:00:${PHONE_A}`,
      status: 'locked',
      expiresAt: new Date(Date.now() + 30000),
      bookingId: null,
    });

    await expect(
      createBookingIdempotent(PHONE_A, DEFAULT_DATA, WHATSAPP, CID)
    ).rejects.toThrow('Booking already in progress');
  });

  it('cleans up expired lock before proceeding', async () => {
    // Lock exists but expired
    mockTx.idempotencyLock.findUnique.mockResolvedValue({
      key: `booking:doc-1:2026-07-20:10:00:${PHONE_A}`,
      status: 'locked',
      expiresAt: new Date(Date.now() - 1000),
      bookingId: null,
    });

    const result = await createBookingIdempotent(PHONE_A, DEFAULT_DATA, WHATSAPP, CID);

    expect(result.created).toBe(true);
    expect(mockTx.idempotencyLock.delete).toHaveBeenCalled();
    expect(mockTx.idempotencyLock.create).toHaveBeenCalled();
    expect(mockTx.booking.create).toHaveBeenCalled();
  });

  it('includes instagramPsid for Instagram bookings', async () => {
    const igPsid = 'ig_psid_xyz789';
    await createBookingIdempotent(igPsid, DEFAULT_DATA, INSTAGRAM, CID);

    expect(mockTx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ instagramPsid: igPsid.replace(/^ig_/, '') }),
      })
    );
  });

  it('uses whatsappNumber as phone for Instagram bookings', async () => {
    const igData = { ...DEFAULT_DATA, whatsappNumber: PHONE_A };
    await createBookingIdempotent('ig_psid_abc', igData, INSTAGRAM, CID);

    expect(mockTx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: PHONE_A }),
      })
    );
  });
});
