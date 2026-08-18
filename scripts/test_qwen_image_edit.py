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
    print("❌ Missing NVIDIA API KEY")
    exit(1)

flux_url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"
qwen_edit_url = "https://ai.api.nvidia.com/v1/genai/qwen/qwen-image-edit"

headers = {
    "Authorization": f"Bearer {nvidia_key}",
    "Accept": "application/json",
}

print("="*80)
print("🚀 STEP 1: Generating Base 3D Diya Image via FLUX...")
print("="*80)

flux_payload = {
    "prompt": "Traditional 3D brass Indian Diya with glowing orange flame, dark obsidian background (#0A0E17), no text, no words, 8k resolution",
    "width": 1024,
    "height": 1024,
    "seed": 123,
    "steps": 4
}

res1 = requests.post(flux_url, headers=headers, json=flux_payload, timeout=60)
if res1.status_code != 200:
    print(f"❌ FLUX generation failed: {res1.status_code} {res1.text}")
    exit(1)

b64_base = res1.json()["artifacts"][0]["base64"]
with open("base_diya_for_edit.png", "wb") as f:
    f.write(base64.b64decode(b64_base))
print("✅ Base Diya image saved to base_diya_for_edit.png!")

print("\n" + "="*80)
print("🚀 STEP 2: Testing Qwen-Image-Edit (https://build.nvidia.com/qwen/qwen-image-edit)...")
print("="*80)

qwen_payload = {
    "prompt": "Add elegant glowing gold typography 'HAPPY DIWALI' in the dark space above the diya",
    "image": f"data:image/png;base64,{b64_base}",
    "seed": 42
}

print(f"📡 Invoking Qwen-Image-Edit at {qwen_edit_url}...")
try:
    res2 = requests.post(qwen_edit_url, headers=headers, json=qwen_payload, timeout=90)
    print(f"📡 Qwen Status Code: {res2.status_code}")
    if res2.status_code == 200:
        data2 = res2.json()
        b64_edit = ""
        if "artifacts" in data2 and len(data2["artifacts"]) > 0:
            b64_edit = data2["artifacts"][0].get("base64", "")
        elif "image" in data2:
            b64_edit = data2["image"]
            
        if b64_edit:
            if b64_edit.startswith("data:image"):
                b64_edit = b64_edit.split(",")[1]
            with open("qwen_edited_output.png", "wb") as f:
                f.write(base64.b64decode(b64_edit))
            print("🎉 SUCCESS! Saved Qwen edited image to qwen_edited_output.png!")
        else:
            print("Response preview:", list(data2.keys()))
    else:
        print(f"❌ Qwen Error ({res2.status_code}): {res2.text}")
except Exception as e:
    print(f"❌ Exception calling Qwen: {e}")
