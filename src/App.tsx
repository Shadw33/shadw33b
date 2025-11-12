import { useEffect, useState } from 'react';
import LandingPage from './components/LandingPage';
import './App.css';

function App() {
  const [initialPath, setInitialPath] = useState<string>('/');
  
  const getApiUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_PROXY_TARGET;
    if (envUrl) {
      return envUrl.replace(/\/$/, '');
    }

    const { hostname, origin } = window.location;

    if (hostname === 'localhost' || hostname.startsWith('127.')) {
      return 'http://localhost:3001';
    }

    if (hostname === 'shadw33b.vercel.app') {
      return 'https://backw33.vercel.app';
    }

    if (hostname === 'wormgpt.ai' || hostname === 'www.wormgpt.ai') {
      return 'https://wormgpt.ai';
    }

    if (hostname.endsWith('.vercel.app')) {
      return origin;
    }

    return origin;
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

