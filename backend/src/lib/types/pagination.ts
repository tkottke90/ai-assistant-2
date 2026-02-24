import z from "zod";

// Base query parameters schema (for validator middleware)
export const PaginationQuerySchemaBase = z.object({
  page: z.coerce.number().int().positive().default(1),
  take: z.coerce.number().int().positive().max(100).default(10)
});

// Query parameters for pagination requests (with skip computed)
export const PaginationQuerySchema = PaginationQuerySchemaBase.transform(data => ({
  ...data,
  skip: (data.page - 1) * data.take
}));

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// Response schema for paginated results
export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  take: z.number().int().positive()
});

export type PaginationMeta = z.infer<typeof PaginationSchema>;

export function withPagination<T extends z.ZodType>(schema: T) {
  return z.object({
    pagination: PaginationSchema,
    data: z.array(schema)
  });
}

export type PaginatedResponse<T> = {
  pagination: PaginationMeta;
  data: T[];
};

export function createPagination(page: number, totalCount: number, take: number): PaginationMeta {
  const totalPages = Math.max(Math.ceil(totalCount / take), 1);
  return {
    page,
    totalPages,
    totalCount,
    take
  };
}