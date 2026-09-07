// Minimal Node-safe test harness (no jest / vitest dependency).
// NOTE: Node caches CommonJS modules, so shared module-level state would leak
// across suites. Each suite therefore creates its OWN harness via makeSuite().
//
// Each suite module exports `runSuite` (the report function). The runner
// imports it inside an async function and awaits it, so async tests are fully
// awaited before failures are reported.

export interface Suite {
  test(name: string, fn: () => void | Promise<void>): void;
  report(): Promise<void>;
}

export function makeSuite(suiteName: string): Suite {
  const failures: string[] = [];
  let completed = 0;
  const pending: Promise<void>[] = [];

  return {
    test(name: string, fn: () => void | Promise<void>): void {
      completed += 1;
      const p = Promise.resolve()
        .then(fn)
        .catch((err) => {
          failures.push(`${name}: ${(err as Error)?.message ?? String(err)}`);
        });
      pending.push(p);
    },
    async report(): Promise<void> {
      await Promise.all(pending);
      if (failures.length === 0) {
        console.log(`PASS ${suiteName} (${completed} checks)`);
        return;
      }
      throw new Error(`FAIL ${suiteName}\n  - ${failures.join('\n  - ')}`);
    },
  };
}

export function assert(cond: unknown, msg = ''): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

export function assertEqual<T>(actual: T, expected: T, msg = ''): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(
      `assertion failed: ${msg} — expected ${b}, got ${a}`,
    );
  }
}

export function assertThrows(fn: () => unknown, msg = ''): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(`assertion failed: ${msg} (expected a throw)`);
}