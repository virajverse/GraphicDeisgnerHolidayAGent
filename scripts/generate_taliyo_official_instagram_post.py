import os
import sys
import base64
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")
if not nvidia_key:
    print("❌ Missing NVIDIA API KEY in .env file")
    exit(1)

flux_url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"

headers = {
    "Authorization": f"Bearer {nvidia_key}",
    "Accept": "application/json",
}

# ==============================================================================
# 🎨 STEP 1: ART DIRECTOR 3D VISUAL BACKDROP PROMPT FOR TALIYO TECHNOLOGIES
# ==============================================================================
# Concept: A monolithic dark titanium silicon core prism with floating precision 
# frosted glass layers and subtle emerald & electric blue circuit traces.
# Real engineering aesthetics — zero cliché robot heads or floating brains.
# ==============================================================================

flux_prompt = (
    "Modern tech startup 3D graphic design centerpiece visual, "
    "floating monolithic isometric dark obsidian titanium silicon chip with glowing neon emerald (#00E676) and cyan blue (#00B0FF) circuit traces, "
    "frosted glassmorphism layers, dark deep space navy studio background (#080D14), "
    "completely clean empty negative space on top and bottom, "
    "no text, no letters, no words, no humanoid figures, zero typography, "
    "tack sharp edges, Octane 3D render, raytraced reflections, enterprise software engineering aesthetic, 8k resolution"
)

print("\n" + "="*80)
print("🚀 [TALIYO CREATIVE ENGINE] Generating 3D Engineering Visual via FLUX.2...")
print("="*80)

payload = {
    "prompt": flux_prompt,
    "width": 1024,
    "height": 1024,
    "seed": 2026,
    "steps": 4
}

res = requests.post(flux_url, headers=headers, json=payload, timeout=90)
if res.status_code != 200:
    print(f"❌ FLUX generation failed: {res.status_code} {res.text}")
    exit(1)

data = res.json()
if "artifacts" in data and len(data["artifacts"]) > 0:
    art = data["artifacts"][0]
    print(f"DEBUG finishReason: {art.get('finishReason')} | seed: {art.get('seed')}")
    b64_raw = art.get("base64", "")
elif "image" in data:
    b64_raw = data["image"]
    print(f"DEBUG found image key, b64 length = {len(b64_raw)}")
if b64_raw:
    if b64_raw.startswith("data:image"):
        b64_raw = b64_raw.split(",")[1]
    raw_3d_asset_path = "taliyo_raw_3d_asset.png"
    with open(raw_3d_asset_path, "wb") as f:
        f.write(base64.b64decode(b64_raw))
    print(f"✅ Generated 3D Core Visual Asset: {raw_3d_asset_path} ({os.path.getsize(raw_3d_asset_path)/1024:.1f} KB)")
else:
    print("❌ No base64 image data found in response!")
    exit(1)

# ==============================================================================
# 📐 STEP 2: 1080 × 1350 PX (4:5 PORTRAIT) INSTAGRAM COMPOSITION ENGINE
# ==============================================================================
print("\n" + "="*80)
print("📐 Assembling 1080 × 1350 px Instagram Post (Typography, Layout & Branding)...")
print("="*80)

CANVAS_W = 1080
CANVAS_H = 1350

# 1. Create Deep Titanium Canvas Background (#080D14)
canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (8, 13, 20, 255))

# 2. Place and blend the 3D Asset in the middle-lower region
raw_img = Image.open(raw_3d_asset_path).convert("RGBA")
raw_img_resized = raw_img.resize((1000, 1000), Image.Resampling.LANCZOS)

