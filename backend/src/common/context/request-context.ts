import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContextValue {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContextValue>();

export function startRequestContext(value?: Partial<RequestContextValue>): RequestContextValue {
  const context: RequestContextValue = {
    requestId: value?.requestId ?? randomUUID(),
    ipAddress: value?.ipAddress,
    userAgent: value?.userAgent,
    userId: value?.userId,
  };

  storage.run(context, () => undefined);

  return context;
}

export function getRequestContext(): RequestContextValue | undefined {
  return storage.getStore();
}

export function setRequestUserId(userId: string | undefined): void {
  const context = storage.getStore();
  if (context) {
    context.userId = userId;
  }
}
