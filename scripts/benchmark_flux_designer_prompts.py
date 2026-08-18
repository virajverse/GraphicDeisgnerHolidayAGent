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
# 🎨 4 MASTER-CLASS GRAPHIC DESIGN ARCHETYPES (PROMPT FORMULA TESTING)
# ==============================================================================
# Formula Structure:
# [Design Purpose] + [Subject & Core Focal] + [Composition & Layout Space] +
# [Color Palette & Materials] + [Lighting & 3D Shaders] + [Editorial Polish]
# ==============================================================================

DESIGN_TEST_SUITES = [
    {
        "id": "01_festive_luxury_poster",
        "name": "Luxury Festive Poster (Diya & Warm Radiance)",
        "prompt": (
            "Commercial graphic design poster for Diwali festival, "
            "centerpiece is a stunning 3D traditional Indian oil Diya made of brass and gold filigree with a glowing realistic flame, "
            "golden sparkling bokeh and subtle marigold petal dust floating, "
            "composition has generous 50% dark negative space at top for typography layout, "
            "matte black obsidian background (#0A0E17) with royal gold ambient glow (#FFB800), "
            "studio rim lighting, Octane render 3D, ultra-detailed 8k, Behance award-winning social poster"
        ),
        "seed": 101
    },
    {
        "id": "02_d2c_product_podium",
        "name": "D2C Luxury Product Podium (Commercial Stage)",
        "prompt": (
            "Minimalist 3D commercial product display stage for luxury perfume bottle, "
            "cylindrical marble podium surrounded by frosted tinted glass slabs and a sleek water ripple base, "
            "60% empty negative space centered above podium for client logo and product packaging placement, "
            "color palette of muted sage green, warm cream and champagne gold accents, "
            "soft diffused architectural studio morning light, sharp focus, hyper-realistic 8k render"
        ),
        "seed": 202
    },
    {
        "id": "03_tech_saas_3d_hero",
        "name": "Tech SaaS 3D Hero Visual (Glassmorphism & Neon)",
        "prompt": (
            "Modern tech startup landing page hero visual, "
            "floating isometric transparent glassmorphism dashboard cards and glowing 3D cyber nodes, "
            "neon emerald (#00E676) and cyan blue (#00B0FF) light beam reflections, "
            "deep space dark navy background (#0B131F) with clean open negative space on the left for headline copy, "
            "clean vectors, ray-traced reflections, Unreal Engine 5 aesthetic, 8k resolution"
        ),
        "seed": 303
    },
    {
        "id": "04_swiss_editorial_minimal",
        "name": "Swiss Modernist Editorial Poster (Bold Geometric)",
        "prompt": (
            "Swiss International Style graphic design poster, "
            "bold abstract 3D sculptural spheres and geometric archways in Bauhaus composition, "
            "high-contrast color blocking with international Klein blue, cadmium red, and warm off-white linen paper texture, "
            "structured grid layout with designated margins for editorial typography, "
            "clean shadow casting, studio art direction, museum exhibition catalog cover aesthetic"
        ),
        "seed": 404
    }
]

def generate_and_save(item):
    print(f"\n🎨 Testing #{item['id']}: {item['name']}...")
    payload = {
        "prompt": item["prompt"],
        "width": 1024,
        "height": 1024,
        "seed": item["seed"],
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
                out_path = f"sample_designer_{item['id']}.png"
                with open(out_path, "wb") as f:
                    f.write(base64.b64decode(b64_data))
                file_kb = os.path.getsize(out_path) / 1024
                print(f"   ✅ Saved: {out_path} ({file_kb:.1f} KB)")
                return out_path
        else:
            print(f"   ❌ Failed ({res.status_code}): {res.text}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    return None

print("="*80)
print("🚀 BENCHMARKING 4 GRAPHIC DESIGN PROMPT FORMULAS (FLUX 2 KLEIN 4B)")
print("="*80)

generated_files = []
for test_item in DESIGN_TEST_SUITES:
    file_path = generate_and_save(test_item)
    if file_path:
        generated_files.append((test_item["id"], test_item["name"], file_path))

print("\n" + "="*80)
print(f"📊 COMPLETED: Generated {len(generated_files)}/{len(DESIGN_TEST_SUITES)} Design Archetypes!")
print("="*80)
for fid, fname, fpath in generated_files:
    print(f"• {fname} -> {fpath}")
