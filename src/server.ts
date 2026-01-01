/**
 * MCP Server Implementation for LSP Driver SDK
 *
 * The SDK automatically registers tools based on which capability providers
 * are defined in the IdeCapabilities configuration.
 */

import {
  type McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { IdeCapabilities } from './capabilities.js'
import {
  formatDiagnosticsAsMarkdown,
  formatSnippetsAsMarkdown,
  formatSymbolsAsMarkdown,
  generateEditId,
  normalizeUri,
} from './formatting.js'
import {
  type ResolverConfig,
  SymbolResolutionError,
  SymbolResolver,
} from './resolver.js'
import {
  ApplyEditSchema,
  CallHierarchySchema,
  FuzzyPositionSchema,
} from './schemas.js'
import type {
  EditResult,
  FuzzyPosition,
  PendingEditOperation,
} from './types.js'

// ============================================================================
// McpLspDriver Class
// ============================================================================

/**
 * Configuration options for the MCP LSP Driver.
 */
export interface McpLspDriverConfig {
  /** Configuration for the symbol resolver */
  resolverConfig?: ResolverConfig
}

/**
 * Register LSP-based tools and resources on the provided MCP server.
 */
export function installMcpLspDriver({
  server,
  capabilities,
  config,
}: {
  server: McpServer
  capabilities: IdeCapabilities
  config?: McpLspDriverConfig
}) {
  const resolver = new SymbolResolver(
    capabilities.fileAccess,
    config?.resolverConfig,
  )

  try {
    registerTools(server, capabilities, resolver)
  } catch (error) {
    return {
      success: false,
      error,
      reason: 'Error occured during registration of tools',
    }
  }

  try {
    registerResources(server, capabilities)
  } catch (error) {
    return {
      success: false,
      error,
      reason: 'Error occured during registration of resources',
    }
  }

  return {
    success: true,
  }
}

function registerTools(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  if (capabilities.definition) {
    registerGotoDefinitionTool(server, capabilities, resolver)
  }

  if (capabilities.references) {
    registerFindReferencesTool(server, capabilities, resolver)
  }

  if (capabilities.hierarchy) {
    registerCallHierarchyTool(server, capabilities, resolver)
  }

  if (capabilities.userInteraction) {
    registerApplyEditTool(server, capabilities, resolver)
  }
}

function registerResources(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  if (capabilities.diagnostics) {
    registerDiagnosticsResources(server, capabilities)
  }

  if (capabilities.outline) {
    registerOutlineResource(server, capabilities)
  }
}

/**
 * Registers the goto_definition tool.
 */
function registerGotoDefinitionTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const definitionProvider = capabilities.definition
  if (!definitionProvider) return

  server.registerTool(
    'goto_definition',
    {
      description:
        'Navigate to the definition of a symbol. Resolves fuzzy position to exact coordinates.',
      inputSchema: {
        uri: FuzzyPositionSchema.shape.uri,
        symbol_name: FuzzyPositionSchema.shape.symbol_name,
        line_hint: FuzzyPositionSchema.shape.line_hint,
        order_hint: FuzzyPositionSchema.shape.order_hint,
      },
      outputSchema: {
        snippets: z.array(
          z.object({
            uri: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            content: z.string(),
          }),
        ),
      },
    },
    async (params) => {
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = await definitionProvider.provideDefinition(
          uri,
          exactPosition,
        )
        const markdown = formatSnippetsAsMarkdown(snippets)

        const structuredSnippets = snippets.map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

        return {
          content: [{ type: 'text' as const, text: markdown }],
          structuredContent: {
            snippets: structuredSnippets,
          },
        }
      } catch (error) {
        const message =
          error instanceof SymbolResolutionError
            ? error.message
            : `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the find_references tool.
 */
function registerFindReferencesTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const referencesProvider = capabilities.references
  if (!referencesProvider) return

  server.registerTool(
    'find_references',
    {
      description:
        'Find all references to a symbol. Returns a list of locations where the symbol is used.',
      inputSchema: {
        uri: FuzzyPositionSchema.shape.uri,
        symbol_name: FuzzyPositionSchema.shape.symbol_name,
        line_hint: FuzzyPositionSchema.shape.line_hint,
        order_hint: FuzzyPositionSchema.shape.order_hint,
      },
      outputSchema: {
        snippets: z.array(
          z.object({
            uri: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            content: z.string(),
          }),
        ),
      },
    },
    async (params) => {
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = await referencesProvider.provideReferences(
          uri,
          exactPosition,
        )
        const markdown = formatSnippetsAsMarkdown(snippets)

        const structuredSnippets = snippets.map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

        return {
          content: [{ type: 'text' as const, text: markdown }],
          structuredContent: {
            snippets: structuredSnippets,
          },
        }
      } catch (error) {
        const message =
          error instanceof SymbolResolutionError
            ? error.message
            : `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the call_hierarchy tool.
 */
function registerCallHierarchyTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const hierarchyProvider = capabilities.hierarchy
  if (!hierarchyProvider) return

  server.registerTool(
    'call_hierarchy',
    {
      description:
        'Get call hierarchy for a function or method. Shows incoming (callers) or outgoing (callees) calls.',
      inputSchema: {
        uri: CallHierarchySchema.shape.uri,
        symbol_name: CallHierarchySchema.shape.symbol_name,
        line_hint: CallHierarchySchema.shape.line_hint,
        order_hint: CallHierarchySchema.shape.order_hint,
        direction: CallHierarchySchema.shape.direction,
      },
      outputSchema: {
        snippets: z.array(
          z.object({
            uri: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            content: z.string(),
          }),
        ),
      },
    },
    async (params) => {
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = await hierarchyProvider.provideCallHierarchy(
          uri,
          exactPosition,
          params.direction,
        )
        const markdown = formatSnippetsAsMarkdown(snippets)

        const structuredSnippets = snippets.map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

        return {
          content: [{ type: 'text' as const, text: markdown }],
          structuredContent: {
            snippets: structuredSnippets,
          },
        }
      } catch (error) {
        const message =
          error instanceof SymbolResolutionError
            ? error.message
            : `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers diagnostics resources.
 * - lsp://diagnostics/{path} - diagnostics for a specific file
 * - lsp://diagnostics/workspace - diagnostics for the entire workspace (if getWorkspaceDiagnostics is provided)
 */
function registerDiagnosticsResources(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const diagnosticsProvider = capabilities.diagnostics
  if (!diagnosticsProvider) return

  // Register file diagnostics resource template
  const fileDiagnosticsTemplate = new ResourceTemplate(
    'lsp://diagnostics/{+path}',
    {
      list: undefined, // Cannot enumerate all files with diagnostics
    },
  )

  server.registerResource(
    'file-diagnostics',
    fileDiagnosticsTemplate,
    {
      description:
        'Diagnostics (errors, warnings, hints) for a specific file. Use the file path after lsp://diagnostics/',
      mimeType: 'text/markdown',
    },
    async (_uri, variables) => {
      try {
        const path = variables.path as string
        const normalizedPath = normalizeUri(path)
        const diagnostics =
          await diagnosticsProvider.provideDiagnostics(normalizedPath)
        const markdown = formatDiagnosticsAsMarkdown(diagnostics)

        return {
          contents: [
            {
              uri: `lsp://diagnostics/${path}`,
              mimeType: 'text/markdown',
              text: markdown,
            },
          ],
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          contents: [
            {
              uri: `lsp://diagnostics/${variables.path}`,
              mimeType: 'text/markdown',
              text: message,
            },
          ],
        }
      }
    },
  )

  // Register workspace diagnostics resource if getWorkspaceDiagnostics is provided
  if (diagnosticsProvider.getWorkspaceDiagnostics) {
    const getWorkspaceDiagnostics =
      diagnosticsProvider.getWorkspaceDiagnostics.bind(diagnosticsProvider)

    server.registerResource(
      'workspace-diagnostics',
      'lsp://diagnostics/workspace',
      {
        description:
          'All diagnostics (errors, warnings, hints) across the entire workspace',
        mimeType: 'text/markdown',
      },
      async () => {
        try {
          const diagnostics = await getWorkspaceDiagnostics()

          // Group diagnostics by file
          const groupedByFile = new Map<string, typeof diagnostics>()
          for (const d of diagnostics) {
            const existing = groupedByFile.get(d.uri) ?? []
            existing.push(d)
            groupedByFile.set(d.uri, existing)
          }

          if (groupedByFile.size === 0) {
            return {
              contents: [
                {
                  uri: 'lsp://diagnostics/workspace',
                  mimeType: 'text/markdown',
                  text: 'No diagnostics found in workspace.',
                },
              ],
            }
          }

          // Format grouped diagnostics
          const sections: string[] = []
          for (const [uri, fileDiagnostics] of groupedByFile) {
            sections.push(
              `## ${uri}\n${formatDiagnosticsAsMarkdown(fileDiagnostics)}`,
            )
          }

          return {
            contents: [
              {
                uri: 'lsp://diagnostics/workspace',
                mimeType: 'text/markdown',
                text: sections.join('\n\n'),
              },
            ],
          }
        } catch (error) {
          const message = `Error: ${error instanceof Error ? error.message : String(error)}`
          return {
            contents: [
              {
                uri: 'lsp://diagnostics/workspace',
                mimeType: 'text/markdown',
                text: message,
              },
            ],
          }
        }
      },
    )
  }

  // Set up subscription support if onDiagnosticsChanged is provided
  if (capabilities.onDiagnosticsChanged) {
    capabilities.onDiagnosticsChanged((uri) => {
      // Notify MCP clients that the diagnostics resource has been updated
      const normalizedUri = normalizeUri(uri)
      server.server.sendResourceUpdated({
        uri: `lsp://diagnostics/${normalizedUri}`,
      })
      // Also notify workspace diagnostics if it exists
      if (diagnosticsProvider.getWorkspaceDiagnostics) {
        server.server.sendResourceUpdated({
          uri: 'lsp://diagnostics/workspace',
        })
      }
    })
  }
}

