import { useState, useEffect, useContext } from "react";
import { IoSearch } from "react-icons/io5";
import { FaPlay } from "react-icons/fa";
import { MoonLoader } from 'react-spinners';
import { AppContext } from '../../../context/AppContext';
import { db } from '../../../firebase/firebase';
import {
  collection,
  query,
  addDoc,
  serverTimestamp,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import AudioImportButton from "../../AudioImport/AudioImportButton2";
import styles from "../Layout.module.css";

const AssetsTab = ({ onImportSuccess, onImportError }) => {
  const { userData, loading: userLoading, activeProject } = useContext(AppContext);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userData || !activeProject) {
      setAssets([]);
      return;
    }

    setIsLoading(true);
    const q = query(
      collection(db, 'users', userData.uid, 'assets'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const assetsData = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }));
        // Filter by active project
        setAssets(assetsData.filter(asset => asset.projectName === activeProject));
        setIsLoading(false);
      },
      (err) => {
        console.error('Error fetching assets:', err);
        setError('Failed to load assets');
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [userData, activeProject]);

  const handleImportSuccess = async (importResult) => {
    console.log('Import result:', importResult);
    
    if (!userData || !activeProject) {
      if (onImportError) {
        onImportError('Please select a project first');
      }
      return;
    }

    try {
      const { metadata } = importResult;
      
      // Convert duration from "3m 45.23s" to "03:45"
      const formatDuration = (durationStr) => {
        const match = durationStr.match(/(\d+)m\s+([\d.]+)s/);
        if (match) {
          const minutes = match[1].padStart(2, '0');
          const seconds = Math.floor(parseFloat(match[2])).toString().padStart(2, '0');
          return `${minutes}:${seconds}`;
        }
        return '00:00';
      };
      
      // Save asset to Firestore
      await addDoc(collection(db, 'users', userData.uid, 'assets'), {
        name: metadata.name || 'Untitled',
        duration: formatDuration(metadata.duration),
        bitrate: 'N/A', // AudioImporter doesn't provide bitrate
        size: metadata.size,
        sampleRate: metadata.sampleRate,
        channels: metadata.numberOfChannels,
        projectName: activeProject,
        createdAt: serverTimestamp(),
      });

      if (onImportSuccess) {
        onImportSuccess(importResult);
      }
    } catch (err) {
      console.error('Error saving asset:', err);
      setError('Failed to save asset');
      if (onImportError) {
        onImportError('Failed to save asset');
      }
    }
  };

  const filteredAssets = assets.filter(asset =>
    asset.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {!activeProject ? (
          <p className={styles.emptyMessage}>Please select a project to view assets.</p>
        ) : (
          <>
            <div className={styles.searchBar}>
              <IoSearch size={18} color="#888" />
              <input
                type="text"
                placeholder="Search"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.tableHeader}>
              <div>Name</div>
              <div>Duration</div>
              <div>Bitrate</div>
            </div>

            {isLoading || userLoading ? (
              <div className={styles.spinner}>
                <MoonLoader color="white" size={30} />
              </div>
            ) : (
              <div className={styles.songList}>
                {filteredAssets.length === 0 ? (
                  <div className={styles.emptyMessage}>
                    {searchTerm ? 'No results' : 'No assets yet. Import some audio files!'}
                  </div>
                ) : (
                  filteredAssets.map(asset => (
                    <div key={asset.id} className={styles.songRow}>
                      <div className={styles.songName}>
                        <FaPlay size={10} color="#fff" />
                        <span>{asset.name}</span>
                      </div>
                      <div className={styles.songDuration}>{asset.duration}</div>
                      <div className={styles.songBitrate}>{asset.bitrate}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.importButtonWrapper}>
              <AudioImportButton
                onImportSuccess={handleImportSuccess}
                onImportError={onImportError}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AssetsTab;