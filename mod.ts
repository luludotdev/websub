/**
 * [WebSub](https://www.w3.org/TR/websub/) subscriber server for TypeScript.
 *
 * @example
 * ```ts
 * import { WebSub } from "@lulu/websub";
 * import { encodeHex } from "@std/encoding/hex";
 *
 * // generate a cryptographically secure secret
 * const bytes = crypto.getRandomValues(new Uint8Array(16));
 * const websub = new WebSub({
 *  // this URL must be publicly reachable and correspond to the server handler below
 *  publicUrl: "https://example.com",
 *  secret: encodeHex(bytes),
 * });
 *
 * Deno.serve({
 *  onListen: () => {
 *    // subscribe to a topic once the server starts
 *    websub.subscribe("..");
 *  },
 * }, (req) => websub.handler(req));
 * ```
 *
 * @module
 */

export * from "./events.ts";
export * from "./server.ts";
