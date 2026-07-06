import { RequestHandler, HandlerResult, CancellationToken } from "vscode-jsonrpc";
import { CM, MessageDirection, ProtocolRequestType } from "vscode-languageserver";

export type ReadFileParams = {
  uri: string;
};

export namespace ReadFileRequest {
  export const method = "hyperjump/readFile" as const;
  export const messageDirection: MessageDirection = MessageDirection.serverToClient;
  export const type = new ProtocolRequestType<ReadFileParams, string, never, void, void>(method);
  export type HandlerSignature = RequestHandler<ReadFileParams, string, void>;
  export type MiddlewareSignature = (params: ReadFileParams, token: CancellationToken, next: HandlerSignature) => HandlerResult<string, void>;
  export const capabilities = CM.create("hyperjump.readFile", undefined);
}
