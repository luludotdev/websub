import { TypedEventTarget } from "@derzade/typescript-event-target";
import { HTTPHeaderLink } from "@hugoalh/http-header-link";
import { encodeHex } from "@std/encoding/hex";
import { STATUS_CODE } from "@std/http/status";
import { cryptoKey } from "./crypto.ts";
import {
  DeniedEvent,
  FeedEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "./events.ts";

export type WebSubOptions = { publicUrl: string | URL; secret: string };

type WebSubEvents = {
  subscribe: SubscribeEvent;
  unsubscribe: UnsubscribeEvent;
  denied: DeniedEvent;
  feed: FeedEvent;
};

export class WebSub extends TypedEventTarget<WebSubEvents> {
  #publicUrl: URL;
  #secret: string;

  #pending = new Set<string>();
  #active = new Set<string>();

  public constructor(options: WebSubOptions) {
    super();

    this.#publicUrl = new URL(options.publicUrl);
    this.#secret = options.secret;
  }

  public async subscribe(
    url: string,
    options: { lease?: number; force?: boolean } = {},
  ): Promise<void> {
    const { hub, topic: _topic } = await this.#discover(url);
    const topic = options.force ? url : _topic;

    this.#pending.add(topic);
    await this.#renameme({
      mode: "subscribe",
      hub,
      topic,
      lease: options.lease,
    });
  }

  public async unsubscribe(
    url: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const { hub, topic: _topic } = await this.#discover(url);
    const topic = options.force ? url : _topic;

    this.#pending.delete(topic);
    await this.#renameme({
      mode: "unsubscribe",
      hub,
      topic,
    });
  }

  async #discover(url: string): Promise<{ hub: string; topic: string }> {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`failed to discover "${url}": ${resp.status}`);
    }

    const linkHeader = resp.headers.get("link");
    if (linkHeader) {
      const link = HTTPHeaderLink.parse(linkHeader);
      if (!link.hasParameter("rel", "hub")) {
        throw new Error("invalid link header");
      }

      const [[hub]] = link.getByRel("hub");
      const [self] = link.getByRel("self");
      const topic = self?.[0] ?? url;

      return { hub, topic };
    }

    // TODO: other discovery methods
    throw new Error("not implemented");
  }

  async #renameme({
    mode,
    hub,
    topic,
    lease,
  }: {
    mode: "subscribe" | "unsubscribe";
    hub: string;
    topic: string;
    lease?: number;
  }) {
    const callback = new URL(this.#publicUrl);
    callback.searchParams.set("hub", hub);
    callback.searchParams.set("topic", topic);

    const body = new URLSearchParams({
      "hub.verify": "async",
      "hub.mode": mode,
      "hub.topic": topic,
      "hub.secret": this.#secret,
      "hub.callback": callback.toString(),
    });

    if (mode === "subscribe" && lease !== undefined) {
      body.set("hub.lease_seconds", lease.toString());
    }

    await fetch(hub, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  }

  public async handler(req: Request): Promise<Response> {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const hub = url.searchParams.get("hub");
      const topic = url.searchParams.get("hub.topic");
      const mode = url.searchParams.get("hub.mode");
      const challenge = url.searchParams.get("hub.challenge");

      if (!hub || !topic || !mode || !challenge) {
        return new Response(null, { status: STATUS_CODE.BadRequest });
      }

      if (!this.#pending.has(topic)) {
        return new Response(null, { status: STATUS_CODE.NotFound });
      } else {
        this.#pending.delete(topic);
      }

      switch (mode) {
        case "denied": {
          this.dispatchTypedEvent("denied", new DeniedEvent(hub, topic));
          return new Response(challenge, { status: STATUS_CODE.OK });
        }

        case "subscribe":
        case "unsubscribe": {
          if (mode === "subscribe") {
            const lease = url.searchParams.get("hub.lease_seconds");
            if (!lease) throw new Error("lease not specified");

            this.#active.add(topic);
            this.dispatchTypedEvent(
              "subscribe",
              new SubscribeEvent(hub, topic, Number.parseInt(lease, 10)),
            );
          } else {
            this.#active.delete(topic);
            this.dispatchTypedEvent(
              "unsubscribe",
              new UnsubscribeEvent(hub, topic),
            );
          }

          return new Response(challenge, { status: STATUS_CODE.OK });
        }

        default: {
          return new Response(null, { status: STATUS_CODE.Forbidden });
        }
      }
    } else if (req.method === "POST") {
      if (req.body === null) {
        return new Response(null, { status: STATUS_CODE.BadRequest });
      }

      const url = new URL(req.url);
      const hub = url.searchParams.get("hub");
      const topic = url.searchParams.get("topic");

      if (!hub || !topic) {
        return new Response(null, { status: STATUS_CODE.BadRequest });
      }

      const _sig = req.headers.get("x-hub-signature");
      if (!_sig) return new Response(null, { status: STATUS_CODE.BadRequest });

      const [algorithm, signature] = _sig.split("=");
      if (!algorithm || !signature) {
        return new Response(null, { status: STATUS_CODE.Forbidden });
      }

      const body = await req.arrayBuffer();
      const key = await cryptoKey(algorithm, this.#secret);
      const signed = await globalThis.crypto.subtle.sign("HMAC", key, body);
      const valid = signature === encodeHex(signed);
      if (!valid) {
        return new Response(null, { status: STATUS_CODE.Accepted });
      }

      this.dispatchTypedEvent("feed", new FeedEvent(hub, topic, body));
      return new Response(null, { status: STATUS_CODE.NoContent });
    } else {
      return new Response(null, { status: STATUS_CODE.MethodNotAllowed });
    }
  }
}
