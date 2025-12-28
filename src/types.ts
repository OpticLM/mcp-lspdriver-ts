/**
 * Core Data Models for MCP LSP Driver SDK
 *
 * These types define how the LLM communicates intent versus
 * how the IDE executes commands.
 */

// ============================================================================
// Location Types
// ============================================================================

/**
 * A Unified Resource Identifier.
 * Must be a file system path or a standard file:// scheme.
 */
export type UnifiedUri = string

/**
 * 0-based exact coordinate system (Used internally by IDE).
 */
export interface ExactPosition {
  /** 0-based line number */
  line: number
  /** 0-based column (character offset) */
  character: number
}

/**
 * The fuzzy location provided by the LLM.
 * Designed to be robust against minor formatting changes or token counting errors.
 */
export interface FuzzyPosition {
  /**
   * The text of the symbol to find (e.g., function name, variable name).
   */
  symbolName: string

  /**
   * An approximate line number where the symbol is expected.
   * 1-based (Human friendly) for LLM input, converted to 0-based internally.
   */
  lineHint: number

  /**
   * If the symbol appears multiple times on the line, which occurrence to target?
   * 0-based index. Defaults to 0 (the first occurrence).
   * Example: "add(a, a)" -> looking for second 'a' -> orderHint: 1.
   */
  orderHint?: number
}

/**
 * Represents a resolved span of text on disk.
 */
export interface DiskRange {
  start: ExactPosition
  end: ExactPosition
}

/**
 * Represents a snippet of code read from disk.
 */
export interface CodeSnippet {
  /** The URI of the file containing the snippet */
  uri: UnifiedUri
  /** The range of the snippet in the file */
  range: DiskRange
  /** The actual text read from disk */
  content: string
}

// ============================================================================
// Edit Types
// ============================================================================

/**
 * Represents a proposed change to a file.
 */
export interface TextEdit {
  /** The range to replace */
  range: DiskRange
  /** The new text to insert */
  newText: string
}

/**
 * Represents a pending edit operation that awaits user approval.
 */
export interface PendingEditOperation {
  /** Unique identifier for this operation */
  id: string
  /** The URI of the file to edit */
  uri: UnifiedUri
  /** The list of edits to apply */
  edits: TextEdit[]
  /** Optional description of the edit (e.g., "Refactor logic to handle null cases") */
  description?: string
}

/**
 * The reason why an edit operation failed.
 */
export type EditFailureReason = 'UserRejected' | 'IOError' | 'ValidationFailed'

/**
 * The result of an edit operation.
 */
export type EditResult =
  | { success: true; message: string }
  | { success: false; message: string; reason: EditFailureReason }

// ============================================================================
// Diagnostic Types
// ============================================================================

/**
 * Severity level for diagnostics.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint'

/**
 * Represents a diagnostic (error, warning, etc.) from the IDE.
 */
export interface Diagnostic {
  /** The URI of the file containing the diagnostic */
  uri: UnifiedUri
  /** The range of the diagnostic */
  range: DiskRange
  /** The severity of the diagnostic */
  severity: DiagnosticSeverity
  /** The diagnostic message */
  message: string
  /** Optional source of the diagnostic (e.g., "typescript", "eslint") */
  source?: string
  /** Optional diagnostic code */
  code?: string | number
}
