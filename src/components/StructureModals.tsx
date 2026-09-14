'use client';

import { useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, scopedPropertyIds, selectCurrentUser } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import { Modal, Field, Input, Select, Textarea } from '@/components/ui';
import { can } from '@/config/roles';
import { BUILDING_TYPES } from '@/config/buildings';
import { uid } from '@/lib/format';
import type {
  Building as BuildingT,
  Unit as UnitT,
  UnitStatus,
  FurnishingLevel,
  Property,
  PropertyType,
  PropertyStatus,
} from '@/types';

const PROPERTY_TYPES: PropertyType[] = ['residential', 'commercial', 'industrial', 'mixed-use', 'estate'];
const PROPERTY_STATUSES: PropertyStatus[] = ['active', 'construction', 'renovation', 'inactive', 'sold', 'archived'];

/** Properties the current user may add structure to (own properties for an owner; all scoped for admin/manager). */
function useManageableProperties() {
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);
  const me = useAppSelector(selectCurrentUser);
  const anyScoped = can(me?.role, 'create');
  return useMemo(
    () =>
      data.properties.filter(
        (p) =>
          scoped.has(p.id) &&
          (anyScoped || (p.owners ?? []).some((o) => o.ownerId === me?.id)),
      ),
    [data.properties, scoped, anyScoped, me?.id],
  );
}

