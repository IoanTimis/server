#!/usr/bin/env node
/*
  OpenSearch sync script
  - Updates existing documents and adds missing ones from DB -> OpenSearch.
  - Does NOT delete stale docs by default.

  Usage:
    node scripts/opensearch-sync.js [--delete-stale]
*/

const path = require('path');
const chalk = require('chalk');

// Load env similar to server
try {
  const dotenv = require('dotenv');
  const envPath = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
  dotenv.config({ path: path.join(__dirname, '..', envPath) });
} catch (_) {}

// Initialize DB connection and models
const sequelize = require('../config/Database');
require('../models/user');
require('../models/resource');
require('../models/resource_image');
require('../models/resource_feature');
require('../models/resource_coordinate');
require('../models/resource_item');

const { reindexAllResources } = require('../utils/opensearch');
const { getOpenSearchClient, getResourcesIndexName } = require('../config/OpenSearch');

(async () => {
  const startedAt = Date.now();
  console.log(chalk.cyan('[OS Sync] Starting sync from DB to OpenSearch...'));

  try {
    // Ensure DB connection is alive
    await sequelize.authenticate();
  } catch (e) {
    console.error(chalk.red('[OS Sync] Database connection failed:'), e.message);
    process.exit(1);
  }

  try {
    // Drop the index to guarantee a clean, authoritative reindex from DB
    const client = getOpenSearchClient();
    if (!client) {
      console.error(chalk.red('[OS Sync] OpenSearch client not configured. Check OPENSEARCH_URL.'));
      process.exit(2);
    }
    const index = getResourcesIndexName();
    try {
      await client.indices.delete({ index });
      console.log(chalk.yellow(`[OS Sync] Deleted index '${index}' (if existed).`));
    } catch (e) {
      const status = e?.meta?.statusCode;
      if (status === 404) {
        console.log(chalk.gray(`[OS Sync] Index '${index}' did not exist. Proceeding...`));
      } else {
        console.warn(chalk.red(`[OS Sync] Failed to delete index '${index}':`), e.message);
      }
    }

    const res = await reindexAllResources();
    if (!res || res.success === false) {
      console.error(chalk.red('[OS Sync] Reindex failed:'), res?.message || 'unknown');
      process.exit(2);
    }
    const took = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(chalk.green(`[OS Sync] Done. Indexed ${res.count || 0} resources in ${took}s.`));
    process.exit(0);
  } catch (e) {
    console.error(chalk.red('[OS Sync] Error during sync:'), e.message);
    process.exit(3);
  }
})();
