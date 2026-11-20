import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UtilityLineDetail } from './UtilityLineDetail';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));

const item = { id: 'l', type: 'utility', description: 'Water', amount: 4_900, meterId: 'm1', fromReading: 200.5, toReading: 214.5 } as never;

function show(staff: boolean, meters: object[] = [{ id: 'm1', unitOfMeasure: 'm³' }]) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({ meters } as never));
  renderWithStore(<UtilityLineDetail item={item} staff={staff} />, store);
}

describe('UtilityLineDetail', () => {
  it('sends staff to the meter on the Utilities page', () => {
    show(true);
    expect(screen.getByText('Read 200.5 → 214.5 m³')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See readings/ })).toHaveAttribute('href', '/utilities?meter=m1');
  });

  it('sends a tenant to their own Utilities page', () => {
    show(false);
    expect(screen.getByRole('link', { name: /See readings/ })).toHaveAttribute('href', '/portal/utilities?meter=m1');
  });

  it('still shows the readings that were billed, without a link, when the viewer cannot see the meter (a tenant who has moved out)', () => {
    show(false, []);
    expect(screen.getByText('Read 200.5 → 214.5')).toBeInTheDocument();      // no unit: the meter is not theirs to see any more
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows nothing for a utility line that has neither a known meter nor readings', () => {
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({ meters: [] } as never));
    const { container } = renderWithStore(<UtilityLineDetail item={{ id: 'l', type: 'utility', description: 'Water', amount: 1, meterId: 'gone' } as never} staff={false} />, store);
    expect(container.textContent).toBe('');
  });
});
