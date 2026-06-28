import { EOL } from "node:os";
import * as jsonc from "jsonc-parser";
import { Server } from "../services/Server.ts";

import type { ServerCapabilities, TextEdit, DocumentFormattingParams, DocumentRangeFormattingParams } from "vscode-languageserver";
import type { JsonDocuments } from "../services/JsonDocuments.ts";

export class Formatting {
  constructor(server: Server, documents: JsonDocuments) {
    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true
      };
      return { capabilities: serverCapabilities };
    });

    server.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return [];
      }

      try {
        const text = document.getText();
        const options = params.options;

        const edits = jsonc.format(text, undefined, {
          tabSize: options.tabSize,
          insertSpaces: options.insertSpaces,
          eol: EOL
        });

        return edits.map((edit) => ({
          range: {
            start: document.positionAt(edit.offset),
            end: document.positionAt(edit.offset + edit.length)
          },
          newText: edit.content
        }));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        server.console.error(`Failed to format document: ${message}`);
        return [];
      }
    });

    server.onDocumentRangeFormatting((params: DocumentRangeFormattingParams): TextEdit[] => {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return [];
      }

      try {
        const text = document.getText();
        const options = params.options;
        const range = params.range;

        const startOffset = document.offsetAt(range.start);
        const endOffset = document.offsetAt(range.end);

        const edits = jsonc.format(text, {
          offset: startOffset,
          length: endOffset - startOffset
        }, {
          tabSize: options.tabSize,
          insertSpaces: options.insertSpaces,
          eol: EOL
        });

        return edits.map((edit) => ({
          range: {
            start: document.positionAt(edit.offset),
            end: document.positionAt(edit.offset + edit.length)
          },
          newText: edit.content
        }));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        server.console.error(`Failed to format range: ${message}`);
        return [];
      }
    });
  }
}
