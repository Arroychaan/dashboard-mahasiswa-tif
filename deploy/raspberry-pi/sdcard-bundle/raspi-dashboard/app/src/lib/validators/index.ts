import { z } from "zod";

export const YEAR_MIN = 1950;
export const YEAR_MAX = 2100;

export const yearSchema = z
  .number()
  .int("Tahun harus berupa bilangan bulat")
  .min(YEAR_MIN, `Tahun minimal ${YEAR_MIN}`)
  .max(YEAR_MAX, `Tahun maksimal ${YEAR_MAX}`);

export const publicationKindSchema = z.enum(["JOURNAL", "ARTICLE"]);
export const userRoleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "EDITOR"]);

export const paginationInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

/**
 * Validates that a URL uses only safe `http:` or `https:` protocols
 * (blocks `javascript:`, `data:`, `file:`, `vbscript:`, etc.).
 */
export const safeHttpUrlSchema = z
  .string()
  .trim()
  .max(1024, "URL maksimal 1024 karakter")
  .url("Format URL tidak valid")
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL hanya boleh menggunakan protokol http:// atau https://" },
  );

/**
 * 1. Graduate Schemas (NIM is strictly excluded everywhere)
 */
export const graduateIdSchema = z.object({
  id: z.string().uuid(),
});

export const listGraduatesInputSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    entryYear: yearSchema.optional(),
    graduationYear: yearSchema.optional(),
    isPublished: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .optional();

export const createGraduateSchema = z
  .object({
    fullName: z.string().trim().min(1, "Nama lengkap wajib diisi").max(255),
    entryYear: yearSchema,
    graduationYear: yearSchema,
    isPublished: z.boolean().default(false),
  })
  .strict()
  .refine((data) => data.graduationYear >= data.entryYear, {
    message: "Tahun lulus harus lebih besar atau sama dengan tahun masuk",
    path: ["graduationYear"],
  });

export const updateGraduateSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string().trim().min(1, "Nama lengkap wajib diisi").max(255),
    entryYear: yearSchema,
    graduationYear: yearSchema,
  })
  .strict()
  .refine((data) => data.graduationYear >= data.entryYear, {
    message: "Tahun lulus harus lebih besar atau sama dengan tahun masuk",
    path: ["graduationYear"],
  });

export const setPublishedSchema = z
  .object({
    id: z.string().uuid(),
    isPublished: z.boolean(),
  })
  .strict();

export const publicGraduateDtoSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string(),
    entryYear: yearSchema,
    graduationYear: yearSchema,
  })
  .strict();

/**
 * 2. Lecturer Schemas (`nip` is admin-only; never included in `publicLecturerDtoSchema`)
 */
export const lecturerIdSchema = z.object({
  id: z.string().uuid(),
});

export const listLecturersInputSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    isPublished: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .optional();

export const createLecturerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Nama lengkap dosen wajib diisi")
      .max(255),
    nidn: z.string().trim().max(64).nullable().optional(),
    nip: z.string().trim().max(64).nullable().optional(),
    position: z.string().trim().min(1, "Jabatan wajib diisi").max(255),
    expertise: z.string().trim().min(1, "Bidang keahlian wajib diisi").max(255),
    education: z.string().trim().nullable().optional(),
    biography: z.string().trim().nullable().optional(),
    photoPath: z.string().trim().max(512).nullable().optional(),
    isPublished: z.boolean().default(false),
  })
  .strict();

export const updateLecturerSchema = createLecturerSchema
  .omit({ isPublished: true })
  .extend({
    id: z.string().uuid(),
  })
  .strict();

export const publicLecturerDtoSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string(),
    nidn: z.string().nullable(),
    position: z.string(),
    expertise: z.string(),
    education: z.string().nullable(),
    biography: z.string().nullable(),
    photoPath: z.string().nullable(),
    publishedPublicationCount: z.number().int().nonnegative(),
  })
  .strict();

/**
 * 3. Publication Schemas
 */
export const publicationIdSchema = z.object({
  id: z.string().uuid(),
});

export const listPublicationsInputSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    isPublished: z.boolean().optional(),
    kind: publicationKindSchema.optional(),
    publicationYear: yearSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .optional();

const uniqueLecturerIdsSchema = z
  .array(z.string().uuid())
  .min(1, "Minimal satu dosen penulis wajib dipilih")
  .max(50, "Maksimal 50 penulis per publikasi")
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Daftar dosen penulis tidak boleh mengandung duplikat",
  });

