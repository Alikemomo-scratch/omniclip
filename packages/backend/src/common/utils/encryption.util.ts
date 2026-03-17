import * as crypto from 'node:crypto';

// Use a fixed 32-byte key for AES-256-CBC
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-byte-key-123456789012';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export function encryptAuthData(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const text = JSON.stringify(data);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptAuthData(encryptedData: string | null): Record<string, unknown> | null {
  if (!encryptedData) return null;

  try {
    // Check if it's already an unencrypted object (legacy data)
    if (typeof encryptedData === 'object') return encryptedData;
    if (typeof encryptedData === 'string' && encryptedData.startsWith('{')) {
      return JSON.parse(encryptedData);
    }

    const textParts = encryptedData.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString());
  } catch (error) {
    console.error('Failed to decrypt auth data', error);
    return null;
  }
}
