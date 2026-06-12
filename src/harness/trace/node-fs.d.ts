declare module "node:fs" {
  export function mkdirSync(
    path: string,
    options: { readonly recursive: true },
  ): void;

  export function writeFileSync(
    path: string,
    data: string,
    options: { readonly encoding: "utf8"; readonly flag: "wx" },
  ): void;

  export function appendFileSync(
    path: string,
    data: string,
    options: { readonly encoding: "utf8" },
  ): void;
}
