import type { CoreAI } from '../ai/contracts.js';
import { growthUpdate, inferProviderLanguage, isBeginnerFriendlyQuestion, nextQuestion, suggestBranches, suggestPrune } from '../ai/provider.js';
import { dimensionsFor } from '../domain/maturity-dimensions.js';

// The only core module that knows the current AI implementation. Tests can
// replace this adapter while the domain operations keep their stable API.
export const coreAI: CoreAI = {
  nextQuestion, growthUpdate, suggestBranches, suggestPrune,
  dimensionsFor, inferProviderLanguage, isBeginnerFriendlyQuestion,
};
