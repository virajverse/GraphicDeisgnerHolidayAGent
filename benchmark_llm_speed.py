import os
import sys
import time
import json
import urllib.request
import urllib.error

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def load_env():
    env_vars = {}
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

print("=" * 75)
print("🚀 TALIYO AGENT — NVIDIA CLOUD (openai/gpt-oss-120b) BENCHMARK")
print("=" * 75 + "\n")

results = []

def benchmark_nvidia_model(model_name="openai/gpt-oss-120b"):
    print(f"🔄 Benchmarking NVIDIA Cloud Primary Model: '{model_name}'...")
    if not nvidia_key:
        print(f"❌ NVIDIA_API_KEY missing in .env\n")
        return

    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {nvidia_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": "Write a 2-line creative graphic design headline for Independence Day."}],
        "temperature": 1,
        "top_p": 1,
        "max_tokens": 500,
        "stream": False
    }

    start_time = time.time()
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=15) as response:
            elapsed_ms = round((time.time() - start_time) * 1000, 2)
            data = json.loads(response.read().decode('utf-8'))
            output_text = data['choices'][0]['message']['content'].strip()
            
            results.append({
                "provider": "NVIDIA Cloud",
                "model": model_name,
                "latency_ms": elapsed_ms,
                "status": "✅ SUCCESS",
                "output_snippet": output_text.replace('\n', ' ')[:80] + '...'
            })
            print(f"  ✅ Response Received in {elapsed_ms}ms!\n  💬 Output: \"{output_text}\"\n")
    except Exception as e:
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        results.append({
            "provider": "NVIDIA Cloud",
            "model": model_name,
            "latency_ms": elapsed_ms,
            "status": f"❌ ERROR ({str(e)})",
            "output_snippet": "N/A"
        })
        print(f"  ❌ Error ({str(e)}) in {elapsed_ms}ms\n")

# Run Primary Benchmark
benchmark_nvidia_model("openai/gpt-oss-120b")

# Render Summary Table
print("=" * 80)
print(f"{'PROVIDER':<15} | {'PRIMARY MODEL':<25} | {'LATENCY (ms)':<12} | {'STATUS'}")
print("=" * 80)

for r in results:
    print(f"{r['provider']:<15} | {r['model']:<25} | {r['latency_ms']:<12} | {r['status']}")

print("=" * 80 + "\n")
