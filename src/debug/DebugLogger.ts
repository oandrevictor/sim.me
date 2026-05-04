import posthog from 'posthog-js'

export type DebugLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type DebugValue = string | number | boolean | null | undefined | DebugValue[] | { [key: string]: DebugValue }
export type DebugFields = Record<string, DebugValue>

type GameTimeProvider = () => DebugFields

interface DebugRecord extends DebugFields {
  type: string
  level: DebugLogLevel
  tsIso: string
  sessionId: string
}

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'
const SERVICE_NAME = 'sim-me-game'
const LOCAL_LOG_LIMIT = 5000

class DebugLogger {
  private readonly sessionId = createSessionId()
  private readonly localRecords: DebugRecord[] = []
  private gameTimeProvider: GameTimeProvider | null = null
  private posthogReady = false
  private initialized = false
  private hooksInstalled = false
  private droppedLocalRecords = 0
  private localDropWarned = false

  init(): void {
    if (this.initialized) return
    this.initialized = true
    this.installWindowHooks()

    const key = stringEnv('VITE_POSTHOG_KEY')
    const host = stringEnv('VITE_POSTHOG_HOST') || DEFAULT_POSTHOG_HOST
    if (!key) {
      this.log('debug.posthog_unavailable', {
        reason: 'missing_vite_posthog_key',
        posthogHost: host,
      }, 'warn')
      return
    }

    try {
      posthog.init(key, {
        api_host: host,
        defaults: '2026-01-30',
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        logs: {
          serviceName: SERVICE_NAME,
          environment: stringEnv('MODE') || 'development',
          serviceVersion: stringEnv('VITE_APP_VERSION') || '1.2.1',
          captureConsoleLogs: false,
          maxBufferSize: 100,
          maxLogsPerInterval: 1000,
        },
      } as never)
      this.posthogReady = true
      this.log('debug.posthog_init', {
        posthogHost: host,
        serviceName: SERVICE_NAME,
      }, 'info')
    } catch (error) {
      this.posthogReady = false
      this.log('debug.posthog_init_failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
      }, 'error')
    }
  }

  setGameTimeProvider(provider: GameTimeProvider): void {
    this.gameTimeProvider = provider
  }

  log(type: string, fields: DebugFields = {}, level: DebugLogLevel = 'debug'): void {
    const record = this.createRecord(type, fields, level)
    this.writeLocal(record)
    //this.writePostHog(record)
  }

  download(filename = debugFilename()): void {
    const records = this.localRecordsForExport()
    const jsonl = records.map(record => JSON.stringify(record)).join('\n') + '\n'
    const blob = new Blob([jsonl], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  clearLocal(): void {
    this.localRecords.length = 0
    this.droppedLocalRecords = 0
    this.localDropWarned = false
  }

  localSize(): number {
    return this.localRecords.length
  }

  getLocalRecords(): DebugRecord[] {
    return this.localRecordsForExport()
  }

  private installWindowHooks(): void {
    if (this.hooksInstalled || typeof window === 'undefined') return
    this.hooksInstalled = true

    window.simmeDebugLogs = {
      download: () => this.download(),
      clear: () => this.clearLocal(),
      size: () => this.localSize(),
      entries: () => this.getLocalRecords(),
    }

    window.addEventListener('keydown', event => {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== 'l') return
      event.preventDefault()
      this.download()
    })
    window.addEventListener('error', event => {
      this.log('debug.uncaught_error', {
        errorMessage: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      }, 'error')
    })
    window.addEventListener('unhandledrejection', event => {
      this.log('debug.unhandled_rejection', {
        errorMessage: event.reason instanceof Error ? event.reason.message : String(event.reason),
      }, 'error')
    })
  }

  private createRecord(type: string, fields: DebugFields, level: DebugLogLevel): DebugRecord {
    const gameTime = this.gameTimeProvider?.() ?? {}
    return cleanFields({
      type,
      level,
      tsIso: new Date().toISOString(),
      sessionId: this.sessionId,
      ...gameTime,
      ...fields,
    }) as DebugRecord
  }

  private writeLocal(record: DebugRecord): void {
    if (this.localRecords.length >= LOCAL_LOG_LIMIT) {
      this.localRecords.shift()
      this.droppedLocalRecords++
      if (!this.localDropWarned) {
        this.localDropWarned = true
        this.writePostHog(this.createRecord('debug.local_logs_dropped', {
          localLogLimit: LOCAL_LOG_LIMIT,
        }, 'warn'))
      }
    }
    this.localRecords.push(record)
  }

  private writePostHog(record: DebugRecord): void {
    if (!this.posthogReady) return
    try {
      const { type, level, ...attributes } = record
      posthog.captureLog({ body: type, level, attributes })
    } catch {
      this.posthogReady = false
    }
  }

  private localRecordsForExport(): DebugRecord[] {
    if (this.droppedLocalRecords === 0) return [...this.localRecords]
    const summary = this.createRecord('debug.local_logs_dropped', {
      droppedCount: this.droppedLocalRecords,
      localLogLimit: LOCAL_LOG_LIMIT,
    }, 'warn')
    return [summary, ...this.localRecords]
  }
}

declare global {
  interface Window {
    simmeDebugLogs?: {
      download: () => void
      clear: () => void
      size: () => number
      entries: () => DebugRecord[]
    }
  }
}

export const debugLog = new DebugLogger()

function stringEnv(key: string): string | null {
  const env = import.meta.env as Record<string, unknown>
  const value = env[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function cleanFields(fields: DebugFields): DebugFields {
  const out: DebugFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) out[key] = value.map(item => cleanValue(item)).filter(v => v !== undefined)
    else if (typeof value === 'object') out[key] = cleanFields(value as DebugFields)
    else if (typeof value === 'number') out[key] = Number.isFinite(value) ? value : String(value)
    else out[key] = value
  }
  return out
}

function cleanValue(value: DebugValue): DebugValue {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return value.map(item => cleanValue(item)).filter(v => v !== undefined)
  if (typeof value === 'object') return cleanFields(value as DebugFields)
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  return value
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function debugFilename(): string {
  const stamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-')
  return `simme-debug-${stamp}.jsonl`
}
