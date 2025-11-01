const jwt = require("jsonwebtoken");

function isClient(req, res, next) {
  if (process.env.NODE_ENV === "test") {
    console.log("Test environment detected. Skipping client authentication...");
    req.user = { id: 1, role: "client" };
    return next();
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access Token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid or expired Access Token" });
    }

    if (decoded.role !== "client") {
      return res.status(403).json({ error: "Access denied" });
    }

    req.user = decoded;
    next();
  });
}

module.exports = { isClient };
