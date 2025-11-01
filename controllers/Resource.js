const { Op, where: sqlWhere, col, cast } = require('sequelize');
const Resource = require('../models/resource');
const ResourceImage = require('../models/resource_image');
const ResourceFeature = require('../models/resource_feature');
const ResourceItem = require('../models/resource_item');
const ResourceCommentary = require('../models/resource_commentary');
const { ALLOWED_FEATURE_NAMES } = require('../models/resource_feature');
const User = require('../models/user');
const ResourceCoordinate = require('../models/resource_coordinate');
const fs = require('fs');
const path = require('path');
const { resourceDir, resourceUploadsPath } = require('../middlewares/Upload');
const { upsertResourceDoc, deleteResourceDoc, searchResourcesOS, suggestResourcesOS } = require('../utils/opensearch');

// Get all products (no filters)
async function getResources(req, res) {
  try {
    const resources = await Resource.findAll({
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'name', 'email'] },
        { model: ResourceImage, as: 'images', attributes: ['id', 'url', 'alt'] },
        { model: ResourceFeature, as: 'features', attributes: ['id', 'name', 'value'] },
        { model: ResourceCoordinate, as: 'coordinates', attributes: ['latitude', 'longitude'] },
        { model: ResourceItem, as: 'items', attributes: ['id', 'name', 'quantity', 'price'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    if (!resources || resources.length === 0) {
      return res.status(200).json({ resources: [], message: 'No resources found' });
    }

    return res.json(resources);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch resources' });
  }
}

// Get products with filters via query params
// Supported query params: name (or q), minPrice, maxPrice, dateFrom, dateTo (mapped to createdAt), user_id,
// camere (exact integer 1..6), suprafataMin, suprafataMax,
// limit, offset, page, sortBy, order
async function getResourcesFiltered(req, res) {
  try {
    const {
      name,
      minPrice,
      maxPrice,
      dateFrom,
      dateTo,
      user_id,
      limit = 10,
      offset = 0,
      page,
      sortBy = 'createdAt',
      order = 'DESC',
      camere,
      suprafataMin,
      suprafataMax,
    } = req.query;

    const where = {};

    // Allow alias 'q' for search; use LIKE for MySQL compatibility
    const search = name || req.query.q;
    if (search) {
      where.name = { [Op.like]: `%${search}%` };
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = parseFloat(minPrice);
      if (maxPrice) where.price[Op.lte] = parseFloat(maxPrice);
    }

    // Map dateFrom/dateTo to createdAt range now that `date` column was removed
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) where.createdAt[Op.lte] = new Date(dateTo);
    }

    if (user_id) {
      where.user_id = parseInt(user_id, 10);
    }

    const limitNum = parseInt(limit, 10);
    let offsetNum = parseInt(offset, 10);
    const pageNum = parseInt(page, 10);
    if (!isNaN(pageNum) && pageNum > 0) {
      offsetNum = (pageNum - 1) * limitNum;
    }

    // Compute resource id constraints for feature filters (Camere, Suprafata)
    let idsConstraint = null; // Set or null

    // Camere == exact value
    if (camere !== undefined && camere !== "") {
      const camVal = parseInt(camere, 10);
      if (!isNaN(camVal)) {
        const camMatches = await ResourceFeature.findAll({
          attributes: ['resource_id'],
          where: { name: 'Camere', value: String(camVal) },
          group: ['resource_id'],
          raw: true,
        });
        const camIds = new Set(camMatches.map(r => r.resource_id));
        idsConstraint = camIds;
      }
    }

    // Suprafata within range (value stored as string; cast to integer for comparison)
    if ((suprafataMin && suprafataMin !== "") || (suprafataMax && suprafataMax !== "")) {
      const minA = suprafataMin !== undefined && suprafataMin !== "" ? parseInt(suprafataMin, 10) : null;
      const maxA = suprafataMax !== undefined && suprafataMax !== "" ? parseInt(suprafataMax, 10) : null;
      if ((minA !== null && !isNaN(minA)) || (maxA !== null && !isNaN(maxA))) {
        const range = {};
        if (minA !== null && !isNaN(minA)) range[Op.gte] = minA;
        if (maxA !== null && !isNaN(maxA)) range[Op.lte] = maxA;
        const areaMatches = await ResourceFeature.findAll({
          attributes: ['resource_id'],
          where: {
            name: 'surface', // match model enum
            [Op.and]: [
              sqlWhere(cast(col('value'), 'UNSIGNED'), range),
            ],
          },
          group: ['resource_id'],
          raw: true,
        });
        const areaIds = new Set(areaMatches.map(r => r.resource_id));
        if (idsConstraint) {
          // intersect
          idsConstraint = new Set([...idsConstraint].filter(x => areaIds.has(x)));
        } else {
          idsConstraint = areaIds;
        }
      }
    }

    if (idsConstraint) {
      const arr = [...idsConstraint];
      if (arr.length === 0) {
        // no matches, return early
        return res.json({ items: [], total: 0, limit: limitNum, offset: offsetNum, page: 1 });
      }
      where.id = { [Op.in]: arr };
    }

    const include = [
      { model: User, as: 'owner', attributes: ['id', 'first_name', 'name', 'email'] },
      { model: ResourceImage, as: 'images', attributes: ['id', 'url', 'alt'] },
      { model: ResourceFeature, as: 'features', attributes: ['id', 'name', 'value'] },
      { model: ResourceCoordinate, as: 'coordinates', attributes: ['latitude', 'longitude'] },
      { model: ResourceItem, as: 'items', attributes: ['id', 'name', 'quantity', 'price'] },
    ];

    // Try OpenSearch for full-text + price + sort + pagination; keep camere/suprafata via idsConstraint
    const osResult = await searchResourcesOS({
      q: name || req.query.q,
      minPrice,
      maxPrice,
      idsConstraint: where.id ? (where.id[Op.in] || where.id) : (idsConstraint ? [...idsConstraint] : null),
      sortBy,
      order,
      limit: limitNum,
      offset: offsetNum,
    });

    console.log('OS Result:', osResult);

    if (osResult && osResult.ids) {
      const ids = osResult.ids;
      if (!ids.length) {
        return res.json({ items: [], total: osResult.total || 0, limit: limitNum, offset: offsetNum, page: (!isNaN(pageNum) && pageNum > 0 ? pageNum : Math.floor(offsetNum / limitNum) + 1) });
      }
      // Fetch full rows for these ids, preserving OS order
      const rows = await Resource.findAll({
        where: { id: ids },
        include,
      });
      const byId = new Map(rows.map(r => [r.id, r]));
      const ordered = ids.map(id => byId.get(typeof id === 'string' ? parseInt(id, 10) || id : id)).filter(Boolean);
      const currentPage = !isNaN(pageNum) && pageNum > 0 ? pageNum : Math.floor(offsetNum / limitNum) + 1;
      return res.json({ items: ordered, total: osResult.total || ordered.length, limit: limitNum, offset: offsetNum, page: currentPage });
    }

    // Fallback to DB when OS unavailable or failed
    const { rows, count } = await Resource.findAndCountAll({
      where,
      include,
      order: [[sortBy, order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']],
      limit: limitNum,
      offset: offsetNum,
      distinct: true,
    });

    const currentPage = !isNaN(pageNum) && pageNum > 0 ? pageNum : Math.floor(offsetNum / limitNum) + 1;
    return res.json({ items: rows, total: count, limit: limitNum, offset: offsetNum, page: currentPage });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch filtered resources' });
  }
}

// Get single product by id
async function getResourceById(req, res) {
  try {
    const { id } = req.params;
    const resource = await Resource.findByPk(id, {
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'name', 'email'] },
        { model: ResourceImage, as: 'images', attributes: ['id', 'url', 'alt'] },
        { model: ResourceFeature, as: 'features', attributes: ['id', 'name', 'value'] },
        { model: ResourceCoordinate, as: 'coordinates', attributes: ['latitude', 'longitude'] },
          { model: ResourceItem, as: 'items', attributes: ['id', 'name', 'quantity', 'price'] },
          { model: ResourceCommentary, as: 'comments', attributes: ['id', 'message', 'user_id', 'createdAt', 'updatedAt'], include: [
            { model: User, as: 'author', attributes: ['id', 'first_name', 'name'] }
          ] },
      ],
    });

    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    return res.json(resource);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch resource' });
  }
}

