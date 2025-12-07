"""
Audio processing module for format conversion, merging, and manipulation.
"""
import os
import shutil
import tempfile
import uuid
import time
from typing import List, Dict, Any, Optional

try:
    from pydub import AudioSegment
    from pydub.effects import normalize
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

    class AudioSegment:  # type: ignore
        """Fallback AudioSegment when pydub is not available"""
        @staticmethod
        def from_file(file_path):
            """Mock from_file method"""
            raise NotImplementedError("pydub is not available")

        def export(self, out_f, audio_format, **kwargs):
            """Mock export method"""

        def __len__(self):
            return 0

        def __add__(self, other):
            return self

        def __radd__(self, other):
            return self

        def append(self, seg, crossfade_duration):  # pylint: disable=unused-argument
            """Mock append method"""
            return self

        def set_frame_rate(self, sample_rate):  # pylint: disable=unused-argument
            """Mock set_frame_rate method"""
            return self

        def __getitem__(self, key):
            return self

        @property
        def channels(self):
            """Mock channels property"""
            return 2

        @property
        def frame_rate(self):
            """Mock frame_rate property"""
            return 44100

        @property
        def sample_width(self):
            """Mock sample_width property"""
            return 2

        def frame_count(self):
            """Mock frame_count method"""
            return 0

        @property
        def dBFS(self):  # pylint: disable=invalid-name
            """Mock dBFS property"""
            return -20.0

    def normalize(audio):
        """Mock normalize function"""
        return audio


class AudioProcessingError(Exception):
    """Custom exception for audio processing errors"""


