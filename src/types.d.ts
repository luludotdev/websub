import { IncomingHttpHeaders } from 'http'

export interface IOptions {
  callbackURL: string
  secret: string
  headers: HeadersInit
}

export interface IError extends Error {
  [key: string]: any
}

export interface ISubscriptionCallback {
  secret: string
  callbackURL: string
}

export interface IDeniedEvent {
  topic: string
  err: Error
}

export interface ISubscribeEvent {
  lease: number
  topic: string
  hub: string
}

export interface IFeedEvent {
  topic: string
  hub: string
  body: string
  headers: IncomingHttpHeaders
}
