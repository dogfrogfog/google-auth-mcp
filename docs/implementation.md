# Product Requirements Document (PRD) for `google-auth-mcp` NPM Package

## 1. Overview

### 1.1 Purpose
The `google-auth-mcp` package is designed to provide a simple, robust, and secure way to handle Google OAuth 2.0 authentication for MCP (likely "My Custom Platform" or similar) servers. It focuses on local authentication flows initially, encapsulating credential management, token storage, and automatic token refresh. The package ensures minimal user intervention for token revalidation and supports secure local file-based storage out of the box. 

The architecture is modular to allow future scaling to remote storage (e.g., databases or cloud secrets) without changing the core API or logic. This PRD outlines the requirements, architecture, detailed logic, API, and implementation guidelines to build a production-ready package.

### 1.2 Scope
- **In Scope**: Local OAuth flow using Google credentials.json, secure token storage, automatic refresh, TypeScript support, minimal dependencies.
- **Out of Scope**: Multi-account support (opt-in, commented out for now), image generation/editing, xAI product integrations, remote storage implementations (examples provided for extensibility).
- **Target Users**: Developers building MCP servers that integrate with Google APIs (e.g., YouTube, Drive). Assumes Node.js environment.

### 1.3 Assumptions and Constraints
- Node.js >= 18 (ESM support).
- Users provide a valid `credentials.json` from Google Cloud Console (OAuth 2.0 Client IDs for installed/web apps).
- No internet access required beyond Google OAuth endpoints.
- Dependencies limited to essentials: `google-auth-library` (for OAuth2Client) and `@google-cloud/local-auth` (for auth flow). No `open` package, as `@google-cloud/local-auth`'s `authenticate` handles browser opening.
- Package size: Keep lightweight (<100KB gzipped).

### 1.4 Success Metrics
- Simple setup: 1-2 lines for basic auth in MCP servers.
- Robustness: 100% automated token refresh with retries.
- Security: Tokens stored with restricted permissions (0o600).
- Extensibility: Swap storage without API changes.

## 2. Features

### 2.1 Core Features
- **Credential Management**: Load `credentials.json` from a default MCP root path (`./credentials.json`) or a user-provided path. Validate format early.
- **Token Storage**: Securely store tokens (including refresh_token) locally after initial auth. Default path: `./tokens/default.token.json`. Use JSON format with pretty-printing for readability.
- **Automatic Token Refresh**: Handle token expiration and refresh without user action. Use a 5-minute buffer before expiry. Include retry logic (exponential backoff) for network failures.
- **OAuth Flow**: For first-time auth, trigger Google's local OAuth flow (browser-based consent) using `@google-cloud/local-auth`. Save tokens post-auth.
- **API Convenience**: Provide methods for quick access to auth headers, tokens, or the full OAuth client, suitable for HTTP requests in MCP servers.
- **Error Handling**: Typed errors for authentication, token expiry, and storage issues.

### 2.2 Non-Functional Requirements
- **Security**: 
  - Tokens stored with file permissions set to 0o600 (owner read/write only).
  - No exposure of secrets in logs or errors.
  - Validate credentials.json to prevent invalid formats.
- **Performance**: Token operations (read/write/refresh) should complete in <500ms. Use async I/O.
- **Reliability**: Retries (up to 3) for refresh failures. Fallback logging for OAuth URL if browser opening fails (though `@google-cloud/local-auth` handles it).
- **Testability**: Injectable storage and logger for unit testing.
- **Compatibility**: TypeScript-first with strict mode. ESM-only.
- **Documentation**: README.md with examples, migration guide.

### 2.3 Future Enhancements
- Multi-account support: Enable via `accountId` and `useAccount()` (currently commented out).
- Remote storage examples: e.g., Prisma, Redis (pluggable via `Storage` interface).
- Headless mode: Enhanced fallback for servers without browsers.

## 3. Architecture

### 3.1 High-Level Architecture
The package follows a modular, layered design for separation of concerns:
- **Public API Layer**: Exports `createAuth` factory and interfaces. Users interact here.
- **Core Auth Logic Layer**: Handles OAuth flow, token refresh, and client management (in `auth.ts`).
- **Storage Layer**: Abstract `Storage` interface with default `FileStorage` implementation (in `storage.ts`). Decouples persistence for future remote scaling.
- **Utils Layer**: Helpers for retries and logging (in `utils.ts`).
- **Error Layer**: Custom error classes (in `errors.ts`).

Data Flow:
1. User calls `createAuth(options)` → Creates instance with storage (default: FileStorage).
2. Method call (e.g., `getAuthHeader()`) → Checks/loads token → Refreshes if needed → Returns header.
3. First-time: Triggers `authenticate` → Browser flow → Saves token.

This ensures:
- **Simplicity**: Minimal config for local use.
- **Extensibility**: Replace `storage` for remote (e.g., DB reads/writes instead of files).
- **Robustness**: All paths handle errors gracefully.

### 3.2 Components
- **createAuth Factory**: Configures and returns a `GoogleAuthMCP` instance.
- **OAuth2Client**: From `google-auth-library`, manages tokens and refresh.
- **authenticate**: From `@google-cloud/local-auth`, handles initial OAuth flow.
- **Storage Interface**: Defines read/write/delete for credentials and tokens.
- **FileStorage**: Concrete impl for local files, with secure mkdir/chmod.
- **Retry Helper**: Exponential backoff for refresh.