// Create a new product
async function createResource(req, res) {
  try {
  const { name, description, price, features } = req.body;
  const latInput = req.body.latitude ?? req.body.lat;
  const lngInput = req.body.longitude ?? req.body.lon ?? req.body.lng;
  const combinedCoords = req.body.coordinates || req.body.location;
  const body_user_id = req.body.user_id;

    const ownerId = req.user?.id || body_user_id;
    if (!name || price == null || !ownerId || !description) {
      return res.status(400).json({ error: 'Missing required fields: name, description, price, user_id' });
    }

    // Optional: check user exists
  const user = await User.findByPk(ownerId);
    if (!user) return res.status(400).json({ error: 'Owner user not found' });

    const resource = await Resource.create({
      name,
      description,
      price,
      user_id: ownerId,
    });

    // If files uploaded, save their URLs in ResourceImage
    if (Array.isArray(req.files) && req.files.length) {
      const imgs = req.files.map((f) => ({
        resource_id: resource.id,
        url: path.posix.join(resourceUploadsPath, f.filename),
        alt: null,
      }));
      await ResourceImage.bulkCreate(imgs);
    }

    // If features provided, create entries for all provided features (enforce enum & deduplicate by name)
    let parsedFeatures = [];
    if (features) {
      try {
        parsedFeatures = typeof features === 'string' ? JSON.parse(features) : features;
      } catch (_) { parsedFeatures = []; }
      if (Array.isArray(parsedFeatures)) {
        const map = new Map();
        for (const f of parsedFeatures) {
          const nm = String(f?.name || '').toLowerCase();
          const val = f?.value;
          if (ALLOWED_FEATURE_NAMES.includes(nm) && val != null && String(val).length > 0) {
            map.set(nm, String(val).slice(0,255));
          }
        }
        const toCreate = [...map.entries()].map(([nm, val]) => ({ resource_id: resource.id, name: nm, value: val }));
        if (toCreate.length) await ResourceFeature.bulkCreate(toCreate, { ignoreDuplicates: true });
      }
    }

    // Coordinates: parse and save if present
    const { latParsed, lngParsed, error: coordError } = parseCoordinatesPayload({ latInput, lngInput, combinedCoords });
    if (coordError) {
      return res.status(400).json({ error: coordError });
    }
    if (latParsed != null && lngParsed != null) {
      try {
        await ResourceCoordinate.create({ resource_id: resource.id, latitude: latParsed, longitude: lngParsed });
      } catch (e) {
        // ignore duplicate unique key errors; fallthrough to readback
      }
    }

    const withImages = await Resource.findByPk(resource.id, {
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'name', 'email'] },
        { model: ResourceImage, as: 'images', attributes: ['id', 'url', 'alt'] },
        { model: ResourceFeature, as: 'features', attributes: ['id', 'name', 'value'] },
        { model: ResourceCoordinate, as: 'coordinates', attributes: ['latitude', 'longitude'] },
        { model: ResourceItem, as: 'items', attributes: ['id', 'name', 'quantity', 'price'] },
      ],
    });
    // Index new resource in OpenSearch (best-effort)
    upsertResourceDoc(withImages).catch(() => {});
    return res.status(201).json(withImages);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create resource' });
  }
}

