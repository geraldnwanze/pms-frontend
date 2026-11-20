import { describe, expect, it } from 'vitest';
import { citiesFor, loadCountries } from './locations';

describe('loadCountries', () => {
  it('lists Nigeria first, then everyone else', async () => {
    const countries = await loadCountries();
    expect(countries[0].name).toBe('Nigeria');
    expect(countries.length).toBeGreaterThan(150);
    expect(countries.filter((c) => c.code === 'NG')).toHaveLength(1);
  });

  it('is cached', async () => {
    expect(await loadCountries()).toBe(await loadCountries());
  });
});

describe('citiesFor', () => {
  it('has a curated city list for every Nigerian state — and for nothing that is not one', async () => {
    const ng = (await loadCountries())[0];
    expect(ng.regions.length).toBeGreaterThanOrEqual(37);
    for (const state of ng.regions) {
      expect(citiesFor('Nigeria', state), state).not.toHaveLength(0);
    }
  });

  it('has no duplicate cities within a state', async () => {
    const ng = (await loadCountries())[0];
    for (const state of ng.regions) {
      const cities = citiesFor('Nigeria', state);
      expect(new Set(cities).size, state).toBe(cities.length);
    }
  });

  it('knows the neighbourhoods people actually type', () => {
    expect(citiesFor('Nigeria', 'Lagos')).toEqual(expect.arrayContaining(['Lekki', 'Ikeja', 'Victoria Island']));
    expect(citiesFor('Nigeria', 'Abuja Federal Capital Territory')).toContain('Maitama');
  });

  it('returns an empty list (→ "Other…") for unknown states and other countries', () => {
    expect(citiesFor('Nigeria', 'Atlantis')).toEqual([]);
    expect(citiesFor('Ghana', 'Greater Accra')).toEqual([]);
    expect(citiesFor('', '')).toEqual([]);
  });
});
