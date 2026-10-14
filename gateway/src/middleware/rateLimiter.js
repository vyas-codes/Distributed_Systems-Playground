const { redisClient } = require("../config/redis");

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 5);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);

if (
  !Number.isInteger(RATE_LIMIT_MAX) ||
  RATE_LIMIT_MAX < 1 ||
  !Number.isSafeInteger(RATE_LIMIT_WINDOW_MS) ||
  RATE_LIMIT_WINDOW_MS < 1
) {
  throw new Error("Invalid rate limiter configuration");
}

// Atomic fixed-window script
const FIXED_WINDOW_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])

if current < limit then
  current = redis.call("INCR", KEYS[1])

  if current == 1 then
    redis.call("PEXPIRE", KEYS[1], windowMs)
  end
end

local ttl = redis.call("PTTL", KEYS[1])

return {current, ttl}
`;

async function rateLimiter(req, res, next) {
  // Normalize userId lookup across req.auth and req.user variants
  const userId =
    req.auth?.userId ||
    req.auth?.id ||
    req.user?.userId ||
    req.user?.id ||
    req.user?._id ||
    req.user?.sub;

  if (!userId || (typeof userId !== "string" && typeof userId !== "number")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authenticated identity is required",
      requestId: req.requestId,
    });
  }

  if (!redisClient.isReady) {
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Rate limiter is temporarily unavailable",
      requestId: req.requestId,
    });
  }

  const now = Date.now();
  const windowId = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const resetAt = (windowId + 1) * RATE_LIMIT_WINDOW_MS;
  const windowTtlMs = resetAt - now;

  const key = `rate-limit:${userId}:${windowId}`;

  console.log("[RATE LIMIT] Incoming check", {
    instance: process.env.INSTANCE_ID,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    userId,
    key,
  });

  try {
    const result = await redisClient.eval(FIXED_WINDOW_SCRIPT, {
      keys: [key],
      arguments: [String(RATE_LIMIT_MAX), String(windowTtlMs)],
    });

    const count = Number(result[0]);
    const remaining = Math.max(0, RATE_LIMIT_MAX - count);
    const retryAfterSeconds = Math.max(1, Math.ceil(Number(result[1]) / 1000));

    res.setHeader("RateLimit-Limit", RATE_LIMIT_MAX);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", Math.ceil(resetAt / 1000));

    if (count >= RATE_LIMIT_MAX) {
      res.setHeader("Retry-After", retryAfterSeconds);

      return res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded",
        retryAfterSeconds,
        requestId: req.requestId,
      });
    }

    return next();
  } catch (error) {
    console.error("Rate limiter Redis error:", {
      requestId: req.requestId,
      message: error.message,
    });

    return res.status(503).json({
      error: "Service Unavailable",
      message: "Rate limiter is temporarily unavailable",
      requestId: req.requestId,
    });
  }
}

module.exports = rateLimiter;