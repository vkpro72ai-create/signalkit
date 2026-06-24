import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/** Hash a plaintext password. Never store plaintext. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Verify a plaintext password against a stored hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
