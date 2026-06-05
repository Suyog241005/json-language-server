import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";

import type { DiagnosticsProvider } from "./Diagnostics.ts";

export class SyntaxValidation implements DiagnosticsProvider {
  getDiagnostics(textDocument: TextDocument): Diagnostic[] {
    const text = textDocument.getText();
    const parseErrors: jsonc.ParseError[] = [];

    jsonc.parseTree(text, parseErrors);

    return parseErrors.map((error) => ({
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(error.offset),
        end: textDocument.positionAt(error.offset + error.length)
      },
      message: jsonc.printParseErrorCode(error.error),
      source: "hyperjump-json-language-server"
    }));
  }
}
