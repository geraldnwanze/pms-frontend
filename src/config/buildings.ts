/**
 * Structural styles a building block can take. `value` is what we store on
 * `Building.buildingType`; `label` is what the UI shows. Add or reorder freely
 * — the backend accepts any string up to 60 chars.
 */
export const BUILDING_TYPES: { value: string; label: string }[] = [
  { value: 'detached-duplex', label: 'Detached duplex' },
  { value: 'semi-detached-duplex', label: 'Semi-detached duplex' },
  { value: 'terraced-duplex', label: 'Terrace of duplexes' },
  { value: 'terrace-of-houses', label: 'Terrace / row of houses' },
  { value: 'street-of-buildings', label: 'Street of buildings' },
  { value: 'block-of-flats', label: 'Block of flats' },
  { value: 'storey-building', label: 'Storey building' },
  { value: 'bungalow', label: 'Bungalow' },
  { value: 'semi-detached-bungalow', label: 'Semi-detached bungalow' },
  { value: 'maisonette', label: 'Maisonette' },
  { value: 'mixed-use', label: 'Mixed-use building' },
  { value: 'other', label: 'Other' },
];

const LABELS = new Map(BUILDING_TYPES.map((t) => [t.value, t.label]));

/** Human label for a stored buildingType value (falls back to the raw value). */
export function buildingTypeLabel(value?: string | null): string | undefined {
  if (!value) return undefined;
  return LABELS.get(value) ?? value;
}
