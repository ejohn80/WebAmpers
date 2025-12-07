
"""
Test suite for AudioProcessor audio manipulation operations
"""
import os
import sys
from unittest.mock import MagicMock, patch
import pytest
from pydub import AudioSegment
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.audio_processor import AudioProcessor


@pytest.fixture(name='norm_mock')
def fixture_mock_normalize():
    """Mocks pydub.effects.normalize imported as normalize in the source."""
    with patch('backend.audio_processor.normalize',
               return_value=MagicMock(spec=AudioSegment)) as mock:
        yield mock


@pytest.fixture(name='from_file_mock')
def fixture_mock_from_file():
    """Mocks AudioSegment.from_file and the methods of the returned mock segment."""
    # Mocking essential pydub methods for the AudioSegment mock
    segment_mock = MagicMock(
        spec=AudioSegment,
        export=MagicMock(),
        set_frame_rate=MagicMock(return_value=MagicMock(spec=AudioSegment)),
        __add__=MagicMock(return_value=MagicMock(spec=AudioSegment)),
        append=MagicMock(return_value=MagicMock(spec=AudioSegment)),
        __getitem__=MagicMock(return_value=MagicMock(spec=AudioSegment,
                                                      export=MagicMock())),
        __len__=MagicMock(return_value=5000)  # Default duration of 5000ms (5s)
    )
    with patch('backend.audio_processor.AudioSegment.from_file',
               return_value=segment_mock) as mock:
        yield mock


@pytest.fixture(name='upload_dir')
def fixture_mock_upload_folder(tmp_path):
    """Initializes AudioProcessor using a real pytest temporary directory."""
    processor = AudioProcessor(upload_folder=str(tmp_path / 'test_output'))
    yield processor


