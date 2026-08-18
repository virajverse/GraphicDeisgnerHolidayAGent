import fs from 'fs';
import path from 'path';

const targetDir = 'public/assets/renders';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const copyMap: Record<string, string> = {
  'flux_benchmark_assets/01_3D_Festive_Cultural_01.png': 'festive_diya.png',
  'flux_benchmark_assets/05_Food_Beverage_Macro_21.png': 'coffee_macro.png',
  'flux_benchmark_assets/06_Luxury_Jewelry_Metals_26.png': 'luxury_jewelry.png',
  'flux_benchmark_assets/03_Tech_SaaS_Cyber_11.png': 'tech_saas.png',
  'flux_benchmark_assets/02_D2C_Product_Podiums_06.png': 'marble_podium.png',
  'flux_benchmark_assets/07_Botanical_Nature_31.png': 'botanical_nature.png',
  'agent_generated_coffee_bean.png': 'coffee_bean_hero.png',
  'agent_generated_real_estate_podium.png': 'real_estate_hero.png',
  'finished_instagram_post_diwali.png': 'finished_instagram_post_diwali.png'
};

for (const [src, destName] of Object.entries(copyMap)) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(targetDir, destName));
    console.log(`✅ Copied ${src} -> ${path.join(targetDir, destName)}`);
  }
}
