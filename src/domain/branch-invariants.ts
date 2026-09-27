import type { Branch } from '../domain.js';

/** Parent links must remain within one Seed and form an acyclic chain. */
export function assertBranchLineage(branch: Branch, siblings: Branch[]): void {
  if (!branch.parentBranchId) return;
  const byId = new Map(siblings.map((item) => [item.id, item]));
  byId.set(branch.id, branch);
  const visited = new Set<string>([branch.id]);
  let parentId: string | undefined = branch.parentBranchId;
  while (parentId) {
    if (visited.has(parentId)) throw new Error('branch-parent-cycle');
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent || parent.seedId !== branch.seedId) throw new Error('branch-parent-invalid');
    parentId = parent.parentBranchId;
  }
}
