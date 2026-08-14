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

if not nvidia_key:
    print("❌ NVIDIA_API_KEY missing in .env!")
    sys.exit(1)

print("=" * 85)
print("🌐 NVIDIA CLOUD — 102 MODELS STRENGTH & CAPABILITY SCANNER")
print("=" * 85)
print("❓ Prompt Question: 'What is your biggest strength? Tell me in one line.'")
print("⏱️ Timeout Per Model: 12 Seconds | Throttle Delay: 1.2 Seconds per call\n")

# Step 1: Fetch complete model list dynamically
def fetch_all_models():
    url = "https://integrate.api.nvidia.com/v1/models"
    headers = {"Authorization": f"Bearer {nvidia_key}"}
    try:
        req = urllib.request.Request(url, headers=headers, method='GET')
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode('utf-8'))
            return sorted([m['id'] for m in data['data']])
    except Exception as e:
        print(f"❌ Failed to fetch model list: {e}")
        sys.exit(1)

all_models = fetch_all_models()
total_models = len(all_models)
print(f"🎉 Successfully fetched {total_models} models from NVIDIA Cloud API!\n")

results = []
working_models_strengths = []

output_txt_path = os.path.join(os.path.dirname(__file__), 'nvidia_models_strengths.txt')
with open(output_txt_path, 'w', encoding='utf-8') as f:
    f.write("=================================================================================\n")
    f.write("🌐 NVIDIA CLOUD WORKING MODELS & SPECIALIZED STRENGTHS AUDIT REPORT\n")
    f.write("=================================================================================\n\n")

print(f"{'#':<6} | {'MODEL ID':<45} | {'STATUS':<12} | {'LATENCY':<10} | {'DIAGNOSTIC REASON'}")
print("-" * 110)

for idx, model_id in enumerate(all_models, 1):
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {nvidia_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": "What is your biggest strength? Tell me in one line."}],
        "temperature": 0.7,
        "max_tokens": 150
    }

    start_time = time.time()
    status_str = "❌ ERROR"
    latency_ms = 0
    diag_reason = "Unknown"
    answer_text = ""

    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=12) as response:
            latency_ms = round((time.time() - start_time) * 1000, 1)
            resp_body = json.loads(response.read().decode('utf-8'))
            
            choice = resp_body['choices'][0]['message']
            reasoning = choice.get('reasoning_content', None)
            content = choice.get('content', '') or ''
            answer_text = content.replace('\n', ' ').strip()

            status_str = "✅ WORKING"
            if reasoning:
                diag_reason = "🧠 Model Thinking / Deep Reasoning"
            elif latency_ms < 2000:
                diag_reason = "⚡ Ultra Fast Inference (<2.0s)"
            elif latency_ms < 5000:
                diag_reason = "🟢 Moderate Load (2.0s-5s)"
            else:
                diag_reason = "⏳ Server Queue / High Traffic Delay (>5s)"

            working_item = {
                "model_id": model_id,
                "latency_ms": latency_ms,
                "reasoning": bool(reasoning),
                "diag_reason": diag_reason,
                "answer": answer_text
            }
            working_models_strengths.append(working_item)

            # Append live to text file
            with open(output_txt_path, 'a', encoding='utf-8') as f:
                f.write(f"{model_id} - {answer_text} [Latency: {latency_ms}ms | {diag_reason}]\n")

    except urllib.error.HTTPError as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        if e.code == 404:
            status_str = "❌ HTTP 404"
            diag_reason = "Endpoint Restricted / Non-Chat Model"
        elif e.code == 429:
            status_str = "⚠️ HTTP 429"
            diag_reason = "Rate Limit Hit (Too Many Requests)"
        elif e.code == 400:
            status_str = "❌ HTTP 400"
            diag_reason = "Invalid Parameters / System Model"
        else:
            status_str = f"❌ HTTP {e.code}"
            diag_reason = f"HTTP Error {e.code}"

    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        err_msg = str(e)
        if "timed out" in err_msg.lower():
            status_str = "⏳ TIMEOUT"
            diag_reason = "Server Queue Stall (>12s timeout)"
        else:
            status_str = "❌ ERROR"
            diag_reason = err_msg[:35]

    num = f"[{idx}/{total_models}]"
    print(f"{num:<6} | {model_id:<45} | {status_str:<12} | {latency_ms:>6}ms | {diag_reason}")
    if answer_text:
        print(f"       👉 Answer: \"{answer_text[:90]}\"")

    results.append({
        "index": idx,
        "model_id": model_id,
        "status": status_str,
        "latency_ms": latency_ms,
        "diagnostic": diag_reason,
        "answer": answer_text
    })

    # Rate limiting throttle delay (1.2 seconds between calls = ~35 calls/min)
    time.sleep(1.2)

# Save JSON Audit Report as well
report_json_path = os.path.join(os.path.dirname(__file__), 'nvidia_models_audit_report.json')
with open(report_json_path, 'w', encoding='utf-8') as f:
    json.dump({"total_scanned": total_models, "working_count": len(working_models_strengths), "models": results}, f, indent=2)

print("\n" + "=" * 85)
print(f"📊 STRENGTH & CAPABILITY AUDIT SCAN COMPLETE!")
print(f"✅ Active Working Models Found: {len(working_models_strengths)} / {total_models}")
print(f"📄 Full Answers Text File saved to: nvidia_models_strengths.txt")
print(f"📁 Full JSON Audit saved to: nvidia_models_audit_report.json")
print("=" * 85 + "\n")
