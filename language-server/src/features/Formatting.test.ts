import { EOL } from "node:os";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";
import { DocumentFormattingRequest, DocumentRangeFormattingRequest } from "vscode-languageserver";

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
    await client.writeDocument("test.json", `{"foo":"bar"}\n`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    });

    expect(result).to.eql([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: "\n  "
      },
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 7 }
        },
        newText: " "
      },
      {
        range: {
          start: { line: 0, character: 12 },
          end: { line: 0, character: 12 }
        },
        newText: "\n"
      }
    ]);
  });

  test("should format JSON with tabs", async () => {
    await client.writeDocument("test.json", `{"foo":"bar"}\n`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: {
        tabSize: 4,
        insertSpaces: false
      }
    });

    expect(result).to.eql([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: `\n\t`
      },
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 7 }
        },
        newText: " "
      },
      {
        range: {
          start: { line: 0, character: 12 },
          end: { line: 0, character: 12 }
        },
        newText: "\n"
      }
    ]);
  });

  test("should preserve CRLF line endings when formatting a document with CRLF", async () => {
    await client.writeDocument("test.json", `{"foo":"bar"}\r\n`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    });

    expect(result).to.eql([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: "\r\n  "
      },
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 7 }
        },
        newText: " "
      },
      {
        range: {
          start: { line: 0, character: 12 },
          end: { line: 0, character: 12 }
        },
        newText: "\r\n"
      }
    ]);
  });

  test("should default to use the system EOL style", async () => {
    await client.writeDocument("test.json", `{"foo":"bar"}`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    });

    expect(result).to.eql([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: `${EOL}  `
      },
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 7 }
        },
        newText: " "
      },
      {
        range: {
          start: { line: 0, character: 12 },
          end: { line: 0, character: 12 }
        },
        newText: EOL
      },
      {
        range: {
          start: { line: 0, character: 13 },
          end: { line: 0, character: 13 }
        },
        newText: EOL
      }
    ]);
  });

  test("should handle formatting invalid JSON documents gracefully", async () => {
    await client.writeDocument("test.json", `{"foo":\n`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    });

    expect(result).to.eql([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: `\n  `
      }
    ]);
  });

  test("should format JSON range", async () => {
    await client.writeDocument("test.json", `{"foo":"bar","baz":"qux"}\n`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentRangeFormattingRequest.type, {
      textDocument: { uri },
      range: {
        start: { line: 0, character: 13 },
        end: { line: 0, character: 24 }
      },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 19 },
          end: { line: 0, character: 19 }
        },
        newText: " "
      }
    ]);
  });
});