export function AddBuildingModal({
  propertyId: fixedPropertyId,
  onClose,
}: {
  propertyId?: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const properties = useManageableProperties();

  const [propertyId, setPropertyId] = useState(fixedPropertyId ?? properties[0]?.id ?? '');
  const [name, setName] = useState('');
  const [buildingType, setBuildingType] = useState(BUILDING_TYPES[0].value);
  const [floors, setFloors] = useState(1);
  const [description, setDescription] = useState('');

  const submit = () => {
    if (!propertyId) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select a property.' }));
      return;
    }
    if (!name.trim()) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Add a building name.' }));
      return;
    }
    dispatch(
      dataActions.createBuilding({
        propertyId,
        name: name.trim(),
        buildingType,
        floors: Number(floors) || 1,
        description: description.trim() || undefined,
      } as Omit<BuildingT, 'id' | 'code'>),
    );
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Building added.' }));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add building"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Add building</button>
        </>
      }
    >
      <div className="space-y-4">
        {!fixedPropertyId && (
          <Field label="Property">
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Building type" hint="How this block is laid out — a duplex, a terrace of duplexes, a block of flats, a storey building…">
          <Select value={buildingType} onChange={(e) => setBuildingType(e.target.value)}>
            {BUILDING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Building name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Block A" />
          </Field>
          <Field label="Floors">
            <Input type="number" min={1} value={floors} onChange={(e) => setFloors(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

const UNIT_STATUSES: UnitStatus[] = [
  'available', 'occupied', 'reserved', 'maintenance', 'renovation', 'unavailable',
];
const FURNISHINGS: FurnishingLevel[] = ['unfurnished', 'semi-furnished', 'furnished'];

export function AddUnitModal({
  propertyId: fixedPropertyId,
  buildingId: fixedBuildingId,
  onClose,
}: {
  propertyId?: string;
  buildingId?: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const properties = useManageableProperties();

  const [propertyId, setPropertyId] = useState(fixedPropertyId ?? properties[0]?.id ?? '');
  const buildings = useMemo(
    () => data.buildings.filter((b) => b.propertyId === propertyId),
    [data.buildings, propertyId],
  );
  const [buildingId, setBuildingId] = useState(fixedBuildingId ?? buildings[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [type, setType] = useState('');
  const [floor, setFloor] = useState(0);
  const [status, setStatus] = useState<UnitStatus>('available');
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [sizeSqm, setSizeSqm] = useState(0);
  const [furnishing, setFurnishing] = useState<FurnishingLevel>('unfurnished');
  const [parkingSpaces, setParkingSpaces] = useState(0);
  const [rent, setRent] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [securityDeposit, setSecurityDeposit] = useState(0);
  const [utilityCharge, setUtilityCharge] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);

  // Keep the building selector in step when the property changes.
  const effectiveBuildingId = buildings.some((b) => b.id === buildingId)
    ? buildingId
    : (buildings[0]?.id ?? '');

  const submit = () => {
    if (!effectiveBuildingId) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Add a building to this property first.' }));
      return;
    }
    if (!code.trim() || !type.trim()) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Unit code and type are required.' }));
      return;
    }
    dispatch(
      dataActions.createUnit({
        buildingId: effectiveBuildingId,
        propertyId,
        code: code.trim(),
        type: type.trim(),
        floor: Number(floor) || 0,
        sizeSqm: Number(sizeSqm) || 0,
        bedrooms: Number(bedrooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        furnishing,
        parkingSpaces: Number(parkingSpaces) || 0,
        status,
        rent: Number(rent) || 0,
        serviceCharge: Number(serviceCharge) || 0,
        securityDeposit: Number(securityDeposit) || 0,
        utilityCharge: Number(utilityCharge) || 0,
        otherCharges: Number(otherCharges) || 0,
      } as Omit<UnitT, 'id' | 'meterIds'>),
    );
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Unit added.' }));
    onClose();
  };

  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(Number(e.target.value));

  return (
    <Modal
      open
      onClose={onClose}
      title="Add unit"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Add unit</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {!fixedPropertyId && (
            <Field label="Property">
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          )}
          {!fixedBuildingId && (
            <Field label="Building">
              <Select value={effectiveBuildingId} onChange={(e) => setBuildingId(e.target.value)}>
                {buildings.length === 0 && <option value="">No buildings yet</option>}
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Unit code" required>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. A01" />
          </Field>
          <Field label="Type" required>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. 2-Bedroom Flat" />
          </Field>
          <Field label="Floor">
            <Input type="number" value={floor} onChange={num(setFloor)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as UnitStatus)}>
              {UNIT_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Bedrooms">
            <Input type="number" min={0} value={bedrooms} onChange={num(setBedrooms)} />
          </Field>
          <Field label="Bathrooms">
            <Input type="number" min={0} value={bathrooms} onChange={num(setBathrooms)} />
          </Field>
          <Field label="Size (m²)">
            <Input type="number" min={0} value={sizeSqm} onChange={num(setSizeSqm)} />
          </Field>
          <Field label="Furnishing">
            <Select value={furnishing} onChange={(e) => setFurnishing(e.target.value as FurnishingLevel)}>
              {FURNISHINGS.map((f) => (
                <option key={f} value={f} className="capitalize">{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Parking spaces">
            <Input type="number" min={0} value={parkingSpaces} onChange={num(setParkingSpaces)} />
          </Field>
        </div>

        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Charges (₦)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rent"><Input type="number" min={0} value={rent} onChange={num(setRent)} /></Field>
          <Field label="Service charge"><Input type="number" min={0} value={serviceCharge} onChange={num(setServiceCharge)} /></Field>
          <Field label="Security deposit"><Input type="number" min={0} value={securityDeposit} onChange={num(setSecurityDeposit)} /></Field>
          <Field label="Utility charge"><Input type="number" min={0} value={utilityCharge} onChange={num(setUtilityCharge)} /></Field>
          <Field label="Other charges"><Input type="number" min={0} value={otherCharges} onChange={num(setOtherCharges)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

export function EditBuildingModal({ building, onClose }: { building: BuildingT; onClose: () => void }) {
  const dispatch = useAppDispatch();

  const [name, setName] = useState(building.name ?? '');
  const [code, setCode] = useState(building.code ?? '');
  const [buildingType, setBuildingType] = useState(building.buildingType ?? BUILDING_TYPES[0].value);
  const [floors, setFloors] = useState(building.floors ?? 1);
  const [description, setDescription] = useState(building.description ?? '');

  const submit = () => {
    if (!name.trim()) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Building name is required.' }));
      return;
    }
    if (!code.trim()) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Building code is required.' }));
      return;
    }
    dispatch(
      dataActions.updateBuilding({
        id: building.id,
        name: name.trim(),
        code: code.trim(),
        buildingType,
        floors: Number(floors) || 1,
        description: description.trim() || undefined,
      }),
    );
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Building updated.' }));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit building"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Save changes</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Building type">
          <Select value={buildingType} onChange={(e) => setBuildingType(e.target.value)}>
            {BUILDING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Building name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Block A" />
          </Field>
          <Field label="Code" required>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. PROP-003-B3" />
          </Field>
          <Field label="Floors">
            <Input type="number" min={1} value={floors} onChange={(e) => setFloors(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

export function EditPropertyModal({ property, onClose }: { property: Property; onClose: () => void }) {
  const dispatch = useAppDispatch();

  const [form, setForm] = useState({
    name: property.name ?? '',
    type: (property.type ?? 'residential') as PropertyType,
    status: (property.status ?? 'active') as PropertyStatus,
    address: property.address ?? '',
    city: property.city ?? '',
    state: property.state ?? '',
    country: property.country ?? 'Nigeria',
    yearBuilt: property.yearBuilt ?? 0,
    landSizeSqm: property.landSizeSqm ?? 0,
    builtUpAreaSqm: property.builtUpAreaSqm ?? 0,
    estimatedValue: property.estimatedValue ?? 0,
    insuranceProvider: property.insuranceProvider ?? '',
    insuranceExpiry: property.insuranceExpiry ?? '',
    taxReference: property.taxReference ?? '',
    description: property.description ?? '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Property name is required.' }));
      return;
    }
    dispatch(
      dataActions.updateProperty({
        id: property.id,
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim(),
        yearBuilt: Number(form.yearBuilt) || undefined,
        landSizeSqm: Number(form.landSizeSqm) || 0,
        builtUpAreaSqm: Number(form.builtUpAreaSqm) || 0,
        estimatedValue: Number(form.estimatedValue) || 0,
        insuranceProvider: form.insuranceProvider.trim() || undefined,
        insuranceExpiry: form.insuranceExpiry || undefined,
        taxReference: form.taxReference.trim() || undefined,
        description: form.description.trim() || undefined,
      }),
    );
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Property updated.' }));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit property"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Save changes</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Marina Heights" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => set('type', e.target.value as PropertyType)} className="capitalize">
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value as PropertyStatus)} className="capitalize">
            {PROPERTY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street address" />
        </Field>
        <Field label="City"><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="State"><Input value={form.state} onChange={(e) => set('state', e.target.value)} /></Field>
        <Field label="Country"><Input value={form.country} onChange={(e) => set('country', e.target.value)} /></Field>
        <Field label="Year built"><Input type="number" value={form.yearBuilt} onChange={(e) => set('yearBuilt', Number(e.target.value))} /></Field>
        <Field label="Land size (m²)"><Input type="number" min={0} value={form.landSizeSqm} onChange={(e) => set('landSizeSqm', Number(e.target.value))} /></Field>
        <Field label="Built-up area (m²)"><Input type="number" min={0} value={form.builtUpAreaSqm} onChange={(e) => set('builtUpAreaSqm', Number(e.target.value))} /></Field>
        <Field label="Estimated value (₦)"><Input type="number" min={0} value={form.estimatedValue} onChange={(e) => set('estimatedValue', Number(e.target.value))} /></Field>
        <Field label="Insurance provider"><Input value={form.insuranceProvider} onChange={(e) => set('insuranceProvider', e.target.value)} /></Field>
        <Field label="Insurance expiry"><Input type="date" value={form.insuranceExpiry?.slice(0, 10)} onChange={(e) => set('insuranceExpiry', e.target.value)} /></Field>
        <Field label="Tax reference"><Input value={form.taxReference} onChange={(e) => set('taxReference', e.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Short description of the property" />
        </Field>
      </div>
    </Modal>
  );
}

export function EditUnitModal({ unit, onClose }: { unit: UnitT; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const buildings = useMemo(
    () => data.buildings.filter((b) => b.propertyId === unit.propertyId),
    [data.buildings, unit.propertyId],
  );

  const [buildingId, setBuildingId] = useState(unit.buildingId);
  const [code, setCode] = useState(unit.code ?? '');
  const [type, setType] = useState(unit.type ?? '');
  const [floor, setFloor] = useState(unit.floor ?? 0);
  const [status, setStatus] = useState<UnitStatus>(unit.status);
  const [bedrooms, setBedrooms] = useState(unit.bedrooms ?? 0);
  const [bathrooms, setBathrooms] = useState(unit.bathrooms ?? 0);
  const [sizeSqm, setSizeSqm] = useState(unit.sizeSqm ?? 0);
  const [furnishing, setFurnishing] = useState<FurnishingLevel>(unit.furnishing ?? 'unfurnished');
  const [parkingSpaces, setParkingSpaces] = useState(unit.parkingSpaces ?? 0);
  const [rent, setRent] = useState(unit.rent ?? 0);
  const [serviceCharge, setServiceCharge] = useState(unit.serviceCharge ?? 0);
  const [securityDeposit, setSecurityDeposit] = useState(unit.securityDeposit ?? 0);
  const [utilityCharge, setUtilityCharge] = useState(unit.utilityCharge ?? 0);
  const [otherCharges, setOtherCharges] = useState(unit.otherCharges ?? 0);

  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(Number(e.target.value));

  const submit = () => {
    if (!code.trim() || !type.trim()) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Unit code and type are required.' }));
      return;
    }
    dispatch(
      dataActions.updateUnit({
        id: unit.id,
        buildingId: buildingId || unit.buildingId,
        code: code.trim(),
        type: type.trim(),
        floor: Number(floor) || 0,
        sizeSqm: Number(sizeSqm) || 0,
        bedrooms: Number(bedrooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        furnishing,
        parkingSpaces: Number(parkingSpaces) || 0,
        status,
        rent: Number(rent) || 0,
        serviceCharge: Number(serviceCharge) || 0,
        securityDeposit: Number(securityDeposit) || 0,
        utilityCharge: Number(utilityCharge) || 0,
        otherCharges: Number(otherCharges) || 0,
      }),
    );
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Unit updated.' }));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit unit ${unit.code}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Save changes</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {buildings.length > 1 && (
            <Field label="Building">
              <Select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Unit code" required>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. A01" />
          </Field>
          <Field label="Type" required>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. 2-Bedroom Flat" />
          </Field>
          <Field label="Floor">
            <Input type="number" value={floor} onChange={num(setFloor)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as UnitStatus)}>
              {UNIT_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Bedrooms">
            <Input type="number" min={0} value={bedrooms} onChange={num(setBedrooms)} />
          </Field>
          <Field label="Bathrooms">
            <Input type="number" min={0} value={bathrooms} onChange={num(setBathrooms)} />
          </Field>
          <Field label="Size (m²)">
            <Input type="number" min={0} value={sizeSqm} onChange={num(setSizeSqm)} />
          </Field>
          <Field label="Furnishing">
            <Select value={furnishing} onChange={(e) => setFurnishing(e.target.value as FurnishingLevel)}>
              {FURNISHINGS.map((f) => (
                <option key={f} value={f} className="capitalize">{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Parking spaces">
            <Input type="number" min={0} value={parkingSpaces} onChange={num(setParkingSpaces)} />
          </Field>
        </div>

        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Charges (₦)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rent"><Input type="number" min={0} value={rent} onChange={num(setRent)} /></Field>
          <Field label="Service charge"><Input type="number" min={0} value={serviceCharge} onChange={num(setServiceCharge)} /></Field>
          <Field label="Security deposit"><Input type="number" min={0} value={securityDeposit} onChange={num(setSecurityDeposit)} /></Field>
          <Field label="Utility charge"><Input type="number" min={0} value={utilityCharge} onChange={num(setUtilityCharge)} /></Field>
          <Field label="Other charges"><Input type="number" min={0} value={otherCharges} onChange={num(setOtherCharges)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
