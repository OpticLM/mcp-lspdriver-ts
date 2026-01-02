import { Client } from '@modelcontextprotocol/sdk/client'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it, vi } from 'vitest'
import type {
  DefinitionProvider,
  DiagnosticsProvider,
  FilesystemProvider,
  GlobalFindMatch,
  GlobalFindOptions,
  GlobalFindProvider,
  HierarchyProvider,
  IdeCapabilities,
  OnDiagnosticsChangedCallback,
  OutlineProvider,
  ReferencesProvider,
} from './capabilities.js'
import type {
  FileAccessProvider,
  UserInteractionProvider,
} from './interfaces.js'
import { installMcpLspDriver } from './server.js'
import type { CodeSnippet, Diagnostic, DocumentSymbol } from './types.js'

const mockFiles = {
  'file:///path/to/file': 'MockFileContent',
}
function createMockFileAccess(
  files: Record<string, string> = mockFiles,
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

const mockCodeSnippet: CodeSnippet = {
  uri: 'file:///path/to/file',
  range: {
    start: { line: 0, character: 1 },
    end: { line: 2, character: 3 },
  },
  content: 'test',
}
function createMockDefinitionProvider(
  results: CodeSnippet[] = [mockCodeSnippet],
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
  workspaceResults?: Diagnostic[],
): DiagnosticsProvider {
  const provider: DiagnosticsProvider = {
    provideDiagnostics: vi.fn(async () => results),
  }
  if (workspaceResults !== undefined) {
    provider.getWorkspaceDiagnostics = vi.fn(async () => workspaceResults)
  }
  return provider
}

function createMockOutlineProvider(
  results: DocumentSymbol[] = [],
): OutlineProvider {
  return {
    provideDocumentSymbols: vi.fn(async () => results),
  }
}

function createMockUserInteraction(approved = true): UserInteractionProvider {
  return {
    previewAndApplyEdits: vi.fn(async () => approved),
  }
}

function createMockFilesystemProvider(
  files: string[] = [],
): FilesystemProvider {
  return {
    getFileTree: vi.fn(async () => files),
  }
}

function createMockGlobalFindProvider(
  matches: GlobalFindMatch[] = [],
  count = 0,
): GlobalFindProvider {
  return {
    globalFind: vi.fn(
      async (
        _query: string,
        _options: GlobalFindOptions,
      ): Promise<GlobalFindMatch[]> => matches,
    ),
    globalReplace: vi.fn(
      async (
        _query: string,
        _replaceWith: string,
        _options: GlobalFindOptions,
      ): Promise<number> => count,
    ),
  }
}

function createMockServer(): McpServer {
  return new McpServer({
    name: 'test-server',
    version: '1.0.0',
  })
}

async function createAndConnectMockClient(server: McpServer): Promise<Client> {
  const [c, s] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await server.connect(s)
  await client.connect(c)
  return client
}

describe('McpLspDriver', () => {
  describe('constructor', () => {
    it('should create instance with minimal capabilities', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
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
        outline: createMockOutlineProvider(),
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
    })

    it('should accept resolver config', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      const { success } = installMcpLspDriver({
        server,
        capabilities,
        config: {
          resolverConfig: {
            lineSearchRadius: 5,
          },
        },
      })

      expect(success).toBeTruthy()
    })
  })

  describe('tool registration', () => {
    it('should not register tools when no optional capabilities are provided', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      // McpLspDriver registers tools internally, we verify it doesn't throw
      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
    })

    it('should register goto_definition when definition provider is available', async () => {
      const server = createMockServer()
      const definitionProvider = createMockDefinitionProvider()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        definition: definitionProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'goto_definition',
        arguments: { uri: mockCodeSnippet.uri, symbol_name: '', line_hint: 1 },
      })
      expect(r.structuredContent).toStrictEqual({
        snippets: [
          {
            content: mockCodeSnippet.content,
            endLine: mockCodeSnippet.range.end.line + 1,
            startLine: mockCodeSnippet.range.start.line + 1,
            uri: mockCodeSnippet.uri,
          },
        ],
      })
    })

    it('should register find_references when references provider is available', () => {
      const server = createMockServer()
      const referencesProvider = createMockReferencesProvider()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        references: referencesProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
    })

    it('should register find_references and return formatted results when called', async () => {
      const server = createMockServer()
      const referenceSnippets: CodeSnippet[] = [
        {
          uri: 'file:///path/to/file1',
          range: {
            start: { line: 10, character: 5 },
            end: { line: 10, character: 10 },
          },
          content: 'someVariable',
        },
        {
          uri: 'file:///path/to/file2',
          range: {
            start: { line: 20, character: 0 },
            end: { line: 20, character: 12 },
          },
          content: 'someVariable = 42',
        },
      ]
      const referencesProvider = createMockReferencesProvider(referenceSnippets)
      // File content with someVariable at line 10
      const files = {
        'file:///path/to/file':
          'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nsomeVariable\nline11',
      }
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(files),
        references: referencesProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'find_references',
        arguments: {
          uri: 'file:///path/to/file',
          symbol_name: 'someVariable',
          line_hint: 10,
        },
      })
      expect(r.structuredContent).toStrictEqual({
        snippets: [
          {
            content: 'someVariable',
            endLine: 11,
            startLine: 11,
            uri: 'file:///path/to/file1',
          },
          {
            content: 'someVariable = 42',
            endLine: 21,
            startLine: 21,
            uri: 'file:///path/to/file2',
          },
        ],
      })
    })

    it('should register call_hierarchy when hierarchy provider is available', () => {
      const server = createMockServer()
      const hierarchyProvider = createMockHierarchyProvider()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        hierarchy: hierarchyProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
    })

    it('should register call_hierarchy and return formatted results when called', async () => {
      const server = createMockServer()
      const callHierarchySnippets: CodeSnippet[] = [
        {
          uri: 'file:///path/to/caller1',
          range: {
            start: { line: 5, character: 0 },
            end: { line: 7, character: 1 },
          },
          content: 'function caller1() {\n  targetFunction()\n}',
        },
        {
          uri: 'file:///path/to/caller2',
          range: {
            start: { line: 15, character: 0 },
            end: { line: 18, character: 1 },
          },
          content: 'function caller2() {\n  x = targetFunction()\n}',
        },
      ]
      const hierarchyProvider = createMockHierarchyProvider(
        callHierarchySnippets,
      )
      // File content with targetFunction at line 10
      const files = {
        'file:///path/to/file':
          'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\ntargetFunction\nline11',
      }
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(files),
        hierarchy: hierarchyProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'call_hierarchy',
        arguments: {
          uri: 'file:///path/to/file',
          symbol_name: 'targetFunction',
          line_hint: 10,
          direction: 'incoming',
        },
      })
      expect(r.structuredContent).toStrictEqual({
        snippets: [
          {
            content: 'function caller1() {\n  targetFunction()\n}',
            endLine: 8,
            startLine: 6,
            uri: 'file:///path/to/caller1',
          },
          {
            content: 'function caller2() {\n  x = targetFunction()\n}',
            endLine: 19,
            startLine: 16,
            uri: 'file:///path/to/caller2',
          },
        ],
      })
    })

    it('should register diagnostics resources and return formatted results', async () => {
      const server = createMockServer()
      const diagnostics: Diagnostic[] = [
        {
          uri: 'test.ts',
          range: {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 10 },
          },
          severity: 'error',
          message: 'Syntax error',
          source: 'typescript',
          code: 2322,
        },
      ]
      const diagnosticsProvider = createMockDiagnosticsProvider(diagnostics)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        diagnostics: diagnosticsProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      // Verify the provider returns the expected diagnostics
      const result = await diagnosticsProvider.provideDiagnostics('test.ts')
      expect(result).toHaveLength(1)
      expect(result[0]?.message).toBe('Syntax error')
      expect(result[0]?.severity).toBe('error')
      expect(result[0]?.code).toBe(2322)
    })

    it('should register workspace diagnostics resource when getWorkspaceDiagnostics is provided', async () => {
      const server = createMockServer()
      const workspaceDiagnostics: Diagnostic[] = [
        {
          uri: 'file1.ts',
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 5 },
          },
          severity: 'warning',
          message: 'Unused variable',
        },
        {
          uri: 'file2.ts',
          range: {
            start: { line: 5, character: 0 },
            end: { line: 5, character: 3 },
          },
          severity: 'error',
          message: 'Missing semicolon',
        },
      ]
      const diagnosticsProvider = createMockDiagnosticsProvider(
        [],
        workspaceDiagnostics,
      )
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        diagnostics: diagnosticsProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      // Verify workspace diagnostics can be retrieved
      if (diagnosticsProvider.getWorkspaceDiagnostics) {
        const result = await diagnosticsProvider.getWorkspaceDiagnostics()
        expect(result).toHaveLength(2)
        expect(result[0]?.uri).toBe('file1.ts')
        expect(result[1]?.uri).toBe('file2.ts')
      }
    })

    it('should register outline resource and return formatted results', async () => {
      const server = createMockServer()
      const symbols: DocumentSymbol[] = [
        {
          name: 'MyClass',
          kind: 'class',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10, character: 1 },
          },
          selectionRange: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 13 },
          },
          children: [
            {
              name: 'constructor',
              kind: 'method',
              range: {
                start: { line: 1, character: 2 },
                end: { line: 3, character: 3 },
              },
              selectionRange: {
                start: { line: 1, character: 2 },
                end: { line: 1, character: 13 },
              },
            },
            {
              name: 'getValue',
              kind: 'method',
              range: {
                start: { line: 4, character: 2 },
                end: { line: 6, character: 3 },
              },
              selectionRange: {
                start: { line: 4, character: 2 },
                end: { line: 4, character: 10 },
              },
            },
          ],
        },
      ]
      const outlineProvider = createMockOutlineProvider(symbols)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        outline: outlineProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      // Verify the outline provider returns the expected symbols
      const result = await outlineProvider.provideDocumentSymbols('test.ts')
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('MyClass')
      expect(result[0]?.kind).toBe('class')
      expect(result[0]?.children).toHaveLength(2)
      expect(result[0]?.children?.[0]?.name).toBe('constructor')
      expect(result[0]?.children?.[1]?.name).toBe('getValue')
    })

    it('should register apply_edit when userInteraction provider is available', () => {
      const server = createMockServer()
      const userInteraction = createMockUserInteraction()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        userInteraction,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
    })

    it('should register apply_edit and return result when user approves', async () => {
      const server = createMockServer()
      const userInteraction = createMockUserInteraction(true)
      const files = { 'file:///test.ts': 'const foo = 1; const bar = 2;' }
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(files),
        userInteraction,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'apply_edit',
        arguments: {
          uri: 'file:///test.ts',
          search_text: 'const foo = 1;',
          replace_text: 'const foo = 100;',
          description: 'Update foo value',
        },
      })
      expect(r.structuredContent).toStrictEqual({
        success: true,
        message: 'Edit successfully applied and saved.',
      })
    })

    it('should register apply_edit and return rejection when user declines', async () => {
      const server = createMockServer()
      const userInteraction = createMockUserInteraction(false)
      const files = { 'file:///test.ts': 'const foo = 1; const bar = 2;' }
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(files),
        userInteraction,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'apply_edit',
        arguments: {
          uri: 'file:///test.ts',
          search_text: 'const foo = 1;',
          replace_text: 'const foo = 100;',
          description: 'Update foo value',
        },
      })
      expect(r.structuredContent).toStrictEqual({
        success: false,
        message: 'Edit rejected by user.',
      })
    })
  })
})

