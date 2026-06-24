import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { TextEdit } from "vscode-languageserver";

describe("Formatting", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should format JSON with spaces", async () => {
    const originalText = `{"foo":"bar"}`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/formatting", {
      textDocument: { uri: uri.toString() },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })) as TextEdit[];

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    const formatted = applyEdits(originalText, result);
    expect(formatted).toBe(`{\n  "foo": "bar"\n}`);
  });

  test("should format JSON with tabs", async () => {
    const originalText = `{"foo":"bar"}`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/formatting", {
      textDocument: { uri: uri.toString() },
      options: {
        tabSize: 4,
        insertSpaces: false
      }
    })) as TextEdit[];

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    const formatted = applyEdits(originalText, result);
    expect(formatted).toBe(`{\n\t"foo": "bar"\n}`);
  });

  test("should preserve CRLF line endings when formatting a document with CRLF", async () => {
    const originalText = `{"foo":"bar"}\r\n`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/formatting", {
      textDocument: { uri: uri.toString() },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })) as TextEdit[];

    expect(result).toBeDefined();
    const formatted = applyEdits(originalText, result);
    expect(formatted).toBe(`{\r\n  "foo": "bar"\r\n}`);
  });

  test("should handle formatting invalid JSON documents gracefully", async () => {
    const originalText = `{"foo":`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/formatting", {
      textDocument: { uri: uri.toString() },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })) as TextEdit[];

    // Even if it has syntax errors, formatting should either return some edits or return safely without throwing
    expect(result).toBeDefined();
    if (result.length > 0) {
      const formatted = applyEdits(originalText, result);
      expect(formatted).toContain("foo");
    }
  });
});

function applyEdits(text: string, edits: TextEdit[]): string {
  const tempDoc = TextDocument.create("temp.json", "json", 0, text);

  // Sort from bottom to top (descending line/character) to prevent offset shifts
  const sortedEdits = [...edits].sort((a, b) => {
    if (b.range.start.line !== a.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  const changes = sortedEdits.map((edit) => ({
    range: edit.range,
    text: edit.newText
  }));

  TextDocument.update(tempDoc, changes, 1);
  return tempDoc.getText();
}