class AudioProcessor:
    """
    A class for performing various audio processing operations using pydub.
    Handles temporary file management for outputs.
    """
    supported_formats = {'wav', 'mp3', 'ogg', 'flac', 'm4a'}
    default_bitrates = {
        'mp3': '192k',
        'ogg': '128k',
        'm4a': '128k'
    }
    CLEANUP_THRESHOLD_SECONDS = 3600

    def __init__(self, upload_folder: Optional[str] = None):
        """
        Initialize the AudioProcessor.
        Creates a temporary directory for output files if none is provided.

        Args:
            upload_folder: Directory for temporary files. If None, creates temp dir.
        """
        if upload_folder is None:
            self.upload_folder = tempfile.mkdtemp()
        else:
            self.upload_folder = upload_folder

        if not os.path.isdir(self.upload_folder):
            os.makedirs(self.upload_folder)

        print(f"AudioProcessor initialized. Output folder: {self.upload_folder}")

    def _validate_format(self, format_str: str) -> None:
        """
        Validate audio format

        Args:
            format_str: Format to validate

        Raises:
            ValueError: If format is not supported
        """
        if format_str.lower() not in self.supported_formats:
            raise ValueError(
                f"Unsupported format: {format_str}. "
                f"Supported formats: {', '.join(self.supported_formats)}"
            )

    def _generate_output_path(self, suffix: str, extension: str) -> str:
        """
        Generates a unique, full output path within the upload folder.

        Args:
            suffix: Descriptive suffix (e.g., 'converted', 'merged')
            extension: File extension (e.g., 'wav', 'mp3')

        Returns:
            The full file path.
        """
        file_name = f"{uuid.uuid4().hex}_{suffix}.{extension}"
        return os.path.join(self.upload_folder, file_name)

    def convert_format(self, input_path: str, target_format: str) -> str:
        """
        Convert audio file to target format

        Args:
            input_path: Path to input audio file
            target_format: Target format (wav, mp3, ogg, flac, m4a)

        Returns:
            Path to converted file

        Raises:
            ValueError: If format is unsupported
            AudioProcessingError: If conversion fails
        """
        self._validate_format(target_format)
        try:
            audio = AudioSegment.from_file(input_path)
            output_path = self._generate_output_path('converted', target_format)

            export_params: Dict[str, Any] = {'format': target_format}
            if target_format in self.default_bitrates:
                export_params['bitrate'] = self.default_bitrates[target_format]
            if target_format == 'mp3':
                export_params['parameters'] = ['-q:a', '2']

            audio.export(output_path, **export_params)

            return output_path

        except (IOError, OSError) as exc:
            raise AudioProcessingError(f"Conversion failed: {str(exc)}") from exc

    def merge_files(
        self,
        file_paths: List[str],
        output_format: str = 'mp3',
        crossfade_ms: int = 0
    ) -> str:
        """
        Merge multiple audio files into one

        Args:
            file_paths: List of paths to audio files
            output_format: Output format (wav, mp3, ogg, etc.)
            crossfade_ms: Crossfade duration in milliseconds (0 = no crossfade)

        Returns:
            Path to merged file

        Raises:
            ValueError: If fewer than 2 files provided or format is unsupported
            AudioProcessingError: If merge fails
        """
        if len(file_paths) < 2:
            raise ValueError("Need at least 2 files to merge")

        self._validate_format(output_format)

        try:
            merged = AudioSegment.from_file(file_paths[0])

            for path in file_paths[1:]:
                audio = AudioSegment.from_file(path)

                if crossfade_ms > 0:
                    merged = merged.append(audio, crossfade=crossfade_ms)
                else:
                    merged = merged + audio

            output_path = self._generate_output_path('merged', output_format)
            export_params: Dict[str, Any] = {'format': output_format}

            if output_format in self.default_bitrates:
                export_params['bitrate'] = self.default_bitrates[output_format]
            if output_format == 'mp3':
                export_params['parameters'] = ['-q:a', '2']

            merged.export(output_path, **export_params)

            return output_path

        except (IOError, OSError) as exc:
            raise AudioProcessingError(f"Merge failed: {str(exc)}") from exc

    def export_with_settings(
        self,
        input_path: str,
        target_format: str,
        settings: Dict[str, Any]
    ) -> str:
        """
        Apply settings (bitrate, sample rate, normalization) and export.

        Args:
            input_path: Path to input audio file
            target_format: Output format
            settings: Dictionary containing optional settings:
                      'bitrate' (str), 'sample_rate' (int), 'normalize_audio' (bool)

        Returns:
            Path to exported file

        Raises:
            ValueError: If format is unsupported
            AudioProcessingError: If export fails
        """
        self._validate_format(target_format)

        try:
            audio = AudioSegment.from_file(input_path)

            normalize_audio = settings.get('normalize_audio', False)
            sample_rate = settings.get('sample_rate')
            bitrate = settings.get('bitrate')

            if normalize_audio:
                audio = normalize(audio)

            if sample_rate is not None:
                audio = audio.set_frame_rate(sample_rate)

            output_path = self._generate_output_path('export', target_format)
            export_params: Dict[str, Any] = {'format': target_format}

            if bitrate:
                export_params['bitrate'] = bitrate
            elif target_format in self.default_bitrates:
                export_params['bitrate'] = self.default_bitrates[target_format]

            if target_format == 'mp3':
                export_params['parameters'] = ['-q:a', '2']

            audio.export(output_path, **export_params)

            return output_path

        except (IOError, OSError) as exc:
            raise AudioProcessingError(
                f"Export with settings failed: {str(exc)}"
            ) from exc

    def trim_audio(
        self,
        input_path: str,
        start_ms: int,
        end_ms: int,
        output_format: str = 'wav'
    ) -> str:
        """
        Trim audio file to specified time range

        Args:
            input_path: Path to input file
            start_ms: Start time in milliseconds
            end_ms: End time in milliseconds
            output_format: Output format

        Returns:
            Path to trimmed file

        Raises:
            ValueError: If time range is invalid or format is unsupported
            AudioProcessingError: If trim fails
        """
        self._validate_format(output_format)

        try:
            audio = AudioSegment.from_file(input_path)
            duration_ms = len(audio)

            if start_ms < 0 or end_ms > duration_ms or start_ms >= end_ms:
                raise ValueError(
                    f"Invalid time range: {start_ms}-{end_ms}ms "
                    f"(audio duration: {duration_ms}ms)"
                )

            trimmed = audio[start_ms:end_ms]
            output_path = self._generate_output_path('trimmed', output_format)
            trimmed.export(output_path, format=output_format)

            return output_path

        except (IOError, OSError) as exc:
            raise AudioProcessingError(f"Trim failed: {str(exc)}") from exc

    def adjust_volume(
        self,
        input_path: str,
        volume_change_db: float,
        output_format: str = 'wav'
    ) -> str:
        """
        Adjusts the volume of an audio file.

        Args:
            input_path: Path to input file
            volume_change_db: Change in volume in dB.
                            Positive increases, negative decreases.
            output_format: Output format.

        Returns:
            Path to the volume-adjusted file.

        Raises:
            ValueError: If format is unsupported
            AudioProcessingError: If adjustment fails
        """
        self._validate_format(output_format)

        try:
            audio = AudioSegment.from_file(input_path)
            adjusted_audio = audio + volume_change_db

            output_path = self._generate_output_path('adjusted', output_format)
            adjusted_audio.export(output_path, format=output_format)

            return output_path

        except (IOError, OSError) as exc:
            raise AudioProcessingError(
                f"Volume adjustment failed: {str(exc)}"
            ) from exc

    def get_audio_info(self, input_path: str) -> Dict[str, Any]:
        """
        Get audio file metadata.

        Args:
            input_path: Path to input audio file

        Returns:
            Dictionary containing audio metadata

        Raises:
            AudioProcessingError: If metadata extraction fails
        """
        try:
            audio = AudioSegment.from_file(input_path)
            return {
                'duration_seconds': len(audio) / 1000.0,
                'channels': audio.channels,
                'sample_rate': audio.frame_rate,
                'sample_width': audio.sample_width,
                'frame_count': audio.frame_count(),
                'dBFS': audio.dBFS
            }
        except (IOError, OSError, AttributeError) as exc:
            raise AudioProcessingError(
                f"Failed to get audio info: {str(exc)}"
            ) from exc

    def cleanup_old_files(self) -> int:
        """
        Removes files in the upload folder older than CLEANUP_THRESHOLD_SECONDS.

        Returns:
            Number of files cleaned up
        """
        now = time.time()
        cutoff = now - self.CLEANUP_THRESHOLD_SECONDS
        if not os.path.exists(self.upload_folder):
            return 0

        cleaned_count = 0
        try:
            for filename in os.listdir(self.upload_folder):
                file_path = os.path.join(self.upload_folder, filename)
                if os.path.isdir(file_path):
                    continue
                if os.path.getmtime(file_path) < cutoff:
                    os.remove(file_path)
                    cleaned_count += 1

            return cleaned_count

        except (IOError, OSError) as exc:
            print(f"Error during cleanup: {exc}")
            return cleaned_count

    def __del__(self):
        """
        Clean up the temporary directory when the object is destroyed.
        """
        try:
            if os.path.exists(self.upload_folder):
                shutil.rmtree(self.upload_folder)
        except (IOError, OSError) as exc:
            print(f"Warning: Could not remove temporary directory "
                  f"{self.upload_folder}: {exc}")
