"""
=============================================================================
TALIYO CREATIVE INTELLIGENCE — 35 PARALLEL MODEL BENCHMARK HARNESS
=============================================================================
Fires 35 simultaneous parallel calls across NVIDIA NIM model cluster
Measures exact latency, throughput, token output, and ranking.
Zero external pip dependencies required (Standard Library only).
=============================================================================
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

# Ensure UTF-8 output on Windows terminal
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 1. Read API Key from .env or environment
API_KEY = os.environ.get("NVIDIA_API_KEY") or os.environ.get("NVIDIA_NIM_API_KEY")
if not API_KEY and os.path.exists(".env"):
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("NVIDIA_API_KEY=") or line.startswith("NVIDIA_NIM_API_KEY="):
                API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
                break

if not API_KEY:
    print("❌ ERROR: NVIDIA_API_KEY not found in environment or .env file!")
    sys.exit(1)

# 2. Complete List of 35 Target Models across the Cluster
MODELS_TO_BENCHMARK = [
    # Top 27 Agent Cluster Models
    "meta/llama-3.1-8b-instruct",
    "nvidia/nemotron-mini-4b-instruct",
    "minimaxai/minimax-m3",
    "openai/gpt-oss-20b",
    "nvidia/llama-3.1-nemoguard-8b-content-safety",
    "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
    "nvidia/nemotron-3.5-content-safety",
    "nvidia/llama-3.1-nemoguard-8b-topic-control",
    "nvidia/nemotron-3-nano-30b-a3b",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    "meta/llama-3.2-11b-vision-instruct",
    "poolside/laguna-xs-2.1",
    "meta/muse-glimmer-30b",
    "z-ai/glm-5.2",
    "mistralai/mistral-nemotron",
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "openai/gpt-oss-120b",
    "stepfun-ai/step-3.7-flash",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/riva-translate-4b-instruct-v1.1",
    "nvidia/riva-translate-4b-instruct-v2",
    "nvidia/ising-calibration-1.5-31b",
    "nvidia/nvidia-nemotron-nano-9b-v2",
    "qwen/qwen2.5-coder-32b-instruct",
    "mistralai/mistral-nemo-12b-instruct",
    # Additional models to complete 35 parallel test load
    "meta/llama-3.1-70b-instruct",
    "google/gemma-2-9b-it",
    "google/gemma-2-27b-it",
    "deepseek-ai/deepseek-r1",
    "baichuan-inc/baichuan2-13b-chat",
    "writer/palmyra-creative",
    "ibm/granite-34b-code-instruct",
    "microsoft/phi-3-mini-128k-instruct"
]

TEST_PROMPT = "Explain the rule of thirds in 1 punchy sentence for a graphic designer."
ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"

def call_single_model(model_name: str, call_id: int):
    """Executes a single API call and measures exact latency."""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "TaliyoBenchmarkHarness/1.0"
    }

    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "You are an expert graphic design director. Respond concisely."},
            {"role": "user", "content": TEST_PROMPT}
        ],
        "max_tokens": 100,
        "temperature": 0.5
    }

    start_time = time.time()
    result = {
        "call_id": call_id,
        "model": model_name,
        "status": "UNKNOWN",
        "latency_ms": 0,
        "tokens": 0,
        "preview": "",
        "error": None
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(ENDPOINT, data=data, headers=headers, method="POST")
        
        # 20 second timeout per call
        with urllib.request.urlopen(req, timeout=20.0) as resp:
            elapsed = time.time() - start_time
            result["latency_ms"] = int(elapsed * 1000)
            
            body = resp.read().decode("utf-8")
            parsed = json.loads(body)
            content = parsed.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            
            result["status"] = "SUCCESS"
            result["preview"] = content[:80].replace("\n", " ")
            usage = parsed.get("usage", {})
            result["tokens"] = usage.get("total_tokens", len(content.split()))

    except urllib.error.HTTPError as e:
        elapsed = time.time() - start_time
        result["latency_ms"] = int(elapsed * 1000)
        result["status"] = f"HTTP_{e.code}"
        result["error"] = str(e)
    except Exception as e:
        elapsed = time.time() - start_time
        result["latency_ms"] = int(elapsed * 1000)
        result["status"] = "FAILED"
        result["error"] = str(e)

    return result

def main():
    total_calls = len(MODELS_TO_BENCHMARK)
    print("=" * 75)
    print(f"🚀 FIRING {total_calls} SIMULTANEOUS PARALLEL CALLS TO NVIDIA CLUSTER...")
    print(f"📡 API Endpoint: {ENDPOINT}")
    print(f"🎯 Concurrency Level: {total_calls} parallel threads")
    print("=" * 75)

    wall_start = time.time()
    results = []

    # 35-Way Parallel Execution
    with ThreadPoolExecutor(max_workers=total_calls) as executor:
        future_to_model = {
            executor.submit(call_single_model, model, i + 1): model 
            for i, model in enumerate(MODELS_TO_BENCHMARK)
        }

        completed_count = 0
        for future in as_completed(future_to_model):
            completed_count += 1
            res = future.result()
            results.append(res)
            status_symbol = "✅" if res["status"] == "SUCCESS" else "⚠️"
            print(f"[{completed_count:02d}/{total_calls:02d}] {status_symbol} {res['model']:<45} | {res['latency_ms']:>5} ms | {res['status']}")

    total_wall_time = time.time() - wall_start
    print("\n" + "=" * 75)
    print(f"🏁 ALL {total_calls} CALLS COMPLETED IN {total_wall_time:.2f} SECONDS (WALL TIME)")
    print("=" * 75)

    # Sort results by Latency (Fastest First)
    results_sorted = sorted(results, key=lambda x: (x["status"] != "SUCCESS", x["latency_ms"]))

    # Output Leaderboard Table
    print("\n" + "─" * 90)
    print(f"{'RANK':<5} | {'MODEL NAME':<45} | {'STATUS':<10} | {'LATENCY (MS)':<12} | {'PREVIEW'}")
    print("─" * 90)

    for rank, r in enumerate(results_sorted, 1):
        preview_clean = (r["preview"][:30] + "...") if r["preview"] else (r.get("error") or "No output")[:30]
        status_disp = "✅ OK" if r["status"] == "SUCCESS" else f"❌ {r['status']}"
        print(f"#{rank:<4} | {r['model']:<45} | {status_disp:<10} | {r['latency_ms']:>6} ms     | {preview_clean}")

    print("─" * 90)

    # Summary Stats
    success_count = sum(1 for r in results if r["status"] == "SUCCESS")
    failed_count = total_calls - success_count
    latencies = [r["latency_ms"] for r in results if r["status"] == "SUCCESS"]
    avg_latency = (sum(latencies) / len(latencies)) if latencies else 0
    fastest = min(latencies) if latencies else 0
    slowest = max(latencies) if latencies else 0

    print(f"\n📊 PERFORMANCE SUMMARY:")
    print(f"• Total Parallel Requests: {total_calls}")
    print(f"• Successful Responses:    {success_count}/{total_calls} ({(success_count/total_calls)*100:.1f}%)")
    print(f"• Failed / Unavailable:    {failed_count}")
    print(f"• Average Model Latency:   {avg_latency:.1f} ms")
    print(f"• ⚡ Fastest Model:          {fastest} ms ({results_sorted[0]['model']})")
    print(f"• 🐢 Slowest Active Model:   {slowest} ms")
    print(f"• 🚀 Cluster Throughput:     {total_calls / total_wall_time:.2f} requests/sec")
    print("=" * 75)

    # Save to JSON
    output_filename = "benchmark_35_parallel_results.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump({
            "total_calls": total_calls,
            "total_wall_seconds": round(total_wall_time, 2),
            "success_rate_percent": round((success_count/total_calls)*100, 1),
            "average_latency_ms": round(avg_latency, 1),
            "fastest_ms": fastest,
            "slowest_ms": slowest,
            "results": results_sorted
        }, f, indent=2)
    
    print(f"\n💾 Saved complete results to: {output_filename}\n")

if __name__ == "__main__":
    main()
