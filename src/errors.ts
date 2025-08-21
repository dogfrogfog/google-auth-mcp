export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}
