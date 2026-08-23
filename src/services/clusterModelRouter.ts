import 'dotenv/config';
import { OpenAI } from 'openai';
import { ModelClusterType } from '../types/models.js';

let nvidiaClientInstance: OpenAI | null = null;

/**
 * Initialize or return singleton AI Mesh Client (OpenAI-compatible)
 */
export function getNvidiaClient(): OpenAI {
  if (!nvidiaClientInstance) {
    const apiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY;
    if (!apiKey) {
      throw new Error('[ClusterModelRouter] ❌ CRITICAL: AI API Key is not configured in process.env / environment variables!');
    }
    nvidiaClientInstance = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
      timeout: 15000,
      maxRetries: 0
    });
  }
  return nvidiaClientInstance;
}

// Backward-compatible alias
export const getOpenAIClient = getNvidiaClient;

/**
 * Verify live connection to AI Mesh Cloud
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
    console.warn(`[Neural Mesh Probe]: ${err.message}`);
    return false;
  }
}

/**
 * Functional Model Pools (Optimized Priority Order from Live 27-Model Benchmark)
 */
export const MODEL_CLUSTERS = {
  FRONT_DISPATCHER: [
    'meta/llama-3.1-8b-instruct',               // ⚡ #1 Sub-second Speed & Intent (100% Success)
    'nvidia/nemotron-mini-4b-instruct',         // ⚡ #2 Ultra-Fast Fallback (100% Success)
    'minimaxai/minimax-m3',                     // 💎 #3 Luxury Aesthetic Quality
    'openai/gpt-oss-20b'
  ],
  SCOPE_GUARD: [
    'meta/llama-3.1-8b-instruct',               // ⚡ #1 Fast Guard (100% Success)
    'nvidia/llama-3.1-nemoguard-8b-content-safety',  // 🛡️ #2 Policy Guard
    'nvidia/nemotron-mini-4b-instruct',
    'nvidia/llama-3.1-nemotron-safety-guard-8b-v3'
  ],
  NEWS_SYNTHESIS: [
    'meta/llama-3.1-8b-instruct',               // ⚡ #1 Ultra-Fast Context Synthesis (< 2s)
    'meta/llama-3.2-11b-vision-instruct',       // 💡 #2 High-Quality Vision-Instruct
    'nvidia/nemotron-mini-4b-instruct',         // 💡 #3 Fast Fallback
    'nvidia/nemotron-3-nano-30b-a3b'
  ],
  CREATIVE_COPY: [
    'meta/llama-3.1-8b-instruct',               // ⚡ #1 Ultra-Fast Copy (< 2s)
    'nvidia/nemotron-mini-4b-instruct',         // 🎨 #2 High-Speed Copy (100% Success)
    'poolside/laguna-xs-2.1',                   // 🎨 #3 Creative Tone
    'z-ai/glm-5.2'
  ],
  DEEP_STRATEGY: [
    'meta/llama-3.1-8b-instruct',               // ⚡ #1 Ultra-Fast & 100% Success (1.8s)
    'nvidia/nemotron-mini-4b-instruct',         // 🧠 #2 High Stability Reasoning
    'openai/gpt-oss-120b',                      // 👑 #3 Deep 6-Angle Campaign Reasoning
    'nvidia/nemotron-3-nano-30b-a3b'
  ],
  TRANSLATION_CALIBRATION: [
    'meta/llama-3.1-8b-instruct',               // 🌐 #1 Fast Specs & Translation
    'nvidia/riva-translate-4b-instruct-v1.1',   // 🌐 #2 Sub-Second Translation
    'nvidia/ising-calibration-1.5-31b',         // 📐 #3 Fast Calibration & Specs
    'nvidia/riva-translate-4b-instruct-v2'
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

      // Execute completion with 15s default timeout support
      const requestOptions = { timeout: options.timeout ?? 15000 };
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
