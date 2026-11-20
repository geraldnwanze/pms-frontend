import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { LocationFields, type LocationValue } from './LocationFields';

function Harness({ initial }: { initial: LocationValue }) {
  const [v, setV] = useState(initial);
  return (<><LocationFields value={v} onChange={setV} /><output data-testid="v">{JSON.stringify(v)}</output></>);
}
const val = () => JSON.parse(screen.getByTestId('v').textContent!) as LocationValue;
const empty = { country: '', state: '', city: '' };
// Field labels aren't programmatically tied to their controls, so find the selects by order: Country, State, City.
const ORDER = ['Country', 'State', 'City'];
const select = (label: string) => screen.getAllByRole('combobox')[ORDER.indexOf(label)] as HTMLSelectElement;

async function ready() {
  await waitFor(() => expect(select('Country')).toBeEnabled());
}

describe('LocationFields', () => {
  it('offers Nigeria first and locks state and city until their parent is chosen', async () => {
    render(<Harness initial={empty} />);
    await ready();
    expect(select('Country').options[1].text).toBe('Nigeria');
    expect(select('State')).toBeDisabled();
    expect(select('City')).toBeDisabled();
  });

  it('cascades country → state → city using lists, not free text', async () => {
    render(<Harness initial={empty} />);
    await ready();
    await userEvent.selectOptions(select('Country'), 'Nigeria');
    expect(select('State')).toBeEnabled();
    await userEvent.selectOptions(select('State'), 'Lagos');
    expect(Array.from(select('City').options).map((o) => o.text)).toEqual(expect.arrayContaining(['Lekki', 'Ikeja', 'Other…']));
    await userEvent.selectOptions(select('City'), 'Lekki');
    expect(val()).toEqual({ country: 'Nigeria', state: 'Lagos', city: 'Lekki' });
  });

  it('clears the levels below when a parent changes', async () => {
    render(<Harness initial={{ country: 'Nigeria', state: 'Lagos', city: 'Lekki' }} />);
    await ready();
    await userEvent.selectOptions(select('State'), 'Oyo');
    expect(val()).toEqual({ country: 'Nigeria', state: 'Oyo', city: '' });
    await userEvent.selectOptions(select('Country'), 'Ghana');
    expect(val()).toEqual({ country: 'Ghana', state: '', city: '' });
  });

  it('lets a city outside the list be typed via "Other…"', async () => {
    render(<Harness initial={{ country: 'Nigeria', state: 'Lagos', city: '' }} />);
    await ready();
    await userEvent.selectOptions(select('City'), 'Other…');
    await userEvent.type(screen.getByPlaceholderText('Enter city or area'), 'Mowe Estate');
    expect(val().city).toBe('Mowe Estate');
  });

  it('keeps a saved city that is not in the list, shown as Other, instead of wiping it', async () => {
    render(<Harness initial={{ country: 'Nigeria', state: 'Lagos', city: 'Old Town' }} />);
    await ready();
    expect(select('City').value).not.toBe('');
    expect(screen.getByPlaceholderText('Enter city or area')).toHaveValue('Old Town');
    expect(val().city).toBe('Old Town');
  });

  it('has no curated cities outside Nigeria, so the city can be typed', async () => {
    render(<Harness initial={{ country: 'Ghana', state: 'Greater Accra', city: '' }} />);
    await ready();
    expect(Array.from(select('City').options).map((o) => o.text)).toEqual(['Select city', 'Other…']);
  });
});