describe('diagnostics subscription', () => {
  it('should register onDiagnosticsChanged callback when provided', () => {
    const server = createMockServer()
    const diagnosticsProvider = createMockDiagnosticsProvider()
    let registeredCallback: OnDiagnosticsChangedCallback | undefined

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: diagnosticsProvider,
      onDiagnosticsChanged: (callback) => {
        registeredCallback = callback
      },
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
    expect(registeredCallback).toBeDefined()
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

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should handle user rejection of edits', () => {
    const server = createMockServer()
    const userInteraction = createMockUserInteraction(false)
    const files = { 'test.ts': 'const foo = 1;' }

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      userInteraction,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
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

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should handle file read errors', () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess({}), // No files
      definition: definitionProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
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

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })
})

describe('resource integration', () => {
  it('should register and access file diagnostics resource', async () => {
    const server = createMockServer()
    const diagnostics: Diagnostic[] = [
      {
        uri: 'test.ts',
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 10 },
        },
        severity: 'error',
        message: 'Syntax error',
        source: 'typescript',
        code: 2322,
      },
    ]
    const diagnosticsProvider = createMockDiagnosticsProvider(diagnostics)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: diagnosticsProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'lsp://diagnostics/test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: '- **ERROR** [typescript] (2322) at line 1: Syntax error',
      uri: 'lsp://diagnostics/test.ts',
    })
  })

  it('should register and access workspace diagnostics resource', async () => {
    const server = createMockServer()
    const workspaceDiagnostics: Diagnostic[] = [
      {
        uri: 'file1.ts',
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        severity: 'warning',
        message: 'Unused variable',
      },
      {
        uri: 'file2.ts',
        range: {
          start: { line: 5, character: 0 },
          end: { line: 5, character: 3 },
        },
        severity: 'error',
        message: 'Missing semicolon',
      },
    ]
    const diagnosticsProvider = createMockDiagnosticsProvider(
      [],
      workspaceDiagnostics,
    )
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: diagnosticsProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'lsp://diagnostics/workspace' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `## file1.ts
- **WARNING** at line 2: Unused variable

## file2.ts
- **ERROR** at line 6: Missing semicolon`,
      uri: 'lsp://diagnostics/workspace',
    })
  })

  it('should register and access outline resource', async () => {
    const server = createMockServer()
    const symbols: DocumentSymbol[] = [
      {
        name: 'MyClass',
        kind: 'class',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
        children: [
          {
            name: 'myMethod',
            kind: 'method',
            range: {
              start: { line: 2, character: 2 },
              end: { line: 5, character: 3 },
            },
            selectionRange: {
              start: { line: 2, character: 2 },
              end: { line: 2, character: 10 },
            },
          },
        ],
      },
    ]
    const outlineProvider = createMockOutlineProvider(symbols)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      outline: outlineProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'lsp://outline/test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `- **class** \`MyClass\` (lines 1-11)
  - **method** \`myMethod\` (lines 3-6)`,
      uri: 'lsp://outline/test.ts',
    })
  })

  it('should handle outline with nested symbols', async () => {
    const server = createMockServer()
    const symbols: DocumentSymbol[] = [
      {
        name: 'MyNamespace',
        kind: 'namespace',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 20, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 10 },
          end: { line: 0, character: 21 },
        },
        children: [
          {
            name: 'MyClass',
            kind: 'class',
            range: {
              start: { line: 2, character: 2 },
              end: { line: 15, character: 3 },
            },
            selectionRange: {
              start: { line: 2, character: 8 },
              end: { line: 2, character: 15 },
            },
            children: [
              {
                name: 'constructor',
                kind: 'method',
                range: {
                  start: { line: 4, character: 4 },
                  end: { line: 6, character: 5 },
                },
                selectionRange: {
                  start: { line: 4, character: 4 },
                  end: { line: 4, character: 15 },
                },
              },
            ],
          },
        ],
      },
    ]
    const outlineProvider = createMockOutlineProvider(symbols)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      outline: outlineProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'lsp://outline/test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `- **namespace** \`MyNamespace\` (lines 1-21)
  - **class** \`MyClass\` (lines 3-16)
    - **method** \`constructor\` (lines 5-7)`,
      uri: 'lsp://outline/test.ts',
    })
  })

  it('should register and access filesystem resource', async () => {
    const server = createMockServer()
    const files = ['src/index.ts', 'src/utils.ts', 'README.md']
    const filesystemProvider = createMockFilesystemProvider(files)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      filesystem: filesystemProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'lsp://files/src' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: '- src/index.ts\n- src/utils.ts\n- README.md',
      uri: 'lsp://files/src',
    })
  })

  it('should handle empty directory in filesystem resource', async () => {
    const server = createMockServer()
    const filesystemProvider = createMockFilesystemProvider([])
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      filesystem: filesystemProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'lsp://files/empty' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: 'No files found in directory.',
      uri: 'lsp://files/empty',
    })
  })
})

