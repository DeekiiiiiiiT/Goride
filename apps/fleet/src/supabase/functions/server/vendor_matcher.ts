/**
 * Vendor Name Matching Service
 * 
 * Provides fuzzy matching logic to suggest existing stations
 * for unverified vendor names.
 */

/**
 * Normalize vendor name for comparison
 * - Lowercase
 * - Remove special characters
 * - Trim whitespace
 * - Standardize spacing
 */
export function normalizeVendorName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')        // Normalize spaces
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy string matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create 2D array for dynamic programming
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Deletion
        matrix[i][j - 1] + 1,      // Insertion
        matrix[i - 1][j - 1] + cost // Substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity score between two strings (0-1)
 * 1.0 = exact match, 0.0 = completely different
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeVendorName(str1);
  const normalized2 = normalizeVendorName(str2);
  
  if (!normalized1 || !normalized2) return 0;
  if (normalized1 === normalized2) return 1.0;
  
  // Check for partial matches (one contains the other)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    const shorter = Math.min(normalized1.length, normalized2.length);
    const longer = Math.max(normalized1.length, normalized2.length);
    return 0.7 + (0.3 * (shorter / longer)); // 0.7-1.0 for partial matches
  }
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLen = Math.max(normalized1.length, normalized2.length);
  
  // Convert distance to similarity score
  const similarity = 1 - (distance / maxLen);
  
  return Math.max(0, similarity); // Ensure non-negative
}

/**
 * Find matching stations for an unverified vendor
 * @param vendorName - Name of unverified vendor
 * @param stations - Array of station objects
 * @param minConfidence - Minimum confidence threshold (default 0.5)
 * @param maxResults - Maximum number of results (default 5)
 * @returns Array of suggested matches with confidence scores
 */
export function suggestStationMatches(
  vendorName: string,
  stations: any[],
  minConfidence: number = 0.5,
  maxResults: number = 5
): Array<{
  station: any;
  similarity: number;
  reason: string;
}> {
  if (!vendorName || !stations || stations.length === 0) {
    return [];
  }
  
  const normalizedVendor = normalizeVendorName(vendorName);
  
  // Calculate similarity for each station
  const matches = stations
    .map(station => {
      const stationName = station.name || '';
      const brandName = station.brand || '';
      
      // Calculate similarity against both name and brand
      const nameSimilarity = calculateSimilarity(vendorName, stationName);
      const brandSimilarity = calculateSimilarity(vendorName, brandName);
      
      // Use the higher of the two
      const similarity = Math.max(nameSimilarity, brandSimilarity);
      
      // Determine match reason
      let reason = '';
      if (similarity >= 0.9) {
        reason = 'Near-exact match';
      } else if (similarity >= 0.7) {
        reason = 'Partial name match';
      } else if (normalizedVendor.includes(normalizeVendorName(brandName))) {
        reason = `Contains brand "${brandName}"`;
      } else if (normalizeVendorName(stationName).includes(normalizedVendor)) {
        reason = 'Vendor name found in station name';
      } else {
        reason = 'Similar name pattern';
      }
      
      return {
        station,
        similarity,
        reason
      };
    })
    .filter(match => match.similarity >= minConfidence)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
  
  return matches;
}

/**
 * Check if two vendor names are likely the same
 * More strict than similarity check - used for deduplication
 */
export function isSameVendor(name1: string, name2: string): boolean {
  const normalized1 = normalizeVendorName(name1);
  const normalized2 = normalizeVendorName(name2);
  
  if (!normalized1 || !normalized2) return false;
  
  // Exact match after normalization
  if (normalized1 === normalized2) return true;
  
  // One fully contains the other and length difference < 30%
  const shorter = Math.min(normalized1.length, normalized2.length);
  const longer = Math.max(normalized1.length, normalized2.length);
  
  if ((normalized1.includes(normalized2) || normalized2.includes(normalized1))) {
    return (shorter / longer) >= 0.7;
  }
  
  // Very high similarity (>= 0.85)
  return calculateSimilarity(name1, name2) >= 0.85;
}
