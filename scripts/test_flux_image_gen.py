import os
import sys
import json
import base64
import requests
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")

if not nvidia_key:
    print("❌ Missing NVIDIA API KEY in .env file")
    exit(1)

invoke_url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"

headers = {
    "Authorization": f"Bearer {nvidia_key}",
    "Accept": "application/json",
}

# ==============================================================================
# 🎨 GRAPHIC DESIGNER MASTER-CLASS ART DIRECTION PROMPT
# ==============================================================================
# How a Senior Creative Director & Agency Designer prompts high-end visuals:
# 1. Composition: 4:5 Instagram portrait framing with 40% clean negative space for typography
# 2. Lighting: Octane 3D render, studio softbox rim lights, volumetric subtle haze
# 3. Materials: Matte obsidian dark titanium (#0A0E17), brushed 24k gold leaf, frosted glass
# 4. Focal Point: Floating 3D geometric festive diya/mandala with modern minimal aesthetics
# ==============================================================================

designer_prompt = (
    "Award-winning professional graphic design social media poster, "
    "subject is a magnificent floating 3D minimalist geometric festive Diya with intricate gold filigree, "
    "composition crafted with 40% generous negative space at top and bottom for typography placement, "
    "materials: matte black obsidian titanium (#0A0E17), brushed royal 24k gold accents (#FFB800), frosted glassmorphism layers, "
    "lighting: high-end commercial studio rim lighting, cinematic warm volumetric glow, Octane 3D render, "
    "aesthetic: sleek modern luxury, Pentagram and Behance top trending, crisp hyper-detailed 8k resolution, photorealistic studio finish"
)

payload = {
    "prompt": designer_prompt,
    "width": 1024,
    "height": 1024,
    "seed": 2026,
    "steps": 4
}

print("\n" + "="*80)
print("🎨 TALIYO CREATIVE INTELLIGENCE — GRAPHIC DESIGNER FLUX IMAGE ENGINE")
print("="*80)
print(f"🎯 Target Model: Black Forest Labs FLUX.2 Klein 4B (via NVIDIA GenAI)")
print(f"📝 Art Director Prompt:\n\"{designer_prompt}\"\n")
print("⚡ Sending request to NVIDIA GenAI Cluster...")

try:
    response = requests.post(invoke_url, headers=headers, json=payload, timeout=90)
    print(f"📡 Response Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        # Check artifacts or image payload
        if "artifacts" in data and len(data["artifacts"]) > 0:
            artifact = data["artifacts"][0]
            b64_data = artifact.get("base64", "")
            finish_reason = artifact.get("finishReason", "SUCCESS")
            seed_used = artifact.get("seed", 2026)
            
            output_filename = "designer_festive_flux_render.png"
            with open(output_filename, "wb") as f:
                f.write(base64.b64decode(b64_data))
                
            file_size_kb = os.path.getsize(output_filename) / 1024
            print("\n" + "="*80)
            print(f"🎉 SUCCESS! Professional Graphic Design Artwork Generated!")
            print(f"📁 Saved Image: {output_filename} ({file_size_kb:.1f} KB)")
            print(f"🎲 Seed: {seed_used} | Status: {finish_reason}")
            print("="*80)
            print("✨ This high-res poster render is ready to be delivered directly to designers on Telegram!\n")
            
        elif "image" in data:
            output_filename = "designer_festive_flux_render.png"
            with open(output_filename, "wb") as f:
                f.write(base64.b64decode(data["image"]))
            print(f"🎉 Saved image to {output_filename}")
        else:
            print("🔍 Unexpected response format:", json.dumps(data, indent=2)[:500])
    else:
        print(f"❌ API Error ({response.status_code}): {response.text}")

except Exception as e:
    print(f"❌ Exception occurred: {e}")
