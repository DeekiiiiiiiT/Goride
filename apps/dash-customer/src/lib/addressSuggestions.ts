export type AddressSuggestion = {
  id: string;
  line1: string;
  line2?: string;
  area: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

export const KINGSTON_ADDRESS_SUGGESTIONS: AddressSuggestion[] = [
  { id: '1', line1: '45 Constant Spring Rd', line2: 'Apt 12B', area: 'Kingston 10', lat: 18.036, lng: -76.795 },
  { id: '2', line1: '78 Half Way Tree Rd', area: 'Kingston 10', lat: 18.013, lng: -76.779 },
  { id: '3', line1: '12 Hope Rd', line2: 'Unit 4', area: 'Kingston 6', lat: 18.018, lng: -76.75 },
  { id: '4', line1: '34 Old Hope Rd', area: 'Kingston 5', lat: 18.01, lng: -76.76 },
  { id: '5', line1: '101 Barbican Rd', area: 'Kingston 6', lat: 18.03, lng: -76.74 },
  { id: '6', line1: '22 Knutsford Blvd', area: 'New Kingston', lat: 18.007, lng: -76.783 },
  { id: '7', line1: '5 Oxford Rd', area: 'New Kingston', lat: 18.005, lng: -76.785 },
  { id: '8', line1: '67 Mannings Hill Rd', area: 'Kingston 8', lat: 18.05, lng: -76.81 },
];

export function searchAddressSuggestions(query: string): AddressSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return KINGSTON_ADDRESS_SUGGESTIONS.filter(
    (s) =>
      s.line1.toLowerCase().includes(q) ||
      s.area.toLowerCase().includes(q) ||
      s.line2?.toLowerCase().includes(q)
  );
}
