import { Injectable } from '@nestjs/common';
import { encryptSecret, decryptSecret, maskSecret } from '@signalkit/llm';
import { requireEnv, optionalEnv } from '@signalkit/config';

/**
 * Wraps the @signalkit/llm envelope-encryption primitives with the platform
 * encryption key. The key is read once at construction; in production it is a
 * required secret (asserted at boot in main.ts).
 */
@Injectable()
export class CryptoService {
  private readonly key: string;

  constructor() {
    this.key =
      optionalEnv('NODE_ENV', 'development') === 'production'
        ? requireEnv('ENCRYPTION_KEY_FOR_LLM_KEYS')
        : optionalEnv('ENCRYPTION_KEY_FOR_LLM_KEYS', 'dev-insecure-encryption-key-please-change');
  }

  encrypt(plaintext: string): string {
    return encryptSecret(plaintext, this.key);
  }

  decrypt(token: string): string {
    return decryptSecret(token, this.key);
  }

  mask(secret: string): string {
    return maskSecret(secret);
  }
}
