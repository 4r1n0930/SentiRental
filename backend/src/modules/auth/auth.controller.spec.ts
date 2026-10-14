import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { AuthController } from './auth.controller';

/**
 * `@Throttle` keys its metadata by the throttler definition name, and
 * `ThrottlerModule.forRoot` registers a single definition called `default`.
 */
const NAME = 'default';

function limitFor(method: keyof AuthController): number | undefined {
  const handler = AuthController.prototype[method];

  return Reflect.getMetadata(`${THROTTLER_LIMIT}${NAME}`, handler) as number | undefined;
}

function ttlFor(method: keyof AuthController): number | undefined {
  const handler = AuthController.prototype[method];

  return Reflect.getMetadata(`${THROTTLER_TTL}${NAME}`, handler) as number | undefined;
}

describe('AuthController throttling', () => {
  it('tightens the limit on credential login below the global ceiling', () => {
    expect(limitFor('login')).toBe(10);
    expect(ttlFor('login')).toBe(60_000);
  });

  it('allows more refreshes than logins, since refresh is routine', () => {
    expect(limitFor('refresh')).toBe(30);
  });

  it('throttles password recovery hard, to blunt email bombing', () => {
    expect(limitFor('forgotPassword')).toBe(5);
    expect(limitFor('resetPassword')).toBe(10);
  });

  it('throttles the Google flow', () => {
    expect(limitFor('googleStart')).toBe(20);
    expect(limitFor('googleExchange')).toBe(20);
  });

  it('leaves ordinary authenticated routes on the global limit', () => {
    expect(limitFor('logout')).toBeUndefined();
    expect(limitFor('register')).toBeUndefined();
  });
});
