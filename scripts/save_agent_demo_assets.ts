import fs from 'fs';
import { runUnifiedGraphicDesignerAgent } from '../src/services/autonomousDesignerAgent.js';

async function generateAndSaveDemoAssets() {
  console.log('Generating and saving live demo assets...');

  const p1 = 'Coffee brand ke liye 3d roasted coffee bean render banao';
  const res1 = await runUnifiedGraphicDesignerAgent(p1);
  if (res1.imageBuffer) {
    fs.writeFileSync('agent_generated_coffee_bean.png', res1.imageBuffer);
    console.log('✅ Saved agent_generated_coffee_bean.png');
  }

  const p2 = 'Real estate luxury flat ke liye 3d podium visual asset do';
  const res2 = await runUnifiedGraphicDesignerAgent(p2);
  if (res2.imageBuffer) {
    fs.writeFileSync('agent_generated_real_estate_podium.png', res2.imageBuffer);
    console.log('✅ Saved agent_generated_real_estate_podium.png');
  }
}

generateAndSaveDemoAssets();
