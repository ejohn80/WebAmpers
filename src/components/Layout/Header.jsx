import {useUserData} from "../../hooks/useUserData";
import {useNavigate} from "react-router-dom";
import DropdownPortal from "./DropdownPortal";
import "./Header.css";

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
          <DropdownPortal side="right" />
        </div>
      </div>
    </div>
  );
}

export default Header;