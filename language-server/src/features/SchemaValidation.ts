import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import { validate } from "@hyperjump/json-schema-errors";
import { pointerSegments } from "@hyperjump/json-pointer";

import type { ErrorObject } from "@hyperjump/json-schema-errors";
import type { DiagnosticsProvider } from "./Diagnostics.ts";

export class SchemaValidation implements DiagnosticsProvider {
  async getDiagnostics(textDocument: TextDocument) {
    const text = textDocument.getText();
    const parseErrors: jsonc.ParseError[] = [];

    const tree = jsonc.parseTree(text, parseErrors);
    const schemaDiagnostics: Diagnostic[] = [];

    const schemaNode = tree ? jsonc.findNodeAtLocation(tree, ["$schema"]) : undefined;
    const schemaUri = schemaNode?.value;

    // skip schema validation if there are syntax errors hence the parseError.length check
    if (schemaUri && parseErrors.length === 0) {
      let instance = JSON.parse(text);
      const result = await validate(schemaUri, instance);

      if (!result.valid) {
        const errors = result.errors;
        errors.forEach((error) => {
          const node = tree ? findNodeByPointer(tree, error.instanceLocation) : undefined;

          if (node) {
            schemaDiagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: textDocument.positionAt(node.offset),
                end: textDocument.positionAt(node.offset + node.length)
              },
              message: formatError(error),
              source: "json-language-server"
            });
          }
        });
      }
    }

    return schemaDiagnostics;
  }
}

const findNodeByPointer = (node: jsonc.Node, pointer: string) => {
  if (pointer === "#") {
    return node;
  }

  pointer = decodeURIComponent(pointer.slice(1));
  for (let segment of pointerSegments(pointer)) {
    const key = /^\d+$/.test(segment) && node.type === "array" ? parseInt(segment) : segment;
    node = jsonc.findNodeAtLocation(node, [key]) ?? node;
  }

  return node;
};

const formatError = (error: ErrorObject, depth = 0): string => {
  let message = error.message;
  if (error.alternatives && error.alternatives.length > 0) {
    const indent = "  ".repeat(depth + 1);
    const lines = error.alternatives.flatMap((alt) => alt.map((subErr) => `${indent}- ${formatError(subErr, depth + 1)}`));
    message += `:\n${lines.join("\n")}`;
  }
  return message;
};
