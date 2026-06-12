import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { generatePersonaBankFixtures } from "./bank.js";

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(resolve(entry)).href;
};

const main = (): void => {
  const fixtures = generatePersonaBankFixtures();
  for (const fixture of fixtures) {
    process.stdout.write(`${fixture.relativePath}\n`);
  }
};

if (isMainModule()) {
  main();
}
