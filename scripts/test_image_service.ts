import { generateDesignerPosterImage } from '../src/services/fluxImageEngine.js';

async function testImageService() {
  console.log('Testing generateDesignerPosterImage...');
  const res = await generateDesignerPosterImage('Traditional Indian Brass Diya with glowing flame on dark marble');
  console.log('Result:', res);
}

testImageService();