### 3.3 Dependencies
- `google-auth-library`: ^10.0.0 (core OAuth handling).
- `@google-cloud/local-auth`: ^3.0.0 (local auth flow, includes browser opening).
- No other runtime deps. Dev deps: TypeScript, ESLint, Jest (for testing).

## 4. Detailed Logic

### 4.1 Authentication Flow
1. **Initialization (`createAuth`)**:
   - Validate required `scopes`.
   - Use provided `storage` or default `FileStorage` with paths (default: `./credentials.json`, `./tokens/default.token.json`).
   - Cache `OAuth2Client` instance internally.

2. **Get Client/Token/Header (`getClientInternal` internal helper)**:
   - If cached client exists: Refresh if needed → Return.
   - Load token from storage.
   - If token exists: Set on new `OAuth2Client` → Refresh if needed → Cache & return.
   - If no token: Load credentials.json → Create `OAuth2Client` → Call `authenticate` (opens browser for consent) → Set credentials → Validate refresh_token → Save token → Cache & return.

3. **Token Refresh (`refreshIfNeeded`)**:
   - Check expiry with 5min buffer (`expiry_date <= now + 300000`).
   - If expired and no refresh_token: Throw `TokenExpiredError`.
   - Call `client.refreshAccessToken()` with retries (1s, 2s, 4s delays).
   - Update credentials and save token to storage.

4. **Sign In (`signIn`)**:
   - Clear cache → Trigger full auth flow (as in step 2, no token case).

5. **Sign Out (`signOut`)**:
   - Revoke credentials if client exists.
   - Clear cache → Delete token from storage.

6. **Error Handling**:
   - `AuthenticationError`: General auth failures (e.g., no refresh_token).
   - `TokenExpiredError`: Subclass for missing/invalid refresh.
   - `StorageError`: File/DB read/write issues.
   - All methods are async and throw on failure.

7. **Storage Operations**:
   - `readCredentials`: Parse JSON, validate `web` or `installed` key.
   - `readToken`: Return null if not found.
   - `writeToken`: Mkdir recursive, write JSON, chmod 0o600.
   - `deleteToken`: Unlink, ignore if not found.

### 4.2 Edge Cases
- **Headless Server**: `@google-cloud/local-auth` logs URL if browser can't open; user pastes manually.
- **Network Failure**: Retries in refresh.
- **Invalid Credentials**: Throw early in `readCredentials`.
- **Token Revocation**: Auto-triggers re-auth on next call.
- **Concurrent Access**: Storage is async; assume single-process MCP for now (remote storage can handle locking).

### 4.3 Security Logic
- Always use `fs.promises` for async I/O.
- Set file perms post-write.
- No logging of tokens/secrets.
- Use `path.resolve` to prevent path traversal.

## 5. API Specification

### 5.1 Public Exports (from `index.ts`)
```ts
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

export interface Storage {
  readCredentials(): Promise<CredentialsJson>;
  readToken(accountId?: string): Promise<TokenData | null>;
  writeToken(token: TokenData, accountId?: string): Promise<void>;
  deleteToken(accountId?: string): Promise<void>;
}

export interface AuthOptions {
  scopes: string[]; // Required
  credentialsPath?: string; // Default: './credentials.json'
  tokenPath?: string; // Default: './tokens/default.token.json'
  storage?: Storage;
  accountId?: string; // Opt-in for future multi-account
  logger?: Pick<Console, 'log' | 'error'>; // Default: console
}

export interface GoogleAuthMCP {
  getClient(): Promise<import('google-auth-library').OAuth2Client>;
  isAuthenticated(): Promise<boolean>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string>;
  getAuthHeader(): Promise<{ Authorization: string }>;
  // useAccount(id: string): GoogleAuthMCP; // Commented out for now
}

export class AuthenticationError extends Error {}
export class TokenExpiredError extends AuthenticationError {}
export class StorageError extends Error {}

export function createAuth(options: AuthOptions): GoogleAuthMCP;
```

## 6. Implementation Guidelines

### 6.1 Folder Structure
```
google-auth-mcp/
  src/
    index.ts              # Exports API
    auth.ts               # Core logic (createAuth, flows)
    storage.ts            # Storage interface + FileStorage
    errors.ts             # Custom errors
    utils.ts              # Retry helper
  package.json            # Config, deps
  tsconfig.json           # Strict TS
  README.md               # Docs, examples
  tests/                  # Unit tests
```

### 6.2 Build and Publish
- Build: `tsc` for JS + d.ts.
- package.json: `"type": "module"`, `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`.
- Linting: ESLint strict, no any.
- Testing: Jest for storage mocks, auth flows.

### 6.3 Usage Examples
See README.md section:
- Simple: `const auth = createAuth({ scopes: [...] }); const headers = await auth.getAuthHeader();`
- Custom Path: Provide `credentialsPath`/`tokenPath`.
- Remote: Inject custom `Storage` (e.g., Prisma).

## 7. Risks and Mitigations
- **Dependency Changes**: Pin versions; monitor Google libs for breaking changes.
- **Security Audits**: Review file ops; consider optional encryption in future.
- **Google Policy Changes**: OAuth flows may evolve; test annually.

## 8. Appendix

### 8.1 References
- Google OAuth Docs: https://developers.google.com/identity/protocols/oauth2
- google-auth-library: https://www.npmjs.com/package/google-auth-library
- @google-cloud/local-auth: https://www.npmjs.com/package/@google-cloud/local-auth

This PRD serves as a blueprint for implementation. Proceed to coding based on the detailed logic in Section 4.