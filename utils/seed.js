/*
 Seed initial data without deleting existing rows.
 - Creates 4 users (admin, vendor, 2 clients) if missing
 - Creates 50 demo resources (if missing by name) owned by the vendor
 - Adds 3 features per resource (surface, level, new) if missing

 Safe to re-run multiple times. Uses findOrCreate and skips updates.
*/

const path = require('path');

// Load environment (mirror server.js behavior)
const dotenv = require('dotenv');
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
}

const sequelize = require('../config/Database');

// Load models and associations
const User = require('../models/user');
const Resource = require('../models/resource');
const ResourceFeature = require('../models/resource_feature');

async function main() {
  const t0 = Date.now();
  console.log('\n[seed] Starting seed...');

  try {
    await sequelize.authenticate();
    console.log('[seed] DB connection OK');
  } catch (e) {
    console.error('[seed] DB connection failed:', e.message);
    process.exit(1);
  }

  // 1) Ensure core users
  const HASH = '$2a$10$5CGgCv.sxWjtvdKCIWtKI.Ek4ry8T608hGIVYwD95/QH3pKdnUaga';
  const usersData = [
    { first_name: 'admin', name: 'admin', email: 'admin@gmail.com', password: HASH, role: 'admin' },
    { first_name: 'Ioan', name: 'Timis', email: 'timisionut2000@gmail.com', password: HASH, role: 'vendor' },
    { first_name: 'User2', name: 'User2', email: 'user2@example.com', password: HASH, role: 'client' },
    { first_name: 'User3', name: 'User3', email: 'user3@example.com', password: HASH, role: 'client' },
  ];

  const usersByEmail = {};
  for (const u of usersData) {
    const [user] = await User.findOrCreate({
      where: { email: u.email },
      defaults: { ...u, createdAt: new Date(), updatedAt: new Date() },
    });
    usersByEmail[u.email] = user;
  }
  console.log('[seed] Users ensured:', Object.keys(usersByEmail));

  const vendor = usersByEmail['timisionut2000@gmail.com'] || usersByEmail['admin@gmail.com'];
  if (!vendor) {
    throw new Error('No vendor/admin user available for resource ownership.');
  }

  // 2) Ensure 50 demo resources (unique by name)
  const makeResourceRow = (i) => {
    const nr = String(i).padStart(3, '0');
    const name = `Produs ${nr}`;
    const description = `Descriere scurtă pentru produsul ${nr}. Item demo pentru listări și testare UI.`;
    // Deterministic price pattern for variety
    const base = (i % 5) * 27.5 + 5 + (i % 3) * 3.2;
    const price = Number(base.toFixed(2));
    return { name, description, price };
  };

  const createdResourceNames = [];
  const resourcesByName = {};
  for (let i = 1; i <= 50; i++) {
    const row = makeResourceRow(i);
    const [res, created] = await Resource.findOrCreate({
      where: { name: row.name },
      defaults: {
        name: row.name,
        description: row.description,
        price: row.price,
        user_id: vendor.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    resourcesByName[row.name] = res;
    if (created) createdResourceNames.push(row.name);
  }
  console.log(`[seed] Resources ensured: ${Object.keys(resourcesByName).length} (new: ${createdResourceNames.length})`);

  // 3) Ensure features (surface, level, new) for each resource
  const names = Object.keys(resourcesByName).sort();
  let createdFeatures = 0;

  for (let idx = 0; idx < names.length; idx++) {
    const name = names[idx];
    const r = resourcesByName[name];
    const i = idx + 1; // 1..N

    // surface: 30, 33, 36 ... cycling after 20 steps
    const surfaceMp = 30 + ((i - 1) % 20) * 3;
    const surfaceVal = `${surfaceMp} mp`;

    // level: Parter, Etaj 1..11 cycling every 12
    const cycle = (i - 1) % 12;
    const levelVal = cycle === 0 ? 'Parter' : `Etaj ${cycle}`;

    // new: alternate false/true starting with false
    const newVal = i % 2 === 1 ? 'false' : 'true';

    // By unique index (resource_id, name) we can safely findOrCreate; we skip updates.
    const toEnsure = [
      { name: 'surface', value: surfaceVal },
      { name: 'level', value: levelVal },
      { name: 'new', value: newVal },
    ];

    for (const f of toEnsure) {
      const [, created] = await ResourceFeature.findOrCreate({
        where: { resource_id: r.id, name: f.name },
        defaults: {
          resource_id: r.id,
          name: f.name,
          value: f.value,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      if (created) createdFeatures++;
    }
  }
  console.log(`[seed] Features ensured (created new): ${createdFeatures}`);

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`[seed] Done in ${dt}s`);
  await sequelize.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[seed] Failed:', err);
  try { await sequelize.close(); } catch (_) {}
  process.exit(1);
});
