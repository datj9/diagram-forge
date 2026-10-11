import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'test/golden.test.mjs'], { env: { ...process.env, UPDATE_GOLDEN: '1' }, stdio: 'inherit' });
process.exit(result.status ?? 1);
