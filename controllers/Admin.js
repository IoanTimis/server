const User = require('../models/user');
const bcrypt = require('bcryptjs');

// Users Admin Controller ---------------------------------------------------------------------------------
const sanitizeUser = (u) => {
  if (!u) return null;
  const { password, ...rest } = u.toJSON ? u.toJSON() : u;
  return rest;
};

const getUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;

    const { rows, count } = await User.findAndCountAll({
      order: [['id', 'ASC']],
      limit,
      offset,
    });
    return res.json({ items: rows.map(sanitizeUser), count, page, limit });
  } catch (err) {
    console.error('admin.getUsers error', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(sanitizeUser(user));
  } catch (err) {
    console.error('admin.getUser error', err);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
};

const addUser = async (req, res) => {
  try {
    const { first_name, name, email, password, role } = req.body || {};
    if (!first_name || !name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const exists = await User.findOne({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Email already used' });

    const hash = await bcrypt.hash(password, 10);
    const created = await User.create({ first_name, name, email, password: hash, role: role || 'client' });
    return res.status(201).json(sanitizeUser(created));
  } catch (err) {
    console.error('admin.addUser error', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
};

const editUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, name, email, password, role } = req.body || {};
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (email && email !== user.email) {
      const exists = await User.findOne({ where: { email } });
      if (exists && exists.id !== user.id) return res.status(409).json({ error: 'Email already used' });
    }

    const updates = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (password) updates.password = await bcrypt.hash(password, 10);

    await user.update(updates);
    return res.json(sanitizeUser(user));
  } catch (err) {
    console.error('admin.editUser error', err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await user.destroy();
    return res.json({ success: true });
  } catch (err) {
    console.error('admin.deleteUser error', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
};

module.exports = {
  getUsers,
  getUser,
  addUser,
  editUser,
  deleteUser,
  // products will be appended below
};
