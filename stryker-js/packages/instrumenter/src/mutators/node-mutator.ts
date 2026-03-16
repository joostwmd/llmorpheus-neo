import type { types, NodePath } from '@babel/core';

export interface NodeMutator {
  mutate(fileName: string, path: NodePath): Iterable<types.Node>;
  readonly name: string;
}
