
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured");
}

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  // Require: Authorization: Bearer <token>
  if (!authorization || !authorization.startsWith("Bearer ")) {
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
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // Identity comes from the verified token, not request headers.
    req.auth = {
      userId: decoded.sub,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      error: "Unauthorized",
      message:
        error.name === "TokenExpiredError"
          ? "Token has expired"
          : "Invalid token",
      requestId: req.requestId,
    });
  }
}

module.exports = authenticateToken;
