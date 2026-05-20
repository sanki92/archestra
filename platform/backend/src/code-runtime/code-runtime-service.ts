import { connect, ReturnType as DaggerReturnType } from "@dagger.io/dagger";
import config from "@/config";
import logger from "@/logging";
import * as metrics from "@/observability/metrics";
import {
  CODE_RUNTIME_LIMITS,
  CodeRuntimeError,
  type RunCodeParams,
  type RunCodeResult,
} from "./types";

type RuntimeStatus =
  | "disabled"
  | "initializing"
  | "ready"
  | "error"
  | "stopped";
type CapturedRun = {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
};
type ValidatedRunParams = { code: string; requirements: string[] };

class CodeRuntimeBackstopError extends CodeRuntimeError {
  constructor(readonly pipeline: Promise<void>) {
    super("the code run exceeded its time budget");
  }
}

/**
 * Runs agent-provided Python scripts in throwaway Dagger containers.
 *
 * One container per call (stateless — nothing persists between calls). The
 * Dagger Engine caches the base image across calls; concurrency across
 * conversations is capped by a semaphore.
 */
class CodeRuntimeService {
  private status: RuntimeStatus = "disabled";
  private initPromise: Promise<void> | null = null;
  private lastInitAttemptAt = 0;
  private activeRuns = 0;
  private readonly waiters: Array<() => void> = [];

  /** whether the runtime is configured on (independent of engine health). */
  get isEnabled(): boolean {
    return config.codeRuntime.enabled;
  }

  /** whether the engine is reachable and the base image is pre-warmed. */
  get isReady(): boolean {
    return this.status === "ready";
  }

