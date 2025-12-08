/**
 * Header Component
 *
 * Main application header with logo and dropdown menus.
 * Left side: Logo + File/Edit/Tools/Settings dropdowns
 * Right side: User/Guest dropdown
 *
 * Props passed to DropdownPortal for track operations and import/export.
 */

import DropdownPortal from "./DropdownPortal";
import "./Header.css";

function Header({
  onImportSuccess,
  onImportError,
  tracks,
  totalLengthMs,
  onExportComplete,
  onCutTrack,
  onCopyTrack,
  onPasteTrack,
  onDeleteTrack,
  selectedTrackId,
  hasClipboard,
  onSamplerRecording,
}) {
  return (
    <div className="header">
      <div className="container">
        {/* Left container: Logo and main menu dropdowns */}
        <div className="leftContainer">
          <span className="webampText">WebAmp</span>
          <DropdownPortal
            side="left"
            tracks={tracks}
            totalLengthMs={totalLengthMs}
            onExportComplete={onExportComplete}
            onImportSuccess={onImportSuccess}
            onImportError={onImportError}
            onCutTrack={onCutTrack}
            onCopyTrack={onCopyTrack}
            onPasteTrack={onPasteTrack}
            onDeleteTrack={onDeleteTrack}
            selectedTrackId={selectedTrackId}
            hasClipboard={hasClipboard}
            onSamplerRecording={onSamplerRecording}
          />
        </div>

        {/* Right container: User/Guest dropdown */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "15px",
            height: "100%",
          }}
        >
          <DropdownPortal side="right" />
        </div>
      </div>
    </div>
  );
}

export default Header;
