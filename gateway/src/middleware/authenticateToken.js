
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const JWT_ISSUER = "distributed-systems-playground-auth";
const JWT_AUDIENCE = "distributed-systems-playground";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured");
}

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  // 1. Require a Bearer token.
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "A Bearer token is required",
      requestId: req.requestId,
    });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Token is missing",
      requestId: req.requestId,
    });
  }

  try {
    // 2. Verify signature, algorithm, expiry, issuer and audience.
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // 3. Validate the claims required by our application.
    if (
      typeof decoded.sub !== "string" ||
      decoded.sub.length === 0 ||
      !["user", "admin"].includes(decoded.role)
    ) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token claims",
        requestId: req.requestId,
      });
    }

    // 4. Attach the verified identity to the gateway request.
    req.auth = {
      userId: decoded.sub,
      role: decoded.role,
    };

    // 5. Continue to the next middleware/proxy.
    return next();
  } catch (error) {
    const message =
      error.name === "TokenExpiredError"
        ? "Token has expired"
        : "Invalid token";

    return res.status(401).json({
      error: "Unauthorized",
      message,
      requestId: req.requestId,
    });
  }
}

module.exports = authenticateToken;
