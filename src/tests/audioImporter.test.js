import AudioImporter from '../audio/audioImporter';
import * as Tone from 'tone';

jest.mock('tone', () => ({
  context: {
    rawContext: {
      decodeAudioData: jest.fn()
    }
  },
  ToneAudioBuffer: jest.fn()
}));

describe('AudioImporter', () => {
  let importer;

  beforeEach(() => {
    importer = new AudioImporter();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('initialized supported formats', () => {
      expect(importer.supportedFormats).toEqual(['audio/wav', 'audio/mp3']);
    });
  });

  describe('validateFile', () => {
    test('WAV is valid', () => {
      const file = new File([''], 'test.wav', { type: 'audio/wav' });
      expect(importer.validateFile(file)).toBe(true);
    });

    test('MP3 is valid', () => {
      const file = new File([''], 'test.mp3', { type: 'audio/mp3' });
      expect(importer.validateFile(file)).toBe(true);
    });

    test('no file leads to error', () => {
      expect(() => importer.validateFile(null)).toThrow('No file provided');
    });

    test('given undefined file', () => {
      expect(() => importer.validateFile(undefined)).toThrow('No file provided');
    });

    test('given unsupported file type', () => {
      const file = new File([''], 'test.txt', { type: 'text' });
      expect(() => importer.validateFile(file)).toThrow('Unsupported file format: text');
    });

    test('given unsupported audio file type', () => {
      const file = new File([''], 'test.ogg', { type: 'audio/ogg' });
      expect(() => importer.validateFile(file)).toThrow('Unsupported file format: audio/ogg');
    });
  });

  describe('fileToArrayBuffer', () => {
    test('convertfile to ArrayBuffer', async () => {
      const content = 'test audio';
      const file = new File([content], 'test.wav', { type: 'audio/wav' });
      const arrayBuffer = await importer.fileToArrayBuffer(file);
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    test('empty file', async () => {
      const file = new File([], 'empty.wav', { type: 'audio/wav' });
      const arrayBuffer = await importer.fileToArrayBuffer(file);
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
      expect(arrayBuffer.byteLength).toBe(0);
    });

    test('FileReader fails', async () => {
      const file = new File(['test'], 'test.wav', { type: 'audio/wav' });
      const fileReader = global.FileReader;
      global.FileReader = class {
        readAsArrayBuffer() {
          setTimeout(() => this.onerror(), 0);
        }
      };
      await expect(importer.fileToArrayBuffer(file)).rejects.toThrow('Failed to read file');
      global.FileReader = fileReader;
    });
  });

  describe('decodeAudioData', () => {
    test('should decode ArrayBuffer to ToneAudioBuffer', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);
      const mockAudioBuffer = {
        duration: 5.5,
        sampleRate: 44100,
        numberOfChannels: 2
      };
      const mockToneBuffer = { duration: 5.5, sampleRate: 44100 };
      Tone.context.rawContext.decodeAudioData.mockResolvedValue(mockAudioBuffer);
      Tone.ToneAudioBuffer.mockImplementation(() => mockToneBuffer);
      const result = await importer.decodeAudioData(mockArrayBuffer);
      expect(Tone.context.rawContext.decodeAudioData).toHaveBeenCalledWith(mockArrayBuffer);
      expect(Tone.ToneAudioBuffer).toHaveBeenCalledWith(mockAudioBuffer);
      expect(result).toEqual(mockToneBuffer);
    });

    test('should throw error if decoding fails', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);
      Tone.context.rawContext.decodeAudioData.mockRejectedValue(new Error('Invalid audio data'));
      await expect(importer.decodeAudioData(mockArrayBuffer)).rejects.toThrow('Failed to decode audio data');
    });

    test('should throw error for corrupted audio data', async () => {
      const mockArrayBuffer = new ArrayBuffer(10);
      Tone.context.rawContext.decodeAudioData.mockRejectedValue(new Error('Corrupt'));
      await expect(importer.decodeAudioData(mockArrayBuffer)).rejects.toThrow('Failed to decode audio data');
    });
  });

  describe('extractMetadata', () => {
    test('check metadata from file and buffer', () => {
      const mockFile = new File(['content'], 'test.wav', { type: 'audio/wav' });
      Object.defineProperty(mockFile, 'size', { value: 1024 });
      const mockBuffer = {
        duration: 5.5,
        sampleRate: 44100
      };

      const metadata = importer.extractMetadata(mockFile, mockBuffer);
      expect(metadata).toEqual({
        name: 'test.wav',
        size: 1024,
        type: 'audio/wav',
        duration: 5.5,
        sampleRate: 44100
      });
    });

    test('different file sizes', () => {
      const mockFile = new File([''], 'large.mp3', { type: 'audio/mp3' });
      Object.defineProperty(mockFile, 'size', { value: 5242880 }); // 5MB
      const mockBuffer = {
        duration: 180.0,
        sampleRate: 48000
      };

      const metadata = importer.extractMetadata(mockFile, mockBuffer);
      expect(metadata.size).toBe(5242880);
      expect(metadata.duration).toBe(180.0);
    });

    test('different sample rates', () => {
      const mockFile = new File([''], 'test.wav', { type: 'audio/wav' });
      const mockBuffer = {
        duration: 10.0,
        sampleRate: 22050
      };

      const metadata = importer.extractMetadata(mockFile, mockBuffer);
      expect(metadata.sampleRate).toBe(22050);
    });
  });

  describe('importFile', () => {
    test('importing a valid audio file', async () => {
      const file = new File(['audio content'], 'test.wav', { type: 'audio/wav' });
      const mockArrayBuffer = new ArrayBuffer(100);
      const mockToneBuffer = {
        duration: 5.5,
        sampleRate: 44100
      };

      jest.spyOn(importer, 'fileToArrayBuffer').mockResolvedValue(mockArrayBuffer);
      jest.spyOn(importer, 'decodeAudioData').mockResolvedValue(mockToneBuffer);
      const result = await importer.importFile(file);
      expect(result.buffer).toEqual(mockToneBuffer);
      expect(result.metadata.name).toBe('test.wav');
      expect(result.metadata.type).toBe('audio/wav');
      expect(result.originalFile).toBe(file);
    });

    test('invalid file', async () => {
      const file = new File([''], 'test.txt', { type: 'text/plain' });
      await expect(importer.importFile(file)).rejects.toThrow('Unsupported file format');
    });

    test('file reading error', async () => {
      const file = new File([''], 'test.wav', { type: 'audio/wav' });
      jest.spyOn(importer, 'fileToArrayBuffer').mockRejectedValue(new Error('Read failed'));
      await expect(importer.importFile(file)).rejects.toThrow('Failed to import audio file: Read failed');
    });

    test('decoding error', async () => {
      const file = new File([''], 'test.wav', { type: 'audio/wav' });
      const mockArrayBuffer = new ArrayBuffer(100);
      jest.spyOn(importer, 'fileToArrayBuffer').mockResolvedValue(mockArrayBuffer);
      jest.spyOn(importer, 'decodeAudioData').mockRejectedValue(new Error('Decode failed'));
      await expect(importer.importFile(file)).rejects.toThrow('Failed to import audio file');
    });

    test('method calls ordering', async () => {
      const file = new File([''], 'test.wav', { type: 'audio/wav' });
      const validateSpy = jest.spyOn(importer, 'validateFile');
      const bufferSpy = jest.spyOn(importer, 'fileToArrayBuffer').mockResolvedValue(new ArrayBuffer(100));
      const decodeSpy = jest.spyOn(importer, 'decodeAudioData').mockResolvedValue({ duration: 5, sampleRate: 44100 });
      const metadataSpy = jest.spyOn(importer, 'extractMetadata');
      await importer.importFile(file);
      expect(validateSpy).toHaveBeenCalled();
      expect(bufferSpy).toHaveBeenCalled();
      expect(decodeSpy).toHaveBeenCalled();
      expect(metadataSpy).toHaveBeenCalled();
    });
  });

  describe('end-to-end scenarios', () => {
    test('should handle MP3 file correctly', async () => {
      const file = new File(['mp3 data'], 'song.mp3', { type: 'audio/mp3' });
      Object.defineProperty(file, 'size', { value: 2048 });
      jest.spyOn(importer, 'fileToArrayBuffer').mockResolvedValue(new ArrayBuffer(2048));
      jest.spyOn(importer, 'decodeAudioData').mockResolvedValue({
        duration: 30.5,
        sampleRate: 44100
      });

      const result = await importer.importFile(file);
      expect(result.metadata.name).toBe('song.mp3');
      expect(result.metadata.type).toBe('audio/mp3');
      expect(result.metadata.size).toBe(2048);
    });

    test('multiple imports', async () => {
      const file1 = new File([''], 'test1.wav', { type: 'audio/wav' });
      const file2 = new File([''], 'test2.mp3', { type: 'audio/mp3' });
      jest.spyOn(importer, 'fileToArrayBuffer').mockResolvedValue(new ArrayBuffer(100));
      jest.spyOn(importer, 'decodeAudioData').mockResolvedValue({
        duration: 5,
        sampleRate: 44100
      });

      const result1 = await importer.importFile(file1);
      const result2 = await importer.importFile(file2);
      expect(result1.metadata.name).toBe('test1.wav');
      expect(result2.metadata.name).toBe('test2.mp3');
    });
  });
});