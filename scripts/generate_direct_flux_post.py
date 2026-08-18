import os
import sys
import base64
import requests
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")
if not nvidia_key:
    print("❌ Missing NVIDIA API KEY in .env")
    exit(1)

invoke_url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"
headers = {
    "Authorization": f"Bearer {nvidia_key}",
    "Accept": "application/json",
}

user_direct_prompt = (
    "A professional, production-ready Instagram post (1080x1350, 4:5 portrait) for technology company 'Taliyo Technologies', "
    "headline: 'We don't just talk about the future. We build it.', "
    "positioning tagline: 'Building the Products I Wish Already Existed.', "
    "premium innovative software engineering and AI systems branding, "
    "sleek dark obsidian tech background with subtle emerald green and cyan blue cyber accents, "
    "sophisticated digital infrastructure, modern clean typography, award-winning graphic design, 8k resolution"
)

payload = {
    "prompt": user_direct_prompt,
    "width": 1024,
    "height": 1024,
    "seed": 42,
    "steps": 4
}

print(f"🚀 Generating Instagram Post via FLUX.2 Klein 4B for Taliyo Technologies...")
res = requests.post(invoke_url, headers=headers, json=payload, timeout=90)

if res.status_code == 200:
    data = res.json()
    b64_data = ""
    if "artifacts" in data and len(data["artifacts"]) > 0:
        b64_data = data["artifacts"][0].get("base64", "")
    elif "image" in data:
        b64_data = data["image"]
        
    if b64_data:
        out_file = "taliyo_technologies_flux_post.png"
        with open(out_file, "wb") as f:
            f.write(base64.b64decode(b64_data))
        print(f"✅ Success! Saved Instagram Post: {out_file} ({os.path.getsize(out_file)/1024:.1f} KB)")
    else:
        print("❌ No base64 in response:", data)
else:
    print(f"❌ Error ({res.status_code}): {res.text}")
