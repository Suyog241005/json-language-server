import { RequestHandler, HandlerResult, CancellationToken } from "vscode-jsonrpc";
import { CM, MessageDirection, ProtocolRequestType } from "vscode-languageserver";

export type FindFilesParams = {
  include: string;
  exclude?: string;
  maxResults?: number;
};

export namespace FindFilesRequest {
  export const method = "hyperjump/findFiles" as const;
  export const messageDirection: MessageDirection = MessageDirection.serverToClient;
  export const type = new ProtocolRequestType<FindFilesParams, string[], never, void, void>(method);
  export type HandlerSignature = RequestHandler<FindFilesParams, string[], void>;
  export type MiddlewareSignature = (params: FindFilesParams, token: CancellationToken, next: HandlerSignature) => HandlerResult<string[], void>;
  export const capabilities = CM.create("hyperjump.findFiles", undefined);
}
