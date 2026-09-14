'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { classNames } from '@/lib/format';
import { EmptyState } from './primitives';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  align?: 'left' | 'right' | 'center';
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchAccessor?: (row: T) => string;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  toolbar?: ReactNode;
  dense?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  onRowClick,
  searchable = false,
  searchPlaceholder = 'Search…',
  searchAccessor,
  pageSize = 12,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  initialSort,
  toolbar,
  dense = false,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim() || !searchAccessor) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => searchAccessor(r).toLowerCase().includes(q));
  }, [rows, query, searchAccessor]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  return (
    <div>
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200/70 px-4 py-3">
          {searchable ? (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="input pl-9"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-200/70">
            <thead className="bg-ink-50/60">
              <tr>
                {columns.map((col) => {
                  const sortable = !!col.sortValue;
                  const isSorted = sort?.key === col.key;
                  return (
                    <th
                      key={col.key}
                      className={classNames(
                        'th select-none',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        sortable && 'cursor-pointer hover:text-ink-700',
                        col.headerClassName,
                      )}
                      onClick={sortable ? () => toggleSort(col.key) : undefined}
                    >
                      <span className={classNames('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                        {col.header}
                        {sortable && isSorted && (sort!.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200/60 bg-white">
              {paged.map((row) => (
                <tr
                  key={keyOf(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={classNames(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-brand-50/40',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={classNames(
                        dense ? 'px-4 py-2 text-sm text-ink-700 align-middle' : 'td',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.className,
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-ink-200/70 px-4 py-3 text-sm text-ink-500">
          <span>
            Showing {clampedPage * pageSize + 1}–{Math.min(sorted.length, (clampedPage + 1) * pageSize)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="btn-secondary px-2.5 py-1.5 text-xs"
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <span className="px-2 text-xs font-semibold text-ink-600">
              {clampedPage + 1} / {pageCount}
            </span>
            <button
              className="btn-secondary px-2.5 py-1.5 text-xs"
              disabled={clampedPage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
