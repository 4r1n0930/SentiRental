import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { buildMeta, skipFor, type Paginated } from '../utils/pagination.util';

export type { Paginated, PaginationMeta } from '../utils/pagination.util';

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 20;

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder: SortOrder = 'desc';
}

export class IdParamDto {
  @IsOptional()
  id?: string;
}

export function resolvePagination(query: PaginationQueryDto): {
  page: number;
  perPage: number;
  skip: number;
  sortOrder: SortOrder;
} {
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 20;

  return {
    page,
    perPage,
    skip: skipFor(page, perPage),
    sortOrder: query.sortOrder ?? 'desc',
  };
}

export async function paginate<T>(
  totalPromise: Promise<number>,
  itemsPromise: Promise<T[]>,
  page: number,
  perPage: number,
): Promise<Paginated<T>> {
  const [total, items] = await Promise.all([totalPromise, itemsPromise]);

  return { items, meta: buildMeta(page, perPage, total) };
}
