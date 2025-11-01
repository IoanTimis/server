const User = require('../models/user');
const bcrypt = require('bcryptjs');
const Product = require('../models/resource');
const ProductImage = require('../models/resource_image');
const ProductFeature = require('../models/resource_feature');

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

// Products Admin Controller -----------------------------------------------------------------------------
const toProductRow = (p) => {
  const json = p.toJSON ? p.toJSON() : p;
  return {
    id: json.id,
    name: json.name,
    price: Number(json.price),
    description: json.description,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
};

const getProducts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;

    // For admin listing, we don't need heavy associations; keep list light.
    const { rows, count } = await Product.findAndCountAll({
      order: [['id', 'ASC']],
      limit,
      offset,
    });
    return res.json({ items: rows.map(toProductRow), count, page, limit });
  } catch (err) {
    console.error('admin.getProducts error', err);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
};

const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const p = await Product.findByPk(id, {
      include: [
        { model: ProductImage, as: 'images', required: false },
        { model: ProductFeature, as: 'features', required: false },
      ],
    });
    if (!p) return res.status(404).json({ error: 'Product not found' });
    return res.json(toProductRow(p));
  } catch (err) {
    console.error('admin.getProduct error', err);
    return res.status(500).json({ error: 'Failed to fetch product' });
  }
};

const addProduct = async (req, res) => {
  try {
    let { name, description, price, user_id } = req.body || {};
    if (user_id == null && req.user?.id) {
      user_id = req.user.id;
    }
    if (!name || !description || price == null || user_id == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const created = await Product.create({ name, description, price, user_id });
    return res.status(201).json(toProductRow(created));
  } catch (err) {
    console.error('admin.addProduct error', err);
    return res.status(500).json({ error: 'Failed to create product' });
  }
};

const editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, user_id } = req.body || {};
    const p = await Product.findByPk(id);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = price;
    if (user_id !== undefined) updates.user_id = user_id;
    await p.update(updates);
    return res.json(toProductRow(p));
  } catch (err) {
    console.error('admin.editProduct error', err);
    return res.status(500).json({ error: 'Failed to update product' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const p = await Product.findByPk(id);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    await p.destroy();
    return res.json({ success: true });
  } catch (err) {
    console.error('admin.deleteProduct error', err);
    return res.status(500).json({ error: 'Failed to delete product' });
  }
};

module.exports.getProducts = getProducts;
module.exports.getProduct = getProduct;
module.exports.addProduct = addProduct;
module.exports.editProduct = editProduct;
module.exports.deleteProduct = deleteProduct;
