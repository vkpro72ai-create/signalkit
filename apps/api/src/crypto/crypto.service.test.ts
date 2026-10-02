import { describe, it, expect } from 'vitest';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  const svc = new CryptoService(); // dev key in non-production

  it('round-trips an API key', () => {
    const token = svc.encrypt('sk-test-123456789');
    expect(token).not.toContain('sk-test-123456789');
    expect(svc.decrypt(token)).toBe('sk-test-123456789');
  });

  it('masks keys for display', () => {
    expect(svc.mask('sk-proj-ABCDEFGH1234')).toBe('sk-p…1234');
  });
});
