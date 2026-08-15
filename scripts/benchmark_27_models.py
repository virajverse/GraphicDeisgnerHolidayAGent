# -*- coding: utf-8 -*-
"""
================================================================================
TALIYO CREATIVE INTELLIGENCE — 27-MODEL LIVE REAL-WORLD BENCHMARK ENGINE
================================================================================
Tests all 27 NVIDIA NIM models with 4 diverse real-world Graphic Design prompts:
  1. Fast Co-Pilot: Luxury Real Estate Palette & Typography
  2. Heavy 6-Angle Strategy: World Photography Day Campaign Ideation
  3. Technical Art Direction: Figma 1080x1350 Canvas & Grid Specs
  4. Desi Copywriting: Monsoon Chai Campaign Relatable Hooks
================================================================================
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Load .env variables
def load_env():
    env_vars = {}
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if not os.path.exists(env_path):
        env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    env_vars[key.strip()] = val.strip().strip("'").strip('"')
    return env_vars

env = load_env()
nvidia_key = env.get('NVIDIA_API_KEY', '')

if not nvidia_key:
    print("❌ ERROR: NVIDIA_API_KEY is not found in .env!")
    sys.exit(1)

# List of all 27 Unique Specialized NIM Models
UNIQUE_27_MODELS = [
    "meta/llama-3.1-8b-instruct",
    "nvidia/nemotron-mini-4b-instruct",
    "openai/gpt-oss-20b",
    "minimaxai/minimax-m3",
    "nvidia/llama-3.1-nemoguard-8b-topic-control",
    "nvidia/nemotron-3.5-content-safety",
    "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
    "nvidia/llama-3.1-nemoguard-8b-content-safety",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "meta/llama-3.2-11b-vision-instruct",
    "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    "meta/llama-3.1-70b-instruct",
    "mistralai/mistral-nemotron",
    "poolside/laguna-xs-2.1",
    "z-ai/glm-5.2",
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "meta/muse-glimmer-30b",
    "openai/gpt-oss-120b",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "stepfun-ai/step-3.7-flash",
    "nvidia/nemotron-3-nano-30b-a3b",
    "thinkingmachines/inkling",
    "nvidia/riva-translate-4b-instruct-v1.1",
    "nvidia/riva-translate-4b-instruct-v2",
    "nvidia/nvidia-nemotron-nano-9b-v2",
    "nvidia/ising-calibration-1.5-31b"
]

TEST_PROMPTS = [
    {
        "id": "PROMPT_A_FAST_COPILOT",
        "title": "⚡ Fast Co-Pilot: Luxury Real Estate Palette & Typography",
        "system": "You are a Senior Art Director. Answer directly, concisely with exact hex codes (#...) and font pairing.",
        "user": "Bhai ek luxury modern penthouse poster ke liye 3 exact Hex color codes (#...) aur 1 display + body font pairing suggest karo."
    },
    {
        "id": "PROMPT_B_HEAVY_REASONING",
        "title": "🧠 Heavy Strategy: 6 Creative Angles for World Photography Day",
        "system": "You are an Executive Creative Director. Output 6 distinct angles with punchy headlines.",
        "user": "World Photography Day ke liye 6 alag angles do: 1. Educational, 2. Emotional, 3. Brand-focused, 4. Social, 5. Interactive, 6. 3D Experimental."
    },
    {
        "id": "PROMPT_C_FIGMA_SPECS",
        "title": "🎨 Technical Figma Art Direction (Canvas, Margins & Grids)",
        "system": "You are a Design Lead. Provide exact pixel dimensions, safe margins, and typography sizes.",
        "user": "Instagram 4:5 portrait carousel ke liye exact canvas dimensions, padding margins in pixels, aur Headline + Body font sizes batao."
    },
    {
        "id": "PROMPT_D_DESI_COPYWRITING",
        "title": "✍️ Desi Copywriting: Relatable Chai Monsoon Hooks",
        "system": "You are an award-winning Indian Advertising Copywriter. Write witty, punchy Hinglish hooks.",
        "user": "Ek organic Chai brand ke monsoon campaign ke liye 3 short, witty aur emotional Hinglish headlines likho."
    }
]

def query_nvidia_model(model_name, system_prompt, user_prompt, timeout=25):
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {nvidia_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.6,
        "max_tokens": 750,
        "stream": False
    }

    start_time = time.time()
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=timeout) as response:
            latency_ms = round((time.time() - start_time) * 1000, 2)
            data = json.loads(response.read().decode('utf-8'))
            output_text = data['choices'][0]['message']['content'].strip()
            return {
                "success": True,
                "latency_ms": latency_ms,
                "output_text": output_text,
                "chars_count": len(output_text),
                "error": None
            }
    except urllib.error.HTTPError as e:
        latency_ms = round((time.time() - start_time) * 1000, 2)
        err_body = e.read().decode('utf-8', errors='ignore')
        return {
            "success": False,
            "latency_ms": latency_ms,
            "output_text": "",
            "chars_count": 0,
            "error": f"HTTP {e.code}: {err_body[:120]}"
        }
    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000, 2)
        return {
            "success": False,
            "latency_ms": latency_ms,
            "output_text": "",
            "chars_count": 0,
            "error": str(e)
        }

def evaluate_design_quality(text):
    score = 0
    # Checks for Hex Codes (#00FF88, #0A0E17, etc.)
    import re
    hex_matches = re.findall(r'#[0-9a-fA-F]{6}', text)
    if hex_matches:
        score += 25
    
    # Checks for Typography Mentions (Syne, Inter, Playfair, Montserrat, Outfit, Cinzel, px, pt)
    fonts = ['inter', 'syne', 'outfit', 'cinzel', 'playfair', 'montserrat', 'helvetica', 'roboto', 'fira', 'px', 'pt']
    if any(f in text.lower() for f in fonts):
        score += 25
    
    # Checks for Layout / Margin / Canvas Specs (1080, 1350, 4:5, padding, margin, grid)
    layout = ['1080', '1350', '4:5', 'margin', 'padding', 'grid', 'carousel', 'layer']
    if any(l in text.lower() for l in layout):
        score += 25

    # Checks for Structured Headings & Angles
    if '\n' in text and ('1.' in text or '•' in text or '-' in text or '#' in text):
        score += 25

    return score, hex_matches

def main():
    print("=" * 85)
    print("🚀 TALIYO 27-MODEL COMPREHENSIVE REASONING & DESIGN BENCHMARK")
    print("=" * 85)
    print(f"• Total Models To Benchmark : {len(UNIQUE_27_MODELS)} Models")
    print(f"• Total Real-World Queries  : {len(TEST_PROMPTS)} Diverse Graphic Design Prompts")
    print("• Evaluation Criteria       : Latency (ms), Output Depth, Hex Code Accuracy, Typography & Reasoning\n")

    report_lines = []
    report_lines.append("=" * 85)
    report_lines.append("TALIYO CREATIVE INTELLIGENCE — 27-MODEL BENCHMARK AUDIT REPORT")
    report_lines.append("=" * 85 + "\n")

    model_summary = {}

    for idx, model in enumerate(UNIQUE_27_MODELS, 1):
        print(f"\n[{idx}/{len(UNIQUE_27_MODELS)}] 🤖 BENCHMARKING MODEL: {model}")
        report_lines.append(f"\n{'='*75}\n[{idx}/{len(UNIQUE_27_MODELS)}] MODEL: {model}\n{'='*75}")
        
        prompt_results = []
        total_latency = 0
        total_chars = 0
        total_score = 0
        success_count = 0

        for p in TEST_PROMPTS:
            print(f"   ▶ Testing: {p['title']}...", end=" ", flush=True)
            res = query_nvidia_model(model, p['system'], p['user'], timeout=22)
            time.sleep(0.5) # Gentle throttle

            if res['success']:
                score, hexes = evaluate_design_quality(res['output_text'])
                total_latency += res['latency_ms']
                total_chars += res['chars_count']
                total_score += score
                success_count += 1
                
                print(f"✅ ({res['latency_ms']}ms | {res['chars_count']} chars | Score: {score}/100)")
                
                report_lines.append(f"\n  • [TEST]: {p['title']}")
                report_lines.append(f"    - Latency: {res['latency_ms']}ms | Output: {res['chars_count']} chars | Quality Score: {score}/100")
                if hexes:
                    report_lines.append(f"    - Extracted Hex Codes: {', '.join(hexes)}")
                snippet = res['output_text'].replace('\n', '\n      ')
                report_lines.append(f"    - Response Sample:\n      {snippet[:350]}...\n")
                
                prompt_results.append({
                    "prompt_id": p['id'],
                    "success": True,
                    "latency_ms": res['latency_ms'],
                    "chars_count": res['chars_count'],
                    "score": score,
                    "sample": res['output_text'][:150]
                })
            else:
                print(f"❌ {res['error'][:40]}")
                report_lines.append(f"\n  • [TEST]: {p['title']}")
                report_lines.append(f"    - Error: {res['error']}")
                prompt_results.append({
                    "prompt_id": p['id'],
                    "success": False,
                    "error": res['error']
                })

        avg_latency = round(total_latency / success_count, 2) if success_count > 0 else 99999
        avg_score = round(total_score / success_count, 2) if success_count > 0 else 0
        
        model_summary[model] = {
            "success_rate": f"{success_count}/{len(TEST_PROMPTS)}",
            "avg_latency_ms": avg_latency,
            "total_chars": total_chars,
            "avg_quality_score": avg_score,
            "prompt_results": prompt_results
        }

    # Final Rankings
    print("\n\n" + "=" * 85)
    print("🏆 FINAL 27-MODEL BENCHMARK RANKING & MATRIX")
    print("=" * 85 + "\n")
    report_lines.append("\n" + "=" * 85)
    report_lines.append("🏆 FINAL 27-MODEL BENCHMARK RANKING & MATRIX")
    report_lines.append("=" * 85 + "\n")

    # Sort by quality score and speed
    sorted_models = sorted(
        model_summary.items(),
        key=lambda item: (
            int(item[1]['success_rate'].split('/')[0]),
            item[1]['avg_quality_score'],
            -item[1]['avg_latency_ms']
        ),
        reverse=True
    )

    header = f"{'Rank':<5} | {'Model Name':<42} | {'Success':<8} | {'Avg Latency':<12} | {'Quality':<8}"
    print(header)
    print("-" * len(header))
    report_lines.append(header)
    report_lines.append("-" * len(header))

    for rank, (m_name, stats) in enumerate(sorted_models, 1):
        row = f"#{rank:<4} | {m_name:<42} | {stats['success_rate']:<8} | {stats['avg_latency_ms']:>8}ms | {stats['avg_quality_score']:>6.1f}/100"
        print(row)
        report_lines.append(row)

    # Save to disk
    report_path = os.path.join(os.path.dirname(__file__), '..', 'benchmark_27_models_report.txt')
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(report_lines))

    matrix_path = os.path.join(os.path.dirname(__file__), '..', 'benchmark_27_models_matrix.json')
    with open(matrix_path, 'w', encoding='utf-8') as f:
        json.dump(model_summary, f, indent=2, ensure_ascii=False)

    print(f"\n📄 Complete Benchmark Report saved to: {os.path.abspath(report_path)}")
    print(f"📊 JSON Telemetry Matrix saved to: {os.path.abspath(matrix_path)}")

if __name__ == '__main__':
    main()
