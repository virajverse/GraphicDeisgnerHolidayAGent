import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';

const nvidiaKey = process.env.NVIDIA_API_KEY;

async function listAllNvidiaModels() {
  console.log('================================================================');
  console.log('🌐 FETCHING COMPLETE LIST OF ALL MODELS ON NVIDIA CLOUD...');
  console.log('================================================================\n');

  if (!nvidiaKey) {
    console.error('❌ NVIDIA_API_KEY missing in .env!');
    process.exit(1);
  }

  try {
    const openai = new OpenAI({
      apiKey: nvidiaKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
      timeout: 15000
    });

    const modelsList = await openai.models.list();
    const allModels = modelsList.data.map(m => m.id).sort();

    console.log(`🎉 TOTAL MODELS AVAILABLE ON NVIDIA CLOUD: ${allModels.length} Models\n`);
    console.log('--- COMPLETE UNFILTERED MODEL LIST ---');

    allModels.forEach((modelId, idx) => {
      const num = (idx + 1).toString().padStart(3, ' ');
      console.log(`${num}. ${modelId}`);
    });

    console.log('\n================================================================');

  } catch (err) {
    console.error('❌ Error fetching NVIDIA model list:', err.message);
  }
}

listAllNvidiaModels();
