import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import * as fsService from "./src/main/services/fsService.js";
import * as sessionService from "./src/main/services/sessionService.js";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};

function makeSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  noStore = false,
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  if (noStore) {
    res.setHeader("Cache-Control", "no-store");
  }
  res.end(JSON.stringify(payload));
}

function sendError(
  res: ServerResponse,
  statusCode: number,
  err: unknown,
  fallbackMessage: string,
): void {
  const message = err instanceof Error ? err.message : fallbackMessage;
  sendJson(res, statusCode, { error: message });
}

async function readJsonBody<T = Record<string, unknown>>(
  req: IncomingMessage,
): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(rawBody || "{}") as T;
}

type MiddlewareContainer = {
  use: (
    route: string,
    handler: (
      req: IncomingMessage,
      res: ServerResponse,
      next: () => void,
    ) => void,
  ) => void;
};

function registerPostJsonRoute<TBody extends Record<string, unknown>>(
  middlewares: MiddlewareContainer,
  route: string,
  handler: (body: TBody, res: ServerResponse) => Promise<void>,
  fallbackError: string,
): void {
  middlewares.use(route, async (req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }
    try {
      const body = await readJsonBody<TBody>(req);
      await handler(body, res);
    } catch (err) {
      const isBadRequest =
        err instanceof Error && err.message === "Path is not a directory.";
      sendError(res, isBadRequest ? 400 : 500, err, fallbackError);
    }
  });
}