// Update a product by id
async function updateResource(req, res) {
  try {
    const { id } = req.params;
  const { name, description, price, deleteImageIds, features } = req.body;
  const latInput = req.body.latitude ?? req.body.lat;
  const lngInput = req.body.longitude ?? req.body.lon ?? req.body.lng;
  const combinedCoords = req.body.coordinates || req.body.location;

    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    // Optional: ownership check - if req.user exists, ensure user_id matches
    if (req.user && req.user.id && resource.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to update this resource' });
    }

    if (name !== undefined) resource.name = name;
  if (description !== undefined) resource.description = description;
  if (price !== undefined) resource.price = price;

    await resource.save();

    // Delete selected images
    if (deleteImageIds) {
      const ids = Array.isArray(deleteImageIds) ? deleteImageIds : String(deleteImageIds).split(',');
      const imgs = await ResourceImage.findAll({ where: { id: ids, resource_id: resource.id } });
      for (const img of imgs) {
        const isLegacy = typeof img.url === 'string' && img.url.includes('/uploads/products');
        const legacyDir = path.join(__dirname, '..', 'uploads', 'products');
        const baseDir = isLegacy ? legacyDir : resourceDir;
        const filePath = path.join(baseDir, path.basename(img.url));
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
        await img.destroy();
      }
    }

    // Replace features if provided (enforce enum & deduplicate by name)
    if (features !== undefined) {
      let parsed = [];
      try { parsed = typeof features === 'string' ? JSON.parse(features) : features; } catch (_) { parsed = []; }
      if (Array.isArray(parsed)) {
        const map = new Map();
        for (const f of parsed) {
          const nm = String(f?.name || '').toLowerCase();
          const val = f?.value;
          if (ALLOWED_FEATURE_NAMES.includes(nm) && val != null && String(val).length > 0) {
            map.set(nm, String(val).slice(0,255));
          }
        }
        const names = [...map.keys()];
        if (names.length) await ResourceFeature.destroy({ where: { resource_id: resource.id, name: names } });
        const toCreate = names.map((nm) => ({ resource_id: resource.id, name: nm, value: map.get(nm) }));
        if (toCreate.length) await ResourceFeature.bulkCreate(toCreate, { ignoreDuplicates: true });
      }
    }

    // Add new uploaded files
    if (Array.isArray(req.files) && req.files.length) {
      const imgs = req.files.map((f) => ({ resource_id: resource.id, url: path.posix.join(resourceUploadsPath, f.filename), alt: null }));
      await ResourceImage.bulkCreate(imgs);
    }

    // Coordinates: update if provided
    const { latParsed, lngParsed, error: coordError, anyProvided } = parseCoordinatesPayload({ latInput, lngInput, combinedCoords }, true);
    if (coordError) {
      return res.status(400).json({ error: coordError });
    }
    if (anyProvided && latParsed != null && lngParsed != null) {
      const existing = await ResourceCoordinate.findOne({ where: { resource_id: resource.id } });
      if (existing) {
        existing.latitude = latParsed;
        existing.longitude = lngParsed;
        await existing.save();
      } else {
        await ResourceCoordinate.create({ resource_id: resource.id, latitude: latParsed, longitude: lngParsed });
      }
    }

    const withImages = await Resource.findByPk(resource.id, {
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'name', 'email'] },
        { model: ResourceImage, as: 'images', attributes: ['id', 'url', 'alt'] },
        { model: ResourceFeature, as: 'features', attributes: ['id', 'name', 'value'] },
        { model: ResourceCoordinate, as: 'coordinates', attributes: ['latitude', 'longitude'] },
        { model: ResourceItem, as: 'items', attributes: ['id', 'name', 'quantity', 'price'] },
      ],
    });
    // Update index document (best-effort)
    upsertResourceDoc(withImages).catch(() => {});
    return res.json(withImages);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update resource' });
  }
}

