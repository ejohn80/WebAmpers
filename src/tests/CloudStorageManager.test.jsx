/* global global */
// ^ Ignores for Vitest globals. ESlint sees these as undefined otherwise.

// src/tests/CloudStorageManager.test.jsx
import {describe, it, expect, vi, beforeEach} from "vitest";
import {cloudStorageManager} from "../managers/CloudStorageManager";
import {dbManager} from "../managers/DBManager";
import ExportManager from "../components/AudioExport/ExportManager";
import * as firebaseStorage from "firebase/storage";

// Mock Firebase Storage
vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  listAll: vi.fn(),
  deleteObject: vi.fn(),
  getMetadata: vi.fn(),
  getStorage: vi.fn(() => ({})),
}));

// Mock DBManager
vi.mock("../managers/DBManager", () => ({
  dbManager: {
    getSession: vi.fn(),
    getAllTracks: vi.fn(),
    getAsset: vi.fn(),
    getAllAssets: vi.fn(),
    createSession: vi.fn(),
    addTrack: vi.fn(),
    addAsset: vi.fn(),
  },
}));

// Mock ExportManager
vi.mock("../components/AudioExport/ExportManager", () => ({
  default: vi.fn().mockImplementation(() => ({
    encodeMp3: vi.fn(),
  })),
}));

// Mock Tone.js
vi.mock("tone", () => ({
  context: {
    createBuffer: vi.fn((channels, length, sampleRate) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      copyToChannel: vi.fn(),
    })),
    rawContext: {
      decodeAudioData: vi.fn(),
    },
  },
}));

// Mock firebase config
vi.mock("../firebase/firebase", () => ({
  storage: {},
}));

