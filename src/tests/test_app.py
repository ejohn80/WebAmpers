"""
Test suite for Flask app audio processing endpoints
"""
import os
import io
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app import app, allowed_file
# FIX: Import AudioProcessingError so it can be used for the mock side_effect
from backend.audio_processor import AudioProcessingError 


@pytest.fixture(name='test_client')
def fixture_client():
    """Fixture to provide a test client for the Flask app."""
    app.config['TESTING'] = True
    app.config['UPLOAD_FOLDER'] = 'test_uploads'

    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])

    with app.test_client() as client:
        yield client

    if os.path.exists(app.config['UPLOAD_FOLDER']):
        for file in os.listdir(app.config['UPLOAD_FOLDER']):
            os.remove(os.path.join(app.config['UPLOAD_FOLDER'], file))
        os.rmdir(app.config['UPLOAD_FOLDER'])


@pytest.fixture(name='processor_mock')
def fixture_mock_processor():
    """Fixture to patch and return the global AudioProcessor instance."""
    with patch('backend.app.processor') as mock:
        yield mock

@pytest.fixture(name='send_file_mock')
def fixture_mock_send_file():
    """
    Fixture yields the MOCK FUNCTION itself,
    allowing tests to assert call history.
    """
    with patch('backend.app.send_file') as mock_func:
        mock_response = MagicMock()
        mock_func.return_value = mock_response
        yield mock_func


def create_mock_file(filename, content_type='audio/wav'):
    """Creates a mock file object suitable for Flask testing."""
    return (io.BytesIO(b"file content"), filename, content_type)

# Tests for app.py Helper Function
def test_allowed_file():
    """Tests the file extension validation helper."""
    assert allowed_file('audio.wav') is True
    assert allowed_file('song.mp3') is True
    assert allowed_file('track.WAV') is True
    assert allowed_file('document.pdf') is False
    assert allowed_file('noextension') is False

# Tests for Flask Endpoints (Routes)
def test_health_check(test_client):
    """Tests the simple health check endpoint."""
    response = test_client.get('/health')
    assert response.status_code == 200
    assert response.json['status'] == 'healthy'

# --- /convert tests ---

@patch('backend.app.os.remove')
def test_convert_audio_success(mock_remove, test_client,
                                processor_mock, send_file_mock):
    """Tests successful audio conversion via the /convert route."""
    processor_mock.convert_format.return_value = '/tmp/output.mp3'
    data = {
        'file': create_mock_file('test.wav', 'audio/wav'),
        'target_format': 'mp3'
    }
    response = test_client.post('/convert', data=data,
                                content_type='multipart/form-data')

    assert response.status_code == 200
    processor_mock.convert_format.assert_called_once()
    send_file_mock.assert_called_once_with(
        '/tmp/output.mp3',
        as_attachment=True,
        download_name='converted.mp3'
    )

    send_file_mock.return_value.call_on_close.assert_called_once()
    cleanup_func = send_file_mock.return_value.call_on_close.call_args[0][0]
    cleanup_func()
    assert mock_remove.call_count == 2

@patch('backend.app.os.remove')
def test_convert_audio_missing_input(mock_remove, test_client, processor_mock):
    """Tests /convert when the required 'file' or 'target_format' is missing."""
    # Case 1: Missing file
    response_no_file = test_client.post('/convert',
                                        data={'target_format': 'mp3'},
                                        content_type='multipart/form-data')
    assert response_no_file.status_code == 400
    assert response_no_file.json['error'] == 'No file provided'

    # Case 2: Missing target_format (but file present)
    data_no_format = {'file': create_mock_file('test.wav', 'audio/wav')}
    response_no_format = test_client.post('/convert', data=data_no_format,
                                          content_type='multipart/form-data')
    assert response_no_format.status_code == 400
    assert response_no_format.json['error'] == 'Missing target_format parameter'

    processor_mock.convert_format.assert_not_called()

@patch('backend.app.os.remove')
def test_convert_audio_invalid_file_type(mock_remove, test_client, processor_mock):
    """Tests /convert with an invalid input file type (e.g., PDF)."""
    data = {
        'file': create_mock_file('doc.pdf', 'application/pdf'),
        'target_format': 'mp3'
    }
    response = test_client.post('/convert', data=data,
                                content_type='multipart/form-data')
    assert response.status_code == 400
    assert response.json['error'] == 'Invalid file type'
    processor_mock.convert_format.assert_not_called()

@patch('backend.app.os.remove')
def test_convert_audio_processor_failure(mock_remove, test_client, processor_mock):
    """Tests /convert when the AudioProcessor raises an exception."""
    # FIX: Raise AudioProcessingError, which the app route explicitly catches.
    processor_mock.convert_format.side_effect = AudioProcessingError("Format validation failed")

    data = {
        'file': create_mock_file('test.wav', 'audio/wav'),
        'target_format': 'mp3'
    }

    response = test_client.post('/convert', data=data,
                                content_type='multipart/form-data')
    assert response.status_code == 500
    assert response.json['error'] == 'Format validation failed'

# --- /merge tests ---

@patch('backend.app.os.remove')
@patch('backend.app.uuid.uuid4',
       side_effect=[MagicMock(hex='f1_id'), MagicMock(hex='f2_id')])
def test_merge_audio_success(mock_uuid, mock_remove, test_client,
                              processor_mock, send_file_mock):
    """Tests successful audio merging via the /merge route."""
    processor_mock.merge_files.return_value = '/tmp/merged.ogg'
    data = {
        'files[]': [
            create_mock_file('track1.wav', 'audio/wav'),
            create_mock_file('track2.wav', 'audio/wav'),
        ],
        'output_format': 'ogg'
    }
    response = test_client.post('/merge', data=data,
                                content_type='multipart/form-data')
    assert response.status_code == 200
    processor_mock.merge_files.assert_called_once()
    send_file_mock.assert_called_once_with(
        '/tmp/merged.ogg',
        as_attachment=True,
        download_name='merged.ogg'
    )
    cleanup_func = send_file_mock.return_value.call_on_close.call_args[0][0]
    cleanup_func()
    assert mock_remove.call_count == 3

