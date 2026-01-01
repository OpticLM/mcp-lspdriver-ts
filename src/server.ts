/**
 * MCP Server Implementation for LSP Driver SDK
 *
 * The SDK automatically registers tools based on which capability providers
 * are defined in the IdeCapabilities configuration.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { IdeCapabilities } from './capabilities.js'
import {
  type ResolverConfig,
  SymbolResolutionError,
  SymbolResolver,
} from './resolver.js'
import type {
  CodeSnippet,
  EditResult,
  FuzzyPosition,
  PendingEditOperation,
} from './types.js'

// ============================================================================
// Zod Schemas for Tool Inputs
// ============================================================================

const FuzzyPositionSchema = z.object({
  uri: z.string().describe('The file URI or path'),
  symbol_name: z.string().describe('The text of the symbol to find'),
  line_hint: z
    .number()
    .int()
    .positive()
    .describe('Approximate 1-based line number where the symbol is expected'),
  order_hint: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(
      '0-based index of which occurrence to target if symbol appears multiple times',
    ),
})

const ApplyEditSchema = z.object({
  uri: z.string().describe('The file URI or path'),
  search_text: z
    .string()
    .describe('Exact text to replace (must exist uniquely in the file)'),
  replace_text: z.string().describe('New text to insert'),
  description: z.string().describe('Rationale for the edit'),
})

const DiagnosticsSchema = z.object({
  uri: z.string().describe('The file URI or path to get diagnostics for'),
})

const CallHierarchySchema = z.object({
  uri: z.string().describe('The file URI or path'),
  symbol_name: z.string().describe('The text of the symbol to find'),
  line_hint: z
    .number()
    .int()
    .positive()
    .describe('Approximate 1-based line number where the symbol is expected'),
  order_hint: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(
      '0-based index of which occurrence to target if symbol appears multiple times',
    ),
  direction: z
    .enum(['incoming', 'outgoing'])
    .describe('Direction of the call hierarchy'),
})

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalizes a URI to handle Windows/Unix path separator differences.
 */
function normalizeUri(uri: string): string {
  // If it's already a file:// URI, leave it alone
  if (uri.startsWith('file://')) {
    return uri
  }
  // Normalize backslashes to forward slashes for consistency
  return uri.replace(/\\/g, '/')
}

/**
 * Formats code snippets as markdown for LLM consumption.
 */
function formatSnippetsAsMarkdown(snippets: CodeSnippet[]): string {
  if (snippets.length === 0) {
    return 'No results found.'
  }

  return snippets
    .map((snippet) => {
      const startLine = snippet.range.start.line + 1 // Convert to 1-based
      const endLine = snippet.range.end.line + 1
      const locationInfo =
        startLine === endLine
          ? `Line ${startLine}`
          : `Lines ${startLine}-${endLine}`

      return `### ${snippet.uri}\n${locationInfo}\n\`\`\`\n${snippet.content}\n\`\`\``
    })
    .join('\n\n')
}

/**
 * Generates a unique ID for pending edit operations.
 */
