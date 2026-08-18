import os
import sys
import base64
import requests
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")
invoke_url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"

headers = {
    "Authorization": f"Bearer {nvidia_key}",
    "Accept": "application/json",
}

# ==============================================================================
# 🎯 2 MAJOR FIXES FOR 100% CRYSTAL-CLEAR DESIGNER ASSETS:
# 1. Zero-Text Directive: Prevents the AI from generating ugly garbled pseudo-letters.
# 2. Ultra-Sharp Camera & Texture Tokens: Tack-sharp studio macro, raytraced reflection.
# ==============================================================================

crisp_prompt_diwali = (
    "Crystal-clear professional 3D graphic design asset, "
    "a single majestic traditional Indian brass Diya with a glowing realistic orange flame, "
    "intricate carved filigree with reflective metallic gold highlights, "
    "floating sparkling golden bokeh particles, "
    "pure deep dark obsidian titanium background (#0A0E17), "
    "completely empty clean negative space at the top, "
    "no text, no words, no letters, no watermark, "
    "tack sharp focus, commercial studio softbox lighting, 8k resolution, photorealistic Octane 3D render"
)

crisp_prompt_tech = (
    "Ultra-clean 3D tech graphic design asset, "
    "isometric floating frosted glassmorphism slabs with glowing neon emerald (#00E676) and cyan edges, "
    "dark space navy studio background (#0B131F), "
    "pristine empty dark negative space on the left, "
    "no text, no letters, no fake typography, zero artifacts, "
    "tack sharp edges, raytraced reflections, hyper-clean 8k resolution, minimalist studio lighting"
)

tests = [
    {"name": "Diwali_Diya_UltraCrisp", "prompt": crisp_prompt_diwali, "seed": 777},
    {"name": "Tech_Glassmorphism_UltraCrisp", "prompt": crisp_prompt_tech, "seed": 888}
]

print("="*80)
print("🚀 TESTING ULTRA-CRISP ZERO-TEXT GRAPHIC DESIGN ASSETS")
print("="*80)

for t in tests:
    print(f"\n🎨 Generating {t['name']}...")
    payload = {
        "prompt": t["prompt"],
        "width": 1024,
        "height": 1024,
        "seed": t["seed"],
        "steps": 4
    }
    
    try:
        res = requests.post(invoke_url, headers=headers, json=payload, timeout=60)
        if res.status_code == 200:
            data = res.json()
            b64_data = ""
            if "artifacts" in data and len(data["artifacts"]) > 0:
                b64_data = data["artifacts"][0].get("base64", "")
            elif "image" in data:
                b64_data = data["image"]
                
            if b64_data:
                out_path = f"ultra_crisp_{t['name']}.png"
                with open(out_path, "wb") as f:
                    f.write(base64.b64decode(b64_data))
                print(f"   ✅ Saved: {out_path} ({os.path.getsize(out_path)/1024:.1f} KB)")
        else:
            print(f"   ❌ Error ({res.status_code}): {res.text}")
    except Exception as e:
        print(f"   ❌ Exception: {e}")

print("\n" + "="*80)
print("🏁 Ultra-Crisp Test Complete! Check generated images.")
print("="*80)