describe("CloudStorageManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("saveToFirebase", () => {
    it("should save session with tracks and assets", async () => {
      const mockSession = {
        id: 1,
        name: "Test Session",
        effects: {pitch: 0, volume: 100},
      };

      const mockTracks = [
        {
          id: 1,
          name: "Track 1",
          assetId: 10,
          segments: [{assetId: 10}],
        },
      ];

      const mockAsset = {
        id: 10,
        name: "Audio.mp3",
        duration: 2,
        size: 1024,
        buffer: {
          numberOfChannels: 2,
          length: 88200,
          sampleRate: 44100,
          channels: [new Float32Array(88200), new Float32Array(88200)],
        },
      };

      localStorage.setItem("webamp.activeSession", "1");
      dbManager.getSession.mockResolvedValue(mockSession);
      dbManager.getAllTracks.mockResolvedValue(mockTracks);
      dbManager.getAsset.mockResolvedValue(mockAsset);

      const mockMp3Blob = new Blob(["mp3data"], {type: "audio/mp3"});
      const mockExportManager = new ExportManager();
      mockExportManager.encodeMp3.mockReturnValue(mockMp3Blob);

      firebaseStorage.ref.mockReturnValue({fullPath: "mock/path"});
      firebaseStorage.uploadBytes.mockResolvedValue({});
      firebaseStorage.getDownloadURL.mockResolvedValue(
        "https://firebase.com/metadata.json"
      );

      const result = await cloudStorageManager.saveToFirebase(
        "user123",
        "My Project"
      );

      expect(result).toBe("https://firebase.com/metadata.json");
      expect(dbManager.getSession).toHaveBeenCalledWith(1);
      expect(dbManager.getAllTracks).toHaveBeenCalledWith(1);
      expect(firebaseStorage.uploadBytes).toHaveBeenCalled();
    });

    it("should throw error when no active session", async () => {
      localStorage.removeItem("webamp.activeSession");

      await expect(
        cloudStorageManager.saveToFirebase("user123", "Project")
      ).rejects.toThrow("No active session");
    });

    it("should handle assets without buffers", async () => {
      const mockSession = {
        id: 1,
        name: "Test Session",
        effects: {},
      };

      const mockTracks = [
        {
          id: 1,
          name: "Track 1",
          assetId: 10,
          segments: [{assetId: 10}],
        },
      ];

      const mockAssetNoBuffer = {
        id: 10,
        name: "Audio.mp3",
        duration: 2,
        size: 1024,
        buffer: null,
      };

      localStorage.setItem("webamp.activeSession", "1");
      dbManager.getSession.mockResolvedValue(mockSession);
      dbManager.getAllTracks.mockResolvedValue(mockTracks);
      dbManager.getAsset.mockResolvedValue(mockAssetNoBuffer);

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.uploadBytes.mockResolvedValue({});
      firebaseStorage.getDownloadURL.mockResolvedValue("https://url");

      const result = await cloudStorageManager.saveToFirebase(
        "user123",
        "Project"
      );

      // Should still succeed but skip the asset
      expect(result).toBe("https://url");
    });
  });

  describe("loadFromFirebase", () => {
    it("should reuse existing assets by name", async () => {
      const mockMetadata = {
        session: {id: 1, effects: {}},
        tracks: [{id: 1, assetId: 10}],
        assets: [
          {
            id: 10,
            name: "Audio.mp3",
            duration: 2,
            size: 1024,
            mp3Url: "https://firebase.com/audio.mp3",
          },
        ],
      };

      const existingAsset = {
        id: 99,
        name: "Audio.mp3",
        duration: 2,
        size: 1024,
      };

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.getDownloadURL.mockResolvedValue("url");

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockMetadata),
      });

      dbManager.getAllAssets.mockResolvedValue([existingAsset]);
      dbManager.createSession.mockResolvedValue(42);
      dbManager.addTrack.mockResolvedValue(1);

      const result = await cloudStorageManager.loadFromFirebase(
        "user123",
        "project1_123"
      );

      // Asset should be reused, not created
      expect(dbManager.addAsset).not.toHaveBeenCalled();
      expect(result.assets).toBe(1);
    });

    it("should reuse assets with numbered names", async () => {
      const mockMetadata = {
        session: {id: 1, effects: {}},
        tracks: [{id: 1, assetId: 10}],
        assets: [
          {
            id: 10,
            name: "Audio.mp3",
            duration: 2,
            size: 1024,
            mp3Url: "https://firebase.com/audio.mp3",
          },
        ],
      };

      // Existing asset has (2) suffix
      const existingAsset = {
        id: 99,
        name: "Audio.mp3 (2)",
        duration: 2,
        size: 1024,
      };

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.getDownloadURL.mockResolvedValue("url");

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockMetadata),
      });

      dbManager.getAllAssets.mockResolvedValue([existingAsset]);
      dbManager.createSession.mockResolvedValue(42);
      dbManager.addTrack.mockResolvedValue(1);

      await cloudStorageManager.loadFromFirebase("user123", "project1_123");

      // Should match by base name (ignoring the (2) suffix)
      expect(dbManager.addAsset).not.toHaveBeenCalled();
    });

    it("should extract project name from folder name", async () => {
      const mockMetadata = {
        session: {id: 1, effects: {}},
        tracks: [],
        assets: [],
      };

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.getDownloadURL.mockResolvedValue("url");

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockMetadata),
      });

      dbManager.getAllAssets.mockResolvedValue([]);
      dbManager.createSession.mockResolvedValue(42);

      await cloudStorageManager.loadFromFirebase(
        "user123",
        "MyProject_1234567890123"
      );

      expect(dbManager.createSession).toHaveBeenCalledWith(
        "MyProject",
        expect.any(Object)
      );
    });
  });

  describe("listSaves", () => {
    it("should list all saves for a user", async () => {
      const mockFolders = [
        {name: "project1_1234567890", fullPath: "path1"},
        {name: "project2_0987654321", fullPath: "path2"},
      ];

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.listAll.mockResolvedValue({
        prefixes: mockFolders,
        items: [],
      });
      firebaseStorage.getMetadata.mockResolvedValue({
        timeCreated: "2024-01-01T12:00:00Z",
        size: 1024,
      });

      const result = await cloudStorageManager.listSaves("user123");

      expect(result).toHaveLength(2);
      expect(result[0].projectName).toBe("project1");
      expect(result[1].projectName).toBe("project2");
    });

    it("should handle errors when listing saves", async () => {
      const mockFolders = [{name: "project1_123", fullPath: "path1"}];

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.listAll.mockResolvedValue({
        prefixes: mockFolders,
        items: [],
      });
      firebaseStorage.getMetadata.mockRejectedValue(new Error("Not found"));

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await cloudStorageManager.listSaves("user123");

      // Should skip folders with errors
      expect(result).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should sort saves by date (newest first)", async () => {
      const mockFolders = [
        {name: "old_project_1000000000", fullPath: "path1"},
        {name: "new_project_2000000000", fullPath: "path2"},
      ];

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.listAll.mockResolvedValue({
        prefixes: mockFolders,
        items: [],
      });

      let callCount = 0;
      firebaseStorage.getMetadata.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          timeCreated:
            callCount === 1 ? "2024-01-01T12:00:00Z" : "2024-12-01T12:00:00Z",
          size: 1024,
        });
      });

      const result = await cloudStorageManager.listSaves("user123");

      // Newest should be first
      expect(result[0].projectName).toBe("new_project");
      expect(result[1].projectName).toBe("old_project");
    });
  });

  describe("deleteSave", () => {
    it("should delete all files in save folder", async () => {
      const mockItems = [
        {fullPath: "path/metadata.json"},
        {fullPath: "path/file.mp3"},
      ];
      const mockSubItems = [{fullPath: "path/assets/audio.mp3"}];

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.listAll
        .mockResolvedValueOnce({
          items: mockItems,
          prefixes: [{name: "assets"}],
        })
        .mockResolvedValueOnce({
          items: mockSubItems,
          prefixes: [],
        });
      firebaseStorage.deleteObject.mockResolvedValue();

      const result = await cloudStorageManager.deleteSave(
        "user123",
        "project1_123"
      );

      expect(result).toBe(true);
      expect(firebaseStorage.deleteObject).toHaveBeenCalledTimes(3);
    });

    it("should handle delete errors", async () => {
      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.listAll.mockRejectedValue(new Error("Network error"));

      await expect(
        cloudStorageManager.deleteSave("user123", "project1_123")
      ).rejects.toThrow("Network error");
    });

    it("should delete multiple subfolders", async () => {
      const mockItems = [{fullPath: "path/metadata.json"}];
      const mockSubFolder1Items = [{fullPath: "path/assets/audio1.mp3"}];
      const mockSubFolder2Items = [{fullPath: "path/other/file.txt"}];

      firebaseStorage.ref.mockReturnValue({});
      firebaseStorage.listAll
        .mockResolvedValueOnce({
          items: mockItems,
          prefixes: [{name: "assets"}, {name: "other"}],
        })
        .mockResolvedValueOnce({
          items: mockSubFolder1Items,
          prefixes: [],
        })
        .mockResolvedValueOnce({
          items: mockSubFolder2Items,
          prefixes: [],
        });
      firebaseStorage.deleteObject.mockResolvedValue();

      await cloudStorageManager.deleteSave("user123", "project1_123");

      // 1 main file + 1 from assets + 1 from other = 3
      expect(firebaseStorage.deleteObject).toHaveBeenCalledTimes(3);
    });
  });
});