// Delete a product by id
async function deleteResource(req, res) {
  try {
    const { id } = req.params;
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    // Ownership check similar to update
    if (req.user && req.user.id && resource.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this resource' });
    }

    // delete images from disk
    const images = await ResourceImage.findAll({ where: { resource_id: resource.id } });
    for (const img of images) {
      const isLegacy = typeof img.url === 'string' && img.url.includes('/uploads/products');
      const legacyDir = path.join(__dirname, '..', 'uploads', 'products');
      const baseDir = isLegacy ? legacyDir : resourceDir;
      const filePath = path.join(baseDir, path.basename(img.url));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
      await img.destroy();
    }

  await resource.destroy();
  // Remove from search index (best-effort)
  deleteResourceDoc(id).catch(() => {});
  return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete resource' });
  }
}

// Items: list for a resource
async function listResourceItems(req, res) {
  try {
    const { id } = req.params; // resource id
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    const items = await ResourceItem.findAll({ where: { resource_id: resource.id }, order: [['createdAt', 'DESC']] });
    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch resource items' });
  }
}

// Items: create under a resource
async function createResourceItem(req, res) {
  try {
    const { id } = req.params; // resource id
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    // ownership check: only owner or admin/vendor can add
    if (req.user && req.user.id && resource.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to add items to this resource' });
    }

    const { name, quantity, price } = req.body;
    if (!name || quantity == null || price == null) {
      return res.status(400).json({ error: 'Missing required fields: name, quantity, price' });
    }
    const qty = parseInt(quantity, 10);
    const pr = parseFloat(price);
    if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'Invalid quantity' });
    if (isNaN(pr) || pr < 0) return res.status(400).json({ error: 'Invalid price' });

  const item = await ResourceItem.create({ resource_id: resource.id, name, quantity: qty, price: pr });
  // Keep index fresh when nested content changes
  upsertResourceDoc(resource.id).catch(() => {});
  return res.status(201).json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create resource item' });
  }
}

