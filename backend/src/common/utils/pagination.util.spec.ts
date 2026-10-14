import { buildMeta, skipFor } from './pagination.util';

describe('pagination util', () => {
  it('computes page metadata', () => {
    expect(buildMeta(1, 20, 45)).toEqual({
      page: 1,
      perPage: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('handles an empty result set', () => {
    expect(buildMeta(1, 20, 0)).toEqual({
      page: 1,
      perPage: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('flags the last page', () => {
    const meta = buildMeta(3, 20, 45);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it('converts a page number into a skip offset', () => {
    expect(skipFor(1, 20)).toBe(0);
    expect(skipFor(3, 20)).toBe(40);
    expect(skipFor(0, 20)).toBe(0);
  });
});
