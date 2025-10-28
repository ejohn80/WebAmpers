import pytest
import os
import time
from unittest.mock import MagicMock, patch, call
from pydub import AudioSegment, effects
from backend.AudioProcessor import AudioProcessor

@pytest.fixture
def mock_normalize():
    """Mocks pydub.effects.normalize which is imported as normalize in the source."""
    with patch('backend.AudioProcessor.normalize', return_value=MagicMock(spec=AudioSegment)) as mock:
        yield mock

@pytest.fixture
def mock_export():
    """Placeholder fixture for clarity."""
    pass

@pytest.fixture
def mock_from_file():
    """Mocks AudioSegment.from_file and the methods of the returned mock segment."""
    # Mocking essential pydub methods for the AudioSegment mock
    segment_mock = MagicMock(
        spec=AudioSegment, 
        export=MagicMock(), 
        set_frame_rate=MagicMock(return_value=MagicMock(spec=AudioSegment)), 
        __add__=MagicMock(return_value=MagicMock(spec=AudioSegment)), 
        append=MagicMock(return_value=MagicMock(spec=AudioSegment)), 
        __getitem__=MagicMock(return_value=MagicMock(spec=AudioSegment, export=MagicMock())),
        __len__=MagicMock(return_value=5000) # Default duration of 5000ms (5s)
    )
    with patch('backend.AudioProcessor.AudioSegment.from_file', return_value=segment_mock) as mock:
        yield mock

@pytest.fixture
def mock_upload_folder(tmp_path):
    """Initializes AudioProcessor using a real pytest temporary directory."""
    # Using the real class but providing a path from pytest's temp fixture
    processor = AudioProcessor(upload_folder=str(tmp_path / 'test_output'))
    yield processor


