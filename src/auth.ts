import { OAuth2Client } from 'google-auth-library';
import { authenticate } from '@google-cloud/local-auth';
import { AuthOptions, CredentialsJson, GoogleAuthMCP, Storage, TokenData } from './index';
import { AuthenticationError, TokenExpiredError } from './errors';
import { retry } from './utils';
import { FileStorage } from './storage';

class GoogleAuthMCPImpl implements GoogleAuthMCP {
  private options: AuthOptions;
  private storage: Storage;
  private client: OAuth2Client | null = null;
  private logger: Pick<Console, 'log' | 'error'>;

  constructor(options: AuthOptions) {
    if (!options.scopes?.length) throw new AuthenticationError('Scopes are required');
    this.options = options;
    this.storage = options.storage || new FileStorage(options.credentialsPath || './credentials.json', options.tokenPath || './tokens/default.token.json');
    this.logger = options.logger || console;
  }

  private async getClientInternal(): Promise<OAuth2Client> {
    if (this.client) {
      await this.refreshIfNeeded();
      return this.client;
    }

    let token = await this.storage.readToken(this.options.accountId);
    if (token) {
      this.client = new OAuth2Client();
      this.client.setCredentials(token);
      await this.refreshIfNeeded();
      return this.client;
    }

    const creds = await this.storage.readCredentials();
    const clientData = creds.web || creds.installed;
    if (!clientData) throw new AuthenticationError('Invalid credentials');

    this.client = new OAuth2Client({
      clientId: clientData.client_id,
      clientSecret: clientData.client_secret,
      redirectUri: clientData.redirect_uris[0],
    });

    const { tokens } = await authenticate({
      scopes: this.options.scopes,
      keyfilePath: undefined, // Using client instead
      clientId: clientData.client_id,
      clientSecret: clientData.client_secret,
      redirectUri: clientData.redirect_uris[0],
    });

    if (!tokens.refresh_token) throw new AuthenticationError('No refresh_token received');

    this.client.setCredentials(tokens);
    await this.storage.writeToken(tokens as TokenData, this.options.accountId);
    return this.client;
  }

  private async refreshIfNeeded(): Promise<void> {
    if (!this.client) return;

    const { expiry_date } = this.client.credentials;
    if (expiry_date && expiry_date <= Date.now() + 300000) {
      if (!this.client.credentials.refresh_token) throw new TokenExpiredError('No refresh_token available');

      try {
        const { credentials } = await retry(() => this.client.refreshAccessToken());
        this.client.setCredentials(credentials);
        await this.storage.writeToken(credentials as TokenData, this.options.accountId);
      } catch (error) {
        throw new AuthenticationError(`Token refresh failed: ${error.message}`);
      }
    }
  }

  async getClient(): Promise<OAuth2Client> {
    return this.getClientInternal();
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getClientInternal();
      return true;
    } catch {
      return false;
    }
  }

  async signIn(): Promise<void> {
    this.client = null;
    await this.getClientInternal();
  }

  async signOut(): Promise<void> {
    if (this.client) {
      await this.client.revokeCredentials();
    }
    this.client = null;
    await this.storage.deleteToken(this.options.accountId);
  }

  async getAccessToken(): Promise<string> {
    const client = await this.getClientInternal();
    const { token } = await client.getAccessToken();
    if (!token) throw new AuthenticationError('No access token available');
    return token;
  }

  async getAuthHeader(): Promise<{ Authorization: string }> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }
}

export function createAuth(options: AuthOptions): GoogleAuthMCP {
  return new GoogleAuthMCPImpl(options);
}
