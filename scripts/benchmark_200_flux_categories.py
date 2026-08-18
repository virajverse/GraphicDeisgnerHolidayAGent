import os
import sys
import json
import base64
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")
if not nvidia_key:
    print("❌ Missing NVIDIA API KEY")
    exit(1)

invoke_url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"
headers = {
    "Authorization": f"Bearer {nvidia_key}",
    "Accept": "application/json",
}

OUT_DIR = "flux_benchmark_assets"
os.makedirs(OUT_DIR, exist_ok=True)

# ==============================================================================
# 🎯 10 DESIGN DOMAINS (DIVERSE PROMPTS TO TEST FLUX EXPERTISE)
# ==============================================================================

CATEGORIES = {
    "01_3D_Festive_Cultural": [
        "Traditional Indian brass Diya with glowing flame, gold filigree, dark obsidian background, no text, 8k",
        "Islamic geometric crescent moon and brass lantern with warm light, midnight blue sky background, no text",
        "Christmas festive red glass bauble with gold glitter, dark pine background, studio rim light, no text",
        "Japanese origami crane in gold foil floating over zen water ripples, black background, no text",
        "3D vibrant Holi powder explosion in mid-air, studio dark backdrop, high-speed photography, no text",
    ],
    "02_D2C_Product_Podiums": [
        "Luxury black marble cylindrical podium on dark water surface with soft caustics, empty space, no text, 8k",
        "Minimalist cream travertine stone pedestal with palm leaf shadow, warm studio lighting, no text",
        "Frosted glass cosmetic display stage with rose gold accents, clean white studio background, no text",
        "Matte charcoal concrete block stage with neon green edge lighting, high-tech product backdrop, no text",
        "Floating wooden oak pedestal surrounded by fresh botanical eucalyptus leaves, studio lighting, no text",
    ],
    "03_Tech_SaaS_Cyber": [
        "Isometric 3D floating glassmorphism dashboard cards with neon cyan and emerald light traces, dark navy base, no text",
        "3D glowing holographic neural network core with optic fiber nodes, dark space background, no text",
        "Floating transparent silicon microchip with glowing gold circuit paths, dark obsidian background, no text",
        "Minimalist 3D cyber padlock security icon made of frosted crystal glass and neon blue glow, no text",
        "Abstract futuristic cloud database server tower with subtle glowing green status LEDs, dark studio, no text",
    ],
    "04_Minimalist_Architecture": [
        "Brutalist 3D architectural geometric archways in warm terracotta and cobalt blue, clean shadows, no text",
        "Floating marble sphere casting soft shadow on minimalist curved staircase, studio lighting, no text",
        "Bauhaus abstract geometric composition with brass rods and concrete blocks, museum lighting, no text",
        "Clean minimal gallery wall with dramatic sunlight casting window frame shadow on concrete floor, no text",
        "Monolithic dark titanium prism resting on polished white terrazzo floor, 8k render, no text",
    ],
    "05_Food_Beverage_Macro": [
        "Roasted coffee beans bursting in mid-air with steam and golden warm light, dark background, macro, no text",
        "Splash of iced matcha latte in crystal glass, droplets frozen in air, studio lighting, no text",
        "Floating fresh organic orange slice with water droplets, dramatic dark rim lighting, 8k macro, no text",
        "Golden honey dripping from wooden dipper onto black slate, studio softbox rim lighting, no text",
        "Single dark chocolate truffle dusted with cocoa powder, commercial studio macro photography, no text",
    ],
    "06_Luxury_Jewelry_Metals": [
        "Intricate 24k gold filigree royal necklace floating on black velvet, studio jewelry lighting, no text",
        "Faceted brilliant cut diamond with rainbow light prism refractions, dark titanium base, macro 8k, no text",
        "Fluid liquid chrome ribbon twisting in 3D space, metallic silver reflections, black studio, no text",
        "Rose gold metallic geometric ring on dark obsidian pedestal, commercial luxury catalog photo, no text",
        "Emerald gemstone embedded in dark textured raw rock, high-precision macro studio render, no text",
    ],
    "07_Botanical_Nature": [
        "Single deep green Monstera leaf with glistening morning water droplets, dark moody background, macro 8k, no text",
        "Delicate pink cherry blossom branch with dew drops, soft dark grey studio background, no text",
        "Lush green mossy stone rock platform with soft morning mist, natural forest lighting, no text",
        "Single golden Ginkgo biloba leaf floating over dark ripples, minimalist zen aesthetics, no text",
        "Deep red rose petal with crystal water beads, commercial beauty studio backdrop, no text",
    ],
    "08_Abstract_3D_Textures": [
        "Iridescent holographic fluid liquid waves flowing in 3D, chromatic sheen, dark background, no text",
        "Frosted semi-transparent acrylic ribbon floating in spiral, soft pastel gradient lighting, no text",
        "Black matte 3D geometric wave grid surface, subtle metallic gold rim edge reflections, no text",
        "Glowing bioluminescent jellyfish tendrils floating in deep oceanic abyss, dark backdrop, no text",
        "3D claymorphism organic smooth pill shapes in modern warm aesthetic, soft studio shadows, no text",
    ]
}

