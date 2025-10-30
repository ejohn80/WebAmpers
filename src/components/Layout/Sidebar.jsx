import { useState, useEffect } from 'react';
import DraggableDiv from '../Generic/DraggableDiv';

import styles from './Layout.module.css';

import { useUserData } from '../../hooks/useUserData';
import { RxCross2 } from "react-icons/rx";
import { useNavigate } from 'react-router-dom';

import { MoonLoader } from "react-spinners";

import AssetsTab from './Sidebar/AssetsTab';



import { db } from '../../firebase/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
  onSnapshot
} from 'firebase/firestore';

/**
 * Sidebar component for the application layout.
 * @param {object} props - The component props.
 * @param {number} props.width - The current width of the sidebar.
 * @param {function} props.onImportSuccess - Callback for successful audio import.
 * @param {function} props.onImportError - Callback for failed audio import.
 */
function Sidebar({ width, onImportSuccess, onImportError }) {
  const navigate = useNavigate();
  const { userData, loading: userLoading } = useUserData();
  const [currentTab, setCurrentTab] = useState("projects");
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [inputFieldOpen, setInputFieldOpen] = useState(false);

  const createProject = async () => {
    setError(null);
    if (!projectName.trim()) {
      setError('Project name cannot be empty');
      return;
    }

    try {
      // check for duplicate
      const q = query(
        collection(db, 'projects'),
        where('ownerId', '==', userData.uid),
        where('name', '==', projectName.trim())
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        setError('A project with that name already exists.');
        return;
      }

      await addDoc(collection(db, 'projects'), {
        ownerId: userData.uid,
        name: projectName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setProjectName('');
      setInputFieldOpen(false);
    } catch (e) {
      console.error(e);
      setError('Failed to create project.');
    }
  };

  useEffect(() => {
    if (!userData) {
      setProjects([]);
      return;
    }

    setIsLoading(true);
    const q = query(
      collection(db, 'projects'),
      where('ownerId', '==', userData.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    });

    return unsubscribe;
  }, [userData]);

  const ProjectsTab = () => {
    return (
      <div>
        {isLoading || userLoading ? (
          <div className={styles.spinner} style={{ display: 'flex', justifyContent: 'center', color: 'white' }}>
            <MoonLoader color="white" />
          </div>
        ) : !userData ? (
          <p style={{ marginTop: '20px' }}>
            Please{' '}
            <span
              style={{ color: 'blue', cursor: 'pointer' }}
              onClick={() => navigate('/login')}
            >
              login
            </span>{' '}
            to view your projects.
          </p>
        ) : (
          <div style={{ marginTop: '20px' }}>
            {projects.length === 0 ? (
              <p>No projects yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {projects.map(p => (
                  <li key={p.id} style={{ marginBottom: '8px', border: '1px solid black', padding: '4px' }}>
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {inputFieldOpen && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: '10px' }}>
            <input
              type="text"
              placeholder="Project Name"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
            />
            <button style={{ margin: '0 5px' }} onClick={createProject}>Save</button>
            <button
              onClick={() => {
                setInputFieldOpen(false);
                setProjectName('');
                setError(null);
              }}
            >
              <RxCross2 />
            </button>
          </div>
        )}

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button
          style={{ marginTop: '30px' }}
          onClick={() => setInputFieldOpen(true)}
          disabled={inputFieldOpen || !userData}
        >
          Create a project
        </button>
      </div>
    )
  }

  const tabs = {
    projects: {
      label: 'Projects',
      component: <ProjectsTab />,
    },
    effects: {
      label: 'Effects',
      component: '',
    },
    assets: {
      label: 'Assets',
      component: <AssetsTab onImportSuccess onImportError />,
    },
  };


  return (
    <DraggableDiv color="1E1D20" className="sidebar-container">
      <div style={{ display: 'flex', marginBottom: '10px', borderRadius: '8px' }}>
        {Object.entries(tabs).map(([key, tab]) => (
          <button
            key={key}
            onClick={() => setCurrentTab(key)}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              background: currentTab === key ? '#00e5ff' : '#2b2b2b',
              color: currentTab === key ? '#000' : '#00e5ff',
              fontWeight: currentTab === key ? 'bold' : 'normal',
              cursor: 'pointer',
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>{tabs[currentTab].component}</div>
    </DraggableDiv>
  );
}

export default Sidebar;

