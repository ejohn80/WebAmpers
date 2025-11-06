import {useUserData} from "../../hooks/useUserData";
import {useNavigate} from "react-router-dom";
import DropdownPortal from "./DropdownPortal";
import AudioImportButton from "../AudioImport/AudioImportButton";
import AudioExportButton from "../AudioExport/AudioExportButton"; // Add this import
import "./Header.css";
import "../AudioImport/AudioImportButton.css"; // Import AudioImportButton CSS
import "../AudioExport/AudioExportButton.css"; // Import AudioExportButton CSS

function Header({
  onImportSuccess,
  onImportError,
  audioBuffer,
  onExportComplete,
}) {
  const navigate = useNavigate();
  const {userData, loading} = useUserData();

  return (
    <div className="header">
      <div className="container">
        {/* container for logo + dropdown */}
        <div className="leftContainer">
          <span className="webampText">Webamp</span>
          <DropdownPortal
            side="left"
            audioBuffer={audioBuffer}
            onExportComplete={onExportComplete}
            onImportSuccess={onImportSuccess}
            onImportError={onImportError}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "15px",
            height: "100%",
          }}
        >
          {/* Add standalone AudioImportButton here */}
          <AudioImportButton
            onImportSuccess={onImportSuccess}
            onImportError={onImportError}
          />

          {/* Add standalone AudioExportButton here */}
          <AudioExportButton
            audioBuffer={audioBuffer}
            onExportComplete={onExportComplete}
          />

          <DropdownPortal side="right" />
        </div>
      </div>
    </div>
  );
}

export default Header;
