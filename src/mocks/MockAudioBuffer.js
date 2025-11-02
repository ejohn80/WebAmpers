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

    // Create a mock Float32Array for each channel.
    // We use a small mock array of zeros since content doesn't matter for WAV size check.
    this.channelData = Array(numberOfChannels)
      .fill(0)
      .map(() => new Float32Array(length).fill(0.1));
  }

  getChannelData(channel) {
    return this.channelData[channel];
  }
}

// Mock ToneAudioBuffer class
export class ToneAudioBuffer {
  constructor(numberOfChannels, length, sampleRate = 44100) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.mockBuffer = new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }

  // The get() method is used by the bufferToWavFile to access channel data
  get() {
    return this.mockBuffer;
  }
}
