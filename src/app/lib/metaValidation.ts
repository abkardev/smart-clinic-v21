import { logger } from './logger';

export interface MetaErrorInfo {
  code?: number;
  type?: string;
  message?: string;
  details?: string;
  fbtraceId?: string;
}

export function parseMetaError(body: string): MetaErrorInfo | null {
  try {
    const parsed = JSON.parse(body);
    const err = parsed?.error;
    if (!err) return null;
    return {
      code: err.code,
      type: err.type,
      message: err.message,
      details: err.error_data?.details,
      fbtraceId: err.fbtrace_id,
    };
  } catch {
    return null;
  }
}

export const META_LIMITS = {
  WHATSAPP: {
    ROW_TITLE: 24,
    ROW_DESCRIPTION: 72,
    BUTTON: 20,
    HEADER: 60,
    BODY: 1024,
    FOOTER: 60,
    SECTION_TITLE: 24,
  },
  INSTAGRAM: {
    QUICK_REPLY_TITLE: 20,
    QUICK_REPLY_LIMIT: 13,
  },
} as const;

export function truncate(str: string, max: number): string {
  const chars = Array.from(str);
  if (chars.length <= max) return str;
  return chars.slice(0, max - 1).join('') + '…';
}

function clean(s: string): string {
  return s.replace(/\*+/g, '').trim();
}

function pickShorter(a: string, b: string): string {
  return clean(a).length <= clean(b).length ? clean(a) : clean(b);
}

export function waRowTitle(ar: string, en: string): string {
  return truncate(pickShorter(ar, en), META_LIMITS.WHATSAPP.ROW_TITLE);
}

export function waRowDescription(ar: string, en: string): string {
  return truncate(`${ar} / ${en}`, META_LIMITS.WHATSAPP.ROW_DESCRIPTION);
}

export function waSectionTitle(ar: string, en: string): string {
  return truncate(pickShorter(ar, en), META_LIMITS.WHATSAPP.SECTION_TITLE);
}

export function waButtonLabel(ar: string, en: string): string {
  return truncate(pickShorter(ar, en), META_LIMITS.WHATSAPP.BUTTON);
}

export function waHeader(text: string): string {
  return truncate(text, META_LIMITS.WHATSAPP.HEADER);
}

export function waBody(text: string): string {
  return truncate(text, META_LIMITS.WHATSAPP.BODY);
}

export function waFooter(text: string): string {
  return truncate(text, META_LIMITS.WHATSAPP.FOOTER);
}

export function igQuickReplyTitle(ar: string, en: string): string {
  return truncate(pickShorter(ar, en), META_LIMITS.INSTAGRAM.QUICK_REPLY_TITLE);
}

export function validateWaRow(row: { id: string; title: string; description?: string }): void {
  if (row.title.length > META_LIMITS.WHATSAPP.ROW_TITLE) {
    row.title = truncate(row.title, META_LIMITS.WHATSAPP.ROW_TITLE);
  }
  if (row.description && row.description.length > META_LIMITS.WHATSAPP.ROW_DESCRIPTION) {
    row.description = truncate(row.description, META_LIMITS.WHATSAPP.ROW_DESCRIPTION);
  }
}

export function validateWaSection(section: { title: string; rows: Array<{ id: string; title: string; description?: string }> }): void {
  if (section.title.length > META_LIMITS.WHATSAPP.SECTION_TITLE) {
    section.title = truncate(section.title, META_LIMITS.WHATSAPP.SECTION_TITLE);
  }
  section.rows.forEach(validateWaRow);
}

export function validateListIntegrity(payload: {
  action: { button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };
}): void {
  const { sections, button } = payload.action;

  if (!button || button.trim().length === 0) {
    logger.warn('[Meta] List button label is empty');
  }

  const seenIds = new Set<string>();

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];

    if (!section.title || section.title.trim().length === 0) {
      logger.warn('[Meta] Section title is empty', { sectionIndex: si });
    }

    if (!section.rows || section.rows.length === 0) {
      logger.warn('[Meta] Section has no rows', { sectionIndex: si, title: section.title });
      continue;
    }

    for (let ri = 0; ri < section.rows.length; ri++) {
      const row = section.rows[ri];

      if (!row.title || row.title.trim().length === 0) {
        logger.warn('[Meta] Row title is empty', { sectionIndex: si, rowIndex: ri, rowId: row.id });
      }

      if (row.id && seenIds.has(row.id)) {
        logger.warn('[Meta] Duplicate row ID', { rowId: row.id, sectionIndex: si, rowIndex: ri });
      }
      if (row.id) seenIds.add(row.id);
    }
  }
}

export function validateWaPayload(payload: {
  header?: { text: string };
  body: { text: string };
  footer?: { text: string };
  action: { button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };
}): void {
  if (payload.header) payload.header.text = waHeader(payload.header.text);
  payload.body.text = waBody(payload.body.text);
  if (payload.footer) payload.footer.text = waFooter(payload.footer.text);
  payload.action.button = truncate(payload.action.button, META_LIMITS.WHATSAPP.BUTTON);
  payload.action.sections.forEach(validateWaSection);
  validateListIntegrity(payload);
}
