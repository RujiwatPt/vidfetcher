// Type definitions for Cloudflare/Bun streaming HTMLRewriter

export interface HTMLRewriterElement {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): this;
  removeAttribute(name: string): this;
  before(content: string, options?: { html?: boolean }): this;
  after(content: string, options?: { html?: boolean }): this;
  replace(content: string, options?: { html?: boolean }): this;
  remove(): this;
  removeAndKeepContent(): this;
  prepend(content: string, options?: { html?: boolean }): this;
  append(content: string, options?: { html?: boolean }): this;
  setInnerContent(content: string, options?: { html?: boolean }): this;
}

export interface HTMLRewriterTextChunk {
  readonly text: string;
  readonly lastInTextNode: boolean;
  replace(content: string, options?: { html?: boolean }): this;
  remove(): this;
}

export interface HTMLRewriterHandlers {
  element?(element: HTMLRewriterElement): void | Promise<void>;
  comments?(comment: unknown): void | Promise<void>;
  text?(text: HTMLRewriterTextChunk): void | Promise<void>;
}

declare global {
  class HTMLRewriter {
    constructor();
    on(selector: string, handlers: HTMLRewriterHandlers): this;
    onDocument(handlers: HTMLRewriterHandlers): this;
    transform(response: Response): Response;
  }
}
