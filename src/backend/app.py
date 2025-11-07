"""
Flask API for audio processing operations that can't be done in browser
"""
import os
import uuid
import logging

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

from backend.AudioProcessor import AudioProcessor

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'ogg', 'flac'}
MAX_FILE_SIZE = 50 * 1024 * 1024

# Set up logging before app configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE
processor = AudioProcessor()

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Helper for cleanup logic (to avoid nested blocks)
def _cleanup_paths(paths):
    """Attempt to remove a list of files, ignoring OSError on failure."""
    for path in paths:
        if path:
            try:
                os.remove(path)
            except OSError:
                logging.warning("Failed to remove file during cleanup: %s", path)
            except Exception:
                pass

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'message': 'Backend is running'}), 200

@app.route('/convert', methods=['POST'])
def convert_audio():
    """
    Convert audio file from one format to another
    Expects: file (audio file), target_format (wav, mp3, ogg)
    Returns: converted file
    """
    input_path = None
    output_path = None

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    target_format = request.form.get('target_format')

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not target_format:
        return jsonify({'error': 'Missing target_format parameter'}), 400

    target_format = target_format.lower()

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    if target_format not in ALLOWED_EXTENSIONS:
        return jsonify({'error': 'Invalid target format'}), 400

    try:
        unique_id = uuid.uuid4().hex
        input_filename = secure_filename(f"{unique_id}_input_{file.filename}")
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_filename)
        file.save(input_path)

        output_path = processor.convert_format(input_path, target_format)
        response = send_file(
            output_path,
            as_attachment=True,
            download_name=f"converted.{target_format}"
        )

        @response.call_on_close
        def cleanup():
            _cleanup_paths([input_path, output_path])

        return response

    except Exception as exc:
        _cleanup_paths([input_path, output_path])
        return jsonify({'error': str(exc)}), 500

@app.route('/merge', methods=['POST'])
def merge_audio():
    """
    Merge multiple audio files into one
    Expects: files[] (multiple audio files), output_format (wav, mp3)
    Returns: merged file
    """
    file_paths = []
    output_path = None
    try:
        files = request.files.getlist('files[]')

        if len(files) < 2:
            return jsonify({'error': 'At least 2 files required for merging'}), 400

        output_format = request.form.get('output_format')

        if not output_format:
            return jsonify({'error': 'Missing output_format parameter'}), 400

        output_format = output_format.lower()
        for file in files:
            if not allowed_file(file.filename):
                # Clean up files saved so far before returning error
                _cleanup_paths(file_paths)
                return jsonify({'error': f'Invalid file type: {file.filename}'}), 400

            unique_id = uuid.uuid4().hex
            filename = secure_filename(f"{unique_id}_{file.filename}")
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            file_paths.append(filepath)

        output_path = processor.merge_files(file_paths, output_format)
        response = send_file(
            output_path,
            as_attachment=True,
            download_name=f"merged.{output_format}"
        )

        @response.call_on_close
        def cleanup():
            all_paths_to_remove = file_paths + ([output_path] if output_path else [])
            _cleanup_paths(all_paths_to_remove)

        return response

    except Exception as exc:
        paths_to_clean = file_paths + ([output_path] if output_path else [])
        _cleanup_paths(paths_to_clean)

        error_keywords = ['Invalid file', 'At least 2 files', 'Missing output_format']
        status_code = 400 if any(kw in str(exc) for kw in error_keywords) else 500
        return jsonify({'error': str(exc)}), status_code


@app.route('/export', methods=['POST'])
def export_audio():
    """
    Export audio with specific settings (bitrate, sample rate, etc.)
    Expects: file, format, bitrate (optional), sample_rate (optional)
    Returns: exported file
    """
    input_path = None
    output_path = None

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    output_format = request.form.get('format')
    bitrate = request.form.get('bitrate')
    sample_rate_str = request.form.get('sample_rate')

    if not output_format or not bitrate or not sample_rate_str:
        return jsonify({
            'error': 'Missing required export settings '
                     '(format, bitrate, or sample_rate)'
        }), 400

    output_format = output_format.lower()

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    try:
        unique_id = uuid.uuid4().hex
        input_filename = secure_filename(f"{unique_id}_{file.filename}")
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_filename)
        file.save(input_path)

        # Moved sample rate conversion inside try block for cleaner error handling
        try:
            sample_rate = int(sample_rate_str)
        except ValueError as exc:
            # Reraise as a string error that will be caught by outer handler
            raise ValueError("Sample rate must be an integer") from exc

        output_path = processor.export_with_settings(
            input_path,
            output_format,
            bitrate,
            sample_rate
        )

        response = send_file(
            output_path,
            as_attachment=True,
            download_name=f"export.{output_format}"
        )

        @response.call_on_close
        def cleanup():
            _cleanup_paths([input_path, output_path])

        return response

    except Exception as exc:
        _cleanup_paths([input_path, output_path])

        error_keywords = ['Sample rate must be', 'Missing required']
        status_code = 400 if any(kw in str(exc) for kw in error_keywords) else 500
        return jsonify({'error': str(exc)}), status_code

@app.route('/metadata', methods=['POST'])
def get_metadata():
    """
    Get detailed metadata about an audio file
    Expects: file
    Returns: JSON with metadata
    """
    filepath = None
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type'}), 400

        unique_id = uuid.uuid4().hex
        filename = secure_filename(f"{unique_id}_{file.filename}")
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        metadata = processor.get_audio_info(filepath)
        return jsonify(metadata), 200

    except Exception as exc:
        return jsonify({'error': str(exc)}), 500

    finally:
        if filepath:
            try:
                os.remove(filepath)
            except OSError:
                pass
