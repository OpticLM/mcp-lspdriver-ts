/**
 * Infrastructure Interfaces for MCP LSP Driver SDK
 *
 * The SDK consumer (Plugin Developer) must implement these interfaces
 * to bridge the SDK to the specific IDE.
 */

import type { PendingEditOperation, UnifiedUri } from './types.js'

// ============================================================================
// File System Access (Required)
// ============================================================================

/**
 * Provides access to the file system for reading files.
 * Since the SDK is responsible for resolving FuzzyPosition to ExactPosition,
 * it needs direct access to read files from the disk.
 */
export interface FileAccessProvider {
  /**
   * Reads the content of a file from the disk (ignoring unsaved IDE buffers).
   * Used for symbol resolution and context retrieval.
   *
   * @param uri - The URI of the file to read
   * @returns The content of the file as a string
   * @throws Error if the file cannot be read
   */
  readFile(uri: UnifiedUri): Promise<string>

  /**
   * Gets the file tree for a directory, excluding git-ignored files.
   *
   * @param folderPath - The path to the folder to read
   * @returns Array of file/folder paths in the directory tree
   */
  getFileTree(folderPath: UnifiedUri): Promise<string[]>
}

// ============================================================================
// User Interaction (Required for Edits)
// ============================================================================

/**
 * Provides user interaction capabilities for edit operations.
 * The SDK uses this to present diffs and get user approval before applying changes.
 */
export interface UserInteractionProvider {
  /**
   * Displays a diff view or a confirmation dialog in the IDE.
   * The user decides whether to apply the edits or discard them.
   *
   * @param operation - The pending edit operation to preview
   * @returns true if applied, false if rejected/cancelled
   */
  previewAndApplyEdits(operation: PendingEditOperation): Promise<boolean>
}
