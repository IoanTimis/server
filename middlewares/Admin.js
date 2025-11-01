const jwt = require("jsonwebtoken");

function isAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access Token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid or expired Access Token" });
    }

    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    req.user = decoded; 
    next(); 
  });
}

module.exports = {
  isAdmin,
};
