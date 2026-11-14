import { escapeIdentifier, type ClientBase } from 'pg';
import type { SeedPlan } from './rows.js';

/** Rows per statement: one round trip per thousand rows, well inside any parameter limit. */
const BATCH_SIZE = 1_000;

interface Column<Row> {
  name: string;
  /** The Postgres type of the column; each batch is sent as one array of it. */
  type: string;
  value: (row: Row) => unknown;
}

const column = <Row>(name: string, type: string, value: (row: Row) => unknown): Column<Row> => ({
  name,
  type,
  value,
});

/**
 * Writes a seed plan in bulk. Each batch is one `INSERT ... SELECT FROM unnest(...)` with one
 * array parameter per column, inserted in array order (WITH ORDINALITY), because the order of
 * asset_movements rows is the order the status trigger applies them in.
 *
 * Assets are inserted naming only the columns the app roles may write: status and
 * current_location_id come from the movements, never from here.
 */
export class SeedWriter {
  private readonly client: ClientBase;

  constructor(client: ClientBase) {
    this.client = client;
  }

  /** `passwordHashes` maps each staff username to its argon2id hash. */
  async write(plan: SeedPlan, passwordHashes: ReadonlyMap<string, string>): Promise<void> {
    const categoryIds = await this.categoryIds();

    await this.insert('locations', plan.locations, [
      column('id', 'uuid', (row) => row.id),
      column('parent_id', 'uuid', (row) => row.parentId),
      column('kind', 'location_kind', (row) => row.kind),
      column('code', 'text', (row) => row.code),
      column('name', 'text', (row) => row.name),
    ]);
    await this.insert('product_models', plan.productModels, [
      column('id', 'uuid', (row) => row.id),
      column('category_id', 'uuid', (row) => lookup(categoryIds, row.categoryCode, 'category')),
      column('brand', 'text', (row) => row.brand),
      column('model_name', 'text', (row) => row.modelName),
    ]);
    await this.insert('model_accessories', plan.modelAccessories, [
      column('id', 'uuid', (row) => row.id),
      column('product_model_id', 'uuid', (row) => row.productModelId),
      column('name', 'text', (row) => row.name),
    ]);
    await this.insert('partner_orgs', plan.partnerOrgs, [
      column('id', 'uuid', (row) => row.id),
      column('name', 'text', (row) => row.name),
      column('type', 'org_type', (row) => row.type),
    ]);
    await this.insert('users', plan.staffUsers, [
      column('id', 'uuid', (row) => row.id),
      column('email', 'citext', (row) => row.email),
      column('username', 'citext', (row) => row.username),
      column('full_name', 'text', (row) => row.fullName),
      column('title', 'text', (row) => row.title),
      column('kind', 'user_kind', () => 'staff'),
      column('role', 'user_role', (row) => row.role),
      column('status', 'user_status', () => 'active'),
      column('password_hash', 'text', (row) => lookup(passwordHashes, row.username, 'password')),
    ]);
    await this.insert('assets', plan.assets, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.createdAt),
      column('asset_code', 'text', (row) => row.assetCode),
      column('serial_number', 'text', (row) => row.serialNumber),
      column('product_model_id', 'uuid', (row) => row.productModelId),
      column('condition', 'condition_grade', (row) => row.condition),
      column('notes', 'text', (row) => row.notes),
      column('retired_at', 'timestamptz', (row) => row.retiredAt),
    ]);
    await this.writeLending(plan);
    await this.writeHistory(plan);
    await this.advanceCounters(plan);
  }

  private async writeLending(plan: SeedPlan): Promise<void> {
    await this.insert('loan_requests', plan.loanRequests, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.createdAt),
      column('request_no', 'text', (row) => row.requestNo),
      column('partner_org_id', 'uuid', (row) => row.partnerOrgId),
      column('filed_by_user_id', 'uuid', (row) => row.filedByUserId),
      column('contact_name', 'text', (row) => row.contactName),
      column('contact_email', 'citext', (row) => row.contactEmail),
      column('contact_phone', 'text', (row) => row.contactPhone),
      column('needed_from', 'date', (row) => row.neededFrom),
      column('needed_until', 'date', (row) => row.neededUntil),
      column('purpose', 'text', (row) => row.purpose),
      column('end_customer', 'text', (row) => row.endCustomer),
      column('status', 'request_status', (row) => row.status),
      column('decided_by_user_id', 'uuid', (row) => row.decidedByUserId),
      column('decided_at', 'timestamptz', (row) => row.decidedAt),
      column('decision_note', 'text', (row) => row.decisionNote),
    ]);
    await this.insert('loan_request_items', plan.loanRequestItems, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.createdAt),
      column('loan_request_id', 'uuid', (row) => row.loanRequestId),
      column('partner_org_id', 'uuid', (row) => row.partnerOrgId),
      column('product_model_id', 'uuid', (row) => row.productModelId),
      column('quantity_requested', 'integer', (row) => row.quantityRequested),
      column('quantity_assigned', 'integer', (row) => row.quantityAssigned),
    ]);
    await this.insert('reservations', plan.reservations, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.createdAt),
      column('asset_id', 'uuid', (row) => row.assetId),
      column('loan_request_item_id', 'uuid', (row) => row.loanRequestItemId),
      column('period', 'daterange', (row) => row.period),
      column('status', 'reservation_status', (row) => row.status),
    ]);
    await this.insert('loans', plan.loans, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.releasedAt),
      column('loan_no', 'text', (row) => row.loanNo),
      column('loan_request_id', 'uuid', (row) => row.loanRequestId),
      column('partner_org_id', 'uuid', (row) => row.partnerOrgId),
      column('contact_name', 'text', (row) => row.contactName),
      column('contact_email', 'citext', (row) => row.contactEmail),
      column('contact_phone', 'text', (row) => row.contactPhone),
      column('released_by_user_id', 'uuid', (row) => row.releasedByUserId),
      column('released_at', 'timestamptz', (row) => row.releasedAt),
      column('due_date', 'date', (row) => row.dueDate),
      column('closed_at', 'timestamptz', (row) => row.closedAt),
    ]);
    await this.insert('loan_items', plan.loanItems, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.releasedAt),
      column('loan_id', 'uuid', (row) => row.loanId),
      column('partner_org_id', 'uuid', (row) => row.partnerOrgId),
      column('asset_id', 'uuid', (row) => row.assetId),
      column('reservation_id', 'uuid', (row) => row.reservationId),
      column('released_at', 'timestamptz', (row) => row.releasedAt),
      column('returned_at', 'timestamptz', (row) => row.returnedAt),
      column('accessories_out', 'jsonb', (row) => JSON.stringify(row.accessoriesOut)),
      column('accessories_back', 'jsonb', (row) =>
        row.accessoriesBack === null ? null : JSON.stringify(row.accessoriesBack),
      ),
    ]);
    await this.insert('loan_extensions', plan.loanExtensions, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.createdAt),
      column('loan_id', 'uuid', (row) => row.loanId),
      column('partner_org_id', 'uuid', (row) => row.partnerOrgId),
      column('requested_by_user_id', 'uuid', (row) => row.requestedByUserId),
      column('requested_due_date', 'date', (row) => row.requestedDueDate),
      column('reason', 'text', (row) => row.reason),
      column('status', 'extension_status', () => 'approved'),
      column('decided_by_user_id', 'uuid', (row) => row.decidedByUserId),
      column('decided_at', 'timestamptz', (row) => row.decidedAt),
    ]);
  }

  private async writeHistory(plan: SeedPlan): Promise<void> {
    await this.insert('asset_movements', plan.movements, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.occurredAt),
      column('asset_id', 'uuid', (row) => row.assetId),
      column('movement_type', 'movement_type', (row) => row.movementType),
      column('from_status', 'asset_status', (row) => row.fromStatus),
      column('to_status', 'asset_status', (row) => row.toStatus),
      column('to_location_id', 'uuid', (row) => row.toLocationId),
      column('actor_user_id', 'uuid', (row) => row.actorUserId),
      column('loan_item_id', 'uuid', (row) => row.loanItemId),
      column('note', 'text', (row) => row.note),
      column('occurred_at', 'timestamptz', (row) => row.occurredAt),
    ]);
    await this.insert('inspections', plan.inspections, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.createdAt),
      column('loan_item_id', 'uuid', (row) => row.loanItemId),
      column('asset_id', 'uuid', (row) => row.assetId),
      column('inspector_user_id', 'uuid', (row) => row.inspectorUserId),
      column('condition', 'condition_grade', (row) => row.condition),
      column('checklist', 'jsonb', (row) => JSON.stringify(row.checklist)),
      column('missing_accessories', 'jsonb', (row) => JSON.stringify(row.missingAccessories)),
      column('notes', 'text', (row) => row.notes),
      column('outcome', 'inspection_outcome', (row) => row.outcome),
    ]);
    await this.insert('repair_tickets', plan.repairTickets, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.openedAt),
      column('asset_id', 'uuid', (row) => row.assetId),
      column('opened_by_user_id', 'uuid', (row) => row.openedByUserId),
      column('problem', 'text', (row) => row.problem),
      column('opened_at', 'timestamptz', (row) => row.openedAt),
    ]);
    await this.insert('audit_log', plan.auditEntries, [
      column('id', 'uuid', (row) => row.id),
      column('created_at', 'timestamptz', (row) => row.occurredAt),
      column('actor_user_id', 'uuid', (row) => row.actorUserId),
      column('action', 'text', (row) => row.action),
      column('target_type', 'text', (row) => row.targetType),
      column('target_id', 'uuid', (row) => row.targetId),
      column('occurred_at', 'timestamptz', (row) => row.occurredAt),
    ]);
  }

  /**
   * R17: never lowers a counter, so the next asset code or request number the API takes from
   * next_counter() follows the last one seeded.
   */
  private async advanceCounters(plan: SeedPlan): Promise<void> {
    await this.client.query(
      `INSERT INTO counters (prefix, value)
       SELECT prefix, value FROM unnest($1::text[], $2::bigint[]) AS t(prefix, value)
       ON CONFLICT (prefix) DO UPDATE SET value = GREATEST(counters.value, EXCLUDED.value)`,
      [plan.counters.map((row) => row.prefix), plan.counters.map((row) => row.value)],
    );
  }

  private async categoryIds(): Promise<Map<string, string>> {
    const { rows } = await this.client.query<{ id: string; code: string }>(
      'SELECT id, code FROM categories',
    );
    return new Map(rows.map((row) => [row.code, row.id]));
  }

  private async insert<Row>(
    table: string,
    rows: readonly Row[],
    columns: Column<Row>[],
  ): Promise<void> {
    // Identifiers come from the constants above, never from data; quoting is belt and braces.
    const names = columns.map((spec) => escapeIdentifier(spec.name)).join(', ');
    const arrays = columns.map((spec, index) => `$${index + 1}::${spec.type}[]`).join(', ');
    const statement =
      `INSERT INTO ${escapeIdentifier(table)} (${names}) ` +
      `SELECT ${names} FROM unnest(${arrays}) WITH ORDINALITY AS t(${names}, seed_order) ` +
      'ORDER BY seed_order';
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      await this.client.query(
        statement,
        columns.map((spec) => batch.map(spec.value)),
      );
    }
  }
}

/** A missing key is a bug in the dataset; it must stop the seed, not insert a null. */
function lookup(map: ReadonlyMap<string, string>, key: string, what: string): string {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Seed bug: no ${what} for ${key}.`);
  }
  return value;
}
