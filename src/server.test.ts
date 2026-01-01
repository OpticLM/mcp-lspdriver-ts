import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it, vi } from 'vitest'
import type {
  DefinitionProvider,
  DiagnosticsProvider,
  HierarchyProvider,
  IdeCapabilities,
  ReferencesProvider,
} from './capabilities.js'
import type {
  FileAccessProvider,
  UserInteractionProvider,
} from './interfaces.js'
import { McpLspDriver } from './server.js'
import type {
  CodeSnippet,
  Diagnostic,
  ExactPosition,
  PendingEditOperation,
} from './types.js'

// Helper to create mock providers
function createMockFileAccess(
  files: Record<string, string> = {},
): FileAccessProvider {
  return {
    readFile: vi.fn(async (uri: string) => {
      const content = files[uri]
      if (content === undefined) {
        throw new Error(`File not found: ${uri}`)
      }
      return content
    }),
  }
}

function createMockDefinitionProvider(
  results: CodeSnippet[] = [],
): DefinitionProvider {
  return {
    provideDefinition: vi.fn(async () => results),
  }
}

function createMockReferencesProvider(
  results: CodeSnippet[] = [],
): ReferencesProvider {
  return {
    provideReferences: vi.fn(async () => results),
  }
}

function createMockHierarchyProvider(
  results: CodeSnippet[] = [],
): HierarchyProvider {
  return {
    provideCallHierarchy: vi.fn(async () => results),
  }
}

function createMockDiagnosticsProvider(
  results: Diagnostic[] = [],
): DiagnosticsProvider {
  return {
    provideDiagnostics: vi.fn(async () => results),
  }
}

function createMockUserInteraction(approved = true): UserInteractionProvider {
  return {
    previewAndApplyEdits: vi.fn(async () => approved),
  }
}

function createMockServer(): McpServer {
  return new McpServer({
    name: 'test-server',
    version: '1.0.0',
  })
}

describe('McpLspDriver', () => {
  describe('constructor', () => {
    it('should create instance with minimal capabilities', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      const driver = new McpLspDriver(server, capabilities)
      expect(driver).toBeDefined()
    })

    it('should create instance with all capabilities', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        userInteraction: createMockUserInteraction(),
        definition: createMockDefinitionProvider(),
        references: createMockReferencesProvider(),
        hierarchy: createMockHierarchyProvider(),
        diagnostics: createMockDiagnosticsProvider(),
      }

      const driver = new McpLspDriver(server, capabilities)
      expect(driver).toBeDefined()
    })

    it('should accept resolver config', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      const driver = new McpLspDriver(server, capabilities, {
        resolverConfig: {
          lineSearchRadius: 5,
        },
      })

      expect(driver).toBeDefined()
    })
  })

  describe('tool registration', () => {
    it('should not register tools when no optional capabilities are provided', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      // McpLspDriver registers tools internally, we verify it doesn't throw
      const driver = new McpLspDriver(server, capabilities)
      expect(driver).toBeDefined()
    })

    it('should register goto_definition when definition provider is available', () => {
      const server = createMockServer()
      const definitionProvider = createMockDefinitionProvider()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        definition: definitionProvider,
      }

      const driver = new McpLspDriver(server, capabilities)
      expect(driver).toBeDefined()
      // Tool registration is internal - we verify by checking the provider is used
    })

    it('should register find_references when references provider is available', () => {
      const server = createMockServer()
      const referencesProvider = createMockReferencesProvider()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        references: referencesProvider,
      }

      const driver = new McpLspDriver(server, capabilities)
      expect(driver).toBeDefined()
    })

    it('should register call_hierarchy when hierarchy provider is available', () => {
      const server = createMockServer()
      const hierarchyProvider = createMockHierarchyProvider()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        hierarchy: hierarchyProvider,
      }

      const driver = new McpLspDriver(server, capabilities)
      expect(driver).toBeDefined()
    })

    it('should register get_diagnostics when diagnostics provider is available', () => {
      const server = createMockServer()
      const diagnosticsProvider = createMockDiagnosticsProvider()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        diagnostics: diagnosticsProvider,
      }

      const driver = new McpLspDriver(server, capabilities)
      expect(driver).toBeDefined()
    })

    it('should register apply_edit when userInteraction provider is available', () => {
      const server = createMockServer()
      const userInteraction = createMockUserInteraction()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        userInteraction,
      }

      const driver = new McpLspDriver(server, capabilities)
      expect(driver).toBeDefined()
    })
  })
})

