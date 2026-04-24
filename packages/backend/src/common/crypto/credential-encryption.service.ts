import { Injectable } from '@nestjs/common';
import { decryptAuthData, encryptAuthData } from '../utils/encryption.util';

@Injectable()
export class CredentialEncryptionService {
  private readonly encryptionKey: string | undefined;

  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY;
  }

  encrypt(data: Record<string, unknown> | null): string | null {
    void this.encryptionKey;
    return encryptAuthData(data);
  }

  decrypt(encryptedData: string | null): Record<string, unknown> | null {
    void this.encryptionKey;
    return decryptAuthData(encryptedData);
  }
}
