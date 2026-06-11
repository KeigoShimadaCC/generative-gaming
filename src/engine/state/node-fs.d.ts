declare module "node:fs" {
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
  }

  export function readdirSync(
    path: URL | string,
    options: { readonly withFileTypes: true },
  ): Dirent[];

  export function readFileSync(path: URL | string, encoding: "utf8"): string;
}
