/**
 * Envelope encryption for BYOK API keys.
 *
 * Keys are encrypted at rest with AES-256-GCM. The 32-byte key is derived
 * deterministically from `ENCRYPTION_KEY_FOR_LLM_KEYS` via SHA-256 so operators
 * can supply any sufficiently strong secret. Ciphertext is stored as
 * `v1:<iv>:<authTag>:<ciphertext>` (all base64). Plaintext keys are NEVER
 * persisted or returned to clients — only `maskSecret()` output is ever shown.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 8) {
    throw new Error('ENCRYPTION_KEY_FOR_LLM_KEYS is missing or too short');
  }
  return createHash('sha256').update(secret, 'utf8').digest(); // 32 bytes
}

/** Encrypt a plaintext secret. Returns an opaque, self-describing token. */
export function encryptSecret(plaintext: string, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    ':',
  );
}

/** Decrypt a token produced by {@link encryptSecret}. Throws on tampering. */
export function decryptSecret(token: string, encryptionKey: string): string {
  const parts = token.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted secret');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = deriveKey(encryptionKey);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/**
 * Produce a masked display form of a secret, e.g. `sk-pr…AB12`. Reveals only a
 * short prefix and suffix; everything else is elided. Safe to store and show.
 */
export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return '••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}…${suffix}`;
}
