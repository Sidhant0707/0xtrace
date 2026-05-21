export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type RouteParams<T = Record<string, string>> = Promise<T>;