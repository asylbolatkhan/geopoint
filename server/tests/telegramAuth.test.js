import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { validateInitData } from '../src/telegramAuth.js';

const BOT_TOKEN = '12345:TEST_TOKEN';

function makeInitData(user, { authDate = Math.floor(Date.now() / 1000), token = BOT_TOKEN } = {}) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAF');
  params.set('user', JSON.stringify(user));
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

describe('validateInitData', () => {
  const user = { id: 777, first_name: 'Aybek' };

  it('accepts a correctly signed payload', () => {
    const result = validateInitData(makeInitData(user), BOT_TOKEN);
    expect(result).toMatchObject({ id: 777, first_name: 'Aybek' });
  });

  it('rejects payload signed with a different token', () => {
    const initData = makeInitData(user, { token: '999:OTHER' });
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('rejects tampered payload', () => {
    const initData = makeInitData(user).replace('Aybek', 'Hacker');
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('rejects stale auth_date (>24h)', () => {
    const initData = makeInitData(user, { authDate: Math.floor(Date.now() / 1000) - 90_000 });
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(validateInitData('', BOT_TOKEN)).toBeNull();
    expect(validateInitData('hash=abc', BOT_TOKEN)).toBeNull();
  });
});
