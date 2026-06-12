declare module "node:readline" {
  export interface Interface {
    close(): void;
  }

  export function createInterface(options: unknown): Interface;
}

declare module "node:url" {
  export function pathToFileURL(path: string): { readonly href: string };
}

declare module "node:path" {
  export function resolve(...paths: string[]): string;
}

declare const process: {
  readonly argv: readonly string[];
  readonly stdin: {
    readonly isTTY: boolean;
    setRawMode(mode: boolean): void;
    resume(): void;
    pause(): void;
    setEncoding(encoding: string): void;
    on(event: "data", listener: (chunk: string) => void): void;
    off(event: "data", listener: (chunk: string) => void): void;
  };
  readonly stdout: {
    write(chunk: string): void;
  };
  readonly stderr: {
    write(chunk: string): void;
  };
  exitCode: number;
  once(event: "SIGINT", listener: () => void): void;
  off(event: "SIGINT", listener: () => void): void;
};
