// Node test runner — imports every suite sequentially. Each suite throws on
// failure (helpers.report), so a failing import rejects here and Node exits
// with a non-zero code.

const suites = [
  './taskModel.test',
  './jsonExtract.test',
  './chatClean.test',
  './orchestrationModel.test',
  './promptModel.test',
  './documentSchema.test',
  './profileModel.test',
  './longDocument.test',
  './apiHub.test',
  './voice-text.test',
  './voiceKeys.test',
  './promptArchitect.test',
];

let failed = 0;

async function main(): Promise<void> {
  for (const suite of suites) {
    try {
      const mod = await import(suite);
      if (typeof (mod as { runSuite?: unknown }).runSuite === 'function') {
        await (mod as { runSuite: () => Promise<void> }).runSuite();
      }
    } catch (err) {
      failed += 1;
      console.error((err as Error)?.stack ?? String(err));
    }
  }

  if (failed > 0) {
    throw new Error(`${failed} test suite(s) failed`);
  }
  console.log('ALL TEST SUITES PASSED');
}

main().catch((err) => {
  if (failed > 0) {
    const diff = (err as Error)?.message ?? String(err);
    console.error(`runner finished: ${diff}`);
  } else {
    console.error((err as Error)?.stack ?? String(err));
  }
  // Rethrowing keeps the process exit code non-zero (Node >= 15 default).
  throw err;
});