import { z } from 'zod';

const nullableText = z.string().trim().max(20_000).nullable().optional();
const tagName = z.string().trim().min(1).max(64);

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const bookmarkCreateSchema = z.object({
  url: z.string().trim().min(1).max(4_000),
  title: z.string().trim().max(500).optional().default(''),
  description: nullableText,
  note: nullableText,
  collectionId: z.number().int().positive().nullable().optional(),
  tags: z.array(tagName).max(30).optional().default([]),
  isFavorite: z.boolean().optional().default(false),
});

export const bookmarkUpdateSchema = bookmarkCreateSchema.partial().extend({
  tags: z.array(tagName).max(30).optional(),
});

export const bookmarkListSchema = z.object({
  q: z.string().trim().max(500).optional(),
  collectionId: z.union([z.coerce.number().int().positive(), z.literal('none')]).optional(),
  tag: tagName.optional(),
  favorite: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'oldest', 'title', 'popular']).optional().default('newest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(24),
});

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.number().int().positive().nullable().optional().default(null),
  icon: z.string().trim().max(20).nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export const collectionUpdateSchema = collectionCreateSchema.partial();

export const tagCreateSchema = z.object({
  name: tagName,
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export const fetchTitleSchema = z.object({ url: z.string().trim().min(1).max(4_000) });

export const importBodySchema = z.object({
  html: z.string().min(1).max(20 * 1024 * 1024),
  collectionId: z.number().int().positive().nullable().optional(),
  mode: z.enum(['skip', 'overwrite']).optional().default('skip'),
});
