import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

interface CommandExecutionError extends Error {
  code?: string | number;
  stdout?: string;
  stderr?: string;
}

export interface RunExternalCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  allowExitCodes?: number[];
}

export interface RunExternalCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export async function runExternalCommand(
  command: string,
  args: string[],
  options: RunExternalCommandOptions = {},
): Promise<RunExternalCommandResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBufferBytes = options.maxBufferBytes ?? 1024 * 1024;

  try {
    const result = await execFile(command, args, {
      cwd: options.cwd,
      timeout: timeoutMs,
      maxBuffer: maxBufferBytes,
      encoding: 'utf8',
    });

    return {
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      exitCode: 0,
    };
  } catch (error) {
    const commandError = error as CommandExecutionError;
    if (commandError.code === 'ENOENT') {
      throw new Error(`Required external command is not available: ${command}`);
    }

    const numericExitCode = typeof commandError.code === 'number'
      ? commandError.code
      : undefined;

    if (
      typeof numericExitCode === 'number'
      && options.allowExitCodes?.includes(numericExitCode)
    ) {
      return {
        stdout: typeof commandError.stdout === 'string' ? commandError.stdout : '',
        stderr: typeof commandError.stderr === 'string' ? commandError.stderr : '',
        exitCode: numericExitCode,
      };
    }

    const stderr = typeof commandError.stderr === 'string' ? commandError.stderr : '';
    const stdout = typeof commandError.stdout === 'string' ? commandError.stdout : '';
    const detail = compact(stderr || stdout || commandError.message || 'unknown failure', 200);
    throw new Error(`External command failed (${command}): ${detail}`);
  }
}
