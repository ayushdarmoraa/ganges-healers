// Shim because TS isn't picking up the installed @types/sinonjs__fake-timers
declare module '@sinonjs/fake-timers' {
  interface ClockCreateOptions {
    now?: number | Date
    toFake?: (keyof typeof Date | string)[]
    loopLimit?: number
    shouldAdvanceTime?: boolean
    advanceTimeDelta?: number
  }
  interface InstalledClock {
    tick(ms: number): number
    uninstall(): void
    setSystemTime(now?: number | Date): void
    Date: DateConstructor
  }
  export function install(opts?: ClockCreateOptions): InstalledClock
}