import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddBuildingModal, AddUnitModal, EditBuildingModal, EditUnitModal } from './StructureModals';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';
import type { Building, Unit } from '@/types';

const bld = { id: 'b1', propertyId: 'p1', name: 'Block A', code: 'B-A', buildingType: 'storey-building', floors: 3, description: 'Old', photos: ['#aabbcc', '/storage/a.jpg'] } as unknown as Building;
const bld2 = { ...bld, id: 'b2', name: 'Block B', code: 'B-B' } as Building;
const unit = {
  id: 'u1', propertyId: 'p1', buildingId: 'b1', code: 'A01', type: '2-Bedroom Flat', floor: 1, status: 'available',
  bedrooms: 2, bathrooms: 2, sizeSqm: 80, furnishing: 'unfurnished', parkingSpaces: 1,
  rent: 1_000_000, serviceCharge: 0, securityDeposit: 0, utilityCharge: 0, otherCharges: 0, photos: [], meterIds: [],
} as unknown as Unit;

function storeAs(role: string, id = 'me') {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id, role, name: 'Me', email: 'me@x.test' }],
    properties: [
      { id: 'p1', name: 'Mine', owners: [{ ownerId: id }] },
      { id: 'p2', name: 'Not mine', owners: [{ ownerId: 'someone-else' }] },
    ],
    buildings: [bld, bld2],
    units: [unit],
  } as never));
  store.dispatch(login({ userId: id, token: 't' }));
  return store;
}
const lastToast = (s: ReturnType<typeof makeTestStore>) => s.getState().ui.toasts.at(-1);
const onClose = () => vi.fn();

describe('AddBuildingModal', () => {
  it('requires a name', async () => {
    const store = storeAs('manager');
    const close = onClose();
    renderWithStore(<AddBuildingModal propertyId="p1" onClose={close} />, store);
    await userEvent.click(screen.getByRole('button', { name: 'Add building' }));
    expect(lastToast(store)).toMatchObject({ kind: 'error', message: 'Add a building name.' });
    expect(close).not.toHaveBeenCalled();
    expect(store.getState().data.buildings).toHaveLength(2);
  });

  it('creates the building with the chosen layout type and closes', async () => {
    const store = storeAs('manager');
    const close = onClose();
    renderWithStore(<AddBuildingModal propertyId="p1" onClose={close} />, store);
    await userEvent.type(screen.getByPlaceholderText('e.g. Block A'), '  Terrace 1 ');
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'terraced-duplex');
    await userEvent.click(screen.getByRole('button', { name: 'Add building' }));
    const created = store.getState().data.buildings.at(-1)!;
    expect(created).toMatchObject({ propertyId: 'p1', name: 'Terrace 1', buildingType: 'terraced-duplex' });
    expect(lastToast(store)).toMatchObject({ kind: 'success' });
    expect(close).toHaveBeenCalled();
  });

  it('offers an owner only the properties they own', () => {
    renderWithStore(<AddBuildingModal onClose={onClose()} />, storeAs('owner', 'owner-1'));
    const options = Array.from(screen.getAllByRole('combobox')[0].querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Mine']);
  });

  it('cancels without creating anything', async () => {
    const store = storeAs('manager');
    const close = onClose();
    renderWithStore(<AddBuildingModal propertyId="p1" onClose={close} />, store);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalled();
    expect(store.getState().data.buildings).toHaveLength(2);
  });
});

describe('EditBuildingModal', () => {
  it('is prefilled and drops colour-hint placeholders from the photos', () => {
    renderWithStore(<EditBuildingModal building={bld} onClose={onClose()} />, storeAs('manager'));
    expect(screen.getByDisplayValue('Block A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('B-A')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('refuses a blank name or code', async () => {
    const store = storeAs('manager');
    renderWithStore(<EditBuildingModal building={bld} onClose={onClose()} />, store);
    await userEvent.clear(screen.getByDisplayValue('Block A'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(lastToast(store)).toMatchObject({ message: 'Building name is required.' });
    await userEvent.type(screen.getByPlaceholderText('e.g. Block A'), 'Block A');
    await userEvent.clear(screen.getByDisplayValue('B-A'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(lastToast(store)).toMatchObject({ message: 'Building code is required.' });
  });

  it('saves changes to the store', async () => {
    const store = storeAs('manager');
    const close = onClose();
    renderWithStore(<EditBuildingModal building={bld} onClose={close} />, store);
    const name = screen.getByDisplayValue('Block A');
    await userEvent.clear(name);
    await userEvent.type(name, 'Block Z');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(store.getState().data.buildings.find((b) => b.id === 'b1')).toMatchObject({ name: 'Block Z', code: 'B-A', photos: ['/storage/a.jpg'] });
    expect(close).toHaveBeenCalled();
  });
});

describe('AddUnitModal', () => {
  it('needs a code and type, and creates the unit in the chosen building', async () => {
    const store = storeAs('manager');
    const close = onClose();
    renderWithStore(<AddUnitModal propertyId="p1" buildingId="b1" onClose={close} />, store);
    await userEvent.click(screen.getByRole('button', { name: /^Add unit$/ }));
    expect(lastToast(store)).toMatchObject({ message: 'Unit code and type are required.' });
    expect(store.getState().data.units).toHaveLength(1);

    await userEvent.type(screen.getByPlaceholderText('e.g. A01'), 'B07');
    await userEvent.type(screen.getByPlaceholderText('e.g. 2-Bedroom Flat'), 'Studio');
    await userEvent.click(screen.getByRole('button', { name: /^Add unit$/ }));
    expect(store.getState().data.units.at(-1)).toMatchObject({ code: 'B07', type: 'Studio', buildingId: 'b1', propertyId: 'p1', status: 'available' });
    expect(close).toHaveBeenCalled();
  });
});

describe('EditUnitModal', () => {
  it('is prefilled, validates, and saves', async () => {
    const store = storeAs('manager');
    const close = onClose();
    renderWithStore(<EditUnitModal unit={unit} onClose={close} />, store);
    const type = screen.getByDisplayValue('2-Bedroom Flat');
    await userEvent.clear(type);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(lastToast(store)).toMatchObject({ message: 'Unit code and type are required.' });

    await userEvent.type(type, '3-Bedroom Flat');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(store.getState().data.units[0]).toMatchObject({ id: 'u1', type: '3-Bedroom Flat', rent: 1_000_000 });
    expect(close).toHaveBeenCalled();
  });

  it('lets the unit move between buildings of the same property', () => {
    renderWithStore(<EditUnitModal unit={unit} onClose={onClose()} />, storeAs('manager'));
    expect(screen.getByRole('option', { name: 'Block B' })).toBeInTheDocument();
  });
});
