import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface ReCaptchaCheckboxRef {
  reset: () => void;
  getValue: () => string | null;
}

interface ReCaptchaCheckboxProps {
  onTokenChange: (token: string | null) => void;
  className?: string;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact';
}

const SIGNUP_RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SIGNUP_SITE_KEY || '';

let scriptLoadingPromise: Promise<void> | null = null;

function loadRecaptchaScript(): Promise<void> {
  if (!SIGNUP_RECAPTCHA_SITE_KEY) {
    return Promise.resolve();
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    if (window.grecaptcha?.render) {
      window.grecaptcha.ready?.(() => resolve());
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[src*="recaptcha/api.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA script')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load reCAPTCHA script'));
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

const ReCaptchaCheckbox = forwardRef<ReCaptchaCheckboxRef, ReCaptchaCheckboxProps>(
  ({ onTokenChange, className, theme = 'light', size = 'normal' }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<number | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          if (widgetIdRef.current !== null) {
            window.grecaptcha?.reset?.(widgetIdRef.current);
          }
          onTokenChange(null);
        },
        getValue: () => {
          if (widgetIdRef.current === null) {
            return null;
          }
          const response = window.grecaptcha?.getResponse?.(widgetIdRef.current);
          if (!response) {
            return null;
          }
          return response;
        },
      }),
      [onTokenChange]
    );

    useEffect(() => {
      if (!SIGNUP_RECAPTCHA_SITE_KEY) {
        console.warn('[CAPTCHA] Signup site key not configured - checkbox will not render.');
        return;
      }

      let mounted = true;

      loadRecaptchaScript()
        .then(() => {
          if (!mounted) {
            return;
          }

          window.grecaptcha?.ready?.(() => {
            if (!containerRef.current || widgetIdRef.current !== null) {
              return;
            }

            try {
              widgetIdRef.current = window.grecaptcha?.render?.(containerRef.current, {
                sitekey: SIGNUP_RECAPTCHA_SITE_KEY,
                theme,
                size,
                callback: (token: string) => {
                  onTokenChange(token);
                  setLoadError(null);
                },
                'expired-callback': () => {
                  onTokenChange(null);
                },
                'error-callback': () => {
                  console.warn('[CAPTCHA] reCAPTCHA encountered an error.');
                  onTokenChange(null);
                  setLoadError('Verification failed to load. Please refresh and try again.');
                },
              }) ?? null;
            } catch (error) {
              console.error('[CAPTCHA] Failed to render reCAPTCHA widget:', error);
              setLoadError('Verification failed to load. Please refresh and try again.');
            }
          });
        })
        .catch((error) => {
          console.error('[CAPTCHA] Failed to load reCAPTCHA script:', error);
          if (mounted) {
            setLoadError('Verification failed to load. Please refresh and try again.');
          }
        });

      return () => {
        mounted = false;
      };
    }, [onTokenChange, theme, size]);

    return (
      <div className={className}>
        <div ref={containerRef} className="flex justify-center" />
        {loadError ? (
          <p className="mt-2 text-center text-sm text-red-500" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>
    );
  }
);

ReCaptchaCheckbox.displayName = 'ReCaptchaCheckbox';

export { SIGNUP_RECAPTCHA_SITE_KEY };
export default ReCaptchaCheckbox;

