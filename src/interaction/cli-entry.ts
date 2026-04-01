import { runMinimalCliInteraction } from './cli-interaction.js';

runMinimalCliInteraction().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[interaction] failed: ${message}`);
  process.exit(1);
});

