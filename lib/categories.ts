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
];
