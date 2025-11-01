const { getOpenSearchClient, getResourcesIndexName } = require('../config/OpenSearch');
const Resource = require('../models/resource');
const ResourceImage = require('../models/resource_image');
const ResourceFeature = require('../models/resource_feature');
const ResourceItem = require('../models/resource_item');
const ResourceCoordinate = require('../models/resource_coordinate');
const User = require('../models/user');

function resourceToDoc(r) {
  if (!r) return null;
  // Normalize plain object
  const res = r.toJSON ? r.toJSON() : r;
  const featuresObj = {};
  (res.features || []).forEach((f) => {
    const k = String(f.name || '').toLowerCase();
    if (!k) return;
    featuresObj[k] = f.value;
  });
  let location = undefined;
  if (res.coordinates && res.coordinates.latitude != null && res.coordinates.longitude != null) {
    const lat = parseFloat(res.coordinates.latitude);
    const lon = parseFloat(res.coordinates.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) location = { lat, lon };
  }
  const primaryImage = res.images && res.images.length ? res.images[0].url : null;

  return {
    id: res.id,
    name: res.name,
    description: res.description,
    price: typeof res.price === 'number' ? res.price : parseFloat(res.price),
    user_id: res.user_id,
    owner: res.owner ? { id: res.owner.id, name: res.owner.name, first_name: res.owner.first_name, email: res.owner.email } : null,
    features: featuresObj,
    location,
    primaryImage,
    imagesCount: Array.isArray(res.images) ? res.images.length : 0,
    itemsCount: Array.isArray(res.items) ? res.items.length : 0,
    createdAt: res.createdAt,
    updatedAt: res.updatedAt,
  };
}

async function ensureIndex(client, index) {
  try {
    const exists = await client.indices.exists({ index });
    if (exists.body === true || exists.body === 'true') return;
  } catch (_) {
    // continue to create
  }
  try {
    await client.indices.create({
      index,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            description: { type: 'text' },
            price: { type: 'float' },
            user_id: { type: 'long' },
            'owner.id': { type: 'long' },
            'owner.name': { type: 'text', fields: { keyword: { type: 'keyword' } } },
            features: { type: 'object', dynamic: true },
            location: { type: 'geo_point' },
            primaryImage: { type: 'keyword' },
            imagesCount: { type: 'integer' },
            itemsCount: { type: 'integer' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
      },
    });
  } catch (e) {
    // If already exists due to race, ignore
    if (e.meta && e.meta.body && e.meta.body.error && e.meta.body.error.type === 'resource_already_exists_exception') return;
    console.error('[OpenSearch] Failed to create index', index, e.message);
  }
}

async function upsertResourceDoc(resourceOrId) {
  const client = getOpenSearchClient();
  if (!client) return; // disabled
  const index = getResourcesIndexName();

  let res = resourceOrId;
  if (typeof resourceOrId === 'number' || typeof resourceOrId === 'string') {
    res = await Resource.findByPk(resourceOrId, {
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'name', 'email'] },
        { model: ResourceImage, as: 'images', attributes: ['id', 'url', 'alt'] },
        { model: ResourceFeature, as: 'features', attributes: ['id', 'name', 'value'] },
        { model: ResourceCoordinate, as: 'coordinates', attributes: ['latitude', 'longitude'] },
        { model: ResourceItem, as: 'items', attributes: ['id'] },
      ],
    });
  }
  if (!res) return;

  const doc = resourceToDoc(res);
  try {
    await ensureIndex(client, index);
    await client.index({
      index,
      id: String(doc.id),
      body: doc,
      refresh: 'true',
    });
  } catch (e) {
    console.error('[OpenSearch] Upsert failed for resource', doc.id, e.message);
  }
}

async function deleteResourceDoc(id) {
  const client = getOpenSearchClient();
  if (!client) return; // disabled
  const index = getResourcesIndexName();
  try {
    await client.delete({ index, id: String(id), refresh: 'true' });
  } catch (e) {
    // ignore 404s
    if (!(e.meta && e.meta.statusCode === 404)) {
      console.error('[OpenSearch] Delete failed for resource', id, e.message);
    }
  }
}

