import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { StorageError } from './errors.js';

/**
 * Credentials JSON structure from Google Cloud Console
 */
export interface CredentialsJson {
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
    token_uri?: string;
    auth_uri?: string;
  };
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
    token_uri?: string;
    auth_uri?: string;
  };
}

/**
 * Token data structure for storing OAuth tokens
 */
export interface TokenData {
  type: 'authorized_user';
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
}

/**
 * Abstract storage interface for credentials and tokens
 */
export interface Storage {
  readCredentials(): Promise<CredentialsJson>;
  readToken(accountId?: string): Promise<TokenData | null>;
  writeToken(token: TokenData, accountId?: string): Promise<void>;
  deleteToken(accountId?: string): Promise<void>;
}

/**
 * File-based storage implementation with secure permissions
 */
export class FileStorage implements Storage {
  constructor(
    private readonly credentialsPath: string = './credentials.json',
    private readonly tokenPath: string = './tokens/default.token.json'
  ) {}

  /**
   * Read and validate credentials.json
   */
  async readCredentials(): Promise<CredentialsJson> {
    try {
      const credentialsPath = resolve(this.credentialsPath);
      const data = await fs.readFile(credentialsPath, 'utf-8');
      const credentials: CredentialsJson = JSON.parse(data);

      // Validate that either web or installed key exists
      if (!credentials.web && !credentials.installed) {
        throw new StorageError('Invalid credentials.json: must contain either "web" or "installed" key');
      }

      // Validate required fields
      const config = credentials.web || credentials.installed!;
      if (!config.client_id || !config.client_secret || !config.redirect_uris) {
        throw new StorageError('Invalid credentials.json: missing required fields (client_id, client_secret, redirect_uris)');
      }

      return credentials;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ENOENT')) {
        throw new StorageError(`Credentials file not found at ${this.credentialsPath}`, error as Error);
      }
      
      throw new StorageError(`Failed to read credentials: ${message}`, error as Error);
    }
  }

  /**
   * Read token data
   * @param accountId Account ID for multi-account support (currently unused)
   */
  async readToken(accountId?: string): Promise<TokenData | null> {
    try {
      const tokenPath = resolve(this.getTokenPath(accountId));
      const data = await fs.readFile(tokenPath, 'utf-8');
      const token: TokenData = JSON.parse(data);

      // Basic validation
      if (!token.refresh_token || !token.client_id || !token.client_secret) {
        throw new StorageError('Invalid token data: missing required fields');
      }

      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      // Return null if file doesn't exist
      if (message.includes('ENOENT')) {
        return null;
      }
      
      if (error instanceof StorageError) {
        throw error;
      }
      
      throw new StorageError(`Failed to read token: ${message}`, error as Error);
    }
  }

  /**
   * Write token data with secure permissions
   * @param token Token data to write
   * @param accountId Account ID for multi-account support (currently unused)
   */
  async writeToken(token: TokenData, accountId?: string): Promise<void> {
    try {
      const tokenPath = resolve(this.getTokenPath(accountId));
      const tokenDir = dirname(tokenPath);

      // Ensure directory exists
      await fs.mkdir(tokenDir, { recursive: true });

      // Write token data with pretty formatting
      const tokenJson = JSON.stringify(token, null, 2);
      await fs.writeFile(tokenPath, tokenJson, 'utf-8');

      // Set secure permissions (owner read/write only)
      await fs.chmod(tokenPath, 0o600);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new StorageError(`Failed to write token: ${message}`, error as Error);
    }
  }

  /**
   * Delete token file
   * @param accountId Account ID for multi-account support (currently unused)
   */
  async deleteToken(accountId?: string): Promise<void> {
    try {
      const tokenPath = resolve(this.getTokenPath(accountId));
      await fs.unlink(tokenPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      // Ignore if file doesn't exist
      if (message.includes('ENOENT')) {
        return;
      }
      
      throw new StorageError(`Failed to delete token: ${message}`, error as Error);
    }
  }

  /**
   * Get token path for account (future multi-account support)
   */
  private getTokenPath(accountId?: string): string {
    if (accountId) {
      const dir = dirname(this.tokenPath);
      const ext = this.tokenPath.endsWith('.json') ? '.json' : '';
      return resolve(dir, `${accountId}.token${ext}`);
    }
    return this.tokenPath;
  }
}