'use client';

import { useEffect, useMemo, useState } from 'react';
import { citiesFor, loadCountries, type CountryEntry } from '@/config/locations';
import { Field, Input, Select } from './form';

export interface LocationValue {
  country: string;
  state: string;
  city: string;
}

const OTHER = '__other__';

/**
 * A select whose value must be one of `options`. With `allowOther`, an
 * "Other…" entry reveals a text box — for places we have no list for. A saved
 * value that isn't in the list (older records) is shown that way too, so
 * editing never silently wipes it.
 */
function PickOrType({
  label, value, options, placeholder, onChange, allowOther = false, disabled = false, otherPlaceholder,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (next: string) => void;
  allowOther?: boolean;
  disabled?: boolean;
  otherPlaceholder?: string;
}) {
  const [typing, setTyping] = useState(false);
  // A different list (e.g. another state's cities) means the old "Other…" choice no longer applies.
  const optionsKey = options.join('\u0001');
  useEffect(() => setTyping(false), [optionsKey]);
  const unknownValue = value !== '' && !options.includes(value);
  const showTyping = allowOther && (typing || unknownValue);

  return (
    <Field label={label} required>
      <Select
        value={showTyping ? OTHER : value}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setTyping(true);
            onChange('');
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        {allowOther && <option value={OTHER}>Other…</option>}
      </Select>
      {showTyping && (
        <Input
          className="mt-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={otherPlaceholder ?? `Enter ${label.toLowerCase()}`}
          autoFocus={typing}
        />
      )}
    </Field>
  );
}

/**
 * Country → State → City, chosen from lists rather than typed. Changing a
 * level clears the ones below it. Renders three fields in a 3-column grid.
 */
export function LocationFields({ value, onChange }: { value: LocationValue; onChange: (next: LocationValue) => void }) {
  const [countries, setCountries] = useState<CountryEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    loadCountries().then((c) => live && setCountries(c));
    return () => { live = false; };
  }, []);

  const country = countries?.find((c) => c.name === value.country);
  const countryOptions = useMemo(() => countries?.map((c) => c.name) ?? [], [countries]);
  const stateOptions = country?.regions ?? [];
  const cityOptions = citiesFor(value.country, value.state);

  return (
    <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
      <PickOrType
        label="Country"
        value={value.country}
        // Until the list arrives keep the current value visible rather than a blank select.
        options={countries ? countryOptions : value.country ? [value.country] : []}
        placeholder={countries ? 'Select country' : 'Loading…'}
        disabled={!countries}
        onChange={(name) => onChange({ country: name, state: '', city: '' })}
      />
      <PickOrType
        label="State"
        value={value.state}
        options={stateOptions}
        placeholder={value.country ? 'Select state' : 'Select a country first'}
        disabled={!countries || !value.country}
        // A few countries have no regions in the dataset — let those be typed.
        allowOther={!!country && stateOptions.length === 0}
        onChange={(state) => onChange({ ...value, state, city: '' })}
      />
      <PickOrType
        label="City"
        value={value.city}
        options={cityOptions}
        placeholder={value.state ? 'Select city' : 'Select a state first'}
        disabled={!countries || !value.state}
        allowOther
        otherPlaceholder="Enter city or area"
        onChange={(city) => onChange({ ...value, city })}
      />
    </div>
  );
}
