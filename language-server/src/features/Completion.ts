import { CompletionItemKind } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";

import type { Server } from "../services/Server.ts";
import type { CompletionItem, ServerCapabilities } from "vscode-languageserver";

export class Completion {
  constructor(server: Server, jsonDocuments: JsonDocuments) {
    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        completionProvider: {
          triggerCharacters: [":", "\""]
        }
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onCompletion(async (params) => {
      const jsonDocument = jsonDocuments.get(params.textDocument.uri)!;
      const keyNode = jsonDocument.findNodeAtPosition(params.position)!;
      const propertyNode = keyNode.parent;

      if (propertyNode?.type !== "property" || propertyNode.children![0] !== keyNode) {
        return [];
      }

      const objectNode = propertyNode.parent!;

      const propertyNames = await jsonDocument.getDeclaredProperties(objectNode);
      for (const node of objectNode.children!) {
        if (node === propertyNode) {
          continue;
        }

        propertyNames.delete(node.children![0].value);
      }

      const completionItems: CompletionItem[] = [];
      for (const propertyName of propertyNames) {
        completionItems.push({
          label: propertyName,
          kind: CompletionItemKind.Property
        });
      }
      return completionItems;
    });
  }
}
