import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.util';

describe('password util', () => {
  it('hashes and verifies a password, rejecting wrong ones', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toBe('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
