require("dotenv").config();
const { connectRedis } = require("./config/redis");
const express = require("express");
const { randomUUID } = require("node:crypto");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const authenticateToken = require("./middleware/authenticateToken");
const rateLimiter = require("./middleware/rateLimiter");

const PORT = process.env.PORT || 4000;
const INSTANCE_ID = process.env.INSTANCE_ID || "gateway-1";

// Correct backend worker targets
const BACKENDS = [
  "http://backend-1:5000",
  "http://backend-2:5000",
  "http://backend-3:5000",
];

let nextBackendIndex = 0;

// Correlation request ID tracking
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
});

// Gateway health endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    instance: INSTANCE_ID,
  });
});

// Proxy for Task API to backend worker instances
const taskProxy = createProxyMiddleware({
  pathFilter: (path) =>
    path === "/api/tasks" || path.startsWith("/api/tasks/"),
  router: () => {
    const target = BACKENDS[nextBackendIndex];
    nextBackendIndex = (nextBackendIndex + 1) % BACKENDS.length;
    return target;
  },
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.setHeader("X-Request-ID", req.requestId);
      // Forward the verified user id to the downstream service
      if (req.user?.userId || req.auth?.userId) {
        proxyReq.setHeader(
          "X-User-ID",
          req.user?.userId || req.auth?.userId
        );
      }
    },
    error: (err, req, res) => {
      console.error("Gateway proxy error:", {
        requestId: req.requestId,
        message: err.message,
      });

      if (!res.headersSent) {
        res.writeHead(502, {
          "Content-Type": "application/json",
          "X-Request-ID": req.requestId,
        });

        res.end(
          JSON.stringify({
            error: "Bad Gateway",
            message: "The downstream service is unavailable",
            requestId: req.requestId,
          })
        );
      }
    },
  },
});

// Proxy for Auth service
const authProxy = createProxyMiddleware({
  pathFilter: (path) =>
    path === "/auth" || path.startsWith("/auth/"),
  target: "http://auth:4001",
  changeOrigin: true,
  on: {
    error: (err, req, res) => {
      console.error("Auth Service proxy error:", {
        requestId: req.requestId,
        message: err.message,
      });

      if (!res.headersSent) {
        res.writeHead(502, {
          "Content-Type": "application/json",
          "X-Request-ID": req.requestId,
        });

        res.end(
          JSON.stringify({
            error: "Bad Gateway",
            message: "Authentication service is unavailable",
            requestId: req.requestId,
          })
        );
      }
    },
  },
});

// Protected route middleware chain
app.use("/api/tasks", authenticateToken);
app.use("/api/tasks", rateLimiter);

// Route proxies
app.use(authProxy);
app.use(taskProxy);

async function startServer() {
  try {
    await connectRedis();

    app.listen(PORT, () => {
      console.log(`Gateway ${INSTANCE_ID} running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Gateway failed to connect to Redis:", error.message);
    process.exit(1);
  }
}

startServer();