async function reindexAllResources() {
  const client = getOpenSearchClient();
  if (!client) return { success: false, message: 'OpenSearch disabled' };
  const index = getResourcesIndexName();
  try {
    await ensureIndex(client, index);
    const all = await Resource.findAll({
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'name', 'email'] },
        { model: ResourceImage, as: 'images', attributes: ['id', 'url', 'alt'] },
        { model: ResourceFeature, as: 'features', attributes: ['id', 'name', 'value'] },
        { model: ResourceCoordinate, as: 'coordinates', attributes: ['latitude', 'longitude'] },
        { model: ResourceItem, as: 'items', attributes: ['id'] },
      ],
      order: [['id', 'ASC']],
    });
    if (!all || !all.length) return { success: true, count: 0 };
    const ops = [];
    for (const r of all) {
      ops.push({ index: { _index: index, _id: String(r.id) } });
      ops.push(resourceToDoc(r));
    }
    const resp = await client.bulk({ body: ops, refresh: 'true' });
    if (resp.body && resp.body.errors) {
      const itemsErrored = (resp.body.items || []).filter(it => it.index && it.index.error);
      console.error('[OpenSearch] Bulk reindex had errors', itemsErrored.length);
    }
    return { success: true, count: all.length };
  } catch (e) {
    console.error('[OpenSearch] Reindex failed', e.message);
    return { success: false, message: e.message };
  }
}

async function searchResourcesOS({ q, minPrice, maxPrice, idsConstraint, sortBy = 'createdAt', order = 'DESC', limit = 10, offset = 0 }) {
  const client = getOpenSearchClient();
  if (!client) return null; // indicate OS disabled
  const index = getResourcesIndexName();

  const filters = [];
  if (minPrice != null || maxPrice != null) {
    const range = {};
    if (minPrice != null && minPrice !== "") range.gte = parseFloat(minPrice);
    if (maxPrice != null && maxPrice !== "") range.lte = parseFloat(maxPrice);
    if (Object.keys(range).length) filters.push({ range: { price: range } });
  }
  if (idsConstraint && Array.isArray(idsConstraint)) {
    if (idsConstraint.length === 0) return { ids: [], total: 0 };
    filters.push({ terms: { id: idsConstraint.map(String) } });
  }

  const qStr = q && String(q).trim();
  const must = qStr && qStr.length
    ? [{
        multi_match: {
          query: qStr,
          fields: ['name^3', 'description'],
          type: 'best_fields',
          fuzziness: 'AUTO',
          prefix_length: 1,
          max_expansions: 50,
          operator: 'and'
        }
      }]
    : [{ match_all: {} }];

  let sortField = sortBy;
  if (sortBy === 'name') sortField = 'name.keyword';
  const sortOrder = (String(order).toUpperCase() === 'ASC') ? 'asc' : 'desc';

  const body = {
    query: { bool: { must, filter: filters } },
    sort: [{ [sortField]: sortOrder }],
    from: Math.max(0, parseInt(offset, 10) || 0),
    size: Math.max(1, parseInt(limit, 10) || 10),
    track_total_hits: true,
    _source: ['id'],
  };

  try {
    await ensureIndex(client, index);
    const resp = await client.search({ index, body });
    const hits = resp.body?.hits?.hits || resp.hits?.hits || [];
    const total = (resp.body?.hits?.total?.value ?? resp.hits?.total?.value ?? 0);
    const ids = hits.map(h => (h._source?.id ?? h._id)).map(x => typeof x === 'string' ? parseInt(x, 10) || x : x);
    return { ids, total };
  } catch (e) {
    console.error('[OpenSearch] search failed', e.message);
    return null; // fail soft -> caller uses DB fallback
  }
}

// Lightweight suggestions: boost prefix on name and allow fuzzy match fallback
async function suggestResourcesOS({ q, limit = 5 }) {
  const client = getOpenSearchClient();
  if (!client) return null;
  const index = getResourcesIndexName();

  const qStr = (q || '').toString().trim();
  if (!qStr) return { items: [] };

  const body = {
    query: {
      bool: {
        should: [
          { match_phrase_prefix: { name: { query: qStr, slop: 2, boost: 3 } } },
          {
            multi_match: {
              query: qStr,
              fields: ['name^3', 'description'],
              type: 'best_fields',
              fuzziness: 'AUTO',
              prefix_length: 1,
              operator: 'or'
            }
          }
        ],
        minimum_should_match: 1
      }
    },
    size: Math.max(1, Math.min(20, parseInt(limit, 10) || 5)),
    _source: ['id', 'name', 'price', 'primaryImage']
  };

  try {
    await ensureIndex(client, index);
    const resp = await client.search({ index, body });
    const hits = resp.body?.hits?.hits || resp.hits?.hits || [];
    const items = hits.map(h => ({
      id: h._source?.id ?? h._id,
      name: h._source?.name,
      price: h._source?.price,
      image: h._source?.primaryImage || null,
    }));
    return { items };
  } catch (e) {
    console.error('[OpenSearch] suggest failed', e.message);
    return null;
  }
}

module.exports = { resourceToDoc, upsertResourceDoc, deleteResourceDoc, reindexAllResources, searchResourcesOS, suggestResourcesOS };
