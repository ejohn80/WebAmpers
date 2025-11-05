// Polyfills first
import "fake-indexeddb/auto";

// Jest-DOM matchers for Vitest
import "@testing-library/jest-dom/vitest";

// RTL cleanup between tests
import {afterEach, vi} from "vitest";
import {cleanup} from "@testing-library/react";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// If you *really* need structuredClone on an older Node, uncomment + install the dep:
// import structuredClonePolyfill from '@ungap/structured-clone';
// if (!globalThis.structuredClone) globalThis.structuredClone = structuredClonePolyfill;

// Minimal FileReader mock for Blob readers in tests
globalThis.FileReader = class FileReader {
  onload = () => {};
  readAsArrayBuffer(blob) {
    this.result = new ArrayBuffer(blob?.size || 0);
    setTimeout(() => this.onload({target: {result: this.result}}), 0);
  }
};