// Items: update one
async function updateResourceItem(req, res) {
  try {
    const { id, itemId } = req.params; // resource id and item id
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    if (req.user && req.user.id && resource.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to update items on this resource' });
    }

    const item = await ResourceItem.findOne({ where: { id: itemId, resource_id: resource.id } });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { name, quantity, price } = req.body;
    if (name !== undefined) item.name = name;
    if (quantity !== undefined) {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'Invalid quantity' });
      item.quantity = qty;
    }
    if (price !== undefined) {
      const pr = parseFloat(price);
      if (isNaN(pr) || pr < 0) return res.status(400).json({ error: 'Invalid price' });
      item.price = pr;
    }
  await item.save();
  upsertResourceDoc(resource.id).catch(() => {});
  return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update resource item' });
  }
}

// Items: delete one (optional)
async function deleteResourceItem(req, res) {
  try {
    const { id, itemId } = req.params;
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    if (req.user && req.user.id && resource.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete items on this resource' });
    }
    const item = await ResourceItem.findOne({ where: { id: itemId, resource_id: resource.id } });
    if (!item) return res.status(404).json({ error: 'Item not found' });
  await item.destroy();
  upsertResourceDoc(resource.id).catch(() => {});
  return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete resource item' });
  }
}

// Comments: list for a resource
async function listResourceComments(req, res) {
  try {
    const { id } = req.params;
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    const comments = await ResourceCommentary.findAll({
      where: { resource_id: id },
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'author', attributes: ['id', 'first_name', 'name'] }],
    });
    return res.json(comments);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }
}

