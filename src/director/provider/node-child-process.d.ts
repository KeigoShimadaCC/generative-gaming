declare module "node:child_process" {
  export type ProviderReadablePipe = {
    setEncoding(encoding: "utf8"): void;
    on(event: "data", listener: (chunk: string) => void): void;
  };

  export type ProviderChildProcess = {
    readonly stdout: ProviderReadablePipe;
    readonly stderr: ProviderReadablePipe;
    on(event: "error", listener: (error: Error) => void): void;
    on(
      event: "close",
      listener: (code: number | null, signal: string | null) => void,
    ): void;
    kill(signal: "SIGTERM"): boolean;
  };

  export function spawn(
    command: string,
    args: readonly string[],
    options: { readonly stdio: readonly ["ignore", "pipe", "pipe"] },
  ): ProviderChildProcess;
}
