import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const publicationKindEnum = pgEnum("publication_kind", [
  "JOURNAL",
  "ARTICLE",
]);

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "ADMIN",
  "EDITOR",
]);

export const systemThemeEnum = pgEnum("system_theme", [
  "LIGHT",
  "DARK",
  "MONOCHROME",
]);

export type PublicationKind = (typeof publicationKindEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type SystemTheme = (typeof systemThemeEnum.enumValues)[number];

/**
 * 1. graduates
 * Note: NIM is strictly excluded from the database, API, DTO, UI, export, and logs.
 */
export const graduates = pgTable(
  "graduates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    entryYear: integer("entry_year").notNull(),
    graduationYear: integer("graduation_year").notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("graduates_is_published_idx").on(t.isPublished),
    index("graduates_entry_year_idx").on(t.entryYear),
    index("graduates_graduation_year_idx").on(t.graduationYear),
    index("graduates_published_grad_year_idx").on(
      t.isPublished,
      t.graduationYear,
    ),
    check(
      "graduates_entry_year_range_chk",
      sql`${t.entryYear} >= 1950 AND ${t.entryYear} <= 2100`,
    ),
    check(
      "graduates_graduation_year_valid_chk",
      sql`${t.graduationYear} >= ${t.entryYear} AND ${t.graduationYear} <= 2100`,
    ),
  ],
);

/**
 * 2. lecturers
 * Note: `nip` is strictly admin-only and must never be exposed in public DTOs.
 */
export const lecturers = pgTable(
  "lecturers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    nidn: varchar("nidn", { length: 64 }),
    nip: varchar("nip", { length: 64 }),
    position: varchar("position", { length: 255 }).notNull(),
    expertise: varchar("expertise", { length: 255 }).notNull(),
    education: text("education"),
    biography: text("biography"),
    photoPath: varchar("photo_path", { length: 512 }),
    isPublished: boolean("is_published").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("lecturers_is_published_idx").on(t.isPublished),
    index("lecturers_nidn_idx").on(t.nidn),
    index("lecturers_full_name_idx").on(t.fullName),
  ],
);

/**
 * 3. publications
 * Note: Do not duplicate publications for co-authors; link via `publication_authors`.
 */
export const publications = pgTable(
  "publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 512 }).notNull(),
    kind: publicationKindEnum("kind").notNull(),
    journalName: varchar("journal_name", { length: 255 }).notNull(),
    publicationYear: integer("publication_year").notNull(),
    doi: varchar("doi", { length: 255 }),
    url: varchar("url", { length: 1024 }),
    isPublished: boolean("is_published").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("publications_is_published_idx").on(t.isPublished),
    index("publications_publication_year_idx").on(t.publicationYear),
    index("publications_kind_idx").on(t.kind),
    index("publications_published_year_kind_idx").on(
      t.isPublished,
      t.publicationYear,
      t.kind,
    ),
    check(
      "publications_year_range_chk",
      sql`${t.publicationYear} >= 1950 AND ${t.publicationYear} <= 2100`,
    ),
  ],
);

/**
 * 4. publication_authors
 * Many-to-many join table between publications and lecturers.
 * Uses ON DELETE RESTRICT to prevent silent deletion of lecturer-publication relationships.
 */
export const publicationAuthors = pgTable(
  "publication_authors",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    lecturerId: uuid("lecturer_id")
      .notNull()
      .references(() => lecturers.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (t) => [
    primaryKey({
      name: "publication_authors_pk",
      columns: [t.publicationId, t.lecturerId],
    }),
    uniqueIndex("publication_authors_pub_lecturer_uq").on(
      t.publicationId,
      t.lecturerId,
    ),
    index("publication_authors_publication_id_idx").on(t.publicationId),
    index("publication_authors_lecturer_id_idx").on(t.lecturerId),
  ],
);

/**
 * 5. users
 * Administrative user accounts.
 * `passwordHash`, `mfaSecretEncrypted`, and `mfaRecoveryCodesHashed` must never be returned in DTOs or logged.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique("users_email_unique"),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: userRoleEnum("role").default("EDITOR").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    mfaRecoveryCodesHashed: jsonb("mfa_recovery_codes_hashed")
      .$type<string[]>()
      .default([])
      .notNull(),
    sessionVersion: integer("session_version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("users_role_idx").on(t.role),
    index("users_is_active_idx").on(t.isActive),
  ],
);

/**
 * 6. audit_logs
 * Immutable audit log entries. `metadata` must never contain secrets, passwords, or NIM.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("audit_logs_actor_user_id_idx").on(t.actorUserId),
    index("audit_logs_entity_type_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

/**
 * Drizzle ORM Relations
 */
export const lecturersRelations = relations(lecturers, ({ many }) => ({
  publicationAuthors: many(publicationAuthors),
}));

export const publicationsRelations = relations(publications, ({ many }) => ({
  publicationAuthors: many(publicationAuthors),
}));

export const publicationAuthorsRelations = relations(
  publicationAuthors,
  ({ one }) => ({
    publication: one(publications, {
      fields: [publicationAuthors.publicationId],
      references: [publications.id],
    }),
    lecturer: one(lecturers, {
      fields: [publicationAuthors.lecturerId],
      references: [lecturers.id],
    }),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  auditLogs: many(auditLogs),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actorUser: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

/**
 * 7. system_settings
 * Global system configuration (e.g. public display theme).
 */
export const systemSettings = pgTable(
  "system_settings",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (t) => [
    index("system_settings_updated_by_user_id_idx").on(t.updatedByUserId),
  ],
);

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [systemSettings.updatedByUserId],
    references: [users.id],
  }),
}));

