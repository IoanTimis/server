const sanitizeHtml = require('sanitize-html');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const jwt = require("jsonwebtoken");

// TODO: register, forgot password, change password, email verification, 2FA

const register = async (req, res) => {
    try {
        const { first_name, name, email, password, role } = req.body;

        if (!first_name || !name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const sanitizedFirstName = sanitizeHtml(first_name);
        const sanitizedName = sanitizeHtml(name);
        const sanitizedEmail = sanitizeHtml(email);
        const sanitizedRole = sanitizeHtml(role);

        const existingUser = await User.findOne({ where: { email: sanitizedEmail } });
        if (existingUser) {
            return res.status(409).json({ error: "Email already in use" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            first_name: sanitizedFirstName,
            name: sanitizedName,
            email: sanitizedEmail,
            password: hashedPassword,
            role: sanitizedRole || 'client',
        });

        return res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        console.error("Registration error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            console.log("Invalid email or password");
            return res.status(204).json({ error: "Invalid email or password" });
        }

        const payload = { id: user.id, email: user.email, first_name: user.first_name, name: user.name, role: user.role};

        const { accessToken, refreshToken } = generateTokens(payload);

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",             
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            maxAge:   30 * 24 * 60 * 60 * 1000,
        });

        console.log("User logat =============================",user);

        return res.status(200).json({ accessToken, message: "Login successful"});
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

const checkSession = (req, res) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.json({ user: null });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.json({ user: null });
        }
        res.json({ user: decoded });
    });
};

const refreshAccessToken = (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: "No refresh token provided" });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    if (!decoded || !decoded.role) {
      return res.status(403).json({ error: "Invalid refresh token payload" });
    }

    const userData = { id: decoded.id, email: decoded.email, role: decoded.role, };

    const newAccessToken = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: "15m" });

    return res.status(200).json({ accessToken: newAccessToken });

  } catch (error) {
    console.error("Invalid or expired refresh token:", error);
    return res.status(403).json({ error: "Refresh Token invalid or expired" });
  }
};

const generateTokens = (user) => {
    
    const accessToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "15m" });

    const refreshToken = jwt.sign(user, process.env.JWT_REFRESH_SECRET, { expiresIn: "30d" });

    return { accessToken, refreshToken };
};

const logout = (req, res) => {
    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    });
    return res.status(200).json({ message: "Logout successful" });
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
    } catch (error) {
        console.error("Forgot password error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log("User ID from token:", userId);
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Both current and new passwords are required" });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(403).json({ error: "Current password is incorrect" });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: "New password must be at least 8 characters long" });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedNewPassword;
        await user.save();

        return res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
        console.error("Change password error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};


module.exports = {
    register,
    login,
    checkSession,
    refreshAccessToken,
    logout,
    forgotPassword,
    changePassword,
};
