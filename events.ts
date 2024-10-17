/**
 * This module contains events emitted by the {@link WebSub} class.
 *
 * @module
 */

// used for documentation links
// deno-lint-ignore no-unused-vars
import type { WebSub } from "./server.ts";

/**
 * Event emitted by the {@link WebSub} class when a subscribe request is accepted.
 */
export class SubscribeEvent extends Event {
  /** WebSub Hub URL. */
  public readonly hub: string;

  /** Topic URL. */
  public readonly topic: string;

  /** Subscription lease in seconds. */
  public readonly lease: number;

  public constructor(
    hub: string,
    topic: string,
    lease: number,
    eventInitDict?: EventInit,
  ) {
    super("subscribe", eventInitDict);
    this.hub = hub;
    this.topic = topic;
    this.lease = lease;
  }
}

/**
 * Event emitted by the {@link WebSub} class when an unsubscribe request is accepted.
 */
export class UnsubscribeEvent extends Event {
  /** WebSub Hub URL. */
  public readonly hub: string;

  /** Topic URL. */
  public readonly topic: string;

  public constructor(
    hub: string,
    topic: string,
    eventInitDict?: EventInit,
  ) {
    super("unsubscribe", eventInitDict);
    this.hub = hub;
    this.topic = topic;
  }
}

/**
 * Event emitted by the {@link WebSub} class when a subscribe request is denied.
 */
export class DeniedEvent extends Event {
  /** WebSub Hub URL. */
  public readonly hub: string;

  /** Topic URL. */
  public readonly topic: string;

  public constructor(
    hub: string,
    topic: string,
    eventInitDict?: EventInit,
  ) {
    super("denied", eventInitDict);
    this.hub = hub;
    this.topic = topic;
  }
}

/**
 * Event emitted by the {@link WebSub} class when a new notification payload is delivered.
 */
export class FeedEvent extends Event {
  /** WebSub Hub URL */
  public readonly hub: string;

  /** Topic URL */
  public readonly topic: string;

  /** Feed body bytes. */
  public readonly body: ArrayBuffer;

  public constructor(
    hub: string,
    topic: string,
    body: ArrayBuffer,
    eventInitDict?: EventInit,
  ) {
    super("feed", eventInitDict);
    this.hub = hub;
    this.topic = topic;
    this.body = body;
  }
}