function localBackendPlugin(): Plugin {
  const attachMiddleware = (middlewares: MiddlewareContainer) => {
    middlewares.use("/api/sessions", async (req, res, next) => {
      const rawUrl = req.url || "";
      const [pathname] = rawUrl.split("?");
      const cleanId = pathname.replace(/^\/+|\/+$/g, "");

      if (!cleanId) {
        if (req.method === "GET") {
          try {
            const list = await sessionService.listAllSessions();
            sendJson(res, 200, list, true);
          } catch (err) {
            sendError(res, 500, err, "Failed to list sessions.");
          }
          return;
        }

        if (req.method === "POST") {
          try {
            const body = await readJsonBody<{
              id?: string;
              name?: string;
              cloneFromId?: string;
            }>(req);
            const newId =
              (typeof body.id === "string" && body.id.trim()) ||
              makeSessionId();
            const name =
              typeof body.name === "string" ? body.name.trim() : undefined;
            const cloneFromId =
              typeof body.cloneFromId === "string"
                ? body.cloneFromId.trim()
                : undefined;
            const session = await sessionService.getOrSeedSession(
              newId,
              name,
              cloneFromId,
            );
            sendJson(res, 200, { ok: true, session });
          } catch (err) {
            sendError(res, 500, err, "Failed to create session.");
          }
          return;
        }

        sendJson(res, 405, { error: "Method not allowed." });
        return;
      }

      const sessionId = decodeURIComponent(cleanId);

      if (req.method === "GET") {
        try {
          const session = await sessionService.getOrSeedSession(sessionId);
          sendJson(res, 200, session, true);
        } catch (err) {
          sendError(res, 500, err, "Failed to get session.");
        }
        return;
      }

      if (req.method === "PUT" || req.method === "POST") {
        try {
          const body = await readJsonBody<{ name?: string; payload?: unknown }>(
            req,
          );
          const result = await sessionService.saveSession(
            sessionId,
            body.name,
            body.payload,
          );
          sendJson(res, 200, result);
        } catch (err) {
          sendError(res, 500, err, "Failed to save session.");
        }
        return;
      }

      if (req.method === "DELETE") {
        try {
          const result = await sessionService.deleteSession(sessionId);
          sendJson(res, 200, result);
        } catch (err) {
          const isLastSession =
            err instanceof Error &&
            err.message === "Cannot delete the only remaining session.";
          sendError(
            res,
            isLastSession ? 400 : 500,
            err,
            "Failed to delete session.",
          );
        }
        return;
      }

      next();
    });

    registerPostJsonRoute<{ path?: string }>(
      middlewares,
      "/api/fs/scan",
      async (body, res) => {
        const targetPath =
          typeof body.path === "string" ? body.path.trim() : "";
        if (!targetPath) {
          sendJson(res, 400, { error: "Missing folder path." });
          return;
        }
        sendJson(res, 200, await fsService.scanFolder(targetPath));
      },
      "Failed to scan folder.",
    );

    registerPostJsonRoute<{ path?: string }>(
      middlewares,
      "/api/fs/read-file",
      async (body, res) => {
        const filePath = typeof body.path === "string" ? body.path.trim() : "";
        if (!filePath) {
          sendJson(res, 400, { error: "Missing file path." });
          return;
        }
        const content = await fsService.readFile(filePath);
        sendJson(res, 200, { content });
      },
      "Failed to read file.",
    );

    registerPostJsonRoute<{ path?: string }>(
      middlewares,
      "/api/fs/read-dir",
      async (body, res) => {
        const dirPath = typeof body.path === "string" ? body.path.trim() : "";
        if (!dirPath) {
          sendJson(res, 400, { error: "Missing directory path." });
          return;
        }
        const items = await fsService.readDirectoryShallow(
          path.resolve(dirPath),
        );
        sendJson(res, 200, { items });
      },
      "Failed to read directory.",
    );

    registerPostJsonRoute<{ path?: string; content?: string }>(
      middlewares,
      "/api/fs/write-file",
      async (body, res) => {
        const filePath = typeof body.path === "string" ? body.path.trim() : "";
        if (!filePath) {
          sendJson(res, 400, { error: "Missing file path." });
          return;
        }
        const content = typeof body.content === "string" ? body.content : "";
        sendJson(res, 200, await fsService.writeFile(filePath, content));
      },
      "Failed to write file.",
    );

    registerPostJsonRoute<{
      parentPath?: string;
      name?: string;
      content?: string;
    }>(
      middlewares,
      "/api/fs/create-file",
      async (body, res) => {
        const parentPath =
          typeof body.parentPath === "string" ? body.parentPath.trim() : "";
        if (!parentPath) {
          sendJson(res, 400, { error: "Missing parent path." });
          return;
        }
        const name =
          typeof body.name === "string" ? body.name.trim() : "Untitled Note";
        const content = typeof body.content === "string" ? body.content : "";
        const note = await fsService.createFile(parentPath, name, content);
        sendJson(res, 200, { ok: true, note });
      },
      "Failed to create file.",
    );

    registerPostJsonRoute<{ parentPath?: string; name?: string }>(
      middlewares,
      "/api/fs/create-folder",
      async (body, res) => {
        const parentPath =
          typeof body.parentPath === "string" ? body.parentPath.trim() : "";
        if (!parentPath) {
          sendJson(res, 400, { error: "Missing parent path." });
          return;
        }
        const name =
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : "New Folder";
        const folder = await fsService.createFolder(parentPath, name);
        sendJson(res, 200, { ok: true, folder });
      },
      "Failed to create folder.",
    );

    registerPostJsonRoute<{ oldPath?: string; newPath?: string }>(
      middlewares,
      "/api/fs/rename",
      async (body, res) => {
        const oldPath =
          typeof body.oldPath === "string" ? body.oldPath.trim() : "";
        const newPath =
          typeof body.newPath === "string" ? body.newPath.trim() : "";
        if (!oldPath || !newPath) {
          sendJson(res, 400, { error: "Missing oldPath or newPath." });
          return;
        }
        const updatedPath = await fsService.renamePath(oldPath, newPath);
        sendJson(res, 200, { ok: true, path: updatedPath });
      },
      "Failed to rename path.",
    );

    registerPostJsonRoute<{ path?: string }>(
      middlewares,
      "/api/fs/delete",
      async (body, res) => {
        const targetPath =
          typeof body.path === "string" ? body.path.trim() : "";
        if (!targetPath) {
          sendJson(res, 400, { error: "Missing path to delete." });
          return;
        }
        sendJson(res, 200, await fsService.deletePath(targetPath));
      },
      "Failed to delete path.",
    );

    middlewares.use("/api/fs/raw", async (req, res, next) => {
      if (req.method !== "GET") {
        next();
        return;
      }
      try {
        const reqUrl = new URL(req.url || "", "http://localhost");
        const targetPath = reqUrl.searchParams.get("path");
        if (!targetPath) {
          res.statusCode = 400;
          res.end("Missing file path.");
          return;
        }
        const resolved = await fsService.resolveLocalMediaPath(targetPath);
        if (!resolved) {
          res.statusCode = 404;
          res.end("File not found.");
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        const mimeType = MIME_BY_EXTENSION[ext] || "application/octet-stream";

        const buffer = await fs.readFile(resolved);
        res.statusCode = 200;
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Accept-Ranges", "bytes");
        res.end(buffer);
      } catch (err) {
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : "Failed to read file.");
      }
    });
  };

  return {
    name: "pent-notes-local-backend",
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react(), localBackendPlugin()],
});
