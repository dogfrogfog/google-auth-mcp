export { createAuth } from './auth';
export { AuthenticationError, TokenExpiredError, StorageError } from './errors';
export { Storage } from './storage';
export type { AuthOptions, GoogleAuthMCP, CredentialsJson, TokenData } from './auth'; // Adjust if types are centralized
// Note: Ensure types match PRD spec; this assumes they are defined in auth.ts or here.
export interface CredentialsJson {
  web?: { client_id: string; client_secret: string; redirect_uris: string[]; token_uri?: string; auth_uri?: string; };
  installed?: { client_id: string; client_secret: string; redirect_uris: string[]; token_uri?: string; auth_uri?: string; };
}

export interface TokenData {
  type: 'authorized_user';
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
}

export interface AuthOptions {
  scopes: string[];
  credentialsPath?: string;
  tokenPath?: string;
  storage?: Storage;
  accountId?: string;
  logger?: Pick<Console, 'log' | 'error'>;
}

export interface GoogleAuthMCP {
  getClient(): Promise<import('google-auth-library').OAuth2Client>;
  isAuthenticated(): Promise<boolean>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string>;
  getAuthHeader(): Promise<{ Authorization: string }>;
}