# Generate 40 distinct benchmark assets across 8 major domains
test_tasks = []
idx = 1
for cat, prompts in CATEGORIES.items():
    for p in prompts:
        test_tasks.append({
            "index": idx,
            "category": cat,
            "prompt": p,
            "seed": 1000 + idx
        })
        idx += 1

def run_single_benchmark(task):
    t_start = time.time()
    payload = {
        "prompt": task["prompt"],
        "width": 1024,
        "height": 1024,
        "seed": task["seed"],
        "steps": 4
    }
    
    try:
        res = requests.post(invoke_url, headers=headers, json=payload, timeout=60)
        dur = round((time.time() - t_start) * 1000)
        
        if res.status_code == 200:
            data = res.json()
            b64 = ""
            if "artifacts" in data and len(data["artifacts"]) > 0:
                b64 = data["artifacts"][0].get("base64", "")
            elif "image" in data:
                b64 = data["image"]
                
            if b64:
                filename = f"{task['category']}_{task['index']:02d}.png"
                filepath = os.path.join(OUT_DIR, filename)
                with open(filepath, "wb") as f:
                    f.write(base64.b64decode(b64))
                file_kb = round(os.path.getsize(filepath) / 1024, 1)
                return {
                    "task": task,
                    "status": "SUCCESS",
                    "duration_ms": dur,
                    "file": filename,
                    "size_kb": file_kb
                }
        return {"task": task, "status": f"HTTP_{res.status_code}", "duration_ms": dur, "error": res.text}
    except Exception as e:
        dur = round((time.time() - t_start) * 1000)
        return {"task": task, "status": "ERROR", "duration_ms": dur, "error": str(e)}

print("="*80)
print(f"🚀 INITIATING FLUX.2 KLEIN 4B EXPERTISE BENCHMARK ({len(test_tasks)} TARGET ASSETS)")
print(f"⚡ Parallel Workers: 8 Threads | Target Directory: {OUT_DIR}/")
print("="*80 + "\n")

start_all = time.time()
completed = 0
results = []

with ThreadPoolExecutor(max_workers=8) as executor:
    futures = {executor.submit(run_single_benchmark, t): t for t in test_tasks}
    for f in as_completed(futures):
        res = f.result()
        results.append(res)
        completed += 1
        icon = "✅" if res["status"] == "SUCCESS" else "❌"
        task_info = res["task"]
        if res["status"] == "SUCCESS":
            print(f"[{completed}/{len(test_tasks)}] {icon} {task_info['category']} (#{task_info['index']:02d}) -> {res['file']} ({res['duration_ms']}ms, {res['size_kb']} KB)")
        else:
            print(f"[{completed}/{len(test_tasks)}] {icon} {task_info['category']} (#{task_info['index']:02d}) -> Failed: {res.get('error', 'unknown')}")

total_time = round(time.time() - start_all, 2)
success_count = sum(1 for r in results if r["status"] == "SUCCESS")

# Save detailed report
report_data = {
    "total_tested": len(test_tasks),
    "successful": success_count,
    "total_time_seconds": total_time,
    "average_latency_ms": round(sum(r["duration_ms"] for r in results) / len(results)),
    "results": results
}

with open("flux_expertise_report.json", "w") as f:
    json.dump(report_data, f, indent=2)

print("\n" + "="*80)
print(f"📊 BENCHMARK COMPLETE: {success_count}/{len(test_tasks)} ASSETS GENERATED IN {total_time}s")
print(f"📁 Assets Saved To: {OUT_DIR}/")
print(f"📄 Detailed Report: flux_expertise_report.json")
print("="*80)
