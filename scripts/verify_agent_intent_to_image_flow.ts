import { runUnifiedGraphicDesignerAgent } from '../src/services/autonomousDesignerAgent.js';

async function verifyIntentToImageFlow() {
  console.log('=' .repeat(80));
  console.log('🧪 TESTING AGENT PERCEPTION -> PROMPT CRAFTING -> FLUX 3D RENDER FLOW');
  console.log('=' .repeat(80));

  const testPrompts = [
    'Coffee brand ke liye 3d roasted coffee bean render banao',
    'Real estate luxury flat ke liye 3d podium visual asset do'
  ];

  for (const prompt of testPrompts) {
    console.log(`\n💬 USER INPUT: "${prompt}"`);
    const t0 = Date.now();
    const result = await runUnifiedGraphicDesignerAgent(prompt, {
      id: 'test_designer',
      name: 'Viraj',
      telegram_chat_id: '1634951702',
      is_approved: 1,
      role: 'SUPER_ADMIN'
    });
    const dur = Date.now() - t0;

    console.log(`⚡ ACTION TYPE: ${result.actionType}`);
    console.log(`⏱️ DURATION: ${dur}ms`);
    console.log(`🧠 THOUGHT TRACE (${result.thoughtTrace.length} steps):`);
    result.thoughtTrace.forEach(t => {
      console.log(`   [Step ${t.stepNumber}] ${t.actionName} (${t.durationMs}ms) -> ${t.thought}`);
    });
    console.log(`🖼️ IMAGE GENERATED: ${result.imageBuffer ? `YES (${result.imageBuffer.length} bytes, Seed: ${result.imageSeed})` : 'NO'}`);
    console.log(`📝 DELIVERABLE PREVIEW:\n${result.deliverable.slice(0, 250)}...\n`);
  }
}

verifyIntentToImageFlow();
