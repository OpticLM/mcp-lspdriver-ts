/**
 * Capability Providers for MCP LSP Driver SDK
 *
 * The Plugin Developer provides an implementation of IdeCapabilities.
 * The SDK exposes tools based on which optional providers are defined.
 *
 * Note: All inputs here use ExactPosition. The SDK handles the
 * Fuzzy -> Exact conversion before calling these.
 */

import type {
  FileAccessProvider,
  UserInteractionProvider,
} from './interfaces.js'
import type {
  CodeSnippet,
  Diagnostic,
  ExactPosition,
  UnifiedUri,
} from './types.js'

// ============================================================================
// LSP Capability Providers
// ============================================================================

/**
 * Provides go-to-definition functionality.
 */
export interface DefinitionProvider {
  /**
   * Returns definition location reading strictly from disk context.
   *
   * @param uri - The URI of the file
   * @param position - The exact position to find the definition for
   * @returns Array of code snippets representing definition locations
   */
  provideDefinition(
    uri: UnifiedUri,
    position: ExactPosition,
  ): Promise<CodeSnippet[]>
}

/**
 * Provides find-references functionality.
 */
export interface ReferencesProvider {
  /**
   * Finds all references to the symbol at the given position.
   *
   * @param uri - The URI of the file
   * @param position - The exact position to find references for
   * @returns Array of code snippets representing reference locations
   */
  provideReferences(
    uri: UnifiedUri,
    position: ExactPosition,
  ): Promise<CodeSnippet[]>
}

/**
 * Provides call hierarchy functionality.
 */
export interface HierarchyProvider {
  /**
   * Provides call hierarchy information for the symbol at the given position.
   *
   * @param uri - The URI of the file
   * @param position - The exact position to get call hierarchy for
   * @param direction - Whether to get incoming or outgoing calls
   * @returns Array of code snippets representing call hierarchy items
   */
  provideCallHierarchy(
    uri: UnifiedUri,
    position: ExactPosition,
    direction: 'incoming' | 'outgoing',
  ): Promise<CodeSnippet[]>
}

/**
 * Provides diagnostics (errors, warnings) for a file.
 */
export interface DiagnosticsProvider {
  /**
   * Gets diagnostics for a file.
   *
   * @param uri - The URI of the file
   * @returns Array of diagnostics for the file
   */
  provideDiagnostics(uri: UnifiedUri): Promise<Diagnostic[]>
}

// ============================================================================
// Composite IDE Capabilities
// ============================================================================

/**
 * The complete set of capabilities that an IDE plugin can provide.
 * The SDK will automatically register tools based on which providers are defined.
 */
export interface IdeCapabilities {
  /** Mandatory: Provides file system access for reading files from disk */
  fileAccess: FileAccessProvider

  /** Optional: Provides user interaction for edit operations */
  userInteraction?: UserInteractionProvider

  /** Optional: Provides go-to-definition functionality */
  definition?: DefinitionProvider

  /** Optional: Provides find-references functionality */
  references?: ReferencesProvider

  /** Optional: Provides call hierarchy functionality */
  hierarchy?: HierarchyProvider

  /** Optional: Provides diagnostics for files */
  diagnostics?: DiagnosticsProvider
}