class TestAudioProcessor:
    def test_processor_initialization(self, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Checks initialization and folder creation."""
        processor = mock_upload_folder
        # Assert the directory exists and is a valid path
        assert os.path.isdir(processor.upload_folder)
        
    @patch('backend.AudioProcessor.uuid.uuid4', return_value=MagicMock(hex='test-uuid'))
    def test_generate_output_path(self, mock_uuid, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests the private helper for generating file paths."""
        processor = mock_upload_folder
        path = processor._generate_output_path('test', 'wav')
        assert os.path.basename(path) == 'test-uuid_test.wav'
        
    @patch('backend.AudioProcessor.uuid.uuid4', return_value=MagicMock(hex='c_uuid'))
    def test_convert_format_success(self, mock_uuid, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests successful audio format conversion."""
        processor = mock_upload_folder
        mock_audio_segment = mock_from_file.return_value

        input_path = "/tmp/input.flac"
        output_path = processor.convert_format(input_path, 'mp3')

        mock_from_file.assert_called_once_with(input_path)
        mock_audio_segment.export.assert_called_once_with(
            output_path,
            format='mp3',
            bitrate='192k',
            parameters=['-q:a', '2']
        )
        assert os.path.basename(output_path) == 'c_uuid_converted.mp3'

    def test_convert_format_unsupported_error(self, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests format conversion failure when target format is unsupported."""
        processor = mock_upload_folder
        with pytest.raises(ValueError, match="Unsupported format: txt"):
            processor.convert_format("/tmp/in.wav", 'txt')

    @patch('backend.AudioProcessor.uuid.uuid4', return_value=MagicMock(hex='m_uuid'))
    def test_merge_files_success_concat(self, mock_uuid, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests merging files with simple concatenation (no crossfade)."""
        processor = mock_upload_folder
        
        # We need two distinct mocks for the segments being loaded
        mock_segment_1 = MagicMock(spec=AudioSegment, __add__=MagicMock(), append=MagicMock(), export=MagicMock())
        mock_segment_2 = MagicMock(spec=AudioSegment)
        
        # Make the first call to from_file return segment_1, the second return segment_2
        mock_from_file.side_effect = [mock_segment_1, mock_segment_2]
        
        # The result of segment_1 + segment_2 should be a segment to export from
        mock_merged_segment = MagicMock(spec=AudioSegment, export=MagicMock())
        mock_segment_1.__add__.return_value = mock_merged_segment
        
        file_paths = ['f1.wav', 'f2.wav']
        output_path = processor.merge_files(file_paths, output_format='wav', crossfade_ms=0)

        # The loop runs once: merged = merged + audio (segment_1 + segment_2)
        mock_segment_1.__add__.assert_called_once_with(mock_segment_2)
        mock_segment_1.append.assert_not_called()

        mock_merged_segment.export.assert_called_once_with(
            output_path,
            format='wav'
        )
        assert os.path.basename(output_path) == 'm_uuid_merged.wav'

    def test_merge_files_error_less_than_two(self, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests merge failure when fewer than two files are provided."""
        processor = mock_upload_folder
        with pytest.raises(ValueError, match="Need at least 2 files to merge"):
            processor.merge_files(['f1.wav'])

    @patch('backend.AudioProcessor.uuid.uuid4', return_value=MagicMock(hex='e_uuid'))
    def test_export_with_settings_normalize_and_resample(self, mock_uuid, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests export with sample rate change and normalization applied."""
        processor = mock_upload_folder
        mock_audio_segment = mock_from_file.return_value
        
        # Configure return values for chaining
        mock_normalized_segment = MagicMock(spec=AudioSegment, export=MagicMock())
        mock_resampled_segment = MagicMock(spec=AudioSegment, export=MagicMock())

        mock_normalize.return_value = mock_normalized_segment
        mock_normalized_segment.set_frame_rate.return_value = mock_resampled_segment

        input_path = "/tmp/input.wav"
        output_path = processor.export_with_settings(
            input_path,
            'ogg',
            bitrate='64k',
            sample_rate=22050,
            normalize_audio=True
        )

        # Assert transformations were applied
        mock_normalize.assert_called_once_with(mock_audio_segment)
        mock_normalized_segment.set_frame_rate.assert_called_once_with(22050)

        # Assert export call used custom bitrate on the final segment
        mock_resampled_segment.export.assert_called_once_with(
            output_path,
            format='ogg',
            bitrate='64k'
        )
        assert os.path.basename(output_path) == 'e_uuid_export.ogg'

    @patch('backend.AudioProcessor.uuid.uuid4', return_value=MagicMock(hex='t_uuid'))
    def test_trim_audio_success(self, mock_uuid, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests successful audio trimming."""
        processor = mock_upload_folder
        mock_audio_segment = mock_from_file.return_value
        
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

    def test_trim_audio_invalid_range(self, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests trimming failure when time range is invalid."""
        processor = mock_upload_folder
        mock_audio_segment = mock_from_file.return_value
        mock_audio_segment.__len__.return_value = 5000 # 5 seconds

        # End time > duration
        with pytest.raises(ValueError, match="Invalid time range: 0-6000ms"):
            processor.trim_audio("/tmp/in.wav", 0, 6000, 'wav')
        
        # Start time >= end time
        with pytest.raises(ValueError, match="Invalid time range: 5000-5000ms"):
            processor.trim_audio("/tmp/in.wav", 5000, 5000, 'wav')

    @patch('backend.AudioProcessor.uuid.uuid4', return_value=MagicMock(hex='a_uuid'))
    def test_adjust_volume_success(self, mock_uuid, mock_normalize, mock_export, mock_from_file, mock_upload_folder):
        """Tests successful volume adjustment (audio + volume_change_db)."""
        processor = mock_upload_folder
        mock_audio_segment = mock_from_file.return_value
        volume_change = 6.0 # +6 dB

        # Mock the result of the addition operator
        mock_adjusted_segment = MagicMock(spec=AudioSegment, export=MagicMock())
        mock_audio_segment.__add__.return_value = mock_adjusted_segment
        
        output_path = processor.adjust_volume("/tmp/in.wav", volume_change, 'mp3')

        # Assert volume adjustment was applied using the '+' operator (AudioSegment.__add__)
        mock_audio_segment.__add__.assert_called_once_with(volume_change)
        
        mock_adjusted_segment.export.assert_called_once_with(
            output_path,
            format='mp3'
        )
        assert os.path.basename(output_path) == 'a_uuid_adjusted.mp3'
        
    @patch('backend.AudioProcessor.time.time') 
    @patch('os.path.getmtime')
    @patch('os.remove')
    @patch('os.listdir')
    def test_cleanup_old_files(self, mock_listdir, mock_remove, mock_getmtime, mock_time, mock_upload_folder):
        """Tests the file cleanup logic."""
        processor = mock_upload_folder
        
        mock_time.return_value = processor.CLEANUP_THRESHOLD_SECONDS * 2.0 
        
        # File names (relative)
        old_file = 'old_file.txt'
        new_file = 'new_file.txt'
        
        mock_listdir.return_value = [old_file, new_file]
        
        # Define mock modification times:
        def mock_getmtime_side_effect(path):
            filename = os.path.basename(path)
            # Old File Time: 0.5 hours. 0.5 < 1.0 (Cutoff) -> DELETED (1)
            if filename == old_file:
                return processor.CLEANUP_THRESHOLD_SECONDS * 0.5 
            # New File Time: 1.5 hours. 1.5 >= 1.0 (Cutoff) -> KEPT (0)
            elif filename == new_file:
                return processor.CLEANUP_THRESHOLD_SECONDS * 1.5
            else:
                return mock_time.return_value # Default to "new"
                
        mock_getmtime.side_effect = mock_getmtime_side_effect
        
        # Mock os.path.isdir to return False for all files
        with patch('os.path.isdir', return_value=False):
            cleaned_count = processor.cleanup_old_files()

        # The assertion should now pass
        assert cleaned_count == 1
        
        # Verify os.remove was called only once for the old file
        old_file_path = os.path.join(processor.upload_folder, old_file)
        mock_remove.assert_called_once_with(old_file_path)