@patch('backend.app.os.remove')
@patch('backend.app.uuid.uuid4',
       side_effect=[MagicMock(hex='f1_id'), MagicMock(hex='f2_id')])
def test_merge_audio_one_invalid_file(mock_uuid, mock_remove, test_client,
                                       processor_mock):
    """Tests merge failure when one of the uploaded files is an invalid type."""
    data = {
        'files[]': [
            create_mock_file('track1.wav', 'audio/wav'),
            create_mock_file('document.pdf', 'application/pdf'),
        ],
        'output_format': 'ogg'
    }

    response = test_client.post('/merge', data=data,
                                content_type='multipart/form-data')

    # The first invalid file should trigger a 400 response
    assert response.status_code == 400
    assert 'Invalid file type' in response.json['error']
    assert 'document.pdf' in response.json['error']
    processor_mock.merge_files.assert_not_called()

def test_merge_audio_error_too_few_files(test_client, processor_mock):
    """Tests merge failure when only one file is uploaded."""
    data = {
        'files[]': [
            create_mock_file('track1.wav', 'audio/wav'),
        ],
        'output_format': 'mp3'
    }

    response = test_client.post('/merge', data=data,
                                content_type='multipart/form-data')

    assert response.status_code == 400
    assert 'At least 2 files required' in response.json['error']
    processor_mock.merge_files.assert_not_called()

# --- /export tests ---

@patch('backend.app.os.remove')
def test_export_audio_success(mock_remove, test_client,
                               processor_mock, send_file_mock):
    """Tests successful audio export with specific settings via /export route."""
    processor_mock.export_with_settings.return_value = '/tmp/exported.flac'
    data = {
        'file': create_mock_file('source.wav', 'audio/wav'),
        'format': 'flac',
        'bitrate': '1411k',
        'sample_rate': '96000'
    }
    response = test_client.post('/export', data=data,
                                content_type='multipart/form-data')
    assert response.status_code == 200

    expected_settings = {
        'bitrate': '1411k',
        'sample_rate': 96000
    }
    # Check for correct arguments passed to export_with_settings (already fixed in prior iteration)
    processor_mock.export_with_settings.assert_called_once_with(
        processor_mock.export_with_settings.call_args[0][0],
        'flac',
        expected_settings
    )

    send_file_mock.assert_called_once_with(
        '/tmp/exported.flac',
        as_attachment=True,
        download_name='export.flac'
    )

@patch('backend.app.os.remove')
def test_export_audio_missing_required_params(mock_remove, test_client,
                                                processor_mock):
    """Tests /export when mandatory parameters are missing."""
    data = {
        'file': create_mock_file('source.wav', 'audio/wav'),
        'format': 'flac',
        'bitrate': '1411k',
        # 'sample_rate' is missing
    }

    response = test_client.post('/export', data=data,
                                content_type='multipart/form-data')

    assert response.status_code == 400
    assert 'Missing required export settings' in response.json['error']
    processor_mock.export_with_settings.assert_not_called()

@patch('backend.app.os.remove')
def test_export_audio_invalid_sample_rate(mock_remove, test_client, processor_mock):
    """Tests /export when sample_rate is not a valid integer."""
    data = {
        'file': create_mock_file('source.wav', 'audio/wav'),
        'format': 'flac',
        'bitrate': '1411k',
        'sample_rate': 'invalid_number'
    }

    response = test_client.post('/export', data=data,
                                content_type='multipart/form-data')

    assert response.status_code == 400
    assert 'Sample rate must be an integer' in response.json['error']
    processor_mock.export_with_settings.assert_not_called()

# --- /metadata tests ---

@patch('backend.app.os.remove')
@patch('backend.app.uuid.uuid4', return_value=MagicMock(hex='meta_id'))
def test_get_metadata_success(mock_uuid, mock_remove, test_client, processor_mock):
    """Tests successful metadata retrieval via /metadata route."""
    expected_metadata = {
        'duration_seconds': 5.0,
        'channels': 2,
        'dBFS': -15.0
    }
    processor_mock.get_audio_info.return_value = expected_metadata
    data = {
        'file': create_mock_file('info.mp3', 'audio/mp3')
    }
    response = test_client.post('/metadata', data=data,
                                content_type='multipart/form-data')
    assert response.status_code == 200
    assert response.json == expected_metadata

    processor_mock.get_audio_info.assert_called_once()
    assert mock_remove.call_count == 1
    assert 'meta_id_info.mp3' in mock_remove.call_args[0][0]

@patch('backend.app.os.remove')
def test_get_metadata_invalid_file_type(mock_remove, test_client, processor_mock):
    """Tests /metadata with an invalid input file type (e.g., PDF)."""
    data = {
        'file': create_mock_file('doc.pdf', 'application/pdf')
    }

    response = test_client.post('/metadata', data=data,
                                content_type='multipart/form-data')

    assert response.status_code == 400
    assert response.json['error'] == 'Invalid file type'
    processor_mock.get_audio_info.assert_not_called()

@patch('backend.app.os.remove')
def test_get_metadata_no_file(mock_remove, test_client, processor_mock):
    """Tests metadata endpoint with no file provided."""
    response = test_client.post('/metadata', data={},
                                content_type='multipart/form-data')

    assert response.status_code == 400
    assert response.json['error'] == 'No file provided'
    processor_mock.get_audio_info.assert_not_called()
