import { type JsonDocuments } from "../services/JsonDocuments.ts";
import * as jsonc from "jsonc-parser";
import { Server } from "../services/Server.ts";

import type { ServerCapabilities, TextEdit, DocumentFormattingParams } from "vscode-languageserver";

export class Formatting {
  constructor(server: Server, documents: JsonDocuments) {
    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        documentFormattingProvider: true
      };
      return { capabilities: serverCapabilities };
    });

    server.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return [];
      }

      const text = document.getText();
      const options = params.options;

      const eol = text.includes("\r\n") ? "\r\n" : "\n";

      const edits = jsonc.format(text, undefined, {
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
        eol: eol
      });

      return edits.map((edit) => ({
        range: {
          start: document.positionAt(edit.offset),
          end: document.positionAt(edit.offset + edit.length)
        },
        newText: edit.content
      }));
    });
  }
}