# Create soft radial mask for smooth edge bleeding
mask = Image.new("L", (1000, 1000), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.ellipse([40, 40, 960, 960], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(50))

# Paste 3D visual with breathing space
canvas.paste(raw_img_resized, (40, 320), mask)

# 3. Create Typography & Graphic Elements Overlay
overlay = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

def get_font(size, bold=False):
    font_names = ["segoeuib.ttf" if bold else "segoeui.ttf", "arialbd.ttf" if bold else "arial.ttf", "calibrib.ttf"]
    for f in font_names:
        try:
            return ImageFont.truetype(f, size)
        except:
            continue
    return ImageFont.load_default()

font_kicker = get_font(20, bold=True)
font_brand_title = get_font(26, bold=True)
font_hero = get_font(58, bold=True)
font_subhero = get_font(58, bold=True)
font_body = get_font(25, bold=False)
font_badge = get_font(21, bold=True)
font_tagline = get_font(22, bold=False)

# -----------------------------------------------------------------------------
# A. TOP NAVIGATION & BRAND SIGNATURE
# -----------------------------------------------------------------------------
# Subtle brand top pill
draw.rounded_rectangle([70, 70, 400, 118], radius=24, fill=(15, 24, 38, 200), outline=(0, 230, 118, 180), width=1)
# Emerald glowing dot
draw.ellipse([92, 89, 102, 99], fill=(0, 230, 118, 255))
draw.text((115, 94), "TALIYO TECHNOLOGIES", fill=(245, 247, 250, 255), font=font_kicker, anchor="lm")

# Right header tag
draw.text((CANVAS_W - 70, 94), "AI SYSTEMS & TOOLS", fill=(140, 160, 185, 200), font=get_font(18, bold=True), anchor="rm")

# Subtle header divider
draw.line([(70, 140), (CANVAS_W - 70, 140)], fill=(30, 45, 68, 120), width=1)

# -----------------------------------------------------------------------------
# B. HERO HEADLINE IN TOP SAFE MARGIN
# -----------------------------------------------------------------------------
draw.text((70, 195), "We don't just talk about the future.", fill=(255, 255, 255, 255), font=font_hero)
draw.text((70, 265), "We build it.", fill=(0, 230, 118, 255), font=font_subhero)

# Supporting paragraph
draw.text(
    (70, 345),
    "Autonomous AI agents, intelligent workflow automation,\nand next-generation developer platforms.",
    fill=(175, 190, 210, 230),
    font=font_body,
    spacing=10
)

# -----------------------------------------------------------------------------
# C. BOTTOM GLASSMORPHISM POSITIONING CARD
# -----------------------------------------------------------------------------
card_box = [70, CANVAS_H - 240, CANVAS_W - 70, CANVAS_H - 90]
draw.rounded_rectangle(card_box, radius=20, fill=(12, 20, 32, 235), outline=(0, 176, 255, 120), width=1)

# Inside Card Content
draw.text((105, CANVAS_H - 195), "OUR CORE POSITIONING", fill=(0, 176, 255, 240), font=get_font(17, bold=True))
draw.text((105, CANVAS_H - 150), "“Building the Products I Wish Already Existed.”", fill=(255, 255, 255, 255), font=get_font(27, bold=True))

# Arrow action icon on right of card
draw.rounded_rectangle([CANVAS_W - 170, CANVAS_H - 180, CANVAS_W - 105, CANVAS_H - 125], radius=14, fill=(0, 230, 118, 25), outline=(0, 230, 118, 180), width=1)
draw.text((CANVAS_W - 138, CANVAS_H - 153), "➔", fill=(0, 230, 118, 255), font=get_font(26, bold=True), anchor="mm")

# -----------------------------------------------------------------------------
# D. FOOTER BRAND SIGNATURE & SAFE MARGIN BORDER
# -----------------------------------------------------------------------------
draw.text((70, CANVAS_H - 50), "taliyo.com", fill=(130, 150, 175, 180), font=font_tagline)
draw.text((CANVAS_W - 70, CANVAS_H - 50), "SOFTWARE • AGENTS • AUTOMATION", fill=(100, 120, 145, 180), font=get_font(16, bold=True), anchor="ra")

# Subtle outer technical frame
draw.rectangle([30, 30, CANVAS_W - 30, CANVAS_H - 30], outline=(30, 45, 70, 70), width=1)
# Corner technical tick marks
tick_len = 15
draw.line([(30, 30), (30 + tick_len, 30)], fill=(0, 230, 118, 140), width=2)
draw.line([(30, 30), (30, 30 + tick_len)], fill=(0, 230, 118, 140), width=2)
draw.line([(CANVAS_W - 30, 30), (CANVAS_W - 30 - tick_len, 30)], fill=(0, 230, 118, 140), width=2)
draw.line([(CANVAS_W - 30, 30), (CANVAS_W - 30, 30 + tick_len)], fill=(0, 230, 118, 140), width=2)
draw.line([(30, CANVAS_H - 30), (30 + tick_len, CANVAS_H - 30)], fill=(0, 230, 118, 140), width=2)
draw.line([(30, CANVAS_H - 30), (30, CANVAS_H - 30 - tick_len)], fill=(0, 230, 118, 140), width=2)
draw.line([(CANVAS_W - 30, CANVAS_H - 30), (CANVAS_W - 30 - tick_len, CANVAS_H - 30)], fill=(0, 230, 118, 140), width=2)
draw.line([(CANVAS_W - 30, CANVAS_H - 30), (CANVAS_W - 30, CANVAS_H - 30 - tick_len)], fill=(0, 230, 118, 140), width=2)

# Composite final Instagram Post
final_post = Image.alpha_composite(canvas, overlay).convert("RGB")
final_output_path = "taliyo_technologies_official_instagram_post.png"
final_post.save(final_output_path, "PNG", quality=98)

file_kb = os.path.getsize(final_output_path) / 1024
print("\n" + "="*80)
print(f"🎉 PRODUCTION-READY INSTAGRAM POST CREATED: {final_output_path} ({file_kb:.1f} KB)")
print(f"📏 Dimensions: {CANVAS_W} × {CANVAS_H} px (4:5 Instagram Portrait Feed Format)")
print("="*80 + "\n")
