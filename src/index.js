const http = require('http')
const fetch = require('node-fetch')
const { parse: parseURL } = require('url')
const { createHmac } = require('crypto')
const { EventEmitter } = require('events')

class WebSub extends EventEmitter {
  /**
   * Create a new WebSub Server
   * @param {Object} [options] Server Options
   * @param {string} [options.callbackURL] Callback URL
   * @param {string} [options.secret] Secret value for HMAC signatures
   */
  constructor (options) {
    super()

    const opts = options || {}

    this.secret = opts.secret
    if (!this.secret) throw new Error('options.secret cannot be blank!')

    this.callbackURL = opts.callbackURL
    if (!this.callbackURL) throw new Error('options.callbackURL cannot be blank!')

    /**
     * @type {http.Server}
     */
    this.server = undefined

    /**
     * @type {number}
     */
    this.port = undefined
  }

  /**
   * @param {number} [port] Port
   * @param {string} [hostname] Hostname
   * @param {number} [backlog] Server Backlog
   * @param {Function} [listeningListener] Listing Listener
   */
  listen (port, hostname, backlog, listeningListener) {
    this.port = port

    this.server = http.createServer((req, res) => this._onRequest(req, res))
    this.server.on('listening', () => this.emit('listening'))
    this.server.on('error', err => this._onError(err))

    this.server.listen(port, hostname, backlog, listeningListener)
  }

  /**
   * @private
   * @param {string} topic Topic
   * @returns {string}
   */
  _createKey (topic) {
    const secret = createHmac('sha1', this.secret)
      .update(topic, 'utf8')
      .digest('hex')

    return secret
  }

  /**
   * Set subscription status
   * @private
   * @param {('subscribe'|'unsubscribe')} mode Either `subscribe` or `unsubscribe`
   * @param {string} topic Topic URL
   * @param {string} hub Hub URL
   * @returns {Promise.<{ secret: string, callbackURL: string }>}
   */
  async _setSubscription (mode, topic, hub) {
    if (!(mode === 'subscribe' || mode === 'unsubscribe')) throw new Error('Mode must be either subscribe or unsubscribe')

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

    try {
      const resp = await fetch(hub, {
        method: 'POST',
        body: form,
      })

      if (resp.status !== 202 && resp.status !== 204) {
        const err = new Error(`Invalid response status ${resp.status}`)
        err.body = await resp.body.text()

        return this.emit('denied', { topic, err })
      }

      return { secret, callbackURL }
    } catch (err) {
      return this.emit('denied', { topic, err })
    }
  }

  /**
   * Subscribe to a topic
   * @param {string} topic Topic URL
   * @param {string} hub Hub URL
   * @returns {Promise.<void>}
   */
  subscribe (topic, hub) {
    return this._setSubscription('subscribe', hub, topic)
  }

  /**
   * Subscribe to a topic
   * @param {string} topic Topic URL
   * @param {string} hub Hub URL
   * @returns {Promise.<void>}
   */
  unsubscribe (topic, hub) {
    return this._setSubscription('unsubscribe', hub, topic)
  }

  /**
   * Internal request handler
   * @private
   * @param {http.IncomingMessage} req Request
   * @param {http.ServerResponse} res Response
   * @returns {void}
   */
  _onRequest (req, res) {
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

  /**
   * @param {Error} err Server Error
   * @returns {void}
   */
  _onError (err) {
    if (err.syscall === 'listen') {
      err.message = `Failed to start listening on port ${this.port} (${err.code})`
      return this.emit('error', err)
    }

    return this.emit('error', err)
  }

  /**
   * Handle HTTP GET Requests
   * @private
   * @param {http.IncomingMessage} req Request
   * @param {http.ServerResponse} res Response
   * @returns {void}
   */
  _handleGetRequest (req, res) {
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
          topic: params['hub.topic'],
          hub: params.hub,
        })
      case 'subscribe':
      case 'unsubscribe':
        res.writeHead(200)
        res.write(params['hub.challenge'])
        res.end()

        return this.emit(params['hub.mode'], {
          lease: Number(params['hub.lease_seconds'] || 0) + Math.round(Date.now() / 1000),
          topic: params['hub.topic'],
          hub: params.hub,
        })
      default:
        res.writeHead(403)
        res.write('Forbidden')
        return res.end()
    }
  }

  /**
   * Parse a request body
   * @private
   * @param {http.IncomingMessage} req Request
   * @param {string} key HMAC Key
   * @param {string} algo HMAC Algorithm
   * @param {string} signature HMAC Algorithm
   * @returns {Promise.<[string, boolean]>}
   */
  _parseBody (req, key, algo, signature) {
    return new Promise((resolve, reject) => {
      const chunks = []
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

  /**
   * Handle HTTP POST Requests
   * @private
   * @param {http.IncomingMessage} req Request
   * @param {http.ServerResponse} res Response
   */
  async _handlePostRequest (req, res) {
    const { query: params } = parseURL(req.url, true, true)

    if (!req.headers['x-hub-signature']) {
      res.writeHead(403)
      res.write('Forbidden')
      return res.end()
    }

    const secret = this._createKey(params.topic)
    const [algo, signature] = req.headers['x-hub-signature'].split('=')
    const [body, valid] = await this._parseBody(req, secret, algo || '', signature || '')

    if (!valid) {
      res.writeHead(202)
      res.write('Accepted')
      return res.end()
    }

    res.writeHead(204)
    res.end()

    return this.emit('feed', {
      topic: params.topic,
      hub: params.hub,
      body,
      headers: req.headers,
    })
  }
}

module.exports = WebSub
