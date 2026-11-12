import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Start the production preview command, retaining its actual Compute child. */
export async function startMixedPreview(t, { root, env }) {
  const output = [];
  const child = spawn(process.execPath, [resolve(root, 'scripts/preview.mjs'), '--host', '127.0.0.1', '--port', '0'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => output.push(chunk));
  }
  const outputText = () => output.join('');
  const exited = once(child, 'exit').then(([code, signal]) => ({ code, signal }));
  let stopping;
  const stop = () => stopping ??= (async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const stopped = await Promise.race([exited, delay(2_000, undefined, { ref: false }).then(() => null)]);
    if (!stopped) {
      child.kill('SIGKILL');
      await exited;
    }
  })();
  t.after(stop);

  try {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const ready = /Mixed Astro preview ready at http:\/\/127\.0\.0\.1:(\d+)/u.exec(outputText());
      if (ready) return { origin: `http://127.0.0.1:${ready[1]}`, output: outputText, stop };
      const exit = await Promise.race([exited, delay(25).then(() => null)]);
      if (exit) throw new Error(`Preview exited before becoming ready (${exit.code ?? exit.signal}).\n${outputText()}`);
    }
    throw new Error(`Preview did not become ready within 12 seconds.\n${outputText()}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
