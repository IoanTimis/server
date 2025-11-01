const jwt = require("jsonwebtoken");

function IsLogged(req, res, next) {
  if (process.env.NODE_ENV === "test") {
    console.log("Test environment detected. Skipping authentication...");
    req.user = { id: 1, role: "client" };
    return next();
  }

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access Token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Authenticated user:", decoded);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired Access Token" });
  }
}

module.exports = { IsLogged };