class TestAudioProcessor:
    """Test suite for AudioProcessor class"""

    def test_processor_initialization(self, _norm_mock, _from_file_mock, upload_dir):
        """Checks initialization and folder creation."""
        processor = upload_dir
        # Assert the directory exists and is a valid path
        assert os.path.isdir(processor.upload_folder)

    @patch('backend.audio_processor.uuid.uuid4',
           return_value=MagicMock(hex='test-uuid'))
    def test_generate_output_path(self, _mock_uuid, _norm_mock,
                                   _from_file_mock, upload_dir):
        """Tests the private helper for generating file paths."""
        processor = upload_dir
        path = processor._generate_output_path('test', 'wav')  # pylint: disable=protected-access
        assert os.path.basename(path) == 'test-uuid_test.wav'

    @patch('backend.audio_processor.uuid.uuid4',
           return_value=MagicMock(hex='c_uuid'))
    def test_convert_format_success(self, _mock_uuid, _norm_mock,
                                     from_file_mock, upload_dir):
        """Tests successful audio format conversion."""
        processor = upload_dir
        mock_audio_segment = from_file_mock.return_value

        input_path = "/tmp/input.flac"
        output_path = processor.convert_format(input_path, 'mp3')

        from_file_mock.assert_called_once_with(input_path)
        mock_audio_segment.export.assert_called_once_with(
            output_path,
            format='mp3',
            bitrate='192k',
            parameters=['-q:a', '2']
        )
        assert os.path.basename(output_path) == 'c_uuid_converted.mp3'

    def test_convert_format_unsupported_error(self, _norm_mock,
                                               _from_file_mock, upload_dir):
        """Tests format conversion failure when target format is unsupported."""
        processor = upload_dir
        with pytest.raises(ValueError, match="Unsupported format: txt"):
            processor.convert_format("/tmp/in.wav", 'txt')

    @patch('backend.audio_processor.uuid.uuid4',
           return_value=MagicMock(hex='m_uuid'))
    def test_merge_files_success_concat(self, _mock_uuid, _norm_mock,
                                        from_file_mock, upload_dir):
        """Tests merging files with simple concatenation (no crossfade)."""
        processor = upload_dir

        # We need two distinct mocks for the segments being loaded
        mock_segment_1 = MagicMock(spec=AudioSegment,
                                   __add__=MagicMock(),
                                   append=MagicMock(),
                                   export=MagicMock())
        mock_segment_2 = MagicMock(spec=AudioSegment)

        # Make the first call to from_file return segment_1, second return segment_2
        from_file_mock.side_effect = [mock_segment_1, mock_segment_2]

        # The result of segment_1 + segment_2 should be a segment to export from
        mock_merged_segment = MagicMock(spec=AudioSegment, export=MagicMock())
        mock_segment_1.__add__.return_value = mock_merged_segment

        file_paths = ['f1.wav', 'f2.wav']
        output_path = processor.merge_files(file_paths,
                                            output_format='wav',
                                            crossfade_ms=0)

        # The loop runs once: merged = merged + audio (segment_1 + segment_2)
        mock_segment_1.__add__.assert_called_once_with(mock_segment_2)
        mock_segment_1.append.assert_not_called()

        mock_merged_segment.export.assert_called_once_with(
            output_path,
            format='wav'
        )
        assert os.path.basename(output_path) == 'm_uuid_merged.wav'

    def test_merge_files_error_less_than_two(self, _norm_mock,
                                              _from_file_mock, upload_dir):
        """Tests merge failure when fewer than two files are provided."""
        processor = upload_dir
        with pytest.raises(ValueError, match="Need at least 2 files to merge"):
            processor.merge_files(['f1.wav'])

    @patch('backend.audio_processor.uuid.uuid4',
           return_value=MagicMock(hex='e_uuid'))
    def test_export_with_settings_normalize_and_resample(
        self, _mock_uuid, norm_mock, from_file_mock, upload_dir
    ):
        """Tests export with sample rate change and normalization applied."""
        processor = upload_dir
        mock_audio_segment = from_file_mock.return_value

        # Configure return values for chaining
        mock_normalized_segment = MagicMock(spec=AudioSegment, export=MagicMock())
        mock_resampled_segment = MagicMock(spec=AudioSegment, export=MagicMock())

        norm_mock.return_value = mock_normalized_segment
        mock_normalized_segment.set_frame_rate.return_value = mock_resampled_segment

        input_path = "/tmp/input.wav"
        # Settings structure confirmed in previous iteration (no change needed here)
        settings = {
            'bitrate': '64k',
            'sample_rate': 22050,
            'normalize_audio': True
        }
        output_path = processor.export_with_settings(
            input_path,
            'ogg',
            settings
        )

        # Assert transformations were applied
        norm_mock.assert_called_once_with(mock_audio_segment)
        mock_normalized_segment.set_frame_rate.assert_called_once_with(22050)

        # Assert export call used custom bitrate on the final segment
        mock_resampled_segment.export.assert_called_once_with(
            output_path,
            format='ogg',
            bitrate='64k'
        )
        assert os.path.basename(output_path) == 'e_uuid_export.ogg'

    @patch('backend.audio_processor.uuid.uuid4',
           return_value=MagicMock(hex='t_uuid'))
    def test_trim_audio_success(self, _mock_uuid, _norm_mock,
                                 from_file_mock, upload_dir):
        """Tests successful audio trimming."""
        processor = upload_dir
        mock_audio_segment = from_file_mock.return_value

        # Mock the result of the slicing operation
        mock_trimmed_segment = MagicMock(spec=AudioSegment, export=MagicMock())
        mock_audio_segment.__getitem__.return_value = mock_trimmed_segment

        start_ms = 1000
        end_ms = 4000
        output_path = processor.trim_audio("/tmp/in.wav", start_ms, end_ms, 'wav')

        mock_audio_segment.__getitem__.assert_called_once_with(slice(1000, 4000, None))
        mock_trimmed_segment.export.assert_called_once_with(
            output_path,
            format='wav'
        )
        assert os.path.basename(output_path) == 't_uuid_trimmed.wav'

    def test_trim_audio_invalid_range(self, _norm_mock,
                                       from_file_mock, upload_dir):
        """Tests trimming failure when time range is invalid."""
        processor = upload_dir
        mock_audio_segment = from_file_mock.return_value
        mock_audio_segment.__len__.return_value = 5000  # 5 seconds

        # End time > duration
        with pytest.raises(ValueError, match="Invalid time range: 0-6000ms"):
            processor.trim_audio("/tmp/in.wav", 0, 6000, 'wav')

        # Start time >= end time
        with pytest.raises(ValueError, match="Invalid time range: 5000-5000ms"):
            processor.trim_audio("/tmp/in.wav", 5000, 5000, 'wav')

    @patch('backend.audio_processor.uuid.uuid4',
           return_value=MagicMock(hex='a_uuid'))
    def test_adjust_volume_success(self, _mock_uuid, _norm_mock,
                                    from_file_mock, upload_dir):
        """Tests successful volume adjustment (audio + volume_change_db)."""
        processor = upload_dir
        mock_audio_segment = from_file_mock.return_value
        volume_change = 6.0  # +6 dB

        # Mock the result of the addition operator
        mock_adjusted_segment = MagicMock(spec=AudioSegment, export=MagicMock())
        mock_audio_segment.__add__.return_value = mock_adjusted_segment

        output_path = processor.adjust_volume("/tmp/in.wav", volume_change, 'mp3')

        # Assert volume adjustment was applied using the '+' operator
        mock_audio_segment.__add__.assert_called_once_with(volume_change)

        mock_adjusted_segment.export.assert_called_once_with(
            output_path,
            format='mp3'
        )
        assert os.path.basename(output_path) == 'a_uuid_adjusted.mp3'

    # FIX: Disable R0917 for this function
    @patch('backend.audio_processor.time.time')
    @patch('os.path.getmtime')
    @patch('os.remove')
    @patch('os.listdir')
    # pylint: disable=R0917
    def test_cleanup_old_files(self, mock_listdir, mock_remove,
                                mock_getmtime, mock_time, upload_dir):
        """Tests the file cleanup logic."""
        processor = upload_dir

        mock_time.return_value = processor.CLEANUP_THRESHOLD_SECONDS * 2.0

        # File names (relative)
        old_file = 'old_file.txt'
        new_file = 'new_file.txt'

        mock_listdir.return_value = [old_file, new_file]

        # Define mock modification times:
        def mock_getmtime_side_effect(path):
            filename = os.path.basename(path)
            if filename == old_file:
                # Old File Time: 0.5 hours. 0.5 < 1.0 (Cutoff) -> DELETED
                return processor.CLEANUP_THRESHOLD_SECONDS * 0.5
            if filename == new_file:
                # New File Time: 1.5 hours. 1.5 >= 1.0 (Cutoff) -> KEPT
                return processor.CLEANUP_THRESHOLD_SECONDS * 1.5
            return mock_time.return_value  # Default to "new"

        mock_getmtime.side_effect = mock_getmtime_side_effect

        # Mock os.path.isdir to return False for all files
        with patch('os.path.isdir', return_value=False):
            cleaned_count = processor.cleanup_old_files()

        # The assertion should now pass
        assert cleaned_count == 1

        # Verify os.remove was called only once for the old file
        old_file_path = os.path.join(processor.upload_folder, old_file)
        mock_remove.assert_called_once_with(old_file_path)
