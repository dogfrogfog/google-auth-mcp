# google-auth-mcp

Simple Google OAuth for MCP servers.

## Installation

bun add google-auth-mcp

## Usage

```ts
import { createAuth } from 'google-auth-mcp';

const auth = createAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
const headers = await auth.getAuthHeader();
// Use headers in API requests

// Custom paths
const customAuth = createAuth({
  scopes: ['...'],
  credentialsPath: '/path/to/credentials.json',
  tokenPath: '/path/to/token.json',
});

// For remote storage, implement Storage interface and pass via options.storage
```

For details, see docs/implementation.md.
