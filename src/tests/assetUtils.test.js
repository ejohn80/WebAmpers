import {saveAsset} from "../utils/assetUtils";

const createMockAudioBuffer = () => {
  const length = 44100;
  return {
    numberOfChannels: 2,
    length,
    sampleRate: 44100,
    duration: 1,
    getChannelData: () => new Float32Array(length).fill(0),
  };
};

const createMockImportResult = () => {
  const buffer = createMockAudioBuffer();
  const metadata = {
    name: "Test.wav",
    duration: "0m 01.00s",
    size: "0.50 MB",
    sampleRate: "44100 Hz",
    numberOfChannels: 2,
    type: "audio/wav",
  };

  const file = new File([new ArrayBuffer(8)], "Test.wav", {
    type: "audio/wav",
  });

  return {buffer, metadata, originalFile: file};
};

describe("saveAsset", () => {
  it("stores PCM data by default", async () => {
    const importResult = createMockImportResult();
    const dbManager = {
      addAsset: vi.fn().mockResolvedValue(1),
    };

    const assetId = await saveAsset(importResult, dbManager);

    expect(assetId).toBe(1);
    expect(dbManager.addAsset).toHaveBeenCalledTimes(1);
    expect(dbManager.addAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        storageMode: "pcm",
        buffer: expect.objectContaining({numberOfChannels: 2}),
        fileBlob: null,
      })
    );
  });

  it("falls back to blob storage when IndexedDB rejects the PCM payload", async () => {
    const importResult = createMockImportResult();
    const quotaError = Object.assign(new Error("QuotaExceededError"), {
      name: "QuotaExceededError",
    });

    const dbManager = {
      addAsset: vi
        .fn()
        .mockRejectedValueOnce(quotaError)
        .mockResolvedValueOnce(2),
    };

    const assetId = await saveAsset(importResult, dbManager);

    expect(assetId).toBe(2);
    expect(dbManager.addAsset).toHaveBeenCalledTimes(2);
    expect(dbManager.addAsset).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        storageMode: "blob",
        buffer: null,
        fileBlob: importResult.originalFile,
      })
    );
  });
});
