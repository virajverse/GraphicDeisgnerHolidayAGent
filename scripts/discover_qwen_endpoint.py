import os
import sys
import requests
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()
nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")

headers = {
    "Authorization": f"Bearer {nvidia_key}",
    "Accept": "application/json",
}

candidates = [
    "https://ai.api.nvidia.com/v1/genai/qwen/qwen-image-edit",
    "https://ai.api.nvidia.com/v1/genai/qwen/qwen-image-edit-2509",
    "https://ai.api.nvidia.com/v1/genai/qwen/qwen-image-edit-2511",
    "https://ai.api.nvidia.com/v1/genai/alibaba/qwen-image-edit",
    "https://integrate.api.nvidia.com/v1/genai/qwen/qwen-image-edit",
    "https://ai.api.nvidia.com/v1/cv/qwen/qwen-image-edit",
    "https://ai.api.nvidia.com/v1/image/qwen/qwen-image-edit"
]

for url in candidates:
    try:
        r = requests.post(url, headers=headers, json={"prompt": "test"}, timeout=5)
        print(f"URL: {url} -> Status: {r.status_code}")
    except Exception as e:
        print(f"URL: {url} -> Error: {e}")
