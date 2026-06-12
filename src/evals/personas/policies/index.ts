export { hoarderPolicy } from "./hoarder.js";
export { pacifistPolicy } from "./pacifist.js";
export { speedrunnerPolicy } from "./speedrunner.js";
export { completionistPolicy } from "./completionist.js";
export { chaosPolicy } from "./chaos.js";

import { chaosPolicy } from "./chaos.js";
import { completionistPolicy } from "./completionist.js";
import { hoarderPolicy } from "./hoarder.js";
import { pacifistPolicy } from "./pacifist.js";
import { speedrunnerPolicy } from "./speedrunner.js";
import type { PersonaPolicy } from "../types.js";

export const personaPolicies = [
  hoarderPolicy,
  pacifistPolicy,
  speedrunnerPolicy,
  completionistPolicy,
  chaosPolicy,
] as const satisfies readonly PersonaPolicy[];
