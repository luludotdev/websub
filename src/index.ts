import { createHmac } from 'crypto'
import { EventEmitter } from 'eventemitter3'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import fetch, { HeadersInit } from 'node-fetch'
import { parse as parseURL, URLSearchParams } from 'url'
import {
  IDeniedEvent,
  IError,
  IFeedEvent,
  IOptions,
  ISubscribeEvent,
} from './types'

// tslint:disable-next-line: interface-name
export interface WebSub {
  on(event: 'listening', listener: () => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'denied', listener: (data: IDeniedEvent) => void): this
  on(event: 'feed', listener: (data: IFeedEvent) => void): this
  on(
    event: 'subscribe' | 'unsubscribe',
    listener: (data: ISubscribeEvent) => void
  ): this

  once(event: 'listening', listener: () => void): this
  once(event: 'error', listener: (err: Error) => void): this
  once(event: 'denied', listener: (data: IDeniedEvent) => void): this
  once(event: 'feed', listener: (data: IFeedEvent) => void): this
  once(
    event: 'subscribe' | 'unsubscribe',
    listener: (data: ISubscribeEvent) => void
  ): this
}

export class WebSub extends EventEmitter {
  public get port() {
    if (!this.server) return undefined

    const address = this.server.address()
    if (!address) return undefined
    if (typeof address === 'string') return undefined

    return address.port
  }

  public static createServer(options?: IOptions) {
    return new WebSub(options)
  }

  private secret: string
  private callbackURL: string
  private headers: HeadersInit
  private server: Server | undefined

  constructor(options?: IOptions) {
    super()
    const opts: Partial<IOptions> = options || {}

    if (!opts.secret) throw new Error('options.secret cannot be blank!')
    if (!opts.callbackURL) {
      throw new Error('options.callbackURL cannot be blank!')
    }

    this.secret = opts.secret
    this.callbackURL = opts.callbackURL
    this.headers = opts.headers || {}
    this.server = undefined
  }

  public listen(
    port?: number,
    hostname?: string,
    backlog?: number,
    listeningListener?: () => any
  ): this
  public listen(
    port?: number,
    hostname?: string,
    listeningListener?: () => any
  ): this
  public listen(port?: number, listeningListener?: () => any): this
  public listen(
    path: string,
    backlog?: number,
    listeningListener?: () => any
  ): this
  public listen(path: string, listeningListener?: () => any): this
  public listen(...args: any[]): this {
    this.server = createServer((req, res) => this._onRequest(req, res))
    this.server.on('listening', () => this.emit('listening'))
    this.server.on('error', err => this._onError(err))

    this.server.listen(...args)
    return this
  }

  public subscribe(topic: string, hub: string, leaseSeconds?: number) {
    return this._setSubscription('subscribe', topic, hub, leaseSeconds)
  }

  public unsubscribe(topic: string, hub: string) {
    return this._setSubscription('unsubscribe', topic, hub)
  }

  private _createKey(topic: string) {
    const secret = createHmac('sha1', this.secret)
      .update(topic, 'utf8')
      .digest('hex')

    return secret
  }

  private async _setSubscription(
    mode: 'subscribe' | 'unsubscribe',
    topic: string,
    hub: string,
    leaseSeconds?: number
  ) {
    if (!(mode === 'subscribe' || mode === 'unsubscribe')) {
      throw new Error('Mode must be either subscribe or unsubscribe')
    }

    if (typeof topic !== 'string') throw new Error('Topic must be a string')
    if (!topic) throw new Error('Topic is required')

    if (typeof hub !== 'string') throw new Error('Hub must be a string')
    if (!hub) throw new Error('Hub is required')

    const callbackParams = new URLSearchParams()
    callbackParams.set('topic', topic)
    callbackParams.set('hub', hub)
    const callbackURL = `${this.callbackURL}?${callbackParams}`

    const secret = this._createKey(topic)
    const form = new URLSearchParams()
    form.set('hub.verify', 'async')
    form.set('hub.mode', mode)
    form.set('hub.topic', topic)
    form.set('hub.secret', secret)
    form.set('hub.callback', callbackURL)

    if (mode === 'subscribe' && leaseSeconds) {
      if (Number.isNaN(leaseSeconds)) {
        throw new Error('Lease Seconds must be a number')
      } else form.set('hub.lease_seconds', `${leaseSeconds}`)
    }

    try {
      const resp = await fetch(hub, {
        body: form,
        headers: this.headers,
        method: 'POST',
      })

      if (resp.status !== 202 && resp.status !== 204) {
        const err: IError = new Error(`Invalid response status ${resp.status}`)
        err.body = await resp.text()

        return this.emit('denied', { topic, err })
      }

      return { secret, callbackURL }
    } catch (err) {
      return this.emit('denied', { topic, err })
    }
  }

