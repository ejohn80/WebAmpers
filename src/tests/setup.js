import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import structuredClone from '@ungap/structured-clone';

global.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    this.result = new ArrayBuffer(blob.size || 0);
    setTimeout(() => this.onload({ target: { result: this.result } }), 0);
  }
};
global.structuredClone = structuredClone;