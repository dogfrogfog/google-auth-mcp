import fs from 'fs/promises';
import path from 'path';
import { CredentialsJson, TokenData } from './index';
import { StorageError } from './errors';

export interface Storage {
  readCredentials(): Promise<CredentialsJson>;
  readToken(accountId?: string): Promise<TokenData | null>;
  writeToken(token: TokenData, accountId?: string): Promise<void>;
  deleteToken(accountId?: string): Promise<void>;
}

export class FileStorage implements Storage {
  private credentialsPath: string;
  private tokenBasePath: string;

  constructor(credentialsPath: string, tokenPath: string) {
    this.credentialsPath = path.resolve(credentialsPath);
    this.tokenBasePath = path.dirname(path.resolve(tokenPath));
  }

  async readCredentials(): Promise<CredentialsJson> {
    try {
      const data = await fs.readFile(this.credentialsPath, 'utf8');
      const creds = JSON.parse(data);
      if (!creds.web && !creds.installed) {
        throw new StorageError('Invalid credentials format');
      }
      return creds;
    } catch (error) {
      throw new StorageError(`Failed to read credentials: ${error.message}`);
    }
  }

  private getTokenPath(accountId?: string): string {
    return path.join(this.tokenBasePath, `${accountId || 'default'}.token.json`);
  }

  async readToken(accountId?: string): Promise<TokenData | null> {
    const tokenPath = this.getTokenPath(accountId);
    try {
      const data = await fs.readFile(tokenPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new StorageError(`Failed to read token: ${error.message}`);
    }
  }

  async writeToken(token: TokenData, accountId?: string): Promise<void> {
    const tokenPath = this.getTokenPath(accountId);
    try {
      await fs.mkdir(this.tokenBasePath, { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(token, null, 2), { mode: 0o600 });
    } catch (error) {
      throw new StorageError(`Failed to write token: ${error.message}`);
    }
  }

  async deleteToken(accountId?: string): Promise<void> {
    const tokenPath = this.getTokenPath(accountId);
    try {
      await fs.unlink(tokenPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new StorageError(`Failed to delete token: ${error.message}`);
      }
    }
  }
}
