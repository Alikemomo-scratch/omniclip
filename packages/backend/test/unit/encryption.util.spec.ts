import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decryptAuthData, encryptAuthData } from '../../src/common/utils/encryption.util';

describe('encryption.util', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it('encrypts and decrypts a record roundtrip', () => {
    const input = { id: 1, name: 'test', enabled: true };

    const encrypted = encryptAuthData(input);
    const decrypted = decryptAuthData(encrypted);

    expect(decrypted).toEqual(input);
  });

  it('returns null for null input', () => {
    expect(encryptAuthData(null)).toBeNull();
    expect(decryptAuthData(null)).toBeNull();
  });

  it('produces different ciphertexts for the same input', () => {
    const input = { token: 'same-payload' };

    const first = encryptAuthData(input);
    const second = encryptAuthData(input);

    expect(first).not.toBe(second);
  });

  it('parses legacy plaintext JSON directly', () => {
    expect(decryptAuthData('{"key":"value"}')).toEqual({ key: 'value' });
  });

  it('returns legacy object values as-is', () => {
    const legacyObject = { key: 'value', nested: { count: 2 } };

    expect(decryptAuthData(legacyObject as any)).toBe(legacyObject);
  });

  it('returns null for corrupt data without throwing', () => {
    expect(decryptAuthData('garbage:data')).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('handles complex nested objects', () => {
    const input = {
      user: {
        id: 'u_123',
        profile: {
          name: 'Alice',
          roles: ['admin', 'editor'],
          preferences: {
            theme: 'dark',
            notifications: [
              { type: 'email', enabled: true },
              { type: 'sms', enabled: false },
            ],
          },
        },
      },
      history: [
        { action: 'login', timestamp: 1710000000000 },
        { action: 'logout', timestamp: 1710003600000 },
      ],
    };

    const encrypted = encryptAuthData(input);
    const decrypted = decryptAuthData(encrypted);

    expect(decrypted).toEqual(input);
  });

  it('roundtrips string credential payloads', () => {
    const input = { api_key: 'someBase64StringABC123==' };

    const encrypted = encryptAuthData(input);
    const decrypted = decryptAuthData(encrypted);

    expect(decrypted).toEqual(input);
  });

  it('roundtrips cookie credential payloads', () => {
    const input = { auth_token: 'abc', ct0: 'xyz' };

    const encrypted = encryptAuthData(input);
    const decrypted = decryptAuthData(encrypted);

    expect(decrypted).toEqual(input);
  });
});
