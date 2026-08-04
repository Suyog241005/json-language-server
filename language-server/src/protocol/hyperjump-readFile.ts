import { CM, MessageDirection, ProtocolRequestType } from "vscode-languageserver";

export type ReadFileParams = {
  uri: string;
};

export const ReadFileRequest = {
  method: "hyperjump/readFile" as const,
  messageDirection: MessageDirection.serverToClient,
  type: new ProtocolRequestType<ReadFileParams, string, never, void, void>("hyperjump/readFile"),
  capabilities: CM.create("hyperjump.readFile", undefined)
};
