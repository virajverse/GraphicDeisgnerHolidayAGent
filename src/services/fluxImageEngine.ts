import dotenv from 'dotenv';

dotenv.config();

const FLUX_API_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';

export interface ImageGenResult {
  success: boolean;
  imageBuffer?: Buffer;
  base64?: string;
  seed?: number;
  durationMs: number;
  errorMessage?: string;
}

/**
 * 🎨 Generates an ultra-crisp, zero-text 3D visual design asset via NVIDIA FLUX.2 Klein 4B
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
      errorMessage: 'NVIDIA API key not configured in environment.'
    };
  }

  // Formula: [Subject + Physical Materials] + [Clean Negative Space] + [Studio Lighting] + [no text, 8k]
  const prompt = `${subject}, studio lighting, dark obsidian background, clean negative space for design, no text, 8k resolution`;

  try {
    const res = await fetch(FLUX_API_URL, {
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
        seed,
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
          return {
            success: false,
            durationMs,
            errorMessage: `FLUX finishReason: ${data.artifacts[0].finishReason}`
          };
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
          seed,
          durationMs
        };
      }

      return {
        success: false,
        durationMs,
        errorMessage: `FLUX response missing base64 image data. Keys: ${Object.keys(data).join(', ')}`
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      success: false,
      durationMs,
      errorMessage: `FLUX API Error (${res.status}): ${errText.slice(0, 150)}`
    };
  } catch (err: any) {
    const durationMs = Date.now() - tStart;
    return {
      success: false,
      durationMs,
      errorMessage: err.message || 'FLUX generation failed'
    };
  }
}
