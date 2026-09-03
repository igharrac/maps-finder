/**
 * Brancheselectie voor de filtersidebar.
 *
 * De `types` zijn Google Places-types en gaan mee als includedTypes in het
 * zoekverzoek. Meer types betekent meer verzoeken en dus meer kosten, dus de
 * groepen zijn bewust klein gehouden.
 *
 * Alleen types uit Google's Tabel A mogen opgevraagd worden. Types uit Tabel B
 * (zoals general_contractor) krijg je wél terug als primaryType, maar een
 * verzoek ermee wordt geweigerd met INVALID_ARGUMENT.
 */
export type CategoryGroup = {
  id: string;
  label: string;
  types: string[];
  /** Groepen buiten de kern staan achter een uitklapper. */
  secondary?: boolean;
};

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: 'installatie',
    label: 'Installatie & techniek',
    types: ['plumber', 'electrician', 'locksmith'],
  },
  {
    id: 'bouw',
    label: 'Bouw & aannemerij',
    types: ['roofing_contractor', 'painter'],
  },
  {
    id: 'auto',
    label: 'Autobedrijf & schade',
    types: ['car_repair', 'car_dealer', 'car_wash'],
  },
  {
    id: 'zakelijk',
    label: 'Zakelijke dienstverlening',
    types: ['accounting', 'lawyer', 'insurance_agency', 'real_estate_agency'],
  },
  {
    id: 'zorg',
    label: 'Zorgpraktijken',
    types: ['dentist', 'physiotherapist', 'veterinary_care'],
  },
  {
    id: 'horeca',
    label: 'Horeca & ambacht',
    types: ['restaurant', 'cafe', 'bakery'],
  },

  // --- minder vaak gebruikt, staan achter "Meer branches" ---
  {
    id: 'detailhandel',
    label: 'Detailhandel',
    types: [
      'hardware_store',
      'electronics_store',
      'furniture_store',
      'home_goods_store',
      'clothing_store',
      'bicycle_store',
    ],
    secondary: true,
  },
  {
    id: 'wellness',
    label: 'Wellness & uiterlijk',
    types: ['gym', 'hair_salon', 'beauty_salon', 'spa', 'nail_salon'],
    secondary: true,
  },
  {
    id: 'transport',
    label: 'Transport & opslag',
    types: ['moving_company', 'storage', 'courier_service', 'warehouse'],
    secondary: true,
  },
  {
    id: 'groothandel',
    label: 'Groothandel & food',
    types: ['wholesaler', 'supermarket', 'butcher_shop', 'convenience_store'],
    secondary: true,
  },
  {
    id: 'verblijf',
    label: 'Recreatie & verblijf',
    types: ['hotel', 'campground', 'travel_agency'],
    secondary: true,
  },
  {
    id: 'onderwijs',
    label: 'Onderwijs',
    types: ['school', 'primary_school'],
    secondary: true,
  },
];

export const PRIMARY_GROUPS = CATEGORY_GROUPS.filter((g) => !g.secondary);
export const SECONDARY_GROUPS = CATEGORY_GROUPS.filter((g) => g.secondary);

const LABEL_BY_ID = new Map(CATEGORY_GROUPS.map((g) => [g.id, g.label]));

/** Namen van de branchegroepen waarin een bedrijf gevonden is. */
export function groupLabels(groupIds: string[]): string[] {
  return groupIds.map((id) => LABEL_BY_ID.get(id) ?? id);
}
