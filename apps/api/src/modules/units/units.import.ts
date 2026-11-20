import {
  optionalNote,
  serialSchema,
  type ConditionGrade,
  type ImportUnitRow,
  type ImportUnitsResponse,
} from '@wms/contracts';

/** What the file's words resolve to: models by "Brand Model", shelves by their code. */
export interface ImportLookup {
  models: Map<string, { id: string; categoryCode: string }>;
  shelves: Map<string, string>;
  /** `${modelId}|${serial}` of every unit already registered with one of the file's serials. */
  taken: Set<string>;
}

/** One row ready to insert. */
export interface ImportPlan {
  row: number;
  modelId: string;
  categoryCode: string;
  serial: string;
  locationId: string;
  condition: ConditionGrade;
  notes: string | null;
}

/** The key a model is matched on: case and spacing do not matter, the words do. */
export function modelKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function shelfKey(code: string): string {
  return code.trim().toUpperCase();
}

const GRADE_WORDS: Record<string, ConditionGrade> = {
  a: 'a',
  b: 'b',
  c: 'c',
  d: 'd',
  'grade a': 'a',
  'grade b': 'b',
  'grade c': 'c',
  'grade d': 'd',
};

const noteSchema = optionalNote();

/**
 * Checks every row and returns every problem, so a file is fixed in one pass. A serial must be
 * new for its model, both against the warehouse and within the file itself.
 */
export function checkImportRows(
  rows: readonly ImportUnitRow[],
  lookup: ImportLookup,
): { errors: ImportUnitsResponse['errors']; plans: ImportPlan[] } {
  const errors: ImportUnitsResponse['errors'] = [];
  const plans: ImportPlan[] = [];
  const seen = new Map<string, number>();

  rows.forEach((input, index) => {
    const row = index + 1;
    const fail = (field: ImportUnitsResponse['errors'][number]['field'], message: string) =>
      errors.push({ row, field, message });
    const before = errors.length;

    const model = lookup.models.get(modelKey(input.model));
    if (!input.model.trim()) fail('model', 'The model is empty');
    else if (!model) fail('model', `No model is called "${input.model.trim()}"`);

    const serial = serialSchema.safeParse(input.serial);
    if (!serial.success) fail('serial', 'The serial number is empty, too long or not valid');

    const locationId = lookup.shelves.get(shelfKey(input.shelf));
    if (!input.shelf.trim()) fail('shelf', 'The shelf is empty');
    else if (!locationId) fail('shelf', `No shelf has the code "${input.shelf.trim()}"`);

    const word = input.condition.trim().toLowerCase();
    const condition = word === '' ? 'a' : GRADE_WORDS[word];
    if (!condition) fail('condition', 'The condition must be A, B, C or D');

    const notes = noteSchema.safeParse(input.notes);
    if (!notes.success) fail('notes', 'The notes contain characters that are not allowed');

    if (model && serial.success) {
      const key = `${model.id}|${serial.data}`;
      const first = seen.get(key);
      if (first !== undefined) {
        fail('serial', `Row ${first} already has this serial for the same model`);
      } else {
        seen.set(key, row);
        if (lookup.taken.has(key))
          fail('serial', 'A unit of this model with this serial is already registered');
      }
    }

    if (
      errors.length === before &&
      model &&
      serial.success &&
      locationId &&
      condition &&
      notes.success
    ) {
      plans.push({
        row,
        modelId: model.id,
        categoryCode: model.categoryCode,
        serial: serial.data,
        locationId,
        condition,
        notes: notes.data ?? null,
      });
    }
  });
  return { errors, plans };
}
