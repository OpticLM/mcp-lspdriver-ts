# MCP LSP Driver SDK

A TypeScript SDK that bridges Language Server Protocol (LSP) capabilities with the Model Context Protocol (MCP). Designed for IDE plugin developers building AI-assisted coding tools for VS Code, JetBrains, and other editors.

## Core Philosophy

- **Fuzzy-to-Exact Resolution**: LLMs interact via semantic anchors (`symbolName`, `lineHint`), and the SDK resolves them to precise coordinates
- **Disk-Based Truth**: All read operations reflect the state of files on disk, ignoring unsaved IDE buffers
- **Human-in-the-Loop Edits**: Write operations require explicit user approval before applying changes
- **Type Safety**: Strict TypeScript with no `any` types

## Installation

```bash
npm install mcp-lsp-driver
# or
pnpm add mcp-lsp-driver
```

## Quick Start

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { installMcpLspDriver, type IdeCapabilities } from 'mcp-lsp-driver'
import * as fs from 'fs/promises'

// 1. Create your MCP server
const server = new McpServer({
  name: 'my-ide-mcp-server',
  version: '1.0.0'
})

// 2. Implement File Access (required)
const fileAccess = {
  readFile: async (uri: string) => {
    return await fs.readFile(uri, 'utf-8')
  }
}

// 3. Implement User Interaction (required for edits)
const userInteraction = {
  previewAndApplyEdits: async (operation) => {
    // Show diff in your IDE and get user approval
    return await showDiffDialog(operation)
  }
}

// 4. Implement LSP Capability Providers
const definition = {
  provideDefinition: async (uri, position) => {
    // Call your IDE's LSP to get definition
    return await lspClient.getDefinition(uri, position)
  }
}

const diagnostics = {
  provideDiagnostics: async (uri) => {
    // Get diagnostics from your IDE for the file
    return await lspClient.getDiagnostics(uri)
  },
  getWorkspaceDiagnostics: async () => {
    // Optional: Get all diagnostics in the workspace
    return await lspClient.getWorkspaceDiagnostics()
  }
}

const outline = {
  provideDocumentSymbols: async (uri) => {
    // Get document symbols from your IDE
    return await lspClient.getDocumentSymbols(uri)
  }
}

// 5. Register LSP tools and resources on the server
const capabilities: IdeCapabilities = {
  fileAccess,
  userInteraction,
  definition,
  diagnostics,
  outline,
  onDiagnosticsChanged: (callback) => {
    // Register for diagnostic changes
    yourIDE.onDiagnosticsChanged((uri) => callback(uri))
  },
  // Add more capabilities as needed
}

installMcpLspDriver({ server, capabilities })

// 6. Connect to transport (you control the server lifecycle)
const transport = new StdioServerTransport()
await server.connect(transport)
```

## API Reference

### Core Interfaces

#### `FileAccessProvider` (Required)

Provides disk access for reading files:

```typescript
interface FileAccessProvider {
  readFile(uri: UnifiedUri): Promise<string>
}
```

#### `UserInteractionProvider` (Required for edits)

Handles user approval for edit operations:

```typescript
interface UserInteractionProvider {
  previewAndApplyEdits(operation: PendingEditOperation): Promise<boolean>
}
```

### Capability Providers

All capability providers receive `ExactPosition` coordinates (0-based). The SDK handles fuzzy-to-exact conversion before calling these.

#### `DefinitionProvider`

```typescript
interface DefinitionProvider {
  provideDefinition(uri: UnifiedUri, position: ExactPosition): Promise<CodeSnippet[]>
}
```

#### `ReferencesProvider`

```typescript
interface ReferencesProvider {
  provideReferences(uri: UnifiedUri, position: ExactPosition): Promise<CodeSnippet[]>
}
```

#### `HierarchyProvider`

```typescript
interface HierarchyProvider {
  provideCallHierarchy(
    uri: UnifiedUri,
    position: ExactPosition,
    direction: 'incoming' | 'outgoing'
  ): Promise<CodeSnippet[]>
}
```

#### `DiagnosticsProvider`

```typescript
interface DiagnosticsProvider {
  provideDiagnostics(uri: UnifiedUri): Promise<Diagnostic[]>
  getWorkspaceDiagnostics?(): Promise<Diagnostic[]>  // Optional workspace diagnostics
}
```

#### `OutlineProvider`

```typescript
interface OutlineProvider {
  provideDocumentSymbols(uri: UnifiedUri): Promise<DocumentSymbol[]>
}
```

### IdeCapabilities

Combine all providers into a single configuration:

```typescript
interface IdeCapabilities {
  fileAccess: FileAccessProvider           // Required
  userInteraction?: UserInteractionProvider // Required for apply_edit tool
  definition?: DefinitionProvider           // Enables goto_definition tool
  references?: ReferencesProvider           // Enables find_references tool
  hierarchy?: HierarchyProvider             // Enables call_hierarchy tool
  diagnostics?: DiagnosticsProvider         // Enables diagnostics resources
  outline?: OutlineProvider                 // Enables outline resource
  onDiagnosticsChanged?: (callback: OnDiagnosticsChangedCallback) => void
}
```

## MCP Tools

The SDK automatically registers tools based on which capabilities you provide:

### `goto_definition`

Navigate to the definition of a symbol.

**Inputs:**
- `uri`: File path or URI
- `symbol_name`: Text of the symbol to find
- `line_hint`: Approximate line number (1-based)
- `order_hint`: Which occurrence if symbol appears multiple times (0-based, default: 0)

### `find_references`

Find all references to a symbol.

**Inputs:** Same as `goto_definition`

### `call_hierarchy`

Get call hierarchy for a function or method.

**Inputs:**
- Same as `goto_definition`, plus:
- `direction`: `'incoming'` (callers) or `'outgoing'` (callees)

### `apply_edit`

Apply a text edit to a file (requires user approval).

**Inputs:**
- `uri`: File path or URI
- `search_text`: Exact text to replace (must be unique in file)
- `replace_text`: New text to insert
- `description`: Rationale for the edit

## MCP Resources

The SDK automatically registers resources based on which capabilities you provide:

### `lsp://diagnostics/{path}`

