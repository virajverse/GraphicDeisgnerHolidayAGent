import { fileURLToPath } from 'url';
import path from 'path';

export default function fileDirName(metaUrl) {
  const __filename = fileURLToPath(metaUrl);
  const __dirname = path.dirname(__filename);
  return { __filename, __dirname };
}
