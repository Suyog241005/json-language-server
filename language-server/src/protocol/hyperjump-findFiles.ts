import { CM, MessageDirection, ProtocolRequestType } from "vscode-languageserver";

export type FindFilesParams = {
  include: string;
  exclude?: string;
  maxResults?: number;
};

export const FindFilesRequest = {
  method: "hyperjump/findFiles" as const,
  messageDirection: MessageDirection.serverToClient,
  type: new ProtocolRequestType<FindFilesParams, string[], never, void, void>("hyperjump/findFiles"),
  capabilities: CM.create("hyperjump.findFiles", undefined)
};
