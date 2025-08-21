# google-auth-mcp

A simple, robust, and secure Google OAuth 2.0 authentication package for MCP (Model Context Protocol) servers. Provides automated token management, secure local storage, and automatic token refresh with minimal configuration.

## Features

- **Simple Setup**: 1-2 lines for basic authentication
- **Automatic Token Management**: Handles token refresh with 5-minute buffer
- **Secure Storage**: Tokens stored with 0o600 permissions (owner read/write only)
- **Robust Error Handling**: Typed errors with retry logic
- **TypeScript Support**: Full TypeScript support with strict typing
- **Minimal Dependencies**: Only essential Google auth libraries
- **Extensible**: Pluggable storage interface for future remote storage

## Installation

```bash
npm install google-auth-mcp
```

```bash
bun install google-auth-mcp
```

## Prerequisites

1. **Node.js >= 18** (ESM support required)
2. **Google Cloud Console Setup**:
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the APIs you want to use (e.g., YouTube API, Drive API)
   - Create OAuth 2.0 Client ID credentials for "Desktop application"
   - Download the `credentials.json` file

## Quick Start

### 1. Basic Usage

Place your `credentials.json` file in your project root, then:

```typescript
import { createAuth } from 'google-auth-mcp';

// Create auth instance
const auth = createAuth({
  scopes: [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
  ]
});

// Get authorization header for API requests
const headers = await auth.getAuthHeader();
// Returns: { Authorization: 'Bearer ya29.a0...' }

// Use with fetch
const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
  headers: await auth.getAuthHeader()
});
```

### 2. MCP Server Integration

```typescript
import { createAuth, GoogleAuthMCP } from 'google-auth-mcp';

class MyMCPServer {
  private auth: GoogleAuthMCP;

  constructor() {
    this.auth = createAuth({
      scopes: ['https://www.googleapis.com/auth/youtube.readonly']
    });
  }

  async handleYouTubeRequest() {
    try {
      // The first call will trigger browser-based OAuth flow
      const headers = await this.auth.getAuthHeader();
      
      const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers
      });
      
      return await response.json();
    } catch (error) {
      console.error('YouTube API request failed:', error);
      throw error;
    }
  }
}
```

## API Reference

### `createAuth(options: AuthOptions): GoogleAuthMCP`

Creates a new authentication instance.

#### AuthOptions

```typescript
interface AuthOptions {
  scopes: string[];              // Required: OAuth scopes
  credentialsPath?: string;      // Default: './credentials.json'
  tokenPath?: string;            // Default: './tokens/default.token.json'
  storage?: Storage;             // Custom storage implementation
  accountId?: string;            // For future multi-account support
  logger?: Pick<Console, 'log' | 'error'>; // Default: console
}
```

#### GoogleAuthMCP Methods

- **`getAuthHeader(): Promise<{ Authorization: string }>`** - Get authorization header for HTTP requests
- **`getAccessToken(): Promise<string>`** - Get raw access token
- **`getClient(): Promise<OAuth2Client>`** - Get the underlying OAuth2Client
- **`isAuthenticated(): Promise<boolean>`** - Check if currently authenticated
- **`signIn(): Promise<void>`** - Force re-authentication
- **`signOut(): Promise<void>`** - Sign out and revoke tokens

## Configuration Examples

### Custom Paths

```typescript
const auth = createAuth({
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  credentialsPath: './config/google-credentials.json',
  tokenPath: './config/tokens/drive.token.json'
});
```

### Custom Storage (Future: Remote Storage)

```typescript
import { Storage, TokenData, CredentialsJson } from 'google-auth-mcp';

class DatabaseStorage implements Storage {
  async readCredentials(): Promise<CredentialsJson> {
    // Read from database
  }
  
  async readToken(accountId?: string): Promise<TokenData | null> {
    // Read from database
  }
  
  async writeToken(token: TokenData, accountId?: string): Promise<void> {
    // Write to database
  }
  
  async deleteToken(accountId?: string): Promise<void> {
    // Delete from database
  }
}

const auth = createAuth({
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  storage: new DatabaseStorage()
});
```

## Authentication Flow

1. **First Time**: Opens browser for Google OAuth consent, saves tokens locally
2. **Subsequent Calls**: Uses saved tokens, automatically refreshes when needed
3. **Token Refresh**: Handles automatically with exponential backoff retry logic
4. **Error Recovery**: Clear error messages for common issues

## Error Handling

```typescript
import { 
  AuthenticationError, 
  TokenExpiredError, 
  StorageError 
} from 'google-auth-mcp';

try {
  const headers = await auth.getAuthHeader();
} catch (error) {
  if (error instanceof TokenExpiredError) {
    console.log('Token expired, trying to sign in again...');
    await auth.signIn();
  } else if (error instanceof StorageError) {
    console.log('Storage issue:', error.message);
  } else if (error instanceof AuthenticationError) {
    console.log('Authentication failed:', error.message);
  }
}
```

## Security Features

- **Secure File Permissions**: Token files created with 0o600 (owner read/write only)
- **No Secret Logging**: Tokens and secrets never logged
- **Path Safety**: Uses `path.resolve()` to prevent traversal attacks
- **Automatic Refresh**: Tokens refreshed 5 minutes before expiry

## Common OAuth Scopes

```typescript
// YouTube
'https://www.googleapis.com/auth/youtube.readonly'
'https://www.googleapis.com/auth/youtube'

// Google Drive
'https://www.googleapis.com/auth/drive.readonly'
'https://www.googleapis.com/auth/drive.file'
'https://www.googleapis.com/auth/drive'

// Gmail
'https://www.googleapis.com/auth/gmail.readonly'
'https://www.googleapis.com/auth/gmail.send'

// Calendar
'https://www.googleapis.com/auth/calendar.readonly'
'https://www.googleapis.com/auth/calendar'
```

## Troubleshooting

### "No refresh token received"

This typically happens when you've previously authorized the application. Solutions:

1. Delete existing token files: `rm -rf ./tokens/`
2. Revoke access in [Google Account Settings](https://myaccount.google.com/permissions)
3. Re-run your application

### "Credentials file not found"

Ensure `credentials.json` is in the correct location:
```bash
ls -la credentials.json
```

### "Invalid credentials.json"

Verify your credentials file has the correct structure:
```json
{
  "installed": {
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "redirect_uris": ["http://localhost"]
  }
}
```

## File Structure

```
your-project/
├── credentials.json          # Google OAuth credentials
├── tokens/
│   └── default.token.json   # Saved auth tokens (auto-created)
└── your-code.js
```

## Requirements

- Node.js >= 18 (ESM support)
- Google Cloud Console project with OAuth 2.0 credentials
- Internet access for initial authentication and token refresh

## License

MIT

## Contributing

Issues and pull requests welcome at [GitHub repository](https://github.com/dogfrogfog/google-auth-mcp)
