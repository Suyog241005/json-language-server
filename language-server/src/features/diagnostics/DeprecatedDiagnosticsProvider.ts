import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";
import { findDeprecated } from "../../evaluation/Annotation.ts";

import type { Diagnostic } from "vscode-languageserver";
import type { Node } from "jsonc-parser";
import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { Annotation } from "../../evaluation/Annotation.ts";
import type { JsonDocument } from "../../models/JsonDocument.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";

export class DeprecatedDiagnosticsProvider implements DiagnosticsProvider {
  private jsonSchema: JsonSchema;

  constructor(jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;
  }

  async getDiagnostics(jsonDocument: JsonDocument) {
    const diagnostics: Diagnostic[] = [];

    const ast = jsonDocument.findNodeAtPointer("");
    if (!ast) {
      return diagnostics;
    }

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (!result) {
        return diagnostics;
      }

      const plugin = LspEvaluationPlugin.from(result);

      const report = (node: Node, annotation: Annotation) => {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          tags: [DiagnosticTag.Deprecated],
          range: jsonDocument.rangeAt(node.offset, node.offset + node.length),
          message: annotation.deprecationMessage() ?? "Deprecated",
          source: "hyperjump-json-language-server"
        });
      };

      // A deprecated property is marked on its key no matter what its value
      // is. A deprecated value is marked on the value.
      jsonDocument.walkNodes(ast, (node) => {
        const pointer = jsonDocument.getPointerForNode(node);
        const location = findDeprecated(plugin.getLocationAnnotations(pointer));
        const value = findDeprecated(plugin.getValueAnnotations(pointer));

        if (node.parent?.type === "property") {
          if (location) {
            report(node.parent.children![0], location);
          }
          if (value) {
            report(node, value);
          }
        } else if (location ?? value) {
          report(node, (location ?? value)!);
        }
      });
    } catch {
      // Schema errors are reported by SchemaValidationDiagnosticsProvider
    }

    return diagnostics;
  }
}
