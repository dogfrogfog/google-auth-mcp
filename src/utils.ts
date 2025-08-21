/**
 * Retry helper with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries (default: 3)
 * @param baseDelay Base delay in milliseconds (default: 1000)
 * @returns Promise resolving to the function result
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Calculate delay: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError!;
}

/**
 * Sleep helper
 * @param ms Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a token is expired with buffer
 * @param expiryDate Expiry date in milliseconds
 * @param bufferMs Buffer time in milliseconds (default: 5 minutes)
 * @returns True if token is expired or will expire within buffer time
 */
export function isTokenExpired(expiryDate?: number, bufferMs: number = 300000): boolean {
  if (!expiryDate) {
    return true;
  }
  
  return expiryDate <= Date.now() + bufferMs;
}