// Comments: create under a resource (logged users)
async function createResourceComment(req, res) {
  try {
    const { id } = req.params;
    const { message } = req.body || {};
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const msg = (message || '').toString().trim();
    if (!msg || msg.length < 1) return res.status(400).json({ error: 'Message is required' });
    if (msg.length > 500) return res.status(400).json({ error: 'Message too long (max 500)' });
    const created = await ResourceCommentary.create({ resource_id: resource.id, user_id: userId, message: msg });
    const withAuthor = await ResourceCommentary.findByPk(created.id, {
      include: [{ model: User, as: 'author', attributes: ['id', 'first_name', 'name'] }]
    });
  // Updating comments may change search relevance in some scenarios; reindex to stay consistent
  upsertResourceDoc(resource.id).catch(() => {});
  return res.status(201).json(withAuthor);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
}

// Comments: delete one (by author, resource owner, or admin)
async function deleteResourceComment(req, res) {
  try {
    const { id, commentId } = req.params;
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    const comment = await ResourceCommentary.findOne({ where: { id: commentId, resource_id: id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const isOwner = user.id === comment.user_id;
    const isResourceOwner = user.id === resource.user_id;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isResourceOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }
  await comment.destroy();
  upsertResourceDoc(resource.id).catch(() => {});
  return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
}

// Comments: update one (by author only)
async function updateResourceComment(req, res) {
  try {
    const { id, commentId } = req.params;
    const { message } = req.body || {};
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    const comment = await ResourceCommentary.findOne({ where: { id: commentId, resource_id: id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const isOwner = user.id === comment.user_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Not authorized to edit this comment' });
    }
    const msg = (message || '').toString().trim();
    if (!msg || msg.length < 1) return res.status(400).json({ error: 'Message is required' });
    if (msg.length > 500) return res.status(400).json({ error: 'Message too long (max 500)' });
    comment.message = msg;
    await comment.save();
    const withAuthor = await ResourceCommentary.findByPk(comment.id, {
      include: [{ model: User, as: 'author', attributes: ['id', 'first_name', 'name'] }]
    });
    upsertResourceDoc(resource.id).catch(() => {});
    return res.json(withAuthor);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update comment' });
  }
}

module.exports = {
  getResources,
  getResourcesFiltered,
  getResourceById,
  getResourceSuggestions,
  createResource,
  updateResource,
  deleteResource,
  listResourceItems,
  createResourceItem,
  updateResourceItem,
  deleteResourceItem,
  listResourceComments,
  createResourceComment,
  deleteResourceComment,
  updateResourceComment,
};

// Helpers
function parseCoordinatesPayload({ latInput, lngInput, combinedCoords }, isUpdate = false) {
  const anyProvided =
    (latInput != null && String(latInput).trim().length > 0) ||
    (lngInput != null && String(lngInput).trim().length > 0) ||
    (combinedCoords != null && String(combinedCoords).trim().length > 0);

  if (!anyProvided) return { latParsed: null, lngParsed: null, error: null, anyProvided: false };

  let latParsed = null;
  let lngParsed = null;

  // If combined provided and individual missing, try to split "lat lon"
  if ((!latInput || !lngInput) && combinedCoords) {
    const both = String(combinedCoords).trim();
    // split by space(s) or comma
    const parts = both
      .replace(/,/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      latParsed = parseSingleCoord(parts[0], 'lat');
      lngParsed = parseSingleCoord(parts[1], 'lng');
    }
  }

  if (latParsed == null && latInput != null && String(latInput).trim().length > 0) {
    latParsed = parseSingleCoord(String(latInput), 'lat');
  }
  if (lngParsed == null && lngInput != null && String(lngInput).trim().length > 0) {
    lngParsed = parseSingleCoord(String(lngInput), 'lng');
  }

  // If one provided but not the other on create, it's invalid. On update we only change when both valid.
  if (!isUpdate) {
    if ((latInput != null || combinedCoords) && (lngInput == null && !combinedCoords)) {
      return { latParsed: null, lngParsed: null, error: 'Longitude is required when latitude is provided', anyProvided };
    }
    if ((lngInput != null || combinedCoords) && (latInput == null && !combinedCoords)) {
      return { latParsed: null, lngParsed: null, error: 'Latitude is required when longitude is provided', anyProvided };
    }
  }

  // Validate parsed ranges if present
  if (latParsed != null && (isNaN(latParsed) || Math.abs(latParsed) > 90)) {
    return { latParsed: null, lngParsed: null, error: 'Invalid latitude value', anyProvided };
  }
  if (lngParsed != null && (isNaN(lngParsed) || Math.abs(lngParsed) > 180)) {
    return { latParsed: null, lngParsed: null, error: 'Invalid longitude value', anyProvided };
  }

  return { latParsed, lngParsed, error: null, anyProvided };
}

function parseSingleCoord(str, kind) {
  if (!str) return null;
  let s = String(str).trim();
  s = s.replace(/,/g, '.');

  // First try DMS format: optional dir, deg, optional min, optional sec, optional dir
  // Examples: 44°25'36.6"N, N 44 25 36.6, 44°25' N, 44 25
  const dmsRe = /^\s*([NnSsEeWw])?\s*([+-]?\d{1,3})\s*(?:[°\s]\s*(\d{1,2})\s*(?:['’′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["”″])?)?)?\s*([NnSsEeWw])?\s*$/;
  let m = s.match(dmsRe);
  if (m) {
    const dir = (m[5] || m[1] || '').toUpperCase();
    const deg = parseFloat(m[2]);
    const min = m[3] != null ? parseFloat(m[3]) : 0;
    const sec = m[4] != null ? parseFloat(m[4]) : 0;
    if (isNaN(deg) || isNaN(min) || isNaN(sec)) return null;
    if (min >= 60 || sec >= 60) return null;
    let num = Math.abs(deg) + (min / 60) + (sec / 3600);
    // apply sign from deg or dir
    if (deg < 0) num = -num;
    if (dir === 'S' || dir === 'W') num = -Math.abs(num);
    if (dir === 'N' || dir === 'E') num = Math.abs(num);
    if (kind === 'lat' && Math.abs(num) > 90) return null;
    if (kind !== 'lat' && Math.abs(num) > 180) return null;
    return num;
  }

  // Then try decimal with optional direction before/after and optional degree symbol
  const decRe = /^\s*([NnSsEeWw])?\s*([+-]?\d+(?:\.\d+)?)\s*(?:°)?\s*([NnSsEeWw])?\s*$/;
  m = s.match(decRe);
  let dir = null;
  let num = null;
  if (m) {
    dir = (m[3] || m[1] || '').toUpperCase();
    num = parseFloat(m[2]);
  } else {
    // Try plain float
    num = parseFloat(s);
  }
  if (num == null || isNaN(num)) return null;
  if (dir === 'S' || dir === 'W') num = -Math.abs(num);
  if (dir === 'N' || dir === 'E') num = Math.abs(num);

  if (kind === 'lat' && Math.abs(num) > 90) return null;
  if (kind !== 'lat' && Math.abs(num) > 180) return null;
  return num;
}

// Suggestions endpoint handler
async function getResourceSuggestions(req, res) {
  try {
    const { q } = req.query;
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit, 10) || 5));
    const term = (q || '').toString().trim();
    if (!term) return res.json({ items: [] });

    // Prefer OpenSearch suggestions
    const os = await suggestResourcesOS({ q: term, limit });
    if (os && Array.isArray(os.items)) {
      return res.json({ items: os.items });
    }

    // Fallback to DB LIKE
    const rows = await Resource.findAll({
      where: { name: { [Op.like]: `%${term}%` } },
      attributes: ['id', 'name', 'price'],
      include: [{ model: ResourceImage, as: 'images', attributes: ['id', 'url'], separate: false }],
      order: [['createdAt', 'DESC']],
      limit,
    });
    const items = rows.map(r => ({
      id: r.id,
      name: r.name,
      price: r.price,
      image: (Array.isArray(r.images) && r.images.length) ? r.images[0].url : null,
    }));
    return res.json({ items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
}
