import { runMinimalCliInteraction } from './cli-interaction.js';
import { withLocalTimestamp } from '../shared/local-time.js';

runMinimalCliInteraction().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(withLocalTimestamp(`交互层启动失败：${message}`));
  process.exit(1);
});
