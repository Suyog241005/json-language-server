import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { TextDocumentSyncKind } from "vscode-languageserver";
import { TestClient } from "../test/test-client.ts";
import { registerSchema, unregisterSchema } from "@hyperjump/json-schema";

describe("Schema Validation", () => {
  let client: TestClient;
  const fixtureSchemaUri = "https://example.com/person";

  beforeAll(async () => {
    client = new TestClient();
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
  });

  afterEach(() => {
    unregisterSchema(fixtureSchemaUri);
  });

  test("textDocumentSync = Incremental", () => {
    expect(client.serverCapabilities?.textDocumentSync).to.equal(TextDocumentSyncKind.Incremental);
  });

  test("JSON Validation using Hyperjump - Valid Case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
        "$schema": "${fixtureSchemaUri}",
        "name": "Alice",
        "age" : 39
        }`);
    await client.openDocument("instance.json");

    const diagnostics = await diagnosticsPromise;
    expect(diagnostics).toHaveLength(0);
  });

  test("JSON Validation using Hyperjump - Invalid Case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "name": 1234,
    "age" : "hello"
    }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(2);
    const messages = diagnostics.map((d) => d.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Expected a.*string/),
        expect.stringMatching(/Expected a.*number/)
      ])
    );
  });

  test("JSON Validation using Hyperjump - anyOf Formatting Case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        value: {
          anyOf: [
            { type: "string" },
            { type: "number" }
          ]
        }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "value": true
    }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(1);
    const cleanMessage = diagnostics[0].message.replace(/[\u2068\u2069]/g, "");
    expect(cleanMessage).toBe("Expected the value to match at least one alternative:\n  - Expected a string\n  - Expected a number");
  });

  test("JSON Validation using Hyperjump - oneOf Formatting Case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        value: {
          oneOf: [
            { type: "string" },
            { type: "number" }
          ]
        }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "value": true
    }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(1);
    const cleanMessage = diagnostics[0].message.replace(/[\u2068\u2069]/g, "");
    expect(cleanMessage).toBe("Expected the value to match exactly one alternative, but none matched:\n  - Expected a string\n  - Expected a number");
  });

  test("JSON Validation using Hyperjump - property name with slash (escape sequence)", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        "foo/bar": { type: "string" }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "foo/bar": 11
    }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(1);
    const cleanMessage = diagnostics[0].message.replace(/[\u2068\u2069]/g, "");
    expect(cleanMessage).toBe("Expected a string");
  });

  test("property key that looks like a number should not be treated like one - object case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        0: { type: "string" }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "0": 123
  }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message.replace(/[\u2068\u2069]/g, "")).toBe("Expected a string");
  });

  test("URI encoded characters in pointer are decoded correctly", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        "foo bar": { type: "string" }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "foo bar": 123
    }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message.replace(/[\u2068\u2069]/g, "")).toBe("Expected a string");
  });

  test("numeric segment in array should be treated as array index", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        42: {
          type: "array",
          items: { type: "number" }
        }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "42": ["foo"]
  }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message.replace(/[\u2068\u2069]/g, "")).toBe("Expected a number");
  });
});