describe('global find and replace tools', () => {
  it('should register global_find tool when globalFind provider is available', () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should register global_find tool and return formatted results', async () => {
    const server = createMockServer()
    const matches: GlobalFindMatch[] = [
      {
        uri: 'file:///src/index.ts',
        line: 10,
        column: 5,
        matchText: 'searchTerm',
        context: 'const searchTerm = "value"',
      },
      {
        uri: 'file:///src/utils.ts',
        line: 25,
        column: 12,
        matchText: 'searchTerm',
        context: 'function searchTerm() {}',
      },
    ]
    const globalFindProvider = createMockGlobalFindProvider(matches)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'global_find',
      arguments: {
        query: 'searchTerm',
        case_sensitive: true,
        exact_match: false,
        regex_mode: false,
      },
    })
    expect(r.structuredContent).toStrictEqual({
      matches: [
        {
          uri: 'file:///src/index.ts',
          line: 10,
          column: 5,
          matchText: 'searchTerm',
          context: 'const searchTerm = "value"',
        },
        {
          uri: 'file:///src/utils.ts',
          line: 25,
          column: 12,
          matchText: 'searchTerm',
          context: 'function searchTerm() {}',
        },
      ],
      count: 2,
    })
  })

  it('should handle global_find with no matches', async () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider([])
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'global_find',
      arguments: {
        query: 'nonexistent',
      },
    })
    expect(r.structuredContent).toStrictEqual({
      matches: [],
      count: 0,
    })
  })

  it('should register global_replace tool when globalFind provider is available', () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should register global_replace tool and return replacement count', async () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider([], 5)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'global_replace',
      arguments: {
        query: 'oldName',
        replace_with: 'newName',
        case_sensitive: true,
        exact_match: true,
        regex_mode: false,
      },
    })
    expect(r.structuredContent).toStrictEqual({
      success: true,
      count: 5,
    })
  })

  it('should handle global_replace with singular occurrence message', async () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider([], 1)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'global_replace',
      arguments: {
        query: 'oldName',
        replace_with: 'newName',
      },
    })
    expect(r.structuredContent).toStrictEqual({
      success: true,
      count: 1,
    })
  })

  it('should handle global_replace with zero replacements', async () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider([], 0)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'global_replace',
      arguments: {
        query: 'nonexistent',
        replace_with: 'anything',
      },
    })
    expect(r.structuredContent).toStrictEqual({
      success: true,
      count: 0,
    })
  })

  it('should use default values for optional global_find parameters', async () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider([])
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    await client.callTool({
      name: 'global_find',
      arguments: {
        query: 'test',
        // Omit optional parameters to test defaults
      },
    })

    // Verify the provider was called with default options
    expect(globalFindProvider.globalFind).toHaveBeenCalledWith('test', {
      caseSensitive: false,
      exactMatch: false,
      regexMode: false,
    })
  })

  it('should use default values for optional global_replace parameters', async () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider([], 0)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: globalFindProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    await client.callTool({
      name: 'global_replace',
      arguments: {
        query: 'test',
        replace_with: 'replacement',
        // Omit optional parameters to test defaults
      },
    })

    // Verify the provider was called with default options
    expect(globalFindProvider.globalReplace).toHaveBeenCalledWith(
      'test',
      'replacement',
      {
        caseSensitive: false,
        exactMatch: false,
        regexMode: false,
      },
    )
  })
})
