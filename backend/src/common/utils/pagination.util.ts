export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export function buildMeta(page: number, perPage: number, total: number): PaginationMeta {
  const totalPages = perPage > 0 ? Math.ceil(total / perPage) : 0;

  return {
    page,
    perPage,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function skipFor(page: number, perPage: number): number {
  return (Math.max(page, 1) - 1) * perPage;
}
