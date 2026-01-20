/**
 * pMap - Parallel Map with Concurrency Control
 * 
 * Maps over an array with an asynchronous function, limiting the number of 
 * concurrent promises to avoid resource exhaustion.
 * 
 * @param iterable The array to map over
 * @param mapper The async function to apply to each item
 * @param options Configuration object containing 'concurrency' limit
 * @returns A promise that resolves to an array of results in the same order as the input
 */
export async function pMap<T, R>(
  iterable: T[],
  mapper: (item: T, index: number) => Promise<R>,
  { concurrency }: { concurrency: number }
): Promise<R[]> {
  const results: R[] = new Array(iterable.length);
  const iterator = iterable.entries();
  
  // Create 'concurrency' number of workers
  // They all share the same iterator, so they will pull unique items
  const workers = Array.from({ length: concurrency }, async () => {
    for (const [index, item] of iterator) {
      try {
        results[index] = await mapper(item, index);
      } catch (err) {
        // We throw immediately to stop processing if one fails, 
        // consistent with Promise.all behavior.
        // For resilience, the mapper itself should handle errors if needed.
        throw err;
      }
    }
  });

  await Promise.all(workers);
  return results;
}
