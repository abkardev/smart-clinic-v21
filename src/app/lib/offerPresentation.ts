import { prisma } from './prisma';
import { logger } from './logger';
import { MSG } from './botMessages';
import { waRowTitle, waRowDescription, waSectionTitle, waHeader, waButtonLabel } from './metaValidation';

export interface ListSection {
  title: string;
  rows: { id: string; title: string; description?: string }[];
}

export interface BotAdapter {
  sendText(to: string, text: string): Promise<void>;
  sendList(to: string, header: string, body: string, button: string, sections: ListSection[]): Promise<void>;
  sendMedia?(to: string, type: 'image', url: string, caption?: string): Promise<void>;
}

export interface OfferCard {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  imageUrl?: string | null;
  code?: string | null;
}

export const OFFERS_PAGE_SIZE = parseInt(process.env.OFFERS_PAGE_SIZE || '5', 10);

const SUPPORTED_IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;

export function isValidMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && SUPPORTED_IMAGE_EXT.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function buildOfferCaption(offer: OfferCard, number: number): string {
  let ar = `🎁 *العرض #${number}*\n`;
  ar += `*${offer.titleAr}*\n`;
  if (offer.descriptionAr) ar += `${offer.descriptionAr}\n`;
  if (offer.code) ar += `كود الخصم: \`${offer.code}\`\n`;

  let en = `🎁 *Offer #${number}*\n`;
  en += `*${offer.titleEn}*\n`;
  if (offer.descriptionEn) en += `${offer.descriptionEn}\n`;
  if (offer.code) en += `Code: \`${offer.code}\`\n`;

  return `${ar}\n— — —\n\n${en}`;
}

export async function sendOfferMediaCard(
  adapter: BotAdapter,
  userId: string,
  offer: OfferCard,
  number: number,
): Promise<void> {
  const caption = buildOfferCaption(offer, number);

  if (adapter.sendMedia && offer.imageUrl && isValidMediaUrl(offer.imageUrl)) {
    try {
      await adapter.sendMedia(userId, 'image', offer.imageUrl, caption);
      return;
    } catch (err) {
      logger.warn('[Offers] Media send failed, falling back to text', {
        offerId: offer.id, error: String(err),
      });
    }
  }

  try {
    await adapter.sendText(userId, caption);
  } catch (err) {
    logger.error('[Offers] Text fallback also failed', {
      offerId: offer.id, error: String(err),
    });
  }
}

function buildSelectionHeader(offersTotal: number, startNumber: number, endNumber: number): string {
  const ar = `🎁 *اختر العرض الذي يهمك*\n(العروض ${startNumber}-${endNumber} من ${offersTotal})`;
  const en = `🎁 *Select an offer*\n(Offers ${startNumber}-${endNumber} of ${offersTotal})`;
  return `${ar}\n— — —\n\n${en}`;
}

function navSection(): ListSection {
  return {
    title: waSectionTitle('التنقل', 'Navigation'),
    rows: [
      { id: 'back', title: '⬅️ رجوع', description: 'Back' },
      { id: 'main_menu', title: '🏠 القائمة الرئيسية', description: 'Main Menu' },
      { id: 'cancel', title: '❌ إلغاء', description: 'Cancel' },
    ],
  };
}

export async function presentOffers(
  adapter: BotAdapter,
  userId: string,
  page: number,
): Promise<'offers'> {
  const offers = await prisma.offer.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!offers.length) {
    await adapter.sendText(userId, MSG.noOffers);
    return 'offers';
  }

  const pageSize = OFFERS_PAGE_SIZE;
  const totalPages = Math.ceil(offers.length / pageSize);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIdx = (currentPage - 1) * pageSize;
  const pageOffers = offers.slice(startIdx, startIdx + pageSize);
  const startNumber = startIdx + 1;
  const endNumber = startIdx + pageOffers.length;

  for (let i = 0; i < pageOffers.length; i++) {
    await sendOfferMediaCard(adapter, userId, pageOffers[i], startNumber + i);
  }

  const actionRows: ListSection['rows'] = pageOffers.map((o, i) => ({
    id: `offer_${o.id}`,
    title: waRowTitle(`#${startNumber + i} ${o.titleAr}`, `#${startNumber + i} ${o.titleEn}`),
    description: waRowDescription(o.descriptionAr || '', o.descriptionEn || ''),
  }));

  actionRows.push({ id: 'menu_book', title: '📅 احجز الآن', description: 'Book Now' });

  if (currentPage < totalPages) {
    actionRows.push({ id: 'offers_next_page', title: '⏩ العروض التالية', description: 'Next Offers' });
  }
  if (currentPage > 1) {
    actionRows.push({ id: 'offers_prev_page', title: '⏪ العروض السابقة', description: 'Previous Offers' });
  }

  const header = buildSelectionHeader(offers.length, startNumber, endNumber);

  await adapter.sendList(
    userId,
    waHeader(`🎁 ${currentPage}/${totalPages}`),
    header,
    waButtonLabel('اختر', 'Choose'),
    [
      { title: waSectionTitle('اختر عرضاً', 'Select Offer'), rows: actionRows },
      navSection(),
    ],
  );

  return 'offers';
}