  /**
   * Connects to the Dagger Engine and pre-pulls the base image so the first
   * real run is fast. Idempotent and safe to call from any process — the first
   * call does the work, later calls await it. Never throws.
   */
  init(): Promise<void> {
    if (!config.codeRuntime.enabled) {
      this.status = "disabled";
      return Promise.resolve();
    }

    if (this.status === "ready" || this.status === "stopped") {
      return Promise.resolve();
    }

    if (this.initPromise) return this.initPromise;

    const now = Date.now();
    if (
      this.status === "error" &&
      now - this.lastInitAttemptAt < INIT_RETRY_COOLDOWN_MS
    ) {
      return Promise.resolve();
    }

    this.initPromise = this.doInit().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  /**
   * Executes a Python script and returns its output. Throws
   * {@link CodeRuntimeError} when the run cannot be performed; a non-zero
   * script exit is a normal result.
   */
  async run(params: RunCodeParams): Promise<RunCodeResult> {
    if (!config.codeRuntime.enabled) {
      throw new CodeRuntimeError("the code runtime is not enabled");
    }
    const runParams = validateRunParams(params);
    // lazily initialize so scheduled-agent runs in worker processes work too.
    await this.init();
    if (this.status === "stopped") {
      throw new CodeRuntimeError("the code runtime is stopped");
    }
    if (this.status !== "ready") {
      throw new CodeRuntimeError(
        "the code runtime is not available (engine unreachable)",
      );
    }

    const timeoutSeconds = this.resolveTimeout(params.timeoutSeconds);
    const startedAt = Date.now();
    let acquired = false;
    let releaseWhenSettled: Promise<void> | null = null;
    try {
      await this.acquire();
      acquired = true;
      const result = await this.execute(runParams, timeoutSeconds, startedAt);
      metrics.codeRuntime.reportRun(
        result.timedOut
          ? "timeout"
          : result.exitCode === 0
            ? "ok"
            : "script_error",
        result.durationMs / 1000,
      );
      return result;
    } catch (error) {
      if (error instanceof CodeRuntimeBackstopError) {
        releaseWhenSettled = error.pipeline;
      }
      metrics.codeRuntime.reportRun(
        "runtime_error",
        (Date.now() - startedAt) / 1000,
      );
      throw error;
    } finally {
      if (acquired) {
        if (releaseWhenSettled) {
          void releaseWhenSettled
            .catch((error) => {
              logger.error(
                { err: error },
                "[CodeRuntime] Dagger pipeline failed after backstop timeout",
              );
            })
            .finally(() => {
              this.release();
            });
        } else {
          this.release();
        }
      }
    }
  }

  /** stops accepting new runs. connect-per-run leaves nothing long-lived to close. */
  async shutdown(): Promise<void> {
    if (this.status === "ready") {
      this.status = "stopped";
    }
  }

  // === private ===

  private async doInit(): Promise<void> {
    if (!config.codeRuntime.enabled) {
      this.status = "disabled";
      return;
    }

    this.applyDaggerEnv();
    this.lastInitAttemptAt = Date.now();
    this.status = "initializing";
    try {
      await connect(async (client) => {
        await client.container().from(config.codeRuntime.image).sync();
      });
      this.status = "ready";
      logger.info(
        { image: config.codeRuntime.image },
        "[CodeRuntime] ready — base image pre-warmed",
      );
    } catch (error) {
      this.status = "error";
      logger.error(
        { err: error },
        "[CodeRuntime] failed to initialize — code execution unavailable",
      );
    }
  }

  private async execute(
    params: ValidatedRunParams,
    timeoutSeconds: number,
    startedAt: number,
  ): Promise<RunCodeResult> {
    // the connect() callback can only return void, so the captured output is
    // flowed out through a promise rather than a closure-mutated variable.
    let resolveRun!: (value: CapturedRun) => void;
    const runResult = new Promise<CapturedRun>((resolve) => {
      resolveRun = resolve;
    });

    const pipeline = connect(async (client) => {
      const container = client
        .container()
        .from(config.codeRuntime.image)
        .withWorkdir(WORKDIR)
        .withUser(NON_ROOT_USER)
        .withEnvVariable("HOME", WORKDIR)
        .withEnvVariable("UV_CACHE_DIR", `${WORKDIR}/uv-cache`)
        .withNewFile(`${WORKDIR}/${SCRIPT_FILE}`, params.code)
        .withNewFile(`${WORKDIR}/${RUNNER_FILE}`, RUNNER_SCRIPT)
        .withExec(buildRunnerArgs(params.requirements, timeoutSeconds), {
          expect: DaggerReturnType.Any,
        });
      const [stdout, stderr, exitCodeText, stdoutTruncated, stderrTruncated] =
        await Promise.all([
          container.file(STDOUT_FILE).contents(),
          container.file(STDERR_FILE).contents(),
          container.file(EXIT_CODE_FILE).contents(),
          container.file(STDOUT_TRUNCATED_FILE).contents(),
          container.file(STDERR_TRUNCATED_FILE).contents(),
        ]);
      const exitCode = Number.parseInt(exitCodeText.trim(), 10);
      if (Number.isNaN(exitCode)) {
        throw new CodeRuntimeError(
          "the code runtime returned an invalid exit code",
        );
      }
      resolveRun({
        stdout,
        stderr,
        exitCode,
        truncated:
          stdoutTruncated.trim() === "1" || stderrTruncated.trim() === "1",
      });
    });

    // the in-container `timeout` should always fire first; this backstop only
    // catches a hung engine/session so the agent is never blocked indefinitely.
    const backstopMs = (timeoutSeconds + BACKSTOP_BUFFER_SECONDS) * 1000;
    if ((await raceWithTimeout(pipeline, backstopMs)) === "timeout") {
      this.status = "error";
      throw new CodeRuntimeBackstopError(pipeline);
    }

    // pipeline settled without timing out → the callback resolved runResult.
    const run = await runResult;
    return {
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.exitCode,
      durationMs: Date.now() - startedAt,
      timedOut: TIMEOUT_EXIT_CODES.has(run.exitCode),
      truncated: run.truncated,
    };
  }

  /**
   * Points the Dagger SDK at a pre-deployed engine and a baked-in CLI so it
   * never tries to provision its own or download the CLI at runtime.
   */
  private applyDaggerEnv(): void {
    const { daggerEngineHost, daggerCliBin } = config.codeRuntime;
    if (daggerEngineHost && !process.env._EXPERIMENTAL_DAGGER_RUNNER_HOST) {
      process.env._EXPERIMENTAL_DAGGER_RUNNER_HOST = daggerEngineHost;
    }
    if (daggerCliBin && !process.env._EXPERIMENTAL_DAGGER_CLI_BIN) {
      process.env._EXPERIMENTAL_DAGGER_CLI_BIN = daggerCliBin;
    }
  }

  private resolveTimeout(requested: number | undefined): number {
    const max = config.codeRuntime.timeoutSeconds;
    if (!requested || requested <= 0) return max;
    return Math.min(requested, max);
  }

  private async acquire(): Promise<void> {
    if (this.activeRuns < config.codeRuntime.maxConcurrent) {
      this.activeRuns++;
      return;
    }
    // cap the queue so a wedged engine cannot pile up unbounded waiters.
    if (this.waiters.length >= CODE_RUNTIME_LIMITS.maxQueueLength) {
      throw new CodeRuntimeError(
        "the code runtime is at capacity — too many runs are already queued",
      );
    }
    // wait for a slot; release() hands one over without decrementing.
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.activeRuns--;
    }
  }
}

export const codeRuntimeService = new CodeRuntimeService();

