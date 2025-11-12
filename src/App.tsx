import { useEffect, useState } from 'react';
import LandingPage from './components/LandingPage';
import './App.css';

function App() {
  const [initialPath, setInitialPath] = useState<string>('/');
  
  const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }

    const { hostname, origin } = window.location;

    if (hostname === 'localhost' || hostname.startsWith('127.')) {
      return 'http://localhost:3001';
    }

    if (
      hostname === 'wormgpt.ai' ||
      hostname === 'www.wormgpt.ai'
    ) {
      return origin;
    }

    if (hostname.includes('netlify.app') || hostname.includes('netlify.com')) {
      return origin;
    }

    return 'https://wormgpt.ai';
  };
  
  useEffect(() => {
    setInitialPath(window.location.pathname);
  }, []);
  
  const apiUrl = getApiUrl();
  
  return (
    <LandingPage apiUrl={apiUrl} initialPath={initialPath} />
  );
}

export default App

