import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Modules } from './Modules';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { ApiError } from '@/lib/api';
import type { ModuleInfo } from '@/config/modules';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { modules: vi.fn(), setModule: vi.fn() } }));
vi.mock('@/store/thunks', async (orig) => ({ ...(await orig<typeof import('@/store/thunks')>()), bootstrap: vi.fn(() => async () => true) }));
import { api } from '@/lib/api';

const row = (key: string, label: string, over: Partial<ModuleInfo> = {}): ModuleInfo =>
  ({ key, label, description: `${label} does things.`, requires: [], dependents: [], enabled: true, ...over }) as ModuleInfo;

const LIST = [
  row('utilities', 'Utilities & meters'),
  row('maintenance', 'Maintenance', { dependents: ['payouts'] }),
  row('payouts', 'Technician payouts', { requires: ['maintenance'] }),
];

function setup(list: ModuleInfo[] = LIST) {
  vi.mocked(api.modules).mockResolvedValue(list);
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({ modules: Object.fromEntries(list.map((r) => [r.key, r.enabled])) } as never));
  return renderWithStore(<Modules />, store);
}
const sw = (label: string) => screen.getByRole('switch', { name: `${label} module` });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.setModule).mockResolvedValue({ modules: LIST, changed: [] });
});

describe('Modules screen', () => {
  it('lists every module with its description and whether it is on', async () => {
    setup([row('utilities', 'Utilities & meters'), row('planner', 'Planner', { enabled: false })]);

    expect(await screen.findAllByTestId('module-card')).toHaveLength(2);
    expect(sw('Utilities & meters')).toHaveAttribute('aria-checked', 'true');
    expect(sw('Planner')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Planner does things.')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('says what a module needs and what uses it', async () => {
    setup();
    await screen.findAllByTestId('module-card');

    expect(screen.getByText('Needs Maintenance.')).toBeInTheDocument();
    expect(screen.getByText('Also used by Technician payouts.')).toBeInTheDocument();
  });

  it('switches a module off straight away when nothing else needs it', async () => {
    setup();
    await screen.findAllByTestId('module-card');

    fireEvent.click(sw('Utilities & meters'));

    await waitFor(() => expect(api.setModule).toHaveBeenCalledWith('utilities', false, false));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches a module on', async () => {
    setup([row('utilities', 'Utilities & meters', { enabled: false })]);
    await screen.findAllByTestId('module-card');

    fireEvent.click(sw('Utilities & meters'));

    await waitFor(() => expect(api.setModule).toHaveBeenCalledWith('utilities', true, false));
  });

  it('asks first when other modules need the one being switched off, and names them', async () => {
    setup();
    await screen.findAllByTestId('module-card');

    fireEvent.click(sw('Maintenance'));

    expect(await screen.findByText('Turn off Maintenance?')).toBeInTheDocument();
    expect(screen.getByText(/This also turns off Technician payouts/)).toBeInTheDocument();
    expect(api.setModule).not.toHaveBeenCalled();
  });

  it('switches both off once that is confirmed', async () => {
    setup();
    await screen.findAllByTestId('module-card');
    fireEvent.click(sw('Maintenance'));

    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));

    await waitFor(() => expect(api.setModule).toHaveBeenCalledWith('maintenance', false, true));
  });

  it('changes nothing when the confirmation is cancelled', async () => {
    setup();
    await screen.findAllByTestId('module-card');
    fireEvent.click(sw('Maintenance'));

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(api.setModule).not.toHaveBeenCalled();
  });

  it('will not switch a module on while the one it needs is off', async () => {
    setup([row('maintenance', 'Maintenance', { enabled: false, dependents: ['payouts'] }), row('payouts', 'Technician payouts', { requires: ['maintenance'], enabled: false })]);
    await screen.findAllByTestId('module-card');

    expect(sw('Technician payouts')).toBeDisabled();
    expect(screen.getByText('Needs Maintenance — turn that on first.')).toBeInTheDocument();
    expect(sw('Maintenance')).toBeEnabled();
  });

  it('asks again with the list when the server knows of dependents the screen did not', async () => {
    setup([row('maintenance', 'Maintenance'), row('payouts', 'Technician payouts', { requires: ['maintenance'] })]);   // the screen thinks nothing depends on it
    vi.mocked(api.setModule).mockRejectedValueOnce(new ApiError('The given data was invalid.', 422, { dependents: ['Technician payouts needs Maintenance and would be turned off too.'] }));
    await screen.findAllByTestId('module-card');

    fireEvent.click(sw('Maintenance'));

    expect(await screen.findByText('Turn off Maintenance?')).toBeInTheDocument();
  });

  it('says so when the modules cannot be loaded', async () => {
    vi.mocked(api.modules).mockRejectedValue(new Error('down'));
    renderWithStore(<Modules />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the modules');
  });

  it('reads the list again after a change, so the cards follow the server', async () => {
    setup();
    await screen.findAllByTestId('module-card');
    const calls = vi.mocked(api.modules).mock.calls.length;

    fireEvent.click(sw('Utilities & meters'));

    await waitFor(() => expect(vi.mocked(api.modules).mock.calls.length).toBeGreaterThan(calls));
    expect(within(screen.getAllByTestId('module-card')[0]).getByText('Utilities & meters')).toBeInTheDocument();
  });

  it('makes the switch bigger on a phone, with a 44px-tall tap area, and back to its usual size from sm up', async () => {
    setup([row('utilities', 'Utilities & meters')]);
    await screen.findAllByTestId('module-card');

    const s = sw('Utilities & meters');
    expect(s).toHaveClass('h-8', 'w-14', 'sm:h-6', 'sm:w-11');
    expect(s.className).toMatch(/before:-inset-y-1\.5/);              // 32px + 2 × 6px = 44px
    expect(s.className).toMatch(/sm:before:hidden/);                   // not needed with a mouse
    expect(s.firstElementChild).toHaveClass('h-6', 'w-6', 'sm:h-5', 'sm:w-5');
  });

  it('moves the thumb to the far end when on, at both sizes', async () => {
    setup([row('utilities', 'Utilities & meters'), row('planner', 'Planner', { enabled: false })]);
    await screen.findAllByTestId('module-card');

    expect(sw('Utilities & meters').firstElementChild!.className).toMatch(/translate-x-\[30px\]/);
    expect(sw('Utilities & meters').firstElementChild!.className).toMatch(/sm:translate-x-5/);
    expect(sw('Planner').firstElementChild).toHaveClass('translate-x-0.5');
  });

  it('keeps keyboard focus on a switch while its change is going through (it only looks disabled, and a second press is ignored)', async () => {
    let finish!: () => void;
    vi.mocked(api.setModule).mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ modules: LIST, changed: [] }); }));
    setup([row('utilities', 'Utilities & meters'), row('planner', 'Planner')]);
    await screen.findAllByTestId('module-card');
    const s = sw('Utilities & meters');
    s.focus();

    fireEvent.click(s);
    await waitFor(() => expect(api.setModule).toHaveBeenCalledTimes(1));

    expect(s).not.toBeDisabled();                                        // a disabled control would lose focus in a real browser
    expect(s).toHaveAttribute('aria-disabled', 'true');
    expect(sw('Planner')).toHaveAttribute('aria-disabled', 'true');      // the others wait too
    expect(document.activeElement).toBe(s);
    fireEvent.click(s);
    fireEvent.click(sw('Planner'));
    expect(api.setModule).toHaveBeenCalledTimes(1);                      // nothing else starts while one is under way

    finish();
    await waitFor(() => expect(s).toHaveAttribute('aria-disabled', 'false'));
    expect(document.activeElement).toBe(s);
  });

  it('is genuinely disabled (and not reachable by Tab) only when the module it needs is off', async () => {
    setup([row('maintenance', 'Maintenance', { enabled: false, dependents: ['payouts'] }), row('payouts', 'Technician payouts', { requires: ['maintenance'], enabled: false })]);
    await screen.findAllByTestId('module-card');

    expect(sw('Technician payouts')).toBeDisabled();
    expect(sw('Maintenance')).not.toBeDisabled();
  });
});
