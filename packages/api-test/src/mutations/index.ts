import type { MutationCategory, MutationModule } from '../types.js';
import { authMutations } from './auth.js';
import { bodyMutations } from './body.js';
import { edgeMutations } from './edge.js';
import { headersMutations } from './headers.js';
import { methodMutations } from './method.js';
import { paramsMutations } from './params.js';

export const mutationRegistry: Record<MutationCategory, MutationModule> = {
  auth: authMutations,
  body: bodyMutations,
  params: paramsMutations,
  headers: headersMutations,
  edge: edgeMutations,
  method: methodMutations,
};

export function getMutationModules(categories: MutationCategory[]): MutationModule[] {
  return categories.map(c => mutationRegistry[c]).filter(Boolean);
}
