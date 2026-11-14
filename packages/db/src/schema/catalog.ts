import { type AnyPgColumn, boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps, timestamptz } from './columns.js';
import { assetStatus, conditionGrade, locationKind, ownershipType } from './enums.js';

export const categories = pgTable('categories', {
  id: primaryId(),
  ...timestamps(),
  name: text('name').notNull(),
  code: text('code').notNull(),
});

export const productModels = pgTable('product_models', {
  id: primaryId(),
  ...timestamps(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  brand: text('brand').notNull(),
  modelName: text('model_name').notNull(),
  isBookable: boolean('is_bookable').notNull().default(true),
});

export const modelAccessories = pgTable('model_accessories', {
  id: primaryId(),
  ...timestamps(),
  productModelId: uuid('product_model_id')
    .notNull()
    .references(() => productModels.id),
  name: text('name').notNull(),
});

export const locations = pgTable('locations', {
  id: primaryId(),
  ...timestamps(),
  // The explicit return type breaks the circular inference of a self-reference.
  parentId: uuid('parent_id').references((): AnyPgColumn => locations.id),
  kind: locationKind('kind').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
});

export const assets = pgTable('assets', {
  id: primaryId(),
  ...timestamps(),
  assetCode: text('asset_code').notNull(),
  serialNumber: text('serial_number').notNull(),
  productModelId: uuid('product_model_id')
    .notNull()
    .references(() => productModels.id),
  status: assetStatus('status').notNull().default('registered'),
  condition: conditionGrade('condition').notNull().default('a'),
  currentLocationId: uuid('current_location_id').references(() => locations.id),
  ownership: ownershipType('ownership').notNull().default('owned'),
  ownerName: text('owner_name'),
  retiredAt: timestamptz('retired_at'),
  notes: text('notes'),
});
