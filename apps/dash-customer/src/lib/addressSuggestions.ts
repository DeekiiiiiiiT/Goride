export type AddressSuggestion = {
  id: string;
  line1: string;
  line2?: string;
  area: string;
};

export const KINGSTON_ADDRESS_SUGGESTIONS: AddressSuggestion[] = [
  { id: '1', line1: '45 Constant Spring Rd', line2: 'Apt 12B', area: 'Kingston 10' },
  { id: '2', line1: '78 Half Way Tree Rd', area: 'Kingston 10' },
  { id: '3', line1: '12 Hope Rd', line2: 'Unit 4', area: 'Kingston 6' },
  { id: '4', line1: '34 Old Hope Rd', area: 'Kingston 5' },
  { id: '5', line1: '101 Barbican Rd', area: 'Kingston 6' },
  { id: '6', line1: '22 Knutsford Blvd', area: 'New Kingston' },
  { id: '7', line1: '5 Oxford Rd', area: 'New Kingston' },
  { id: '8', line1: '67 Mannings Hill Rd', area: 'Kingston 8' },
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
