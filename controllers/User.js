const sanitizeHtml = require("sanitize-html");
const User = require("../models/user");

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { first_name, name } = req.body;

        console.log( userId, first_name, name );

        if (!first_name || !name) {
            return res.status(400).json({ error: "First name and name are required" });
        }

        const sanitizedFirstName = sanitizeHtml(first_name);
        const sanitizedName = sanitizeHtml(name);

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        user.first_name = sanitizedFirstName;
        user.name = sanitizedName;
        await user.save();

        return res.status(200).json({ message: "Profile updated successfully" });
    } catch (error) {
        console.error("Update profile error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

module.exports = {
    updateProfile,
};
