/**
 * Country → state → city data for the property forms.
 *
 * Countries and their states/regions come from `country-region-data` (MIT),
 * loaded lazily so its ~600 KB stays out of the main bundle until a form that
 * needs it opens. That package has no cities, so cities are curated here — in
 * full for Nigeria (every state, including the usual neighbourhoods of Lagos
 * and Abuja) — and any other place falls back to "Other…" in the picker.
 */

export interface CountryEntry {
  name: string;
  code: string;
  regions: string[];
}

let cache: Promise<CountryEntry[]> | null = null;

/** Every country with its states/regions, Nigeria first. Cached after the first call. */
export function loadCountries(): Promise<CountryEntry[]> {
  cache ??= import('country-region-data').then(({ allCountries }) => {
    const all: CountryEntry[] = allCountries.map(([name, code, regions]) => ({
      name,
      code,
      regions: regions.map(([region]) => region),
    }));
    return [...all.filter((c) => c.code === 'NG'), ...all.filter((c) => c.code !== 'NG')];
  });
  return cache;
}

/** Cities/towns selectable for a state. Empty when we have no curated list for it. */
export function citiesFor(country: string, state: string): string[] {
  if (country === 'Nigeria') return NIGERIA_CITIES[state] ?? [];
  return [];
}

// Keys match the state names `country-region-data` uses for Nigeria.
const NIGERIA_CITIES: Record<string, string[]> = {
  Abia: ['Umuahia', 'Aba', 'Arochukwu', 'Ohafia', 'Bende', 'Isuikwuato'],
  'Abuja Federal Capital Territory': [
    'Abuja', 'Asokoro', 'Maitama', 'Wuse', 'Garki', 'Jabi', 'Utako', 'Gwarinpa', 'Katampe', 'Kado',
    'Life Camp', 'Lokogoma', 'Apo', 'Lugbe', 'Kubwa', 'Bwari', 'Gwagwalada', 'Kuje', 'Mpape', 'Nyanya',
  ],
  Adamawa: ['Yola', 'Jimeta', 'Mubi', 'Numan', 'Ganye', 'Gombi'],
  'Akwa Ibom': ['Uyo', 'Eket', 'Ikot Ekpene', 'Oron', 'Abak', 'Ikot Abasi'],
  Anambra: ['Awka', 'Onitsha', 'Nnewi', 'Ekwulobia', 'Agulu', 'Ihiala', 'Obosi'],
  Bauchi: ['Bauchi', 'Azare', 'Misau', "Jama'are", 'Katagum', 'Ningi'],
  Bayelsa: ['Yenagoa', 'Brass', 'Ogbia', 'Sagbama', 'Nembe'],
  Benue: ['Makurdi', 'Gboko', 'Otukpo', 'Katsina-Ala', 'Vandeikya', 'Adikpo'],
  Borno: ['Maiduguri', 'Bama', 'Biu', 'Dikwa', 'Gwoza', 'Konduga'],
  'Cross River': ['Calabar', 'Ogoja', 'Ikom', 'Obudu', 'Akamkpa', 'Ugep'],
  Delta: ['Asaba', 'Warri', 'Effurun', 'Sapele', 'Ughelli', 'Agbor', 'Oleh', 'Abraka', 'Kwale'],
  Ebonyi: ['Abakaliki', 'Afikpo', 'Onueke', 'Ishieke', 'Ezzamgbo'],
  Edo: ['Benin City', 'Auchi', 'Ekpoma', 'Uromi', 'Igarra', 'Irrua'],
  Ekiti: ['Ado-Ekiti', 'Ikere-Ekiti', 'Ijero-Ekiti', 'Ikole-Ekiti', 'Omuo-Ekiti', 'Efon-Alaaye', 'Aramoko-Ekiti'],
  Enugu: ['Enugu', 'Nsukka', 'Agbani', 'Awgu', 'Oji River', 'Udi', 'Emene'],
  Gombe: ['Gombe', 'Kumo', 'Bajoga', 'Dukku', 'Kaltungo', 'Billiri'],
  Imo: ['Owerri', 'Orlu', 'Okigwe', 'Oguta', 'Mbieri', 'Aboh Mbaise'],
  Jigawa: ['Dutse', 'Hadejia', 'Gumel', 'Kazaure', 'Ringim', 'Birnin Kudu'],
  Kaduna: ['Kaduna', 'Zaria', 'Kafanchan', 'Sabon Gari', 'Birnin Gwari', 'Kachia', 'Saminaka'],
  Kano: ['Kano', 'Wudil', 'Gaya', 'Rano', 'Bichi', 'Dambatta', 'Kumbotso'],
  Katsina: ['Katsina', 'Daura', 'Funtua', 'Malumfashi', 'Dutsin-Ma', 'Kankia'],
  Kebbi: ['Birnin Kebbi', 'Argungu', 'Yauri', 'Zuru', 'Jega', 'Koko'],
  Kogi: ['Lokoja', 'Okene', 'Kabba', 'Idah', 'Ankpa', 'Dekina', 'Anyigba'],
  Kwara: ['Ilorin', 'Offa', 'Omu-Aran', 'Lafiagi', 'Jebba', 'Patigi', 'Share'],
  Lagos: [
    'Lagos Island', 'Ikeja', 'Lekki', 'Victoria Island', 'Ikoyi', 'Ajah', 'Sangotedo', 'Surulere', 'Yaba',
    'Maryland', 'Gbagada', 'Magodo', 'Ojota', 'Ketu', 'Isolo', 'Mushin', 'Oshodi', 'Agege', 'Alimosho',
    'Apapa', 'Festac Town', 'Amuwo-Odofin', 'Ojo', 'Badagry', 'Ikorodu', 'Epe',
  ],
  Nasarawa: ['Lafia', 'Keffi', 'Karu', 'Mararaba', 'Akwanga', 'Nasarawa', 'Doma', 'Masaka'],
  Niger: ['Minna', 'Bida', 'Suleja', 'Kontagora', 'New Bussa', 'Lapai', 'Tegina', 'Mokwa'],
  Ogun: ['Abeokuta', 'Ijebu-Ode', 'Sagamu', 'Ota', 'Agbara', 'Ilaro', 'Ifo', 'Mowe', 'Ibafo', 'Ikenne', 'Ayetoro'],
  Ondo: ['Akure', 'Ondo', 'Owo', 'Ikare', 'Okitipupa', 'Ore', 'Ile Oluji', 'Idanre'],
  Osun: ['Osogbo', 'Ile-Ife', 'Ilesa', 'Ede', 'Iwo', 'Ikirun', 'Ila Orangun', 'Ikire'],
  Oyo: ['Ibadan', 'Ogbomosho', 'Oyo', 'Iseyin', 'Saki', 'Igboho', 'Eruwa', 'Igbo-Ora', 'Lanlate'],
  Plateau: ['Jos', 'Bukuru', 'Pankshin', 'Shendam', 'Vom', 'Barkin Ladi', 'Mangu'],
  Rivers: ['Port Harcourt', 'Obio-Akpor', 'Bonny', 'Okrika', 'Eleme', 'Ahoada', 'Omoku', 'Bori'],
  Sokoto: ['Sokoto', 'Tambuwal', 'Wurno', 'Gwadabawa', 'Illela', 'Gada', 'Goronyo'],
  Taraba: ['Jalingo', 'Wukari', 'Bali', 'Takum', 'Zing', 'Mutum Biyu', 'Gembu'],
  Yobe: ['Damaturu', 'Potiskum', 'Gashua', 'Nguru', 'Geidam', 'Buni Yadi'],
  Zamfara: ['Gusau', 'Kaura Namoda', 'Anka', 'Talata Mafara', 'Tsafe', 'Zurmi', 'Bakura'],
};
