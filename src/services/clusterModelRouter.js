import 'dotenv/config';
import OpenAI from 'openai';

function getOpenAIClient() {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  return new OpenAI({
    apiKey: nvidiaKey || 'dummy_key',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    timeout: 10000
  });
}

/**
 * 27-Model Resilient Cluster Registry
 * Structured into 5 Specialized Functional Pools with automatic cascading failover.
 */
export const MODEL_CLUSTERS = {
  // CLUSTER 1: Scope & Topic Guardrails (< 500ms)
  SCOPE_GUARD: [
    'nvidia/llama-3.1-nemoguard-8b-topic-control',
    'minimaxai/minimax-m3',
    'meta/llama-3.1-8b-instruct',
    'nvidia/nemotron-3.5-content-safety',
    'nvidia/llama-3.1-nemotron-safety-guard-8b-v3',
    'nvidia/llama-3.1-nemoguard-8b-content-safety'
  ],

  // CLUSTER 2: Real-World News & Trend Synthesizer (700ms - 1.2s)
  NEWS_SYNTHESIS: [
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'openai/gpt-oss-20b',
    'meta/llama-3.2-11b-vision-instruct',
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    'meta/llama-3.1-70b-instruct'
  ],

  // CLUSTER 3: Creative Copywriting & Headlines (500ms - 1.5s)
  CREATIVE_COPY: [
    'mistralai/mistral-nemotron',
    'poolside/laguna-xs-2.1',
    'nvidia/nemotron-mini-4b-instruct',
    'z-ai/glm-5.2',
    'nvidia/llama-3.3-nemotron-super-49b-v1',
    'meta/muse-glimmer-30b'
  ],

  // CLUSTER 4: Deep Strategy & 6 Category Briefing Engine (1.5s - 3.5s)
  DEEP_STRATEGY: [
    'openai/gpt-oss-120b',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'stepfun-ai/step-3.7-flash',
    'nvidia/nemotron-3-nano-30b-a3b',
    'thinkingmachines/inkling'
  ],

  // CLUSTER 5: Regional Translation & Technical Calibration
  TRANSLATION_CALIBRATION: [
    'nvidia/riva-translate-4b-instruct-v1.1',
    'nvidia/riva-translate-4b-instruct-v2',
    'nvidia/nvidia-nemotron-nano-9b-v2',
    'nvidia/ising-calibration-1.5-31b'
  ]
};

/**
 * Executes an AI task against a cluster with automatic instant failover.
 * @param {Array<string>} cluster - Ordered list of model IDs in the cluster
 * @param {string} prompt - Prompt to execute
 * @param {Object} options - Completion parameters
 */
export async function executeClusterQuery(cluster, prompt, options = {}) {
  const {
    temperature = 0.7,
    max_tokens = 1000,
    top_p = 1,
    jsonMode = false
  } = options;

  let lastError = null;

  const client = getOpenAIClient();

  for (const modelId of cluster) {
    const startTime = Date.now();
    try {
      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        top_p,
        max_tokens,
        stream: false
      });

      const choice = completion.choices[0].message;
      const content = choice.content ? choice.content.trim() : '';
      const reasoning = choice.reasoning_content || null;
      const latencyMs = Date.now() - startTime;

      if (jsonMode) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              success: true,
              data: parsed,
              rawText: content,
              reasoning,
              modelUsed: modelId,
              latencyMs
            };
          } catch (jsonErr) {
            // Json parse failed, continue to next model
          }
        }
      } else if (content) {
        return {
          success: true,
          data: content,
          rawText: content,
          reasoning,
          modelUsed: modelId,
          latencyMs
        };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[ClusterRouter] Model "${modelId}" failed (${err.message}). Cascading to next fallback...`);
    }
  }

  throw new Error(`All models in cluster failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
}
