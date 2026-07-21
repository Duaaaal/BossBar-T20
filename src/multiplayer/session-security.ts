import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 8;
const TOKEN_BYTES = 32;

export type SessionCredentials = {
  roomCode: string;
  hostToken: string;
  playerToken: string;
};

const randomCharacters = (length: number, alphabet: string) =>
  Array.from(
    { length },
    () => alphabet[randomInt(0, alphabet.length)],
  ).join('');

export const createSessionCredentials = (): SessionCredentials => ({
  roomCode: randomCharacters(ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET),
  hostToken: randomBytes(TOKEN_BYTES).toString('base64url'),
  playerToken: randomBytes(TOKEN_BYTES).toString('base64url'),
});

export const tokensMatch = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
};

type RateLimitEntry = { count: number; resetAt: number };

export class SessionConnectionRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  private readonly maximumAttempts: number;

  private readonly windowMs: number;

  constructor(
    maximumAttempts = 60,
    windowMs = 60_000,
  ) {
    this.maximumAttempts = maximumAttempts;
    this.windowMs = windowMs;
  }

  allow(key: string, now = Date.now()) {
    const normalizedKey = key || 'unknown';
    const current = this.entries.get(normalizedKey);
    if (!current || current.resetAt <= now) {
      this.entries.set(normalizedKey, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      if (this.entries.size > 2_048) this.removeExpired(now);
      return true;
    }
    if (current.count >= this.maximumAttempts) return false;
    current.count += 1;
    return true;
  }

  private removeExpired(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}
