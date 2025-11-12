import { useEffect, useState } from 'react';

import AppChat from './AppChat';
import Auth from './Auth';
import { LegalModal } from './LegalModal';
import { Button } from './ui/button';
import { RainbowButton } from './ui/rainbow-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Database, Eye, Lock, Shield, Skull, Terminal, Zap, Code } from 'lucide-react';

import { useLegalModal } from '@/hooks/useLegalModal';
import { supabase } from '../lib/supabase';

interface LandingPageProps {
  apiUrl: string;
  initialPath?: string;
}

export default function LandingPage({ apiUrl, initialPath }: LandingPageProps) {
  const [showChat, setShowChat] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showGlitch, setShowGlitch] = useState(false);

  const fallbackPath = showChat ? '/terminal' : '/';
  const { activeModal: activeLegalModal, openModal: openLegalModal, closeModal: closeLegalModal } = useLegalModal({
    initialPath,
    fallbackPath,
  });
  
  // Check if user is already authenticated
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const storedRedirect = localStorage.getItem('postAuthRedirect');
        if (storedRedirect === 'chat') {
          setShowChat(true);
          localStorage.removeItem('postAuthRedirect');
        }
      }
      
      // Check if we're on /terminal path
      const path = initialPath || window.location.pathname;
      if (path === '/terminal' || path.startsWith('/terminal')) {
        // Check if user is authenticated
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.user) {
          setShowChat(true);
        } else {
          // Redirect to home and show auth
          window.history.replaceState({}, '', '/');
          setShowChat(true);
          setShowAuth(true);
          localStorage.setItem('postAuthRedirect', 'chat');
        }
      }
      
    };
    
    checkSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setShowChat(false);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [initialPath]);

  // Glitch effect every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setShowGlitch(true);
      setTimeout(() => setShowGlitch(false), 150);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAccess = async () => {
    localStorage.setItem('postAuthRedirect', 'chat');
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setShowChat(true);
      setShowAuth(false);
      return;
    }
    setShowChat(true);
    setShowAuth(true);
  };

  const handleAuthSuccess = async (_email: string) => {
    setShowAuth(false);
    localStorage.removeItem('postAuthRedirect');
    const hostname = window.location.hostname;
    if (
      hostname === 'wormgpt.ai' ||
      hostname === 'www.wormgpt.ai' ||
      hostname.includes('netlify.app')
    ) {
      window.location.href = '/terminal';
      return;
    }
    setShowChat(true);
  };

  const featureHighlights = [
    {
      icon: Shield,
      title: 'Responsible Access',
      subtitle: 'Licensed cybersecurity research',
      description: 'Strictly designed for authorized researchers and defenders who need an unrestricted lab assistant without operational bloat.',
      accent: 'from-purple-500/50 via-purple-500/30 to-transparent'
    },
    {
      icon: Code,
      title: 'Secure Coding Guidance',
      subtitle: 'Hardening & remediation',
      description: 'Generate safer configurations, patches, and code review checklists focused on preventing real-world exploits before they land.',
      accent: 'from-blue-500/50 via-blue-500/30 to-transparent'
    },
    {
      icon: Zap,
      title: 'Incident Response Support',
      subtitle: 'Repeatable workflows',
      description: 'Produce tabletop exercises, IR runbooks, and communication templates that help teams move from detection to resolution faster.',
      accent: 'from-yellow-500/50 via-yellow-500/30 to-transparent'
    },
    {
      icon: Lock,
      title: 'Compliance Alignment',
      subtitle: 'Framework mapping',
      description: 'Translate findings into NIST, ISO, PCI DSS, and other control frameworks so documentation stays audit-ready.',
      accent: 'from-green-500/50 via-green-500/30 to-transparent'
    },
    {
      icon: Skull,
      title: 'Adversary Simulation Insights',
      subtitle: 'Defense through understanding',
      description: 'Study attacker techniques safely by requesting simulated threat narratives and countermeasures tailored to your environment.',
      accent: 'from-pink-500/50 via-pink-500/30 to-transparent'
    },
    {
      icon: Eye,
      title: 'Threat Detection Ideas',
      subtitle: 'Monitoring & analytics',
      description: 'Build detections, hypothesis-driven hunts, and anomaly scenarios curated for modern SOC tooling and telemetry.',
      accent: 'from-teal-500/50 via-teal-500/30 to-transparent'
    },
    {
      icon: Database,
      title: 'Research Knowledge Base',
      subtitle: 'Curated references',
      description: 'Tap into vetted checklists, playbooks, and citations created in partnership with cybersecurity educators.',
      accent: 'from-orange-500/50 via-orange-500/30 to-transparent'
    },
    {
      icon: Terminal,
      title: 'Workflow Automation',
      subtitle: 'Repeatable scripting',
      description: 'Draft defensive scripts, SOAR playbooks, and automation scaffolding while preserving secure defaults.',
      accent: 'from-indigo-500/50 via-indigo-500/30 to-transparent'
    }
  ];

  const complianceGuidelines = [
    {
      title: 'What You Can Do',
      tone: 'text-purple-300',
      points: [
        'Practice ethical penetration testing within authorized lab environments.',
        'Draft security policies, awareness training, and compliance documentation.',
        'Simulate adversary behaviour to strengthen defensive controls.',
        'Study threat intelligence and incident response best practices.'
      ]
    },
    {
      title: 'What Is Strictly Forbidden',
      tone: 'text-pink-300',
      points: [
        'Instructions for live malware deployment or propagation.',
        'Phishing, social engineering, or fraud campaigns targeting individuals.',
        'Guidance for unauthorized system access or privacy violations.',
        'Requests that facilitate physical harm, harassment, or other illegal acts.'
      ]
    }
  ];

  const privacyAssurances = [
    {
      title: 'Zero Conversation Storage',
      tone: 'text-purple-300',
      description: 'Sessions are ephemeral. Messages are never logged, replicated, or sent to third parties.'
    },
    {
      title: 'No Training On User Data',
      tone: 'text-pink-300',
      description: 'We do not fine-tune or adapt the model using chat activity. Updates come from curated datasets reviewed by cybersecurity experts.'
    },
    {
      title: 'Expert-Crafted Knowledge',
      tone: 'text-teal-300',
      description: 'Content is sourced with AI and security professionals working alongside a dedicated data labeling and annotation company.'
    }
  ];

  if (showChat) {
    return (
      <>
        <div className="relative min-h-screen bg-black">
          <div className={showAuth ? 'pointer-events-none transition duration-200' : ''}>
            <AppChat apiUrl={apiUrl} onOpenLegalModal={openLegalModal} />
          </div>
          {showAuth && (
            <Auth onAuthSuccess={handleAuthSuccess} apiUrl={apiUrl} variant="modal" />
          )}
        </div>
        <LegalModal type="privacy" open={activeLegalModal === 'privacy'} onClose={() => closeLegalModal()} />
        <LegalModal type="terms" open={activeLegalModal === 'terms'} onClose={() => closeLegalModal()} />
      </>
    );
  }

  return (
    <>
      <div className="relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-black">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-black to-black"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-purple-500/10 via-transparent to-transparent"></div>
        
        {/* Floating particles */}
        <div className="absolute inset-0">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-purple-500/30 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10">
        {/* Navigation */}
        <nav className="fixed top-0 w-full bg-black/30 backdrop-blur-md border-b border-purple-500/20 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <img 
                  src="/avatar_5ee1eeab-f41d-4602-be31-1b5ebb0ce277.png" 
                  alt="WormGPT AI Logo" 
                  className="w-10 h-10 rounded-full"
                />
                <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                  WormGPT AI
                </span>
              </div>
              <div className="flex items-center gap-4">
                <RainbowButton onClick={handleAccess}>
                  Test Now For Free!
                </RainbowButton>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="min-h-screen flex items-center justify-center px-4 pt-20">
          <div className="max-w-7xl mx-auto text-center py-20">
            {/* Glitch Title */}
            <div className="mb-8 flex justify-center">
              <img 
                src="/avatar_5ee1eeab-f41d-4602-be31-1b5ebb0ce277.png" 
                alt="WormGPT AI Logo" 
                className="w-32 h-32 rounded-full shadow-2xl shadow-purple-500/50"
              />
            </div>
            
            <h1 className={`text-7xl md:text-9xl font-black mb-6 transition-all duration-150 ${showGlitch ? 'glitch' : ''}`}>
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                WORMGPT AI
              </span>
              <span className="block text-xs md:text-lg font-normal text-green-400 mt-4 font-mono">
                {'>'} ./SYSTEM_INITIATED_[OK]
              </span>
            </h1>
            
            <p className="text-lg text-gray-400 mb-6 max-w-3xl mx-auto font-mono">
              // Dedicated to defensive security, threat analysis, and resilience building.
              <br />
              // Built for ethical hackers, researchers, and security professionals.
            </p>
            <p className="text-sm text-gray-300 max-w-3xl mx-auto font-mono leading-relaxed mb-8">
              No conversations are stored or reused to train our models. WormGPT AI is trained offline with cybersecurity, AI, and machine learning professionals in partnership with specialized data labeling teams to ensure reliable, private outcomes every time you log in.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20">
              <Button
                onClick={handleAccess}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-6 px-12 text-xl shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 transition-all transform hover:scale-105 border border-purple-400/30"
              >
                <Terminal className="mr-2 h-6 w-6" />
                Access Terminal
              </Button>
            </div>

            {/* Terminal Window */}
            <Card className="bg-black/80 border border-purple-500/30 backdrop-blur-xl mx-auto max-w-4xl mt-16">
              <CardHeader className="border-b border-purple-500/20 py-4">
                <div className="flex items-center justify-between font-mono text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <span className="hidden sm:block">wormgpt-ai@terminal ~</span>
                  </div>
                  <span className="text-purple-300">/research-mode</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 py-6 font-mono text-sm text-left">
                <div className="flex gap-2">
                  <span className="text-green-400">{'$'}</span>
                  <span className="text-gray-300">./wormgpt-ai --research-mode</span>
                </div>
                <div className="text-purple-400 animate-pulse">
                  {'>'} Initializing cybersecurity guidance safeguards...
                </div>
                <div className="text-green-400">
                  {'['}<span className="text-yellow-400">OK</span>{']'} Model loaded successfully
                </div>
                <div className="text-gray-500 pt-3">
                  {'//'} Ready to support defense, compliance, and research prompts only.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-32 relative">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-20">
              <h2 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-4">
                REQUEST: GRANT_ACCESS
              </h2>
              <p className="text-gray-400 text-xl font-mono">
                {'//'} Advanced capabilities for your operations
              </p>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
              {featureHighlights.map(({ icon: Icon, title, subtitle, description, accent }, idx) => (
                <Card
                  key={idx}
                  className="bg-black/70 border border-purple-500/20 transition duration-300 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20"
                >
                  <CardHeader className="flex flex-row items-start gap-4 pb-2">
                    <div className={`rounded-md bg-gradient-to-br ${accent} p-3 text-white shadow-inner`}> 
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-white text-lg">{title}</CardTitle>
                      <CardDescription className="text-xs uppercase tracking-wide text-purple-200/80">
                        {subtitle}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Compliance Section */}
        <section className="py-20 border-y border-purple-500/20 bg-black/40 backdrop-blur-xl">
          <div className="max-w-5xl mx-auto px-4 space-y-6">
            <h3 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
              Responsible Use Commitment
            </h3>
            <p className="text-gray-400 text-base md:text-lg leading-relaxed">
              WormGPT AI is provided solely for cybersecurity education, research, and defensive readiness. You must never use the platform to design, request, or execute malicious activity. The assistant automatically declines examples such as malware development, phishing schemes, financial fraud, identity theft, privacy invasion, harassment, or physical harm. No other categories are authorized; prompts outside this scope are automatically rejected.
            </p>
            <div className="grid md:grid-cols-2 gap-6 text-gray-300">
              {complianceGuidelines.map(({ title, tone, points }) => (
                <Card key={title} className="bg-black/70 border border-purple-500/30">
                  <CardHeader>
                    <CardTitle className={`${tone} text-xl`}>{title}</CardTitle>
                    <CardDescription className="text-gray-400 text-sm">
                      Follow the policy to maintain access.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-gray-400">
                      {points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid md:grid-cols-3 gap-4 text-gray-300">
              {privacyAssurances.map(({ title, tone, description }) => (
                <Card key={title} className="bg-black/70 border border-purple-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className={`${tone} text-lg`}>{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-purple-500/20 py-16 bg-black/40 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="flex items-center gap-3 mb-4 md:mb-0">
                <img 
                  src="/avatar_5ee1eeab-f41d-4602-be31-1b5ebb0ce277.png" 
                  alt="WormGPT AI" 
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                    WormGPT AI
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">
                    {'//'} For security research only
                  </p>
                </div>
              </div>
              <div className="text-center md:text-right">
                <p className="text-gray-400 font-mono text-sm mb-2">
                  {'//'} Cybersecurity education & research only
                </p>
                <p className="text-xs text-gray-600 font-mono">
                  2024 WormGPT AI. Conversations are not logged or used for model training.
                </p>
                <div className="mt-3 flex items-center justify-center md:justify-end gap-4 text-xs font-mono text-purple-200">
                  <button
                    type="button"
                    onClick={() => openLegalModal('privacy')}
                    className="underline decoration-dotted decoration-purple-400 hover:text-purple-100"
                  >
                    Privacy Policy
                  </button>
                  <button
                    type="button"
                    onClick={() => openLegalModal('terms')}
                    className="underline decoration-dotted decoration-purple-400 hover:text-purple-100"
                  >
                    Terms of Service
                  </button>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Glitch CSS */}
      <style>{`
        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
        }
        .glitch {
          animation: glitch 0.3s infinite;
          text-shadow: 
            2px 0 #ff00c1,
            -2px 0 #00fff9,
            2px 0 #ff00c1;
        }
      `}</style>
      </div>
      <LegalModal type="privacy" open={activeLegalModal === 'privacy'} onClose={() => closeLegalModal()} />
      <LegalModal type="terms" open={activeLegalModal === 'terms'} onClose={() => closeLegalModal()} />
    </>
  );
}
