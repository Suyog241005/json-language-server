import type { FoldingRange, ServerCapabilities } from "vscode-languageserver";
import type { Node } from "jsonc-parser";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";
import type { JsonDocument } from "../models/JsonDocument.ts";

export class FoldingRanges {
  private jsonDocuments: JsonDocuments;

  constructor(server: Server, jsonDocuments: JsonDocuments) {
    this.jsonDocuments = jsonDocuments;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        foldingRangeProvider: true
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onFoldingRanges((params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri);
      if (!jsonDocument) {
        return [];
      }

      return this.getFoldingRanges(jsonDocument);
    });
  }

  private getFoldingRanges(jsonDocument: JsonDocument): FoldingRange[] {
    const ast = jsonDocument.getAst();
    if (!ast) {
      return [];
    }

    const ranges: FoldingRange[] = [];
    this.collectFoldingRanges(jsonDocument, ast, ranges);
    return ranges;
  }

  private collectFoldingRanges(jsonDocument: JsonDocument, node: Node, ranges: FoldingRange[]) {
    if (node.type === "object" || node.type === "array") {
      const startLine = jsonDocument.positionAt(node.offset).line;
      const endLine = jsonDocument.positionAt(node.offset + node.length - 1).line - 1;

      if (endLine > startLine) {
        ranges.push({
          startLine,
          endLine
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectFoldingRanges(jsonDocument, child, ranges);
      }
    }
  }
}
