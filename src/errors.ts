/**
 * Base authentication error class
 */
export class AuthenticationError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'AuthenticationError';
    this.cause = cause;
  }
}

/**
 * Token expired error - subclass of AuthenticationError
 * Thrown when refresh token is missing or invalid
 */
export class TokenExpiredError extends AuthenticationError {
  constructor(message: string = 'Token expired and refresh token is unavailable', cause?: Error) {
    super(message, cause);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Storage error - for file/storage related issues
 */
export class StorageError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}