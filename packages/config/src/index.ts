/**
 * @signalkit/config — shared runtime configuration helpers.
 *
 * Provides strict environment parsing so apps fail fast and clearly when a
 * required secret/setting is missing (an engineering & security law: startup
 * must fail clearly if critical secrets are absent).
 */

export class MissingEnvError extends Error {
  constructor(public readonly key: string) {
    super(`Missing required environment variable: ${key}`);
    this.name = 'MissingEnvError';
  }
}

type Env = Record<string, string | undefined>;

/** Read a required env var or throw a clear, named error. */
export function requireEnv(key: string, env: Env = process.env): string {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new MissingEnvError(key);
  }
  return value;
}

/** Read an optional env var with a fallback. */
export function optionalEnv(key: string, fallback: string, env: Env = process.env): string {
  const value = env[key];
  return value === undefined || value === '' ? fallback : value;
}

/** Parse a boolean-ish env var ("1", "true", "yes"). */
export function boolEnv(key: string, fallback = false, env: Env = process.env): boolean {
  const value = env[key];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/** Parse an integer env var, throwing on non-numeric values. */
export function intEnv(key: string, fallback: number, env: Env = process.env): number {
  const value = env[key];
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got "${value}"`);
  }
  return parsed;
}

/** The canonical set of secrets the API requires to boot in production. */
export const REQUIRED_API_SECRETS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'ENCRYPTION_KEY_FOR_LLM_KEYS',
] as const;

/** Validate all required secrets are present; returns the list of missing ones. */
export function findMissingSecrets(
  keys: readonly string[],
  env: Env = process.env,
): string[] {
  return keys.filter((key) => {
    const value = env[key];
    return value === undefined || value === '';
  });
}
