/* Allows importing the ESM next.config.mjs from tests (vitest resolves it at
 * runtime; this only satisfies tsc). */
declare module "*.mjs" {
  const value: any;
  export default value;
  export const SECURITY_HEADERS: { key: string; value: string }[];
}
