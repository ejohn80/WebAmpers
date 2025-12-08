/**
 * Mock implementation of Tone.AudioBuffer for testing purposes.
 * This is used to create valid-looking audio buffers needed for the
 * bufferToWavFile logic, which is why it simulates real AudioBuffer structure.
 */

// Mock AudioBuffer structure as used by the ToneAudioBuffer.get() method
class MockAudioBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;

    // Create mock Float32Arrays for each channel (filled with small values)
    // Content doesn't matter for WAV size calculation - just needs valid structure
    this.channelData = Array(numberOfChannels)
      .fill(0)
      .map(() => new Float32Array(length).fill(0.1));
  }

  // Required method for AudioBuffer interface
  getChannelData(channel) {
    return this.channelData[channel];
  }
}

// Mock ToneAudioBuffer class - mimics the actual Tone.js class
export class ToneAudioBuffer {
  constructor(numberOfChannels, length, sampleRate = 44100) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.mockBuffer = new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }

  // The get() method is used by bufferToWavFile to access the underlying AudioBuffer
  get() {
    return this.mockBuffer;
  }
}
