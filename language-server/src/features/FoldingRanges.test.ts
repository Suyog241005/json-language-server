import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";
import { FoldingRangeRequest } from "vscode-languageserver";

describe("FoldingRanges", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should return folding ranges for multi-line JSON objects", async () => {
    await client.writeDocument(
      "test.json",
      `{
        "foo": "bar",
        "baz": 123
      }`
    );
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        startLine: 0,
        endLine: 2
      }
    ]);
  });

  test("should return folding ranges for multi-line JSON arrays", async () => {
    await client.writeDocument(
      "test.json",
      `[
        "a",
        "b"
      ]`
    );
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        startLine: 0,
        endLine: 2
      }
    ]);
  });

  test("should return folding ranges for nested objects and arrays", async () => {
    await client.writeDocument(
      "test.json",
      `{
        "a": {
          "b": [
            1,
            2
          ]
        }
      }`
    );
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        startLine: 0,
        endLine: 6
      },
      {
        startLine: 1,
        endLine: 5
      },
      {
        startLine: 2,
        endLine: 4
      }
    ]);
  });

  test("should not return folding ranges for single-line objects or arrays", async () => {
    await client.writeDocument("test.json", `{ "a": [1, 2] }`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should return folding ranges for multiple objects inside an array", async () => {
    await client.writeDocument(
      "test.json",
      `[
        {
          "id": 1
        },
        {
          "id": 2
        }
      ]`
    );
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        startLine: 0,
        endLine: 6
      },
      {
        startLine: 1,
        endLine: 2
      },
      {
        startLine: 4,
        endLine: 5
      }
    ]);
  });

  test("should not return folding ranges for two-line empty objects", async () => {
    await client.writeDocument("test.json", `{
    }`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should return folding ranges for empty multi-line objects with empty lines", async () => {
    await client.writeDocument("test.json", `{


    }`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        startLine: 0,
        endLine: 2
      }
    ]);
  });
});