  private _onRequest(req: IncomingMessage, res: ServerResponse) {
    switch (req.method) {
      case 'GET':
        return this._handleGetRequest(req, res)

      case 'POST':
        return this._handlePostRequest(req, res)

      default:
        res.writeHead(405)
        res.write('Method Not Allowed')
        return res.end()
    }
  }

  private _onError(err: IError) {
    if (err.syscall === 'listen') {
      err.message = `Failed to start listening on port ${this.port} (${err.code})`
      return this.emit('error', err)
    }

    return this.emit('error', err)
  }

  private _handleGetRequest(req: IncomingMessage, res: ServerResponse) {
    if (!req.url) {
      res.writeHead(400)
      res.write('Bad Request')
      return res.end()
    }
    const { query: params } = parseURL(req.url, true, true)

    // Invalid Request
    if (!params['hub.topic'] || !params['hub.mode']) {
      res.writeHead(400)
      res.write('Bad Request')
      return res.end()
    }

    switch (params['hub.mode']) {
      case 'denied':
        res.writeHead(200)
        res.write(params['hub.challenge'] || 'OK')

        return this.emit('denied', {
          hub: params.hub,
          topic: params['hub.topic'],
        })

      case 'subscribe':
      case 'unsubscribe':
        res.writeHead(200)
        res.write(params['hub.challenge'])
        res.end()

        const hubMode = params['hub.mode']
        const mode = Array.isArray(hubMode) ? hubMode[0] : hubMode

        return this.emit(mode, {
          hub: params.hub,
          lease:
            Number(params['hub.lease_seconds'] || 0) +
            Math.round(Date.now() / 1000),
          topic: params['hub.topic'],
        })

      default:
        res.writeHead(403)
        res.write('Forbidden')
        return res.end()
    }
  }

  private _parseBody(
    req: IncomingMessage,
    key: string,
    algo: string,
    signature: string
  ): Promise<readonly [string, boolean]> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = []
      const hmac = createHmac(algo.toLowerCase(), key)

      req.on('error', err => reject(err))
      req.on('data', chunk => chunks.push(chunk))

      req.on('end', () => {
        const body = Buffer.concat(chunks).toString()
        const digest = hmac.update(body, 'utf8').digest('hex')

        const valid = digest.toLowerCase() === signature.toLowerCase()
        return resolve([body, valid])
      })
    })
  }

  private async _handlePostRequest(req: IncomingMessage, res: ServerResponse) {
    if (!req.url) {
      res.writeHead(400)
      res.write('Bad Request')
      return res.end()
    }

    const { query: params } = parseURL(req.url, true, true)

    if (!req.headers['x-hub-signature']) {
      res.writeHead(403)
      res.write('Forbidden')
      return res.end()
    }

    const topic = Array.isArray(params.topic) ? params.topic[0] : params.topic
    const secret = this._createKey(topic)

    const xHubSignature = req.headers['x-hub-signature']
    const hubSig = Array.isArray(xHubSignature)
      ? xHubSignature[0]
      : xHubSignature

    if (!hubSig) {
      res.writeHead(202)
      res.write('Accepted')
      return res.end()
    }

    const [algo, signature] = hubSig.split('=')
    const [body, valid] = await this._parseBody(
      req,
      secret,
      algo || '',
      signature || ''
    )

    if (!valid) {
      res.writeHead(202)
      res.write('Accepted')
      return res.end()
    }

    res.writeHead(204)
    res.end()

    return this.emit('feed', {
      body,
      headers: req.headers,
      hub: params.hub,
      topic: params.topic,
    })
  }
}
