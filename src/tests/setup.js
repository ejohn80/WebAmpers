import "@testing-library/jest-dom";

global.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    this.result = new ArrayBuffer(blob.size || 0);
    setTimeout(() => this.onload({target: {result: this.result}}), 0);
  }
};
