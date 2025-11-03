import React, { useState } from 'react';
import AudioExporter from './AudioExporter'; 
import '../AudioExport/AudioExportButton.css'; 

/**
 * A modal wrapper for the AudioExporter component.
 * @param {object} props
 * @param {Tone.ToneAudioBuffer} props.audioBuffer - The audio buffer to export.
 * @param {function} props.onExportComplete - Callback function on export success/failure.
 */
const AudioExportModal = ({ audioBuffer, onExportComplete }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const closeModal = () => setIsModalOpen(false);
    const openModal = () => {
        if (audioBuffer) {
            setIsModalOpen(true);
        } else {
            console.log("Export disabled: No audio buffer loaded.");
        }
    }

    const handleExportComplete = (result) => {
        closeModal();
        if (onExportComplete) {
            onExportComplete(result);
        }
    };

    const Modal = ({ children, isOpen, onClose }) => {
        if (!isOpen) return null;

        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', 
                justifyContent: 'center', alignItems: 'center', zIndex: 1000
            }}>
                {/* Modal Content */}
                <div style={{ 
                    background: 'white', 
                    padding: '20px', 
                    borderRadius: '8px', 
                    minWidth: '400px', 
                    maxWidth: '90vw', 
                    maxHeight: '90vh', 
                    overflowY: 'auto' 
                }}>
                    <button 
                        onClick={onClose} 
                        style={{ float: 'right', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#333', lineHeight: '20px' }}
                    >&times;</button>
                    <h2 style={{ color: '#333', marginTop: '0' }}>Export Audio Settings</h2>
                    {children}
                </div>
            </div>
        );
    };

    return (
        <>
            <button
                className="import-button"
                onClick={openModal}
                disabled={!audioBuffer} 
                title={!audioBuffer ? "Load an audio file to enable export" : "Export Audio"}
            >
                Export Audio
            </button>

            <Modal isOpen={isModalOpen} onClose={closeModal}>
                <AudioExporter
                    audioBuffer={audioBuffer}
                    onExportComplete={handleExportComplete}
                />
            </Modal>
        </>
    );
};

export default AudioExportModal;