import type { Sender } from './template';

/**
 * De afzender op de flyer. Uit omgevingsvariabelen zodat je hem kunt wijzigen
 * zonder de code aan te raken.
 */
export function senderFromEnv(): { sender: Sender; missing: string[] } {
  const sender: Sender = {
    name: process.env.FLYER_BUSINESS_NAME ?? '',
    website: process.env.FLYER_WEBSITE ?? '',
    email: process.env.FLYER_EMAIL ?? '',
    phone: process.env.FLYER_PHONE ?? '',
  };

  const missing = Object.entries(sender)
    .filter(([, value]) => value.trim() === '')
    .map(([key]) => `FLYER_${key.toUpperCase()}`);

  return { sender, missing };
}
