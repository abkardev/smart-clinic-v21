export function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing environment variable: ${name}\n` +
      `Set it in .env.local or your deployment environment variables.`
    );
  }
  return val;
}

export function optional(name: string): string | undefined {
  return process.env[name];
}

export function optionalWithDefault(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const META_REQUIRED = {
  WHATSAPP: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'],
  INSTAGRAM: ['INSTAGRAM_TOKEN'],
} as const;

export const META_OPTIONAL = {
  WHATSAPP: ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'],
  INSTAGRAM: ['INSTAGRAM_VERIFY_TOKEN', 'INSTAGRAM_APP_SECRET'],
} as const;
