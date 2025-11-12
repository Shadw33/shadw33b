/**
 * reCAPTCHA Enterprise integration for security
 * Using score-based keys for better bot detection
 */

type RecaptchaEnterprise = {
  ready: (callback: () => void) => Promise<void>;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

export type Grecaptcha = {
  enterprise?: RecaptchaEnterprise;
  render?: (
    container: HTMLElement,
    parameters: Record<string, unknown>
  ) => number;
  reset?: (widgetId?: number) => void;
  getResponse?: (widgetId?: number) => string;
  ready?: (callback: () => void) => void;
};

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

/**
 * Initialize reCAPTCHA Enterprise
 * This loads the Enterprise script in the background
 */
export function initCaptcha(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!RECAPTCHA_SITE_KEY) {
      console.warn('[CAPTCHA] Site key not configured - skipping CAPTCHA');
      resolve(); // Allow in development
      return;
    }

    // Check if already loaded
    if (window.grecaptcha?.enterprise) {
      resolve();
      return;
    }

    // Load reCAPTCHA Enterprise script
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      // Wait for grecaptcha.enterprise to be ready
      window.grecaptcha?.enterprise?.ready(() => {
        console.log('[CAPTCHA] Enterprise reCAPTCHA initialized');
        resolve();
      });
    };
    
    script.onerror = () => {
      console.error('[CAPTCHA] Failed to load reCAPTCHA Enterprise script');
      reject(new Error('Failed to load CAPTCHA'));
    };
    
    document.head.appendChild(script);
  });
}

/**
 * Get CAPTCHA token for an action
 * This generates an encrypted response token that needs to be validated on the backend
 * 
 * @param action - Meaningful name for the user interaction (e.g., 'LOGIN', 'CHAT', 'SIGNUP')
 * @returns Promise with the encrypted token or null if CAPTCHA not configured
 */
export async function getCaptchaToken(action: string = 'SUBMIT'): Promise<string | null> {
  if (!RECAPTCHA_SITE_KEY) {
    return null; // No CAPTCHA in development
  }

  // Initialize if not already loaded
  if (!window.grecaptcha?.enterprise) {
    await initCaptcha();
  }

  try {
    const enterprise = window.grecaptcha?.enterprise;
    if (!enterprise) {
      console.warn('[CAPTCHA] Enterprise execute API unavailable');
      return null;
    }
    // Use Enterprise execute API
    const token = await enterprise.execute(RECAPTCHA_SITE_KEY, { action });
    return token;
  } catch (error) {
    console.error('[CAPTCHA] Error getting token:', error);
    return null;
  }
}

