const jwt = require("jsonwebtoken");

function NotLogged(req, res, next) {
  if (process.env.NODE_ENV === "test") {
    console.log("Test environment detected. Skipping not-logged auth check...");
    req.user = null;
    return next();
  }

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.status(403).json({ error: "Already authenticated" });
  } catch (err) {
    return next();
  }
}

module.exports = { NotLogged };
