export { cautiousPolicy } from "./cautious.js";
export { balancedPolicy } from "./balanced.js";
export { aggressivePolicy } from "./aggressive.js";

import { aggressivePolicy } from "./aggressive.js";
import { balancedPolicy } from "./balanced.js";
import { cautiousPolicy } from "./cautious.js";

export const botPolicies = [
  cautiousPolicy,
  balancedPolicy,
  aggressivePolicy,
] as const;
