import type { FoldingRange, ServerCapabilities } from "vscode-languageserver";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";

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
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri)!;
      const ast = jsonDocument.findNodeAtPointer("");
      if (!ast) {
        return [];
      }

      const ranges: FoldingRange[] = [];
      jsonDocument.walkNodes(ast, (node) => {
        if (node.type === "object" || node.type === "array") {
          const startLine = jsonDocument.positionAt(node.offset).line;
          const endLine = jsonDocument.positionAt(node.offset + node.length - 1).line - 1;

          if (endLine > startLine) {
            ranges.push({ startLine, endLine });
          }
        }
      });
      return ranges;
    });
  }
}
