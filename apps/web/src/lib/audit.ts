import type { AuditEntry } from '@wms/contracts';

/**
 * One line saying what an activity-log entry changed. The demo keeps a record name and a
 * sentence; the API keeps the changed field names, with values only where they are safe.
 */
export function describeEntry(entry: AuditEntry): { record: string; detail: string } {
  const { record, detail, ...fields } = entry.changedFields;
  const recordText =
    typeof record === 'string'
      ? record
      : `${entry.targetType.replace(/_/g, ' ')}${entry.targetId ? ` ${entry.targetId.slice(0, 8)}` : ''}`;
  const detailText =
    typeof detail === 'string'
      ? detail
      : Object.entries(fields)
          .map(([name, value]) =>
            value === '[changed]' || value === true ? name : `${name}: ${String(value)}`,
          )
          .join(', ');
  return { record: recordText, detail: detailText };
}
