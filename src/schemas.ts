/**
 * Zod schemas for MCP tool inputs and outputs.
 * @internal
 */

import { z } from 'zod'

export const FuzzyPositionSchema = z.object({
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

export const ApplyEditSchema = z.object({
  uri: z.string().describe('The file URI or path'),
  search_text: z
    .string()
    .describe('Exact text to replace (must exist uniquely in the file)'),
  replace_text: z.string().describe('New text to insert'),
  description: z.string().describe('Rationale for the edit'),
})

export const CallHierarchySchema = z.object({
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
