import 'dotenv/config';
import { OpenAI } from 'openai';
import { ModelClusterType } from '../types/models.js';

let nvidiaClientInstance: OpenAI | null = null;

/**
 * Initialize or return singleton NVIDIA NIM API Client (OpenAI-compatible)
 */
export function getNvidiaClient(): OpenAI {
  if (!nvidiaClientInstance) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error('[ClusterModelRouter] ❌ CRITICAL: NVIDIA_API_KEY is not configured in process.env / environment variables!');
    }
    nvidiaClientInstance = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }
  return nvidiaClientInstance;
}

// Backward-compatible alias
export const getOpenAIClient = getNvidiaClient;

/**
 * Verify live connection to NVIDIA NIM Cloud
 */
export async function verifyNvidiaConnection(): Promise<boolean> {
  try {
    const client = getNvidiaClient();
    const res = await client.chat.completions.create({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    });
    return !!res.choices?.[0]?.message?.content;
  } catch (err: any) {
    console.warn(`[Nvidia Connection Probe]: ${err.message}`);
    return false;
  }
}

/**
 * Functional Model Pools (Optimized Priority Order from Live 27-Model Benchmark)
 */
export const MODEL_CLUSTERS = {
  FRONT_DISPATCHER: [
    'meta/llama-3.1-8b-instruct',               // ⚡ #1 Speed & Intent (2.4s, 100% Success)
    'nvidia/nemotron-mini-4b-instruct',         // ⚡ #2 Ultra-Fast Fallback (2.9s, 100% Success)
    'minimaxai/minimax-m3',                     // 💎 #3 Luxury Aesthetic Quality (75/100)
    'openai/gpt-oss-20b'
  ],
  SCOPE_GUARD: [
    'nvidia/llama-3.1-nemoguard-8b-content-safety',  // 🛡️ #1 Sub-second Guard (722ms, 100% Success)
    'nvidia/llama-3.1-nemotron-safety-guard-8b-v3',  // 🛡️ #2 Fast Policy Guard (1035ms, 100% Success)
    'nvidia/nemotron-3.5-content-safety',            // 🛡️ #3 Content Safety (1586ms, 100% Success)
    'meta/llama-3.1-8b-instruct',
    'minimaxai/minimax-m3',
    'nvidia/llama-3.1-nemoguard-8b-topic-control'
  ],
  NEWS_SYNTHESIS: [
    'nvidia/nemotron-3-nano-30b-a3b',           // 💡 #1 Stable Context (100% Success, 56.2/100)
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', // 💡 #2 Fast Synthesis (4.3s)
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',  // 💡 #3 Multi-Modal Context (100% Success)
    'meta/llama-3.2-11b-vision-instruct',       // 💡 #4 100% Success Vision-Instruct
    'openai/gpt-oss-20b'
  ],
  CREATIVE_COPY: [
    'poolside/laguna-xs-2.1',                   // 🎨 #1 Ultra-Fast Copy (2.4s)
    'nvidia/nemotron-mini-4b-instruct',         // 🎨 #2 High-Speed Copy (2.9s, 100% Success)
    'meta/muse-glimmer-30b',                    // 🎨 #3 Creative Tone (58.3/100)
    'z-ai/glm-5.2',                             // 🎨 #4 High Quality Copy (75/100)
    'mistralai/mistral-nemotron',
    'nvidia/llama-3.3-nemotron-super-49b-v1'
  ],
  DEEP_STRATEGY: [
    'nvidia/nemotron-3.5-lightning-30b-a3b',     // 🧠 #1 Benchmark Winner (4.6s, 100% Success, 62.5/100)
    'meta/llama-3.1-8b-instruct',               // ⚡ #2 Fast Fallback (2.4s, 100% Success)
    'nvidia/nemotron-3-nano-30b-a3b',           // 🧠 #3 High Stability Reasoning (100% Success)
    'openai/gpt-oss-120b',                      // 👑 #4 Heavy 6-Angle Campaign Reasoning
    'stepfun-ai/step-3.7-flash',
    'nvidia/nemotron-3-ultra-550b-a55b'
  ],
  TRANSLATION_CALIBRATION: [
    'nvidia/riva-translate-4b-instruct-v1.1',   // 🌐 #1 Sub-Second Translation (828ms, 100% Success)
    'nvidia/riva-translate-4b-instruct-v2',     // 🌐 #2 Fast Translation (931ms, 100% Success)
    'nvidia/ising-calibration-1.5-31b',         // 📐 #3 Fast Calibration & Specs (1.7s, 100% Success)
    'nvidia/nvidia-nemotron-nano-9b-v2'
  ]
} as const;

export interface ClusterQueryOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  response_format?: any;
  timeout?: number;
}

/**
 * Execute resilient cascading inference across specialized model pools
 */
export async function executeClusterQuery(
  clusterPool: readonly string[] | string[] | ModelClusterType | keyof typeof MODEL_CLUSTERS,
  systemPrompt: string,
  userPrompt: string,
  options: ClusterQueryOptions = {}
): Promise<{ text: string; modelUsed: string; poolAttempts: number; durationMs: number }> {
  let models: readonly string[];

  if (Array.isArray(clusterPool)) {
    models = clusterPool;
  } else if (typeof clusterPool === 'string' && clusterPool in MODEL_CLUSTERS) {
    models = MODEL_CLUSTERS[clusterPool as keyof typeof MODEL_CLUSTERS];
  } else {
    throw new Error(`[ClusterRouter] ❌ Unknown model cluster pool specified: "${String(clusterPool)}". Valid pools: ${Object.keys(MODEL_CLUSTERS).join(', ')}`);
  }

  if (models.length === 0) {
    throw new Error(`[ClusterRouter] ❌ Cluster pool "${String(clusterPool)}" contains 0 models.`);
  }

  const client = getNvidiaClient();
  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const attemptStart = Date.now();

    try {
      const requestPayload: any = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: options.temperature ?? 0.6,
        max_tokens: options.max_tokens ?? 2048,
        top_p: options.top_p ?? 0.9,
      };

      // Only attach response_format if explicitly defined
      if (options.response_format) {
        requestPayload.response_format = options.response_format;
      }

      // Execute completion with 20s default timeout support
      const requestOptions = { timeout: options.timeout ?? 20000 };
      const response = await client.chat.completions.create(requestPayload, requestOptions);

      const text = response.choices[0]?.message?.content?.trim();

      // Guard against empty model responses
      if (!text) {
        throw new Error(`Model "${model}" returned an empty response string.`);
      }

      const durationMs = Date.now() - startTime;
      const attemptDuration = Date.now() - attemptStart;

      console.log(`[ClusterRouter] ✅ Model [${i + 1}/${models.length}] "${model}" succeeded in ${attemptDuration}ms`);
      return {
        text,
        modelUsed: model,
        poolAttempts: i + 1,
        durationMs
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(errorMessage);
      const attemptDuration = Date.now() - attemptStart;
      console.warn(`[ClusterRouter] ⚠️ Model [${i + 1}/${models.length}] "${model}" failed in ${attemptDuration}ms: ${errorMessage}. Cascading to next fallback...`);
    }
  }

  throw new Error(`[ClusterRouter Failure] All ${models.length} models in cluster pool failed. Last Error: ${lastError?.message}`);
}
