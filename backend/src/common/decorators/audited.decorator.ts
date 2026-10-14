import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit:metadata';

export interface AuditMetadata {
  action: string;
  resourceType: string;
  /** Dot path used to pull the resource id from the handler result, e.g. 'id'. */
  resourceIdFromResult?: string;
}

/** Records an entry in audit_logs after a successful, non-GET handler execution. */
export const Audited = (metadata: AuditMetadata) => SetMetadata(AUDIT_KEY, metadata);
