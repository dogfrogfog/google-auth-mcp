import { OAuth2Client } from 'google-auth-library';
import { authenticate } from '@google-cloud/local-auth';
import { Storage, FileStorage, TokenData, CredentialsJson } from './storage.js';
import { AuthenticationError, TokenExpiredError } from './errors.js';
import { retryWithBackoff, isTokenExpired } from './utils.js';

/**
 * Authentication options for creating GoogleAuthMCP instance
 */
export interface AuthOptions {
  scopes: string[]; // Required
  credentialsPath?: string; // Default: './credentials.json'
  tokenPath?: string; // Default: './tokens/default.token.json'
  storage?: Storage;
  accountId?: string; // Opt-in for future multi-account
  logger?: Pick<Console, 'log' | 'error'>; // Default: console
}

/**
 * Google Auth MCP interface
 */
export interface GoogleAuthMCP {
  getClient(): Promise<OAuth2Client>;
  isAuthenticated(): Promise<boolean>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string>;
  getAuthHeader(): Promise<{ Authorization: string }>;
  // useAccount(id: string): GoogleAuthMCP; // Commented out for now
}

/**
 * Internal implementation of GoogleAuthMCP
 */
class GoogleAuthMCPImpl implements GoogleAuthMCP {
  private client?: OAuth2Client;
  
  constructor(
    private readonly options: Required<Omit<AuthOptions, 'storage' | 'accountId' | 'logger'>> & 
      Pick<AuthOptions, 'accountId'> & {
        storage: Storage;
        logger: Pick<Console, 'log' | 'error'>;
      }
  ) {}

  /**
   * Get authenticated OAuth2Client
   */
  async getClient(): Promise<OAuth2Client> {
    return this.getClientInternal();
  }

  /**
   * Check if currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await this.options.storage.readToken(this.options.accountId);
      if (!token || !token.refresh_token) {
        return false;
      }

      // Check if token is expired (with buffer)
      if (isTokenExpired(token.expiry_date)) {
        // Try to refresh to see if refresh token is still valid
        try {
          await this.getClientInternal();
          return true;
        } catch {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sign in - triggers full auth flow
   */
  async signIn(): Promise<void> {
    // Clear cached client to force re-authentication
    this.client = undefined;
    await this.getClientInternal();
  }

  /**
   * Sign out - revoke credentials and clear cache
   */
  async signOut(): Promise<void> {
    try {
      // Revoke credentials if client exists
      if (this.client) {
        await this.client.revokeCredentials();
      }
    } catch (error) {
      // Log error but don't throw - we still want to clear local data
      this.options.logger.error('Failed to revoke credentials:', error);
    }

    // Clear cache and delete token
    this.client = undefined;
    await this.options.storage.deleteToken(this.options.accountId);
  }

  /**
   * Get access token
   */
  async getAccessToken(): Promise<string> {
    const client = await this.getClientInternal();
    const credentials = client.credentials;
    
    if (!credentials.access_token) {
      throw new AuthenticationError('No access token available');
    }

    return credentials.access_token;
  }

  /**
   * Get authorization header for HTTP requests
   */
  async getAuthHeader(): Promise<{ Authorization: string }> {
    const accessToken = await this.getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }

  /**
   * Internal method to get client with full auth flow
   */
  private async getClientInternal(): Promise<OAuth2Client> {
    // Return cached client if available and valid
    if (this.client) {
      await this.refreshIfNeeded(this.client);
      return this.client;
    }

    // Try to load existing token
    const existingToken = await this.options.storage.readToken(this.options.accountId);
    
    if (existingToken) {
      // Create client with existing token
      const credentials = await this.options.storage.readCredentials();
      const config = credentials.web || credentials.installed!;
      
      const client = new OAuth2Client(
        config.client_id,
        config.client_secret,
        config.redirect_uris[0]
      );

      // Set credentials from token
      client.setCredentials({
        access_token: existingToken.access_token,
        refresh_token: existingToken.refresh_token,
        expiry_date: existingToken.expiry_date,
      });

      // Refresh if needed
      await this.refreshIfNeeded(client);
      
      // Cache and return
      this.client = client;
      return client;
    }

    // No existing token - perform initial authentication
    return this.performInitialAuth();
  }

  /**
   * Perform initial OAuth authentication
   */
  private async performInitialAuth(): Promise<OAuth2Client> {
    try {
      const credentials = await this.options.storage.readCredentials();
      
      // Use @google-cloud/local-auth for the OAuth flow
      const authClient = await authenticate({
        scopes: this.options.scopes,
        keyfilePath: this.options.credentialsPath,
      });

      // Validate that we got a refresh token
      if (!authClient.credentials.refresh_token) {
        throw new AuthenticationError(
          'No refresh token received. This may happen if you have previously authorized this application. ' +
          'Try revoking access in your Google account settings and try again.'
        );
      }

      // Create token data for storage
      const config = credentials.web || credentials.installed!;
      const tokenData: TokenData = {
        type: 'authorized_user',
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: authClient.credentials.refresh_token,
        access_token: authClient.credentials.access_token || undefined,
        expiry_date: authClient.credentials.expiry_date ?? undefined,
      };

      // Save token
      await this.options.storage.writeToken(tokenData, this.options.accountId);

      // Cache and return client
      this.client = authClient as unknown as OAuth2Client;
      return authClient as unknown as OAuth2Client;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AuthenticationError(`Authentication failed: ${message}`, error as Error);
    }
  }

  /**
   * Refresh token if needed with retry logic
   */
  private async refreshIfNeeded(client: OAuth2Client): Promise<void> {
    const credentials = client.credentials;
    
    // Check if token is expired (with 5-minute buffer)
    if (!isTokenExpired(credentials.expiry_date ?? undefined)) {
      return; // Token is still valid
    }

    // Check if we have a refresh token
    if (!credentials.refresh_token) {
      throw new TokenExpiredError('Token expired and no refresh token available');
    }

    try {
      // Refresh with retry logic
      await retryWithBackoff(async () => {
        const { credentials: newCredentials } = await client.refreshAccessToken();
        client.setCredentials(newCredentials);
      });

      // Save updated token
      const updatedCredentials = client.credentials;
      const existingToken = await this.options.storage.readToken(this.options.accountId);
      
      if (existingToken) {
        const updatedToken: TokenData = {
          ...existingToken,
          access_token: updatedCredentials.access_token || undefined,
          expiry_date: updatedCredentials.expiry_date || undefined,
        };
        
        await this.options.storage.writeToken(updatedToken, this.options.accountId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TokenExpiredError(`Failed to refresh token: ${message}`, error as Error);
    }
  }
}

/**
 * Factory function to create GoogleAuthMCP instance
 */
export function createAuth(options: AuthOptions): GoogleAuthMCP {
  // Validate required options
  if (!options.scopes || options.scopes.length === 0) {
    throw new Error('scopes is required and must not be empty');
  }

  // Set defaults
  const credentialsPath = options.credentialsPath || './credentials.json';
  const tokenPath = options.tokenPath || './tokens/default.token.json';
  const storage = options.storage || new FileStorage(credentialsPath, tokenPath);
  const logger = options.logger || console;

  const resolvedOptions = {
    scopes: options.scopes,
    credentialsPath,
    tokenPath,
    storage,
    accountId: options.accountId,
    logger,
  };

  return new GoogleAuthMCPImpl(resolvedOptions);
}