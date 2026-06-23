import { compile, getSchema } from "@hyperjump/json-schema/experimental";
import { evaluateCompiledSchema } from "@hyperjump/json-schema-errors";
import { normalizeIri } from "@hyperjump/uri";

import type { CompiledSchema } from "@hyperjump/json-schema/experimental";
import type { Json } from "@hyperjump/json-schema-errors";
import type { Server } from "../services/server.ts";

export class SchemaStore {
  private compiledSchemaCache: Map<string, CompiledSchema> = new Map();

  constructor(server: Server) {
    server.onDidChangeWatchedFiles((params) => {
      for (const change of params.changes) {
        const changedSchemaUri = normalizeIri(change.uri);
        this.clear(changedSchemaUri);
      }
    });
  }

  async validate(schemaUri: string, instance: Json) {
    if (!this.compiledSchemaCache.has(schemaUri)) {
      const schema = await getSchema(schemaUri);
      this.compiledSchemaCache.set(schemaUri, await compile(schema));
    }
    const compiledSchema = this.compiledSchemaCache.get(schemaUri)!;

    return evaluateCompiledSchema(compiledSchema, instance);
  }

  getDependentSchemaUris(schemaUri: string) {
    const compiledSchema = this.compiledSchemaCache.get(schemaUri);
    if (compiledSchema === undefined) {
      return undefined;
    }
    return this.getDependenencies(compiledSchema);
  }

  clear(schemaUri: string) {
    for (const [cachedSchemaUri, compiledSchema] of this.compiledSchemaCache.entries()) {
      const dependentSchemas = this.getDependenencies(compiledSchema);
      if (dependentSchemas.has(schemaUri)) {
        this.compiledSchemaCache.delete(cachedSchemaUri);
      }
    }
  }

  private getDependenencies(compiledSchema: CompiledSchema) {
    const dependentSchemas = new Set<string>();
    for (const key of Object.keys(compiledSchema.ast)) {
      if (key !== "metaData" && key !== "plugins") {
        dependentSchemas.add(key.split("#")[0]);
      }
    }
    return dependentSchemas;
  }
}
