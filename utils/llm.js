const axios = require('axios');

// Calls a local LLM server (e.g., Ollama) with a simple generate API
// Env:
//  - OLLAMA_BASE_URL (default http://localhost:11434)
//  - OLLAMA_MODEL (e.g., 'qwen2.5-coder:7b' or 'codellama:7b')
async function callLLM(prompt) {
  if (String(process.env.OLLAMA_MOCK || '0') === '1') {
    // Return a minimal, useful mock result as JSON text that the controller can parse
    return JSON.stringify({
      findings: [
        {
          id: 'mock-1',
          file: 'example.js',
          lineStart: 1,
          lineEnd: 1,
          severity: 'info',
          title: 'Mock review active',
          description: 'Local LLM is mocked. Start Ollama to get real analysis.',
          guideline: 'Setup/Infrastructure',
          recommendation: 'Install and start Ollama, then set OLLAMA_MOCK=0.',
          effortHours: 0.1
        }
      ]
    });
  }
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
