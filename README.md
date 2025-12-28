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
import { McpLspDriver, type IdeCapabilities } from 'mcp-lsp-driver'
import * as fs from 'fs/promises'

// 1. Implement File Access (required)
const fileAccess = {
  readFile: async (uri: string) => {
    return await fs.readFile(uri, 'utf-8')
  }
}

// 2. Implement User Interaction (required for edits)
const userInteraction = {
  previewAndApplyEdits: async (operation) => {
    // Show diff in your IDE and get user approval
    return await showDiffDialog(operation)
  }
}

// 3. Implement LSP Capability Providers
const definition = {
  provideDefinition: async (uri, position) => {
    // Call your IDE's LSP to get definition
    return await lspClient.getDefinition(uri, position)
  }
}

// 4. Initialize and start the driver
const capabilities: IdeCapabilities = {
  fileAccess,
  userInteraction,
  definition,
  // Add more capabilities as needed
}

const driver = new McpLspDriver(capabilities, {
  name: 'my-ide-mcp-server',
  version: '1.0.0'
})

await driver.start()
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
  diagnostics?: DiagnosticsProvider         // Enables get_diagnostics tool
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

### `get_diagnostics`

Get diagnostics (errors, warnings) for a file.

**Inputs:**
- `uri`: File path or URI

### `apply_edit`

Apply a text edit to a file (requires user approval).

**Inputs:**
- `uri`: File path or URI
- `search_text`: Exact text to replace (must be unique in file)
- `replace_text`: New text to insert
- `description`: Rationale for the edit

## Symbol Resolution

The SDK uses a robust algorithm to handle imprecise LLM positioning:

1. Target the `lineHint` (converting 1-based to 0-based)
2. Search for `symbolName` in that line
3. **Robustness Fallback**: If not found, scan +/- 2 lines (configurable)
4. Use `orderHint` to select the Nth occurrence if needed

Configure the search radius:

```typescript
const driver = new McpLspDriver(capabilities, {
  resolverConfig: {
    lineSearchRadius: 5  // Default: 2
  }
})
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