function generateEditId(): string {
  return `edit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

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
 * The main MCP LSP Driver class.
 * Registers LSP-based tools on a user-provided MCP server.
 *
 * The server is owned and managed by the caller - the driver only registers
 * tools on it. This allows the caller to configure the server with any
 * transport and lifecycle management they prefer.
 */
export class McpLspDriver {
  private readonly server: McpServer
  private readonly capabilities: IdeCapabilities
  private readonly resolver: SymbolResolver

  /**
   * Creates a new McpLspDriver and registers LSP tools on the provided server.
   *
   * @param server - The MCP server to register tools on (owned by caller)
   * @param capabilities - IDE capabilities that determine which tools are available
   * @param config - Optional configuration for the driver
   */
  constructor(
    server: McpServer,
    capabilities: IdeCapabilities,
    config?: McpLspDriverConfig,
  ) {
    this.server = server
    this.capabilities = capabilities
    this.resolver = new SymbolResolver(
      capabilities.fileAccess,
      config?.resolverConfig,
    )

    this.registerTools()
  }

  /**
   * Registers all available tools based on the provided capabilities.
   */
  private registerTools(): void {
    // Always register goto_definition if definition provider exists
    if (this.capabilities.definition) {
      this.registerGotoDefinitionTool()
    }

    // Register find_references if references provider exists
    if (this.capabilities.references) {
      this.registerFindReferencesTool()
    }

    // Register call_hierarchy if hierarchy provider exists
    if (this.capabilities.hierarchy) {
      this.registerCallHierarchyTool()
    }

    // Register get_diagnostics if diagnostics provider exists
    if (this.capabilities.diagnostics) {
      this.registerDiagnosticsTool()
    }

    // Register apply_edit if user interaction provider exists
    if (this.capabilities.userInteraction) {
      this.registerApplyEditTool()
    }
  }

  /**
   * Registers the goto_definition tool.
   */
  private registerGotoDefinitionTool(): void {
    const definitionProvider = this.capabilities.definition
    if (!definitionProvider) return

    this.server.tool(
      'goto_definition',
      'Navigate to the definition of a symbol. Resolves fuzzy position to exact coordinates.',
      {
        uri: FuzzyPositionSchema.shape.uri,
        symbol_name: FuzzyPositionSchema.shape.symbol_name,
        line_hint: FuzzyPositionSchema.shape.line_hint,
        order_hint: FuzzyPositionSchema.shape.order_hint,
      },
      async (params) => {
        try {
          const uri = normalizeUri(params.uri)
          const fuzzy: FuzzyPosition = {
            symbolName: params.symbol_name,
            lineHint: params.line_hint,
            orderHint: params.order_hint,
          }

          const exactPosition = await this.resolver.resolvePosition(uri, fuzzy)
          const snippets = await definitionProvider.provideDefinition(
            uri,
            exactPosition,
          )
          const markdown = formatSnippetsAsMarkdown(snippets)

          return {
            content: [{ type: 'text' as const, text: markdown }],
          }
        } catch (error) {
          const message =
            error instanceof SymbolResolutionError
              ? error.message
              : `Error: ${error instanceof Error ? error.message : String(error)}`
          return {
            content: [{ type: 'text' as const, text: message }],
            isError: true,
          }
        }
      },
    )
  }

  /**
   * Registers the find_references tool.
   */
  private registerFindReferencesTool(): void {
    const referencesProvider = this.capabilities.references
    if (!referencesProvider) return

    this.server.tool(
      'find_references',
      'Find all references to a symbol. Returns a list of locations where the symbol is used.',
      {
        uri: FuzzyPositionSchema.shape.uri,
        symbol_name: FuzzyPositionSchema.shape.symbol_name,
        line_hint: FuzzyPositionSchema.shape.line_hint,
        order_hint: FuzzyPositionSchema.shape.order_hint,
      },
      async (params) => {
        try {
          const uri = normalizeUri(params.uri)
          const fuzzy: FuzzyPosition = {
            symbolName: params.symbol_name,
            lineHint: params.line_hint,
            orderHint: params.order_hint,
          }

          const exactPosition = await this.resolver.resolvePosition(uri, fuzzy)
          const snippets = await referencesProvider.provideReferences(
            uri,
            exactPosition,
          )
          const markdown = formatSnippetsAsMarkdown(snippets)

          return {
            content: [{ type: 'text' as const, text: markdown }],
          }
        } catch (error) {
          const message =
            error instanceof SymbolResolutionError
              ? error.message
              : `Error: ${error instanceof Error ? error.message : String(error)}`
          return {
            content: [{ type: 'text' as const, text: message }],
            isError: true,
          }
        }
      },
    )
  }

  /**
   * Registers the call_hierarchy tool.
   */
  private registerCallHierarchyTool(): void {
    const hierarchyProvider = this.capabilities.hierarchy
    if (!hierarchyProvider) return

    this.server.tool(
      'call_hierarchy',
      'Get call hierarchy for a function or method. Shows incoming (callers) or outgoing (callees) calls.',
      {
        uri: CallHierarchySchema.shape.uri,
        symbol_name: CallHierarchySchema.shape.symbol_name,
        line_hint: CallHierarchySchema.shape.line_hint,
        order_hint: CallHierarchySchema.shape.order_hint,
        direction: CallHierarchySchema.shape.direction,
      },
      async (params) => {
        try {
          const uri = normalizeUri(params.uri)
          const fuzzy: FuzzyPosition = {
            symbolName: params.symbol_name,
            lineHint: params.line_hint,
            orderHint: params.order_hint,
          }

          const exactPosition = await this.resolver.resolvePosition(uri, fuzzy)
          const snippets = await hierarchyProvider.provideCallHierarchy(
            uri,
            exactPosition,
            params.direction,
          )
          const markdown = formatSnippetsAsMarkdown(snippets)

          return {
            content: [{ type: 'text' as const, text: markdown }],
          }
        } catch (error) {
          const message =
            error instanceof SymbolResolutionError
              ? error.message
              : `Error: ${error instanceof Error ? error.message : String(error)}`
          return {
            content: [{ type: 'text' as const, text: message }],
            isError: true,
          }
        }
      },
    )
  }

  /**
   * Registers the get_diagnostics tool.
   */
  private registerDiagnosticsTool(): void {
    const diagnosticsProvider = this.capabilities.diagnostics
    if (!diagnosticsProvider) return

    this.server.tool(
      'get_diagnostics',
      'Get diagnostics (errors, warnings, hints) for a file.',
      {
        uri: DiagnosticsSchema.shape.uri,
      },
      async (params) => {
        try {
          const uri = normalizeUri(params.uri)
          const diagnostics = await diagnosticsProvider.provideDiagnostics(uri)

          if (diagnostics.length === 0) {
            return {
              content: [
                { type: 'text' as const, text: 'No diagnostics found.' },
              ],
            }
          }

          const markdown = diagnostics
            .map((d) => {
              const line = d.range.start.line + 1
              const severity = d.severity.toUpperCase()
              const source = d.source ? ` [${d.source}]` : ''
              const code = d.code !== undefined ? ` (${d.code})` : ''
              return `- **${severity}**${source}${code} at line ${line}: ${d.message}`
            })
            .join('\n')

          return {
            content: [{ type: 'text' as const, text: markdown }],
          }
        } catch (error) {
          const message = `Error: ${error instanceof Error ? error.message : String(error)}`
          return {
            content: [{ type: 'text' as const, text: message }],
            isError: true,
          }
        }
      },
    )
  }

  /**
   * Registers the apply_edit tool.
   */
  private registerApplyEditTool(): void {
    const userInteraction = this.capabilities.userInteraction
    if (!userInteraction) return

    this.server.tool(
      'apply_edit',
      'Apply a text edit to a file. The edit must be approved by the user before being applied.',
      {
        uri: ApplyEditSchema.shape.uri,
        search_text: ApplyEditSchema.shape.search_text,
        replace_text: ApplyEditSchema.shape.replace_text,
        description: ApplyEditSchema.shape.description,
      },
      async (params) => {
        try {
          const uri = normalizeUri(params.uri)

          // Validate that the search text exists and is unique
          const range = await this.resolver.findExactText(
            uri,
            params.search_text,
          )

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
                reason: 'UserRejected',
              }

          return {
            content: [{ type: 'text' as const, text: result.message }],
            isError: !result.success,
          }
        } catch (error) {
          const message = `Error: ${error instanceof Error ? error.message : String(error)}`
          return {
            content: [{ type: 'text' as const, text: message }],
            isError: true,
          }
        }
      },
    )
  }
}