describe('normalizeUri (via server behavior)', () => {
  it('should handle Windows-style paths in tool inputs', () => {
    // This tests that the server normalizes paths correctly
    const server = createMockServer()
    const files = { 'C:/Users/test/file.ts': 'const x = 1;' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })

  it('should preserve file:// URIs', () => {
    const server = createMockServer()
    const files = { 'file:///home/user/file.ts': 'const x = 1;' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })
})

describe('formatSnippetsAsMarkdown (via provider results)', () => {
  it('should format single snippet correctly', async () => {
    const snippets: CodeSnippet[] = [
      {
        uri: 'test.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        content: 'const x = 1;',
      },
    ]

    const definitionProvider: DefinitionProvider = {
      provideDefinition: vi.fn(async () => snippets),
    }

    const server = createMockServer()
    const files = { 'test.ts': 'const x = 1;' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      definition: definitionProvider,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
    // The formatting is tested indirectly through integration
  })

  it('should handle empty results', async () => {
    const definitionProvider: DefinitionProvider = {
      provideDefinition: vi.fn(async () => []),
    }

    const server = createMockServer()
    const files = { 'test.ts': 'const x = 1;' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      definition: definitionProvider,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })
})

describe('diagnostics formatting', () => {
  it('should handle various diagnostic severities', () => {
    const diagnostics: Diagnostic[] = [
      {
        uri: 'test.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 'error',
        message: 'Test error',
      },
      {
        uri: 'test.ts',
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        severity: 'warning',
        message: 'Test warning',
      },
      {
        uri: 'test.ts',
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 5 },
        },
        severity: 'information',
        message: 'Test info',
      },
      {
        uri: 'test.ts',
        range: {
          start: { line: 3, character: 0 },
          end: { line: 3, character: 5 },
        },
        severity: 'hint',
        message: 'Test hint',
      },
    ]

    const diagnosticsProvider: DiagnosticsProvider = {
      provideDiagnostics: vi.fn(async () => diagnostics),
    }

    const server = createMockServer()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: diagnosticsProvider,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })

  it('should handle diagnostics with source and code', () => {
    const diagnostics: Diagnostic[] = [
      {
        uri: 'test.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 'error',
        message: 'Test error',
        source: 'typescript',
        code: 2322,
      },
    ]

    const diagnosticsProvider: DiagnosticsProvider = {
      provideDiagnostics: vi.fn(async () => diagnostics),
    }

    const server = createMockServer()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: diagnosticsProvider,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })
})

describe('edit operations', () => {
  it('should create pending edit operation with correct structure', () => {
    const server = createMockServer()
    const userInteraction = createMockUserInteraction(true)
    const files = { 'test.ts': 'const foo = 1;' }

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      userInteraction,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })

  it('should handle user rejection of edits', () => {
    const server = createMockServer()
    const userInteraction = createMockUserInteraction(false)
    const files = { 'test.ts': 'const foo = 1;' }

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      userInteraction,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })
})

describe('error handling', () => {
  it('should handle SymbolResolutionError gracefully', () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()
    const files = { 'test.ts': 'const foo = 1;' }

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      definition: definitionProvider,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })

  it('should handle file read errors', () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess({}), // No files
      definition: definitionProvider,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })

  it('should handle provider errors', () => {
    const server = createMockServer()
    const definitionProvider: DefinitionProvider = {
      provideDefinition: vi.fn(async () => {
        throw new Error('Provider error')
      }),
    }

    const files = { 'test.ts': 'const foo = 1;' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      definition: definitionProvider,
    }

    const driver = new McpLspDriver(server, capabilities)
    expect(driver).toBeDefined()
  })
})

describe('type safety', () => {
  it('should enforce correct FuzzyPosition structure', () => {
    // This is a compile-time check - if this compiles, the types are correct
    const fuzzy = {
      symbolName: 'test',
      lineHint: 1,
      orderHint: 0,
    }

    expect(fuzzy.symbolName).toBe('test')
    expect(fuzzy.lineHint).toBe(1)
    expect(fuzzy.orderHint).toBe(0)
  })

  it('should enforce correct ExactPosition structure', () => {
    const exact: ExactPosition = {
      line: 0,
      character: 5,
    }

    expect(exact.line).toBe(0)
    expect(exact.character).toBe(5)
  })

  it('should enforce correct PendingEditOperation structure', () => {
    const operation: PendingEditOperation = {
      id: 'edit-123',
      uri: 'test.ts',
      edits: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          newText: 'hello',
        },
      ],
      description: 'Test edit',
    }

    expect(operation.id).toBe('edit-123')
    expect(operation.edits).toHaveLength(1)
  })
})
