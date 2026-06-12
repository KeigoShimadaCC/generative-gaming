declare module "node:fs" {
  export function writeFileSync(
    path: string | URL,
    data: string,
    encoding?: "utf8",
  ): void;
}
