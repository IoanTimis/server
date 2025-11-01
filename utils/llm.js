const axios = require('axios');

// Calls a local LLM server (e.g., Ollama) with a simple generate API
// Env:
//  - OLLAMA_BASE_URL (default http://localhost:11434)
//  - OLLAMA_MODEL (e.g., 'qwen2.5-coder:7b' or 'codellama:7b')
async function callLLM(prompt) {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
  try {
    // Ollama generate endpoint
    const { data } = await axios.post(`${base}/api/generate`, {
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        top_p: 0.9,
        num_predict: 1024
      }
    }, { timeout: 60_000 });
    return data?.response || '';
  } catch (err) {
    console.error('LLM call failed', err?.response?.data || err?.message || err);
    return '';
  }
}

module.exports = { callLLM };
