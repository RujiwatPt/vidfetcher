// Global ambient type declarations for Bun runtime environment

interface BunFile extends Blob {
  exists(): Promise<boolean>;
}

declare namespace Bun {
  interface ServeOptions {
    port?: number | string;
    hostname?: string;
    fetch(request: Request, server: any): Response | Promise<Response>;
    error?(error: Error): Response | Promise<Response>;
  }

  interface Server {
    port: number;
    hostname: string;
    stop(closeActiveConnections?: boolean): void;
    reload(options: ServeOptions): void;
  }

  function serve(options: ServeOptions): Server;
  function file(path: string): BunFile;

  const env: Record<string, string | undefined>;
  const version: string;
}

interface ImportMeta {
  main?: boolean;
  url: string;
}

declare const process: {
  env: Record<string, string | undefined>;
  uptime(): number;
};

declare module 'bun:test' {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: any): {
    toBe(expected: any): void;
    toEqual(expected: any): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(expected: any): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
  };
}