export const createPublicationSchema = z
  .object({
    title: z.string().trim().min(1, "Judul publikasi wajib diisi").max(512),
    kind: publicationKindSchema,
    journalName: z
      .string()
      .trim()
      .min(1, "Nama jurnal/konferensi wajib diisi")
      .max(255),
    publicationYear: yearSchema,
    doi: z.string().trim().max(255).nullable().optional(),
    url: safeHttpUrlSchema.nullable().optional(),
    lecturerIds: uniqueLecturerIdsSchema,
    isPublished: z.boolean().default(false),
  })
  .strict();

export const updatePublicationSchema = createPublicationSchema
  .omit({ isPublished: true })
  .extend({
    id: z.string().uuid(),
  })
  .strict();

export const deletePublicationSchema = z
  .object({
    id: z.string().uuid(),
    confirmUnlinkAuthors: z.boolean().default(false),
  })
  .strict();

export const publicPublicationAuthorDtoSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string(),
    nidn: z.string().nullable(),
  })
  .strict();

export const publicPublicationDtoSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    kind: publicationKindSchema,
    journalName: z.string(),
    publicationYear: yearSchema,
    doi: z.string().nullable(),
    url: z.string().nullable(),
    authors: z.array(publicPublicationAuthorDtoSchema),
  })
  .strict();

/**
 * Public Dashboard Output Schemas
 */
export const publicOverviewDtoSchema = z
  .object({
    totalGraduates: z.number().int().nonnegative(),
    totalLecturers: z.number().int().nonnegative(),
    totalPublications: z.number().int().nonnegative(),
    totalJournals: z.number().int().nonnegative(),
    totalArticles: z.number().int().nonnegative(),
    lastUpdatedAt: z.date().nullable(),
  })
  .strict();

export const publicGraduateStatsDtoSchema = z
  .object({
    byGraduationYear: z.array(
      z
        .object({
          year: yearSchema,
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    byEntryYear: z.array(
      z
        .object({
          year: yearSchema,
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    recentGraduates: z.array(publicGraduateDtoSchema),
  })
  .strict();

export const publicPublicationStatsDtoSchema = z
  .object({
    byYearAndKind: z.array(
      z
        .object({
          year: yearSchema,
          journalCount: z.number().int().nonnegative(),
          articleCount: z.number().int().nonnegative(),
          total: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    recentPublications: z.array(publicPublicationDtoSchema),
  })
  .strict();

/**
 * 4. User Schemas (`passwordHash` and MFA secrets are never returned in DTOs)
 */
export const listUsersInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .optional();

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi").max(255),
    email: z.string().trim().toLowerCase().email("Email tidak valid").max(255),
    password: z.string().min(12, "Password minimal 12 karakter").max(128),
    role: userRoleSchema.default("EDITOR"),
    isActive: z.boolean().default(true),
    totpSecretBase32: z
      .string()
      .trim()
      .regex(/^[A-Z2-7]+=*$/i)
      .min(16)
      .optional(),
  })
  .strict();

export const changeUserRoleSchema = z
  .object({
    id: z.string().uuid(),
    role: userRoleSchema,
    totpSecretBase32: z
      .string()
      .trim()
      .regex(/^[A-Z2-7]+=*$/i)
      .min(16)
      .optional(),
  })
  .strict();

export const setUserActiveSchema = z
  .object({
    id: z.string().uuid(),
    isActive: z.boolean(),
  })
  .strict();

export const changeUserPasswordSchema = z
  .object({
    id: z.string().uuid(),
    currentPassword: z.string().min(1).max(128).optional(),
    newPassword: z.string().min(12, "Password baru minimal 12 karakter").max(128),
  })
  .strict();

export const updateUserSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1, "Nama wajib diisi").max(255),
    email: z.string().trim().toLowerCase().email("Email tidak valid").max(255),
    role: userRoleSchema,
    isActive: z.boolean(),
  })
  .strict();

export const resetUserPasswordSchema = z
  .object({
    id: z.string().uuid(),
    newPassword: z.string().min(12, "Password minimal 12 karakter").max(128),
  })
  .strict();

export const userDtoSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: userRoleSchema,
    isActive: z.boolean(),
    mfaEnabled: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

/**
 * 5. Audit Log Schemas
 */
export const listAuditLogsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
    entityType: z.string().trim().max(64).optional(),
  })
  .optional();

export type PublicGraduateDTO = z.infer<typeof publicGraduateDtoSchema>;
export type PublicLecturerDTO = z.infer<typeof publicLecturerDtoSchema>;
export type PublicPublicationDTO = z.infer<typeof publicPublicationDtoSchema>;
export type PublicOverviewDTO = z.infer<typeof publicOverviewDtoSchema>;
export type PublicGraduateStatsDTO = z.infer<
  typeof publicGraduateStatsDtoSchema
>;
export type PublicPublicationStatsDTO = z.infer<
  typeof publicPublicationStatsDtoSchema
>;
export type UserDTO = z.infer<typeof userDtoSchema>;
