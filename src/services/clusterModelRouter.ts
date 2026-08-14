import 'dotenv/config';
import OpenAI from 'openai';
import { ModelClusterType } from '../types/models.js';

let openaiClientInstance: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClientInstance) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      console.warn('[ClusterModelRouter] ⚠️ NVIDIA_API_KEY is not defined in process.env!');
    }
    openaiClientInstance = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }
  return openaiClientInstance;
}

/**
 * 27-Model Resilient Functional Pools
 */
export const MODEL_CLUSTERS = {
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
};

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
  clusterPool: string[] | ModelClusterType,
  systemPrompt: string,
  userPrompt: string,
  options: ClusterQueryOptions = {}
): Promise<{ text: string; modelUsed: string; poolAttempts: number; durationMs: number }> {
  const models = Array.isArray(clusterPool) ? clusterPool : MODEL_CLUSTERS[clusterPool] || MODEL_CLUSTERS.DEEP_STRATEGY;
  const client = getOpenAIClient();
  const startTime = Date.now();

  let lastError: Error | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const attemptStart = Date.now();

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: options.temperature !== undefined ? options.temperature : 0.6,
        max_tokens: options.max_tokens || 2048,
        top_p: options.top_p !== undefined ? options.top_p : 0.9,
        response_format: options.response_format
      });

      const text = response.choices[0]?.message?.content || '';
      const durationMs = Date.now() - startTime;
      const attemptDuration = Date.now() - attemptStart;

      console.log(`[ClusterRouter] ✅ Model [${i + 1}/${models.length}] "${model}" succeeded in ${attemptDuration}ms`);
      return {
        text,
        modelUsed: model,
        poolAttempts: i + 1,
        durationMs
      };
    } catch (err: any) {
      lastError = err;
      const attemptDuration = Date.now() - attemptStart;
      console.warn(`[ClusterRouter] ⚠️ Model [${i + 1}/${models.length}] "${model}" failed in ${attemptDuration}ms: ${err.message}. Cascading to next model...`);
    }
  }

  throw new Error(`[ClusterRouter Failure] All ${models.length} models in cluster pool failed. Last Error: ${lastError?.message}`);
}