Get diagnostics (errors, warnings) for a specific file.

**Resource URI Pattern:** `lsp://diagnostics/{path}`

**Example:** `lsp://diagnostics/src/main.ts`

Returns diagnostics formatted as markdown with location, severity, and message information.

**Subscription Support:** If your IDE implements `onDiagnosticsChanged` capability, these resources become subscribable. When diagnostics change, the driver sends resource update notifications.

### `lsp://diagnostics/workspace`

Get diagnostics across the entire workspace.

**Resource URI:** `lsp://diagnostics/workspace`

Only available if your `DiagnosticsProvider` implements the optional `getWorkspaceDiagnostics()` method.

Returns workspace diagnostics grouped by file, formatted as markdown.

**Subscription Support:** If your IDE implements `onDiagnosticsChanged` capability, this resource becomes subscribable.

### `lsp://outline/{path}`

Get the document outline (symbol tree) for a file.

**Resource URI Pattern:** `lsp://outline/{path}`

**Example:** `lsp://outline/src/components/Button.tsx`

Returns document symbols formatted as a hierarchical markdown outline, including:
- Symbol names and kinds (class, function, method, etc.)
- Source locations
- Nested children (e.g., methods within classes)

No subscription support for this resource (read-only).

## Subscription and Change Notifications

When your IDE supports the `onDiagnosticsChanged` capability, diagnostic resources become subscribable:

```typescript
const capabilities: IdeCapabilities = {
  fileAccess,
  diagnostics: {
    provideDiagnostics: async (uri) => { /* ... */ },
    getWorkspaceDiagnostics: async () => { /* ... */ }
  },
  onDiagnosticsChanged: (callback) => {
    // Register your IDE's diagnostic change listener
    yourIDE.onDiagnosticsChanged((uri) => {
      // Call the callback when diagnostics change
      callback(uri)
    })
  }
}
```

When diagnostics change, call the registered callback with the affected file URI. The driver will send MCP resource update notifications to subscribers.

## Symbol Resolution

The SDK uses a robust algorithm to handle imprecise LLM positioning:

1. Target the `lineHint` (converting 1-based to 0-based)
2. Search for `symbolName` in that line
3. **Robustness Fallback**: If not found, scan +/- 2 lines (configurable)
4. Use `orderHint` to select the Nth occurrence if needed

Configure the search radius:

```typescript
installMcpLspDriver({ server, capabilities, config: {
  resolverConfig: {
    lineSearchRadius: 5  // Default: 2
  }
}})
```

## Type Definitions

### Position Types

```typescript
// 0-based exact coordinates (internal)
interface ExactPosition {
  line: number
  character: number
}

// Fuzzy position from LLM
interface FuzzyPosition {
  symbolName: string
  lineHint: number      // 1-based
  orderHint?: number    // 0-based, default: 0
}

// Range on disk
interface DiskRange {
  start: ExactPosition
  end: ExactPosition
}
```

### Result Types

```typescript
interface CodeSnippet {
  uri: UnifiedUri
  range: DiskRange
  content: string
}

interface Diagnostic {
  uri: UnifiedUri
  range: DiskRange
  severity: 'error' | 'warning' | 'information' | 'hint'
  message: string
  source?: string
  code?: string | number
}

type EditResult =
  | { success: true; message: string }
  | { success: false; message: string; reason: 'UserRejected' | 'IOError' | 'ValidationFailed' }
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint
pnpm lint

# Format
pnpm format
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.7.0

## License

MIT
