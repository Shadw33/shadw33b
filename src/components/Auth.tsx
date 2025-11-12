import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { initCaptcha, getCaptchaToken } from '../lib/captcha';
import ReCaptchaCheckbox, { SIGNUP_RECAPTCHA_SITE_KEY, type ReCaptchaCheckboxRef } from './security/ReCaptchaCheckbox';

interface AuthProps {
  onAuthSuccess: (email: string) => void;
  apiUrl?: string;
  variant?: 'fullpage' | 'modal';
}

// Client-side rate limiting for signup
const signupAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_SIGNUP_ATTEMPTS = 5;
const SIGNUP_WINDOW = 60 * 60 * 1000; // 1 hour

function canSignUp(): boolean {
  const key = 'signup_attempts';
  const now = Date.now();
  const attempts = signupAttempts.get(key);

  if (!attempts) {
    signupAttempts.set(key, { count: 1, lastAttempt: now });
    return true;
  }

  // Reset if window passed
  if (now - attempts.lastAttempt > SIGNUP_WINDOW) {
    signupAttempts.set(key, { count: 1, lastAttempt: now });
    return true;
  }

  // Check if exceeded
  if (attempts.count >= MAX_SIGNUP_ATTEMPTS) {
    return false;
  }

  attempts.count++;
  attempts.lastAttempt = now;
  return true;
}

