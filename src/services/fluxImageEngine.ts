import dotenv from 'dotenv';

dotenv.config();

const RENDER_ENDPOINT_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';

export interface ImageGenResult {
  success: boolean;
  imageBuffer?: Buffer;
  base64?: string;
  seed?: number;
  durationMs: number;
  errorMessage?: string;
}

/**
 * 🎨 Generates an ultra-crisp, zero-text 3D visual design asset via Taliyo 3D Studio Engine
 * Features automatic 3-attempt retry with optical seed jitter and exponential backoff
 */
export async function generateDesignerPosterImage(
  subject: string,
  style: '3D_LUXURY' | 'TECH_CYBER' | 'MINIMAL_PODIUM' | 'BOTANICAL' = '3D_LUXURY',
  seed: number = Math.floor(Math.random() * 900000) + 100000
): Promise<ImageGenResult> {
  const tStart = Date.now();
  const apiKey = process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      durationMs: 0,
      errorMessage: '3D Studio API credentials not configured.'
    };
  }

  // Formula: [Subject + Physical Materials] + [Clean Negative Space] + [Studio Lighting] + [no text, 8k]
  const prompt = `${subject}, studio lighting, dark obsidian background, clean negative space for design, no text, 8k resolution`;

  const MAX_RETRIES = 3;
  let lastErrorMessage = 'Image generation temporary bottleneck';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const currentSeed = attempt === 1 ? seed : Math.floor(Math.random() * 900000) + 100000;

    try {
      const res = await fetch(RENDER_ENDPOINT_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          width: 1024,
          height: 1024,
          seed: currentSeed,
          steps: 4
        })
      });

      const durationMs = Date.now() - tStart;

      if (res.ok) {
        const data: any = await res.json();
        let b64 = '';

        if (data.artifacts && data.artifacts.length > 0) {
          b64 = data.artifacts[0].base64 || '';
          if (!b64 && data.artifacts[0].finishReason) {
            lastErrorMessage = `Render finished with reason: ${data.artifacts[0].finishReason}`;
            continue;
          }
        } else if (data.image) {
          b64 = data.image;
        }

        if (b64) {
          if (b64.startsWith('data:image')) {
            b64 = b64.split(',')[1];
          }
          const imageBuffer = Buffer.from(b64, 'base64');
          return {
            success: true,
            imageBuffer,
            base64: b64,
            seed: currentSeed,
            durationMs
          };
        }

        lastErrorMessage = 'Studio response payload missing image buffer';
      } else {
        const errText = await res.text().catch(() => '');
        lastErrorMessage = `Studio Service (${res.status}): ${errText.slice(0, 100)}`;
      }
    } catch (err: any) {
      lastErrorMessage = err.message || '3D visual synthesis interrupted';
    }

    if (attempt < MAX_RETRIES) {
      // Exponential backoff before retry (400ms, 800ms)
      await new Promise(resolve => setTimeout(resolve, attempt * 400));
    }
  }

  const totalDuration = Date.now() - tStart;
  return {
    success: false,
    durationMs: totalDuration,
    errorMessage: lastErrorMessage
  };
}
