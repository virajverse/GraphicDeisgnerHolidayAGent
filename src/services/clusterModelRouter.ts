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
 * Functional Model Pools (Categorized by Cognitive Capability)
 */
export const MODEL_CLUSTERS = {
  FRONT_DISPATCHER: [
    'meta/llama-3.1-8b-instruct',
    'nvidia/nemotron-mini-4b-instruct',
    'openai/gpt-oss-20b',
    'minimaxai/minimax-m3'
  ],
  SCOPE_GUARD: [
    'nvidia/llama-3.1-nemoguard-8b-topic-control',
    'minimaxai/minimax-m3',
    'meta/llama-3.1-8b-instruct',
    'nvidia/nemotron-3.5-content-safety',
    'nvidia/llama-3.1-nemotron-safety-guard-8b-v3',
    'nvidia/llama-3.1-nemoguard-8b-content-safety'
  ],
  NEWS_SYNTHESIS: [
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'openai/gpt-oss-20b',
    'meta/llama-3.2-11b-vision-instruct',
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    'meta/llama-3.1-70b-instruct'
  ],
  CREATIVE_COPY: [
    'mistralai/mistral-nemotron',
    'poolside/laguna-xs-2.1',
    'nvidia/nemotron-mini-4b-instruct',
    'z-ai/glm-5.2',
    'nvidia/llama-3.3-nemotron-super-49b-v1',
    'meta/muse-glimmer-30b'
  ],
  DEEP_STRATEGY: [
    'openai/gpt-oss-120b',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'stepfun-ai/step-3.7-flash',
    'nvidia/nemotron-3-nano-30b-a3b',
    'thinkingmachines/inkling'
  ],
  TRANSLATION_CALIBRATION: [
    'nvidia/riva-translate-4b-instruct-v1.1',
    'nvidia/riva-translate-4b-instruct-v2',
    'nvidia/nvidia-nemotron-nano-9b-v2',
    'nvidia/ising-calibration-1.5-31b'
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

      // Execute completion with optional timeout support
      const requestOptions = options.timeout ? { timeout: options.timeout } : undefined;
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