/**
 * Registers the outline resource.
 * - lsp://outline/{path} - document symbols (outline) for a specific file
 */
function registerOutlineResource(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const outlineProvider = capabilities.outline
  if (!outlineProvider) return

  const outlineTemplate = new ResourceTemplate('lsp://outline/{+path}', {
    list: undefined, // Cannot enumerate all files
  })

  server.registerResource(
    'file-outline',
    outlineTemplate,
    {
      description:
        'Document outline (symbols like classes, functions, variables) for a specific file. Use the file path after lsp://outline/',
      mimeType: 'text/markdown',
    },
    async (_uri, variables) => {
      try {
        const path = variables.path as string
        const normalizedPath = normalizeUri(path)
        const symbols =
          await outlineProvider.provideDocumentSymbols(normalizedPath)
        const markdown = formatSymbolsAsMarkdown(symbols)

        return {
          contents: [
            {
              uri: `lsp://outline/${path}`,
              mimeType: 'text/markdown',
              text: markdown,
            },
          ],
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          contents: [
            {
              uri: `lsp://outline/${variables.path}`,
              mimeType: 'text/markdown',
              text: message,
            },
          ],
        }
      }
    },
  )
}

/**
 * Registers the apply_edit tool.
 */
function registerApplyEditTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const userInteraction = capabilities.userInteraction
  if (!userInteraction) return

  server.registerTool(
    'apply_edit',
    {
      description:
        'Apply a text edit to a file. The edit must be approved by the user before being applied.',
      inputSchema: {
        uri: ApplyEditSchema.shape.uri,
        search_text: ApplyEditSchema.shape.search_text,
        replace_text: ApplyEditSchema.shape.replace_text,
        description: ApplyEditSchema.shape.description,
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
        reason: z.string().optional(),
      },
    },
    async (params) => {
      try {
        const uri = normalizeUri(params.uri)

        // Validate that the search text exists and is unique
        const range = await resolver.findExactText(uri, params.search_text)

        // Create pending edit operation
        const operation: PendingEditOperation = {
          id: generateEditId(),
          uri,
          edits: [
            {
              range,
              newText: params.replace_text,
            },
          ],
          description: params.description,
        }

        // Request user approval
        const approved = await userInteraction.previewAndApplyEdits(operation)

        const result: EditResult = approved
          ? { success: true, message: 'Edit successfully applied and saved.' }
          : {
              success: false,
              message: 'Edit rejected by user.',
            }

        const structuredResult = {
          success: result.success,
          message: result.message,
        }

        return {
          content: [{ type: 'text' as const, text: result.message }],
          structuredContent: structuredResult,
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: {
            success: false,
            message,
          },
          isError: true,
        }
      }
    },
  )
}
