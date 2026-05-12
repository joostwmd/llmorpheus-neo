
/** Query context; used during matching to resolve context-dependent paths. */
export interface QueryContext {
  [index: string]: string
}

/** Queryable interface for a single policy document. */
export interface Queryable {
  /** Check whether an action is allowed on a path.
    * @param path Path to be acted on.
    * @param verb Action to be performed.
    * @param ctx Query context for resolving context-dependent paths.
    * @returns Returns `true` if the action is explicitly allowed,
    *          `false` if the action is explicitly denied, or
    *          `null` if the combination of path and action
    *          is not governed by this policy. */
  query: (path: string, verb: string, ctx?: QueryContext) => boolean | null
}

/** Queryable interface for a collection of policy documents. */
export interface QueryableMap {
  /** Check whether an action is allowed on a path.
    * @param policy Policy to be queried.
    * @param path Path to be acted on.
    * @param verb Action to be performed.
    * @param ctx Query context for resolving context-dependent paths.
    * @returns Returns `true` if the action is explicitly allowed,
    *          `false` if the action is explicitly denied, or
    *          `null` if the combination of policy, path and
    *          action is not governed by this collection. */
  query: (policy: string, path: string, verb: string, ctx?: QueryContext) => boolean | null
}