export default function Auth({ onAuthSuccess, apiUrl = '', variant = 'fullpage' }: AuthProps) {
  const isDevMode = !import.meta.env.PROD;
  const supabaseReady = isSupabaseConfigured();
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isModal = variant === 'modal';
  const signupCaptchaRef = useRef<ReCaptchaCheckboxRef | null>(null);
  const [signupCaptchaToken, setSignupCaptchaToken] = useState<string | null>(null);
  const signupCaptchaEnabled = Boolean(SIGNUP_RECAPTCHA_SITE_KEY);

  const handleSignupCaptchaToken = useCallback((token: string | null) => {
    setSignupCaptchaToken(token);
  }, []);

  const resetSignupCaptcha = useCallback(() => {
    signupCaptchaRef.current?.reset();
    setSignupCaptchaToken(null);
  }, []);

  const activateDevAuth = (authEmail: string, mode: 'signup' | 'signin') => {
    const normalizedEmail = authEmail.trim().toLowerCase();
    const domain = normalizedEmail.split('@')[1];
    const tier = normalizedEmail === 'admin@admin.ai' || domain === 'wormgpt.ai' ? 'ultimate' : 'free';
    localStorage.setItem('wormgpt_dev_auth', JSON.stringify({
      email: normalizedEmail,
      tier,
      timestamp: Date.now()
    }));

    setError('');
    setMessage(
      mode === 'signup'
        ? 'Account created in development mode. Redirecting...'
        : 'Signed in using development mode. Redirecting...'
    );
    onAuthSuccess(authEmail);
  };

  // Initialize CAPTCHA on mount
  useEffect(() => {
    initCaptcha()
      .then(() => {
        console.log('CAPTCHA initialized successfully');
      })
      .catch(() => {
        console.warn('CAPTCHA initialization failed, continuing without it');
      });
  }, []);

  useEffect(() => {
    if (!isSignUp) {
      setSignupCaptchaToken(null);
    }
  }, [isSignUp]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Client-side rate limiting
        if (!canSignUp()) {
          throw new Error('Too many signup attempts. Please try again in an hour.');
        }

        // Validate password strength
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }

        const requireSignupCaptcha = signupCaptchaEnabled;

        // Get CAPTCHA token
        let captchaToken: string | null = null;
        if (requireSignupCaptcha) {
          captchaToken = signupCaptchaRef.current?.getValue() ?? signupCaptchaToken;
          if (!captchaToken) {
            throw new Error('Please complete the CAPTCHA verification.');
          }
        } else {
          try {
            captchaToken = await getCaptchaToken('SIGNUP');
          } catch (err) {
            console.warn('CAPTCHA token generation failed:', err);
            // In development, continue without CAPTCHA
            if (!isDevMode) {
              throw new Error('CAPTCHA verification failed. Please try again.');
            }
          }
        }

        if (!supabaseReady && isDevMode) {
          console.warn('[Auth] Supabase not configured - using development signup flow');
          activateDevAuth(email, 'signup');
          return;
        }

        // Skip backend validation if apiUrl is not provided or endpoint is not available
        if (apiUrl) {
          try {
            const validateResponse = await fetch(`${apiUrl}/api/auth/validate-signup`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email,
                captchaToken,
              }),
            });

            if (!validateResponse.ok) {
              const errorData = await validateResponse.json();
              throw new Error(errorData.message || 'Signup validation failed');
            }
          } catch (err: any) {
            // If validation endpoint fails, check if it's a rate limit or validation error
            if (err.message.includes('rate') || err.message.includes('Too many')) {
              throw err;
            }
            // Otherwise, log but continue (endpoint might not be available in all setups)
            console.warn('Signup validation endpoint error:', err);
            console.log('Continuing with Supabase signup without backend validation...');
          }
        }

        // Proceed with Supabase signup with proper email redirect URL
        const getRedirectUrl = () => {
          const hostname = window.location.hostname;
          // Production domain
          if (
            hostname === 'wormgpt.ai' ||
            hostname === 'www.wormgpt.ai'
          ) {
            return 'https://wormgpt.ai/terminal';
          }
          // Netlify preview/branch deployments
          if (hostname.includes('netlify.app') || hostname.includes('netlify.com')) {
            return `${window.location.origin}/terminal`;
          }
          // Development fallback now defaults to production domain
          return 'https://wormgpt.ai/terminal';
        };
        
        const redirectUrl = getRedirectUrl();

        try {
          const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: redirectUrl,
            },
          });

          if (signUpError) throw signUpError;

          if (data.user) {
            if (data.user.email_confirmed_at) {
              setMessage('Account created successfully! Redirecting...');
              onAuthSuccess(email);
              return;
            }

            setMessage('Account created! Please check your inbox and confirm your email before signing in.');
            return;
          }

          if (isDevMode && !supabaseReady) {
            console.warn('[Auth] Supabase signup returned no user and backend not configured. Using development signup flow.');
            activateDevAuth(email, 'signup');
            return;
          }
        } catch (signUpErr: any) {
          console.warn('[Auth] Supabase signup error:', signUpErr?.message || signUpErr);
          if (isDevMode && !supabaseReady) {
            activateDevAuth(email, 'signup');
            return;
          }
          throw signUpErr;
        }
      } else {
        if (!supabaseReady && isDevMode) {
          console.warn('[Auth] Supabase not configured - using development signin flow');
          activateDevAuth(email, 'signin');
          return;
        }

        // Sign in flow
        try {
          const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (signInError) {
            if (isDevMode && !supabaseReady) {
              console.warn('[Auth] Supabase sign-in error (dev mode fallback):', signInError.message);
              activateDevAuth(email, 'signin');
              return;
            }
            // Check if error is due to unconfirmed email
            if (signInError.message.includes('email') && signInError.message.includes('confirm')) {
              throw new Error('Please confirm your email address before signing in. Check your inbox for a confirmation link.');
            }
            throw signInError;
          }

          if (data.user && !data.user.email_confirmed_at) {
            throw new Error('Please confirm your email address before signing in. Check your inbox for a confirmation link.');
          }

          setMessage('Signed in successfully! Redirecting...');
          onAuthSuccess(email);
        } catch (signInErr: any) {
          console.warn('[Auth] Supabase sign-in error:', signInErr?.message || signInErr);
          if (isDevMode && !supabaseReady) {
            activateDevAuth(email, 'signin');
            return;
          }
          throw signInErr;
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      if (signupCaptchaEnabled && isSignUp) {
        resetSignupCaptcha();
      }
      setLoading(false);
    }
  };

  const containerClasses = isModal
    ? 'fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70'
    : 'min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4';

  const cardClasses = isModal
    ? 'w-full max-w-md p-8 bg-black/80 border border-purple-500/50 shadow-2xl text-white'
    : 'w-full max-w-md p-8';

  const isSubmitDisabled = loading || (isSignUp && signupCaptchaEnabled && !signupCaptchaToken);

  return (
    <div className={containerClasses}>
      <Card className={cardClasses}>
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <img 
            src="/avatar_5ee1eeab-f41d-4602-be31-1b5ebb0ce277.png" 
            alt="WormGPT AI Logo" 
            className="w-24 h-24 rounded-full shadow-2xl"
          />
        </div>

        <h2 className="text-3xl font-bold text-center mb-2">
          {isSignUp ? 'Create Account' : 'Sign In'}
        </h2>
        <p className="text-center text-gray-400 mb-8">
          {isSignUp ? 'Start your free WormGPT AI journey' : 'Welcome back to WormGPT AI'}
        </p>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="•••••••• (min 8 characters)"
            />
            {isSignUp && (
              <p className="text-xs text-gray-400 mt-1">
                Password must be at least 8 characters long
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-500/20 border border-green-500 text-green-500 px-4 py-3 rounded-lg text-sm">
              {message}
            </div>
          )}

          {isSignUp && signupCaptchaEnabled && (
            <div className="mt-4">
              <ReCaptchaCheckbox
                ref={signupCaptchaRef}
                onTokenChange={handleSignupCaptchaToken}
                className="flex flex-col items-center gap-3"
              />
              <p className="text-center text-xs text-gray-400">
                This verification helps block automated account creation attempts.
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitDisabled}
            aria-busy={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 text-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
              setMessage('');
            }}
            className="text-purple-400 hover:text-purple-300 text-sm"
          >
            {isSignUp 
              ? 'Already have an account? Sign in' 
              : 'Need an account? Sign up'
            }
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-700">
          <p className="text-xs text-gray-400 text-center">
            By continuing, you agree to use WormGPT AI for security research purposes only
          </p>
        </div>
      </Card>
    </div>
  );
}

