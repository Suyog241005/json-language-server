import { ProposedFeatures } from "vscode-languageserver";
import { createConnection } from "vscode-languageserver/node";
import { buildServer } from "./build-server.ts";

const connection = createConnection(ProposedFeatures.all);
connection.console.log("Starting Hyperjump JSON language server ...");

const server = buildServer(connection);
server.listen();
