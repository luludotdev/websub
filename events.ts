export class SubscribeEvent extends Event {
  public constructor(
    public readonly hub: string,
    public readonly topic: string,
    public readonly lease: number,
    eventInitDict?: EventInit,
  ) {
    super("subscribe", eventInitDict);
  }
}

export class UnsubscribeEvent extends Event {
  public constructor(
    public readonly hub: string,
    public readonly topic: string,
    eventInitDict?: EventInit,
  ) {
    super("unsubscribe", eventInitDict);
  }
}

export class DeniedEvent extends Event {
  public constructor(
    public readonly hub: string,
    public readonly topic: string,
    eventInitDict?: EventInit,
  ) {
    super("denied", eventInitDict);
  }
}

export class FeedEvent extends Event {
  public constructor(
    public readonly hub: string,
    public readonly topic: string,
    public readonly body: ArrayBuffer,
    eventInitDict?: EventInit,
  ) {
    super("feed", eventInitDict);
  }
}
