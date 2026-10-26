import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const operationsSessions = sqliteTable('operations_sessions', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  adminHash: text('admin_hash').notNull(),
  viewerHash: text('viewer_hash').notNull(),
  publisherHash: text('publisher_hash').notNull(),
  inviteHash: text('invite_hash').notNull(),
}, table => [index('operations_sessions_expiry').on(table.expiresAt)]);

export const operationsDevices = sqliteTable('operations_devices', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => operationsSessions.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('operations_devices_token').on(table.tokenHash), index('operations_devices_session').on(table.sessionId)]);

export const operationsUnits = sqliteTable('operations_units', {
  sessionId: text('session_id').notNull().references(() => operationsSessions.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  ownerDeviceId: text('owner_device_id').references(() => operationsDevices.id, { onDelete: 'cascade' }),
  payloadJson: text('payload_json').notNull(),
  observedAt: integer('observed_at'),
  // A fixed-width UTC key preserves ordering beyond millisecond precision.
  observationKey: text('observation_key'),
}, table => [primaryKey({ columns: [table.sessionId, table.id] }), index('operations_units_observed').on(table.observedAt)]);

export const operationsRateLimits = sqliteTable('operations_rate_limits', {
  key: text('key').primaryKey(),
  expiresAt: integer('expires_at').notNull(),
  count: integer('count').notNull(),
}, table => [index('operations_rate_limits_expiry').on(table.expiresAt)]);
