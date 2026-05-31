import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { createServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const host = process.env.HOST ?? "0.0.0.0";

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(cors());

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }
  const isParseError =
    err instanceof SyntaxError ||
    (typeof err === "object" && err !== null && "body" in err);
  if (isParseError) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error" },
      id: null,
    });
    return;
  }
  res.status(500).json({
    jsonrpc: "2.0",
    error: { code: -32603, message: "Internal server error" },
    id: null,
  });
};
app.use(errorHandler);

const httpServer = app.listen(port, host, () => {
  console.error(`windmill-mcp-server listening on http://${host}:${port}/mcp`);
});

function shutdown() {
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
