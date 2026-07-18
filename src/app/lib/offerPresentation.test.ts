import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidMediaUrl,
  buildOfferCaption,
  sendOfferMediaCard,
  presentOffers,
  OFFERS_PAGE_SIZE,
  BotAdapter,
  OfferCard,
} from './offerPresentation';

vi.mock('./prisma', () => ({
  prisma: {
    offer: {
      findMany: vi.fn(),
    },
  },
}));

const mockSendText = vi.fn();
const mockSendList = vi.fn();
const mockSendMedia = vi.fn();

function createAdapter(hasMedia = true): BotAdapter {
  return {
    sendText: mockSendText,
    sendList: mockSendList,
    ...(hasMedia ? { sendMedia: mockSendMedia } : {}),
  };
}

function makeOffer(overrides: Partial<OfferCard> = {}): OfferCard {
  return {
    id: 'offer-1',
    titleAr: 'عرض تنظيف',
    titleEn: 'Cleaning Offer',
    descriptionAr: 'جلسة تنظيف احترافية',
    descriptionEn: 'Professional cleaning session',
    imageUrl: 'https://example.com/img.jpg',
    code: 'CLEAN20',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── isValidMediaUrl ────────────────────────────────────────────────────────────

describe('isValidMediaUrl', () => {
  it('returns true for valid HTTPS image URL', () => {
    expect(isValidMediaUrl('https://example.com/image.jpg')).toBe(true);
    expect(isValidMediaUrl('https://example.com/img.png')).toBe(true);
    expect(isValidMediaUrl('https://example.com/img.gif')).toBe(true);
    expect(isValidMediaUrl('https://example.com/img.webp')).toBe(true);
    expect(isValidMediaUrl('https://example.com/img.jpeg')).toBe(true);
  });

  it('returns false for null or undefined', () => {
    expect(isValidMediaUrl(null)).toBe(false);
    expect(isValidMediaUrl(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidMediaUrl('')).toBe(false);
  });

  it('returns false for HTTP (not HTTPS)', () => {
    expect(isValidMediaUrl('http://example.com/image.jpg')).toBe(false);
  });

  it('returns false for unsupported extension', () => {
    expect(isValidMediaUrl('https://example.com/image.svg')).toBe(false);
    expect(isValidMediaUrl('https://example.com/image.bmp')).toBe(false);
    expect(isValidMediaUrl('https://example.com/image.pdf')).toBe(false);
  });

  it('returns false for relative URL', () => {
    expect(isValidMediaUrl('/uploads/offers/img.jpg')).toBe(false);
  });

  it('returns false for data URL', () => {
    expect(isValidMediaUrl('data:image/png;base64,iVBOR')).toBe(false);
  });

  it('returns false for malformed URL', () => {
    expect(isValidMediaUrl('not-a-url')).toBe(false);
  });
});

// ─── buildOfferCaption ─────────────────────────────────────────────────────────

describe('buildOfferCaption', () => {
  it('includes offer number, title, description and code', () => {
    const offer = makeOffer();
    const caption = buildOfferCaption(offer, 1);
    expect(caption).toContain('العرض #1');
    expect(caption).toContain('Offer #1');
    expect(caption).toContain('عرض تنظيف');
    expect(caption).toContain('Cleaning Offer');
    expect(caption).toContain('جلسة تنظيف احترافية');
    expect(caption).toContain('Professional cleaning session');
    expect(caption).toContain('CLEAN20');
  });

  it('omits code when not available', () => {
    const offer = makeOffer({ code: null });
    const caption = buildOfferCaption(offer, 3);
    expect(caption).toContain('Offer #3');
    expect(caption).not.toContain('كود الخصم');
    expect(caption).not.toContain('Code:');
  });

  it('omits description when not available', () => {
    const offer = makeOffer({ descriptionAr: null, descriptionEn: null });
    const caption = buildOfferCaption(offer, 2);
    expect(caption).toContain('Offer #2');
    expect(caption).not.toContain('undefined');
  });

  it('includes Arabic and English sections separated by separator', () => {
    const offer = makeOffer();
    const caption = buildOfferCaption(offer, 1);
    expect(caption).toContain('— — —');
    const [arPart, enPart] = caption.split('\n— — —\n\n');
    expect(arPart).toContain('العرض #1');
    expect(enPart).toContain('Offer #1');
  });
});

// ─── sendOfferMediaCard ────────────────────────────────────────────────────────

describe('sendOfferMediaCard', () => {
  it('sends media message when sendMedia exists and URL is valid', async () => {
    const adapter = createAdapter(true);
    const offer = makeOffer({ imageUrl: 'https://example.com/pic.jpg' });

    await sendOfferMediaCard(adapter, 'user-1', offer, 1);

    expect(mockSendMedia).toHaveBeenCalledTimes(1);
    expect(mockSendMedia).toHaveBeenCalledWith(
      'user-1', 'image', 'https://example.com/pic.jpg',
      expect.stringContaining('Offer #1'),
    );
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('falls back to text when sendMedia does not exist', async () => {
    const adapter = createAdapter(false);
    const offer = makeOffer({ imageUrl: 'https://example.com/pic.jpg' });

    await sendOfferMediaCard(adapter, 'user-1', offer, 1);

    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledWith('user-1', expect.stringContaining('Offer #1'));
  });

  it('falls back to text when imageUrl is null', async () => {
    const adapter = createAdapter(true);
    const offer = makeOffer({ imageUrl: null });

    await sendOfferMediaCard(adapter, 'user-1', offer, 1);

    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it('falls back to text when imageUrl is invalid (http)', async () => {
    const adapter = createAdapter(true);
    const offer = makeOffer({ imageUrl: 'http://example.com/pic.jpg' });

    await sendOfferMediaCard(adapter, 'user-1', offer, 1);

    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it('falls back to text when sendMedia throws', async () => {
    const adapter = createAdapter(true);
    mockSendMedia.mockRejectedValueOnce(new Error('Meta API error'));
    const offer = makeOffer({ imageUrl: 'https://example.com/pic.jpg' });

    await sendOfferMediaCard(adapter, 'user-1', offer, 1);

    expect(mockSendMedia).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledWith('user-1', expect.stringContaining('Offer #1'));
  });

  it('sends correct caption in fallback text', async () => {
    const adapter = createAdapter(true);
    const offer = makeOffer({ imageUrl: null });

    await sendOfferMediaCard(adapter, 'user-1', offer, 3);

    expect(mockSendText).toHaveBeenCalledWith('user-1', expect.stringContaining('Offer #3'));
  });

  it('never throws — catches all errors', async () => {
    const adapter = createAdapter(true);
    mockSendMedia.mockRejectedValueOnce(new Error('Network failure'));
    mockSendText.mockRejectedValueOnce(new Error('Text also failed'));

    await expect(
      sendOfferMediaCard(adapter, 'user-1', makeOffer({ imageUrl: 'https://example.com/pic.jpg' }), 1),
    ).resolves.toBeUndefined();
  });
});

// ─── presentOffers ────────────────────────────────────────────────────────────

describe('presentOffers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends noOffers text when no active offers exist', async () => {
    const adapter = createAdapter(true);
    const { prisma } = await import('./prisma');
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce([]);

    const result = await presentOffers(adapter, 'user-1', 1);

    expect(result).toBe('offers');
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledWith('user-1', expect.stringContaining('لا توجد عروض'));
    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(mockSendList).not.toHaveBeenCalled();
  });

  it('sends media card and selection list for each offer on page 1', async () => {
    const adapter = createAdapter(true);
    const { prisma } = await import('./prisma');
    const offers = [
      makeOffer({ id: 'o1', imageUrl: 'https://example.com/1.jpg' }),
      makeOffer({ id: 'o2', titleAr: 'عرض ٢', titleEn: 'Offer 2', imageUrl: 'https://example.com/2.jpg' }),
    ];
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    const result = await presentOffers(adapter, 'user-1', 1);

    expect(result).toBe('offers');
    expect(mockSendMedia).toHaveBeenCalledTimes(2);
    expect(mockSendMedia).toHaveBeenNthCalledWith(1, 'user-1', 'image', 'https://example.com/1.jpg', expect.stringContaining('Offer #1'));
    expect(mockSendMedia).toHaveBeenNthCalledWith(2, 'user-1', 'image', 'https://example.com/2.jpg', expect.stringContaining('Offer #2'));
    expect(mockSendList).toHaveBeenCalledTimes(1);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('sends text fallback for offers without valid images', async () => {
    const adapter = createAdapter(true);
    const { prisma } = await import('./prisma');
    const offers = [
      makeOffer({ id: 'o1', imageUrl: null }),
    ];
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    await presentOffers(adapter, 'user-1', 1);

    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledWith('user-1', expect.stringContaining('Offer #1'));
    expect(mockSendList).toHaveBeenCalledTimes(1);
  });

  it('includes Book Now and Next on first page with multiple pages', async () => {
    const adapter = createAdapter(true);
    const { prisma } = await import('./prisma');
    const offers = Array.from({ length: OFFERS_PAGE_SIZE + 1 }, (_, i) =>
      makeOffer({ id: `o${i + 1}`, titleAr: `عرض ${i + 1}`, titleEn: `Offer ${i + 1}`, imageUrl: 'https://example.com/img.jpg' }),
    );
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    await presentOffers(adapter, 'user-1', 1);

    expect(mockSendMedia).toHaveBeenCalledTimes(OFFERS_PAGE_SIZE);
    expect(mockSendList).toHaveBeenCalledTimes(1);
    const listCall = mockSendList.mock.calls[0];
    const sections = listCall[4];
    const actionRows = sections[0].rows;
    const rowIds = actionRows.map((r: { id: string }) => r.id);
    expect(rowIds).toContain('menu_book');
    expect(rowIds).toContain('offers_next_page');
    expect(rowIds).not.toContain('offers_prev_page');
    expect(sections[1].rows.map((r: { id: string }) => r.id)).toEqual(['back', 'main_menu', 'cancel']);
  });

  it('includes Previous but not Next on last page', async () => {
    const adapter = createAdapter(true);
    const { prisma } = await import('./prisma');
    const offers = Array.from({ length: OFFERS_PAGE_SIZE + 1 }, (_, i) =>
      makeOffer({ id: `o${i + 1}`, titleAr: `عرض ${i + 1}`, titleEn: `Offer ${i + 1}`, imageUrl: 'https://example.com/img.jpg' }),
    );
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    await presentOffers(adapter, 'user-1', 2);

    const listCall = mockSendList.mock.calls[0];
    const rowIds = listCall[4][0].rows.map((r: { id: string }) => r.id);
    expect(rowIds).toContain('menu_book');
    expect(rowIds).toContain('offers_prev_page');
    expect(rowIds).not.toContain('offers_next_page');
  });

  it('includes both Next and Previous on middle pages', async () => {
    const adapter = createAdapter(true);
    const { prisma } = await import('./prisma');
    const offers = Array.from({ length: OFFERS_PAGE_SIZE * 3 }, (_, i) =>
      makeOffer({ id: `o${i + 1}`, titleAr: `عرض ${i + 1}`, titleEn: `Offer ${i + 1}`, imageUrl: 'https://example.com/img.jpg' }),
    );
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    await presentOffers(adapter, 'user-1', 2);

    const listCall = mockSendList.mock.calls[0];
    const rowIds = listCall[4][0].rows.map((r: { id: string }) => r.id);
    expect(rowIds).toContain('menu_book');
    expect(rowIds).toContain('offers_next_page');
    expect(rowIds).toContain('offers_prev_page');
  });

  it('clamps page number within valid range', async () => {
    const adapter = createAdapter(true);
    const { prisma } = await import('./prisma');
    const offers = [
      makeOffer({ id: 'o1', imageUrl: null }),
    ];
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    await presentOffers(adapter, 'user-1', 99);

    expect(mockSendList).toHaveBeenCalledTimes(1);
  });

  it('offers are numbered globally across pages', async () => {
    const adapter = createAdapter(true);
    const { prisma } = await import('./prisma');
    const offers = Array.from({ length: OFFERS_PAGE_SIZE * 2 + 1 }, (_, i) =>
      makeOffer({ id: `o${i + 1}`, titleAr: `عرض ${i + 1}`, titleEn: `Offer ${i + 1}`, imageUrl: 'https://example.com/img.jpg' }),
    );
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    await presentOffers(adapter, 'user-1', 1);
    expect(mockSendMedia).toHaveBeenCalledTimes(OFFERS_PAGE_SIZE);
    expect(mockSendMedia).toHaveBeenNthCalledWith(1, 'user-1', 'image', 'https://example.com/img.jpg', expect.stringContaining('Offer #1'));
    expect(mockSendMedia).toHaveBeenNthCalledWith(OFFERS_PAGE_SIZE, 'user-1', 'image', 'https://example.com/img.jpg', expect.stringContaining(`Offer #${OFFERS_PAGE_SIZE}`));
  });

  it('works without sendMedia on adapter (Instagram compat)', async () => {
    const adapter = createAdapter(false);
    const { prisma } = await import('./prisma');
    const offers = [
      makeOffer({ id: 'o1', imageUrl: 'https://example.com/1.jpg' }),
      makeOffer({ id: 'o2', imageUrl: 'https://example.com/2.jpg' }),
    ];
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    await presentOffers(adapter, 'user-1', 1);

    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledTimes(2);
    expect(mockSendList).toHaveBeenCalledTimes(1);
  });

  it('continues when one media send fails', async () => {
    const adapter = createAdapter(true);
    mockSendMedia
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockResolvedValueOnce(undefined);
    const { prisma } = await import('./prisma');
    const offers = [
      makeOffer({ id: 'o1', imageUrl: 'https://example.com/1.jpg' }),
      makeOffer({ id: 'o2', imageUrl: 'https://example.com/2.jpg' }),
      makeOffer({ id: 'o3', imageUrl: 'https://example.com/3.jpg' }),
    ];
    vi.mocked(prisma.offer.findMany).mockResolvedValueOnce(offers as any);

    await expect(presentOffers(adapter, 'user-1', 1)).resolves.toBe('offers');

    expect(mockSendMedia).toHaveBeenCalledTimes(3);
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendList).toHaveBeenCalledTimes(1);
  });
});
