import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoonLoader } from 'react-spinners';
import { RxCross2 } from 'react-icons/rx';
import { AppContext } from '../../../context/AppContext';
import { db } from '../../../firebase/firebase';
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
import styles from '../Layout.module.css';

function ProjectsTab() {
  const { userData, loading: userLoading, activeProject, setActiveProject } = useContext(AppContext);
  const navigate = useNavigate();
  
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

  return (
    <div className={styles.container}>
      {isLoading || userLoading ? (
        <div className={styles.spinner}>
          <MoonLoader color="white" />
        </div>
      ) : !userData ? (
        <p className={styles.loginPrompt}>
          Please{' '}
          <span
            className={styles.loginLink}
            onClick={() => navigate('/login')}
          >
            login
          </span>{' '}
          to view your projects.
        </p>
      ) : (
        <div>
          {projects.length === 0 ? (
            <p className={styles.emptyMessage}>No projects yet.</p>
          ) : (
            <ul className={styles.projectsList}>
              {[...projects].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                <li
                  key={p.name}
                  onClick={() => setActiveProject(p.name)}
                  className={`${styles.projectItem} ${p.name === activeProject ? styles.activeProject : ''}`}
                >
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {inputFieldOpen && (
        <div onClick={e => e.stopPropagation()} className={styles.inputSection}>
          <input
            type="text"
            placeholder="Project Name"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            className={styles.input}
          />
          <button className={styles.saveButton} onClick={createProject}>
            Save
          </button>
          <button
            className={styles.closeButton}
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

      {error && <p className={styles.error}>{error}</p>}

      <button
        className={styles.createButton}
        onClick={() => setInputFieldOpen(true)}
        disabled={inputFieldOpen || !userData}
      >
        Create a project
      </button>
    </div>
  );
}

export default ProjectsTab;