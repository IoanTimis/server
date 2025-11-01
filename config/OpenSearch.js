const { Client } = require('@opensearch-project/opensearch');

let cachedClient = null;

function getOpenSearchClient() {
  try {
    const node = process.env.OPENSEARCH_URL || process.env.OPENSEARCH_NODE;
    if (!node) return null; // disabled if not configured

    if (cachedClient) return cachedClient;

    const username = process.env.OPENSEARCH_USERNAME || process.env.OPENSEARCH_USER;
    const password = process.env.OPENSEARCH_PASSWORD || process.env.OPENSEARCH_PASS;

    const sslReject = (process.env.OPENSEARCH_SSL_REJECT || 'true').toLowerCase() !== 'false';

    const config = {
      node,
    };

    if (username && password) {
      config.auth = { username, password };
    }
    // Allow self-signed clusters if requested
    config.ssl = { rejectUnauthorized: sslReject };

    cachedClient = new Client(config);
    return cachedClient;
  } catch (e) {
    // Never crash the app if OS client fails; just disable indexing
    console.error('[OpenSearch] Failed to init client:', e.message);
    return null;
  }
}

function getResourcesIndexName() {
  return process.env.OPENSEARCH_RESOURCES_INDEX || 'resources';
}

module.exports = { getOpenSearchClient, getResourcesIndexName };
