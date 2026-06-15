import { parse as parseYaml } from 'yaml'
import type { FieldHint, SchemaHint } from './types'

export type PartialSchema = Partial<SchemaHint> & { fields: Record<string, FieldHint> }

export function parseSchema(yamlText: string): PartialSchema {
  const raw = (parseYaml(yamlText) ?? {}) as Partial<SchemaHint>
  return { ...raw, fields: raw.fields ?? {} }
}

/** Shallow field-merge: base fields first, then collection fields override by name. */
export function mergeSchema(
  base: { fields: Record<string, FieldHint> } | undefined,
  child: PartialSchema,
): SchemaHint {
  return {
    collection: child.collection ?? 'unknown',
    extract: child.extract ?? 'bold-label',
    entry: child.entry ?? 'editor',
    extends: child.extends,
    fields: { ...(base?.fields ?? {}), ...child.fields },
  }
}
