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

prompts = [
    {
        "name": "perfume_luxury_podium",
        "prompt": (
            "Commercial 3D product photography backdrop, "
            "a single elegant luxury glass perfume bottle on a sleek black marble podium, "
            "warm golden rim lighting with delicate water ripples and soft caustic reflections, "
            "pure dark obsidian background (#0A0E17), "
            "completely clean empty copy space on the right, "
            "no text, no words, no letters, no labels, "
            "tack sharp focus, 8k resolution, photorealistic Octane 3D render"
        ),
        "seed": 555
    },
    {
        "name": "modern_tech_3d_cube",
        "prompt": (
            "Minimalist modern tech graphic design visual, "
            "a floating 3D glowing isometric glass cube with neon emerald green (#00E676) and cyan cyber circuits inside, "
            "dark space navy background (#0B131F), "
            "50% clean open negative space on the left, "
            "no text, no letters, zero typography, "
            "tack sharp edges, raytraced reflections, hyper-clean 8k resolution"
        ),
        "seed": 999
    }
]

for p in prompts:
    payload = {
        "prompt": p["prompt"],
        "width": 1024,
        "height": 1024,
        "seed": p["seed"],
        "steps": 4
    }
    try:
        res = requests.post(invoke_url, headers=headers, json=payload, timeout=60)
        if res.status_code == 200:
            data = res.json()
            b64 = ""
            if "artifacts" in data and len(data["artifacts"]) > 0:
                b64 = data["artifacts"][0].get("base64", "")
            elif "image" in data:
                b64 = data["image"]
            if b64:
                out = f"ultra_crisp_{p['name']}.png"
                with open(out, "wb") as f:
                    f.write(base64.b64decode(b64))
                print(f"✅ Generated {out} ({os.path.getsize(out)/1024:.1f} KB)")
        else:
            print(f"❌ Error for {p['name']}: {res.status_code} {res.text}")
    except Exception as e:
        print(f"❌ Exception: {e}")
