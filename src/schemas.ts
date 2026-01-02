/**
 * Zod schemas for MCP tool inputs and outputs.
 * @internal
 */

import * as z from 'zod/mini'

export const FuzzyPositionSchema = z.object({
  uri: z.string().check(z.describe('The file URI or path')),
  symbol_name: z.string().check(z.describe('The text of the symbol to find')),
  line_hint: z
    .number()
    .check(
      z.int(),
      z.positive(),
      z.describe(
        'Approximate 1-based line number where the symbol is expected',
      ),
    ),
  order_hint: z
    ._default(z.optional(z.number().check(z.int(), z.minimum(0))), 0)
    .check(
      z.describe(
        '0-based index of which occurrence to target if symbol appears multiple times',
      ),
    ),
})

export const ApplyEditSchema = z.object({
  uri: z.string().check(z.describe('The file URI or path')),
  search_text: z
    .string()
    .check(
      z.describe('Exact text to replace (must exist uniquely in the file)'),
    ),
  replace_text: z.string().check(z.describe('New text to insert')),
  description: z.string().check(z.describe('Rationale for the edit')),
})

export const CallHierarchySchema = z.object({
  uri: z.string().check(z.describe('The file URI or path')),
  symbol_name: z.string().check(z.describe('The text of the symbol to find')),
  line_hint: z
    .number()
    .check(
      z.int(),
      z.positive(),
      z.describe(
        'Approximate 1-based line number where the symbol is expected',
      ),
    ),
  order_hint: z
    ._default(z.optional(z.number().check(z.int(), z.minimum(0))), 0)
    .check(
      z.describe(
        '0-based index of which occurrence to target if symbol appears multiple times',
      ),
    ),
  direction: z
    .enum(['incoming', 'outgoing'])
    .check(z.describe('Direction of the call hierarchy')),
})

export const GlobalFindSchema = z.object({
  query: z.string().check(z.describe('The search query')),
  case_sensitive: z
    ._default(z.optional(z.boolean()), false)
    .check(z.describe('Whether the search is case-sensitive')),
  exact_match: z
    ._default(z.optional(z.boolean()), false)
    .check(z.describe('Whether to match exact words only')),
  regex_mode: z
    ._default(z.optional(z.boolean()), false)
    .check(z.describe('Whether the query is a regular expression')),
})

export const GlobalReplaceSchema = z.object({
  query: z.string().check(z.describe('The search query')),
  case_sensitive: z
    ._default(z.optional(z.boolean()), false)
    .check(z.describe('Whether the search is case-sensitive')),
  exact_match: z
    ._default(z.optional(z.boolean()), false)
    .check(z.describe('Whether to match exact words only')),
  regex_mode: z
    ._default(z.optional(z.boolean()), false)
    .check(z.describe('Whether the query is a regular expression')),
  replace_with: z.string().check(z.describe('The replacement text')),
})
