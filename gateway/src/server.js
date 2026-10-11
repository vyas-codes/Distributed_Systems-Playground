
require("dotenv").config();

const express = require("express");
const { randomUUID } = require("node:crypto");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const authenticateToken = require("./middleware/authenticateToken");
const PORT = process.env.PORT || 4040;
const INSTANCE_ID = process.env.INSTANCE_ID || "gateway-1";

// These are Docker Compose service names, not host ports.
const BACKENDS = [
  "http://backend-1:5000",
  "http://backend-2:5000",
  "http://backend-3:5000",
];

let nextBackendIndex = 0;

// Add a request ID before routing or proxying.
//for the frontend
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
});

// Gateway health endpoint: does not call a backend.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    instance: INSTANCE_ID,
  });
});

// Forward Task API requests to the backend instances.
// For now, use round-robin destination selection.
const taskProxy = createProxyMiddleware({
  pathFilter: (path) =>
    path === "/api/tasks" || path.startsWith("/api/tasks/"),
  //router():opens and internal http connection socket to the selected container and api
  router: () => {
    const target = BACKENDS[nextBackendIndex];

    nextBackendIndex =
      (nextBackendIndex + 1) % BACKENDS.length;

    return target;
  },

  changeOrigin: true,
  //change the origin 
  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.setHeader("X-Request-ID", req.requestId);
    },
    //this is for the backend to have a track of requests

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
app.use("/api/tasks", authenticateToken);
app.use(taskProxy);

app.listen(PORT, () => {
  console.log(
    `Gateway ${INSTANCE_ID} running on port ${PORT}`
  );
});