// === internal helpers ===

/** scripts run from /tmp — world-writable, so the non-root image user can write there. */
const WORKDIR = "/tmp";
const SCRIPT_FILE = "main.py";
const RUNNER_FILE = "runner.sh";
const STDOUT_FILE = `${WORKDIR}/stdout.txt`;
const STDERR_FILE = `${WORKDIR}/stderr.txt`;
const EXIT_CODE_FILE = `${WORKDIR}/exit-code.txt`;
const STDOUT_TRUNCATED_FILE = `${WORKDIR}/stdout-truncated.txt`;
const STDERR_TRUNCATED_FILE = `${WORKDIR}/stderr-truncated.txt`;
const NON_ROOT_USER = "1000:1000";
/** extra time beyond the script's own timeout before the hung-run backstop fires. */
const BACKSTOP_BUFFER_SECONDS = 60;
const INIT_RETRY_COOLDOWN_MS = 10_000;
/** exit codes coreutils/busybox `timeout` reports when it kills the script. */
const TIMEOUT_EXIT_CODES = new Set([124, 137]);

const RUNNER_SCRIPT = `#!/bin/sh
set -u

timeout_seconds="$1"
max_output_bytes="$2"
shift 2

stdout_raw="${WORKDIR}/stdout.raw"
stderr_raw="${WORKDIR}/stderr.raw"

timeout -s KILL "$timeout_seconds" uv run "$@" python3 "${SCRIPT_FILE}" > "$stdout_raw" 2> "$stderr_raw"
exit_code=$?

head -c "$max_output_bytes" "$stdout_raw" > "${STDOUT_FILE}"
head -c "$max_output_bytes" "$stderr_raw" > "${STDERR_FILE}"

stdout_bytes=$(wc -c < "$stdout_raw")
stderr_bytes=$(wc -c < "$stderr_raw")

if [ "$stdout_bytes" -gt "$max_output_bytes" ]; then
  printf 1 > "${STDOUT_TRUNCATED_FILE}"
else
  printf 0 > "${STDOUT_TRUNCATED_FILE}"
fi

if [ "$stderr_bytes" -gt "$max_output_bytes" ]; then
  printf 1 > "${STDERR_TRUNCATED_FILE}"
else
  printf 0 > "${STDERR_TRUNCATED_FILE}"
fi

printf "%s" "$exit_code" > "${EXIT_CODE_FILE}"
exit 0
`;

function validateRunParams(params: RunCodeParams): ValidatedRunParams {
  const codeBytes = Buffer.byteLength(params.code, "utf8");
  if (codeBytes > CODE_RUNTIME_LIMITS.maxCodeBytes) {
    throw new CodeRuntimeError(
      `code is too large (${formatBytes(codeBytes)} > ${formatBytes(CODE_RUNTIME_LIMITS.maxCodeBytes)})`,
    );
  }

  return {
    code: params.code,
    requirements: normalizeRequirements(params.requirements),
  };
}

function normalizeRequirements(requirements: string[] | undefined): string[] {
  if (!requirements) return [];
  if (requirements.length > CODE_RUNTIME_LIMITS.maxRequirements) {
    throw new CodeRuntimeError(
      `too many requirements (${requirements.length} > ${CODE_RUNTIME_LIMITS.maxRequirements})`,
    );
  }

  return requirements.map((requirement, index) => {
    const normalized = requirement.trim();
    const bytes = Buffer.byteLength(normalized, "utf8");
    if (!normalized) {
      throw new CodeRuntimeError(`requirement ${index + 1} is empty`);
    }
    if (bytes > CODE_RUNTIME_LIMITS.maxRequirementBytes) {
      throw new CodeRuntimeError(
        `requirement ${index + 1} is too large (${formatBytes(bytes)} > ${formatBytes(CODE_RUNTIME_LIMITS.maxRequirementBytes)})`,
      );
    }
    if (/[\r\n\0]/.test(normalized)) {
      throw new CodeRuntimeError(
        `requirement ${index + 1} must be a single line`,
      );
    }
    return normalized;
  });
}

function buildRunnerArgs(
  requirements: string[],
  timeoutSeconds: number,
): string[] {
  return [
    "sh",
    `${WORKDIR}/${RUNNER_FILE}`,
    String(timeoutSeconds),
    String(config.codeRuntime.maxOutputBytes),
    ...requirements.flatMap((requirement) => ["--with", requirement]),
  ];
}

function formatBytes(bytes: number): string {
  return `${bytes} bytes`;
}

async function raceWithTimeout(
  work: Promise<void>,
  ms: number,
): Promise<"done" | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  try {
    return await Promise.race([work.then(() => "done" as const), timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
