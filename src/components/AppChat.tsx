import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';

import type { LegalModalType } from '@/lib/legal';

import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip';
import {
  Mic,
  Paperclip,
  Square,
  Camera,
  Video,
  Search,
  Bot,
  Loader2,
  Send,
  Trash2,
  LogOut,
  Settings,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import MessageRenderer from './MessageRenderer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import './AppChat.css';
import './MessageRenderer.css';

const PREMIUM_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$90/mo',
    tokens: '250k tokens/mo',
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$140/mo',
    tokens: '750k tokens/mo',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$210/mo',
    tokens: '2M tokens/mo',
  },
];

class QuotaExceededError extends Error {
  nextUnlockAt?: string;
  cooldownRemainingMs?: number;
  displayMessage?: string;

  constructor(nextUnlockAt?: string | null, cooldownRemainingMs?: number | null) {
    super('QUOTA_EXCEEDED');
    this.name = 'QuotaExceededError';
    this.nextUnlockAt = nextUnlockAt ?? undefined;
    this.cooldownRemainingMs = cooldownRemainingMs ?? undefined;
  }
}

interface UsageStatus {
  usage: {
    count: number;
    limit: number;
    remaining: number;
    cooldownRemainingMs: number | null;
    nextUnlockAt: string | null;
  };
  subscription: {
    tier: string;
    status: string;
  };
  canMakeRequest: boolean;
  isAdmin: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
  nextUnlockAt?: string | null;
  cooldownRemainingMs?: number | null;
}

interface AppChatProps {
  apiUrl?: string;
  onOpenLegalModal?: (type: LegalModalType) => void;
}

export default function AppChat({ apiUrl = 'https://wormgpt.ai', onOpenLegalModal }: AppChatProps) {
  const handleLegalNoticeClick = (type: LegalModalType) => {
    if (onOpenLegalModal) {
      onOpenLegalModal(type);
      return;
    }

    const fallbackPath = type === 'privacy' ? '/privacy-policy' : '/terms';
    if (typeof window !== 'undefined') {
      window.location.href = fallbackPath;
    }
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingPremiumFeature, setPendingPremiumFeature] = useState<string | null>(null);
  const [upgradeDialogMode, setUpgradeDialogMode] = useState<'feature' | 'quota' | null>(null);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [nextUnlockAt, setNextUnlockAt] = useState<Date | null>(null);
  const [countdownText, setCountdownText] = useState<string | null>(null);

  const isRecording = false;
  const [preferences, setPreferences] = useState({
    showTimestamps: true,
    autoScroll: true,
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const preferencesRef = useRef(preferences);
  const countdownIntervalRef = useRef<number | null>(null);
  const lastQuotaStateRef = useRef<boolean>(true);
  const isQuotaExceeded = usageStatus ? (!usageStatus.canMakeRequest && !usageStatus.isAdmin) : false;
  const sendDisabled = isLoading || !input.trim() || isQuotaExceeded;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('wormgpt-settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setPreferences((prev) => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to parse stored settings', error);
      }
    }
  }, []);

  useEffect(() => {
    preferencesRef.current = preferences;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('wormgpt-settings', JSON.stringify(preferences));
  }, [preferences]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (!preferencesRef.current.autoScroll) return;
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAttachFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf,.txt,.doc,.docx';
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0] ?? null;
      if (file) {
        handleFileUpload(file);
      }
    };
    input.click();
  };

  const isUpgradeDialogOpen = upgradeDialogMode !== null;

  const openUpgradePrompt = useCallback((featureName: string) => {
    setPendingPremiumFeature(featureName);
    setUpgradeDialogMode('feature');
  }, []);

  const openQuotaUpgradePrompt = useCallback(() => {
    setPendingPremiumFeature(null);
    setUpgradeDialogMode('quota');
  }, []);

  const handleUpgradeDialogChange = (open: boolean) => {
    if (!open) {
      setUpgradeDialogMode(null);
      setPendingPremiumFeature(null);
    }
  };

  const handlePlanSubscribe = (planId: string) => {
    console.log('Selected plan for Cryptomus checkout integration:', planId);
    // TODO: Integrate Cryptomus checkout flow here.
    setUpgradeDialogMode(null);
  };

  const computeCountdownText = useCallback((target: Date) => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) {
      return '00:00:00';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }, []);

  const fetchUsageStatus = useCallback(async (sessionOverride?: string) => {
    const sessionId = sessionOverride ?? sessionIdRef.current;
    if (!sessionId) return;

    try {
      const response = await fetch(`${apiUrl}/api/usage`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
        },
      });

      if (!response.ok) {
        console.warn('Failed to fetch usage status');
        return;
      }

      const data: UsageStatus = await response.json();
      setUsageStatus(data);

      const unlockIso = data.usage?.nextUnlockAt;
      const cooldownMs = data.usage?.cooldownRemainingMs ?? null;
      let unlockDate: Date | null = null;

      if (unlockIso) {
        unlockDate = new Date(unlockIso);
      } else if (cooldownMs && cooldownMs > 0) {
        unlockDate = new Date(Date.now() + cooldownMs);
      }

      if (!data.canMakeRequest) {
        if (unlockDate) {
          setNextUnlockAt(unlockDate);
        }
        if (lastQuotaStateRef.current) {
          openQuotaUpgradePrompt();
        }
      }

      if (data.canMakeRequest) {
        setNextUnlockAt(null);
        setCountdownText(null);
      }

      lastQuotaStateRef.current = data.canMakeRequest;
    } catch (error) {
      console.error('Failed to refresh usage status:', error);
    }
  }, [apiUrl, openQuotaUpgradePrompt]);

  useEffect(() => {
    if (!nextUnlockAt) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setCountdownText(null);
      return;
    }

    const refresh = () => {
      const diff = nextUnlockAt.getTime() - Date.now();
      if (diff <= 0) {
        setCountdownText(null);
        setNextUnlockAt(null);
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        fetchUsageStatus();
        return;
      }

      setCountdownText(computeCountdownText(nextUnlockAt));
    };

    refresh();
    const interval = window.setInterval(refresh, 1000);
    countdownIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
      countdownIntervalRef.current = null;
    };
  }, [nextUnlockAt, computeCountdownText, fetchUsageStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedSessionId = window.localStorage.getItem('wormgpt-session-id');
    if (storedSessionId) {
      sessionIdRef.current = storedSessionId;
      fetchUsageStatus(storedSessionId);
    }
  }, [fetchUsageStatus]);

  const handleSpeechToText = async () => {
    openUpgradePrompt('Speech to Text');
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setStreamingMessageId(null);
    }
  };

  const handleImageGeneration = () => {
    openUpgradePrompt('Image Generation');
  };

  const handleVideoGeneration = () => {
    openUpgradePrompt('Video Generation');
  };

  const handleDarkWebSearch = () => {
    openUpgradePrompt('Dark Web Search');
  };

  const handleAgentMode = () => {
    openUpgradePrompt('AI Agent Mode');
  };

  const handleFileUpload = (file: File) => {
    setSelectedFile(file);
    
    // Auto-generate OCR prompt for images and documents
    const fileType = file.type.toLowerCase();
    let prompt = '';
    
    if (fileType.includes('image')) {
      prompt = `Analyze this image and extract all text content using OCR. Provide a detailed transcription of any text found in the image, maintaining formatting and structure where possible.`;
    } else if (fileType.includes('pdf')) {
      prompt = `Extract and transcribe all text content from this PDF document. Maintain the original formatting and structure.`;
    } else {
      prompt = `Analyze this document and extract its text content. Provide a complete transcription.`;
    }
    
    setInput(prompt);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };


  const handleSend = async () => {
    if ((!input.trim() && !selectedFile) || isLoading) return;

    if (isQuotaExceeded) {
      openQuotaUpgradePrompt();
      return;
    }

    let messageContent = input.trim();
    let fileData = null;

    // Handle file upload
    if (selectedFile) {
      try {
        // Convert file to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });

        fileData = {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
          data: base64
        };

        // If no text input, use default OCR prompt
        if (!messageContent) {
          messageContent = `Analyze this file (${selectedFile.name}) and extract all text content using OCR. Provide a detailed transcription.`;
        }
      } catch (error) {
        console.error('Error processing file:', error);
        alert('Error processing file. Please try again.');
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, assistantMessage]);

    // Create abort controller for stop functionality
    abortControllerRef.current = new AbortController();

    try {
      // Get CAPTCHA token
      const { getCaptchaToken } = await import('../lib/captcha');
      const captchaToken = await getCaptchaToken('CHAT');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      };
      
      if (sessionIdRef.current) {
        headers['X-Session-ID'] = sessionIdRef.current;
      }
      
      if (captchaToken) {
        headers['X-Captcha-Token'] = captchaToken;
      }
      
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          fileData: fileData,
          stream: true
        }),
        signal: abortControllerRef.current.signal
      });

      const responseSessionId = response.headers.get('X-Session-ID');
      if (responseSessionId) {
        sessionIdRef.current = responseSessionId;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('wormgpt-session-id', responseSessionId);
        }
      }
      
      if (!response.ok) {
        let errorMessage = `API error (${response.status})`;
        let errorData: ApiErrorResponse | null = null;

        try {
          errorData = await response.json() as ApiErrorResponse;
        } catch {
          errorData = null;
        }

        if (response.status === 429 && errorData?.error === 'quota_exceeded') {
          const quotaError = new QuotaExceededError(
            errorData.nextUnlockAt ?? null,
            errorData.cooldownRemainingMs ?? null
          );
          if (typeof errorData.message === 'string') {
            quotaError.displayMessage = errorData.message;
          }
          throw quotaError;
        }

        if (errorData) {
          if (typeof errorData.message === 'string') {
            errorMessage = errorData.message;
          } else if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          }
        } else {
          try {
            const errorText = await response.text();
            if (errorText) {
              errorMessage = errorText;
            }
          } catch (textError) {
            console.warn('Failed to read error body', textError);
          }
        }

        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
          let doneReading = false;
          while (!doneReading) {
            const { done, value } = await reader.read();
            if (done) {
              doneReading = true;
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.chunk) {
                    setStreamingMessageId(assistantMessageId);
                    setMessages(prev => prev.map(msg => 
                      msg.id === assistantMessageId
                        ? { ...msg, content: msg.content + data.chunk }
                        : msg
                    ));
                    setTimeout(scrollToBottom, 50);
                  }
                  
                  if (data.done) {
                    setIsLoading(false);
                    setStreamingMessageId(null);
                  }

                  if (data.triggerUpgrade) {
                    openUpgradePrompt('Unlimited prompts');
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
          }
        }
      } else {
        const data = await response.json();

        if (data.triggerUpgrade) {
          openUpgradePrompt('Unlimited prompts');
        }
        
        if (data.response) {
          setStreamingMessageId(assistantMessageId);
          const words = data.response.split(/(\s+)/);
          let currentContent = '';
          
          for (const word of words) {
            currentContent += word;
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId
                ? { ...msg, content: currentContent }
                : msg
            ));
            setTimeout(scrollToBottom, 10);
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 20));
          }
          setStreamingMessageId(null);
        }

        setIsLoading(false);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request aborted by user');
        return;
      }

      if (error instanceof QuotaExceededError) {
        lastQuotaStateRef.current = false;

        const unlockDate = error.nextUnlockAt
          ? new Date(error.nextUnlockAt)
          : error.cooldownRemainingMs
            ? new Date(Date.now() + error.cooldownRemainingMs)
            : nextUnlockAt;

        if (unlockDate) {
          setNextUnlockAt(unlockDate);
          setCountdownText(computeCountdownText(unlockDate));
        }

        const cooldownMs = unlockDate ? Math.max(0, unlockDate.getTime() - Date.now()) : (error.cooldownRemainingMs ?? null);

        setUsageStatus(prev => {
          if (!prev) {
            return {
              usage: {
                count: 1,
                limit: 1,
                remaining: 0,
                cooldownRemainingMs: cooldownMs,
                nextUnlockAt: unlockDate ? unlockDate.toISOString() : (error.nextUnlockAt ?? null)
              },
              subscription: {
                tier: 'free',
                status: 'active'
              },
              canMakeRequest: false,
              isAdmin: false
            };
          }

          return {
            ...prev,
            usage: {
              ...prev.usage,
              remaining: 0,
              cooldownRemainingMs: cooldownMs,
              nextUnlockAt: unlockDate ? unlockDate.toISOString() : prev.usage.nextUnlockAt
            },
            canMakeRequest: false
          };
        });

        const displayMessage = error.displayMessage;
        let quotaNotice = displayMessage && displayMessage.length > 0
          ? displayMessage
          : 'Your last response consumed your free quota for today.';

        if (unlockDate) {
          quotaNotice = `${quotaNotice} Access unlocks in ${computeCountdownText(unlockDate)}.`;
        }

        const quotaMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: `🚫 ${quotaNotice}`,
          timestamp: new Date()
        };

        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId ? quotaMessage : msg
        ));

        openQuotaUpgradePrompt();
        return;
      }

      console.error('Error sending message:', error);
      
      let errorContent = 'Failed to get response. ';
      
      if (error instanceof Error) {
        if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
          errorContent = `Unable to connect to the server. Please make sure the backend server is running on ${apiUrl}

**Quick Check:**
1. Is the server running? Run: \`cd server && npm run dev\`
2. Check the server console for errors
3. Verify the server is accessible at ${apiUrl}/api/health`;
        } else if (error.message?.includes('configuration') || error.message?.includes('API key') || error.message?.includes('unavailable')) {
          errorContent = `🔧 **Setup Required**

${error.message}

**Quick Fix:**
1. Get a LongCat API key from https://longcat.chat/
2. Add to \`server/.env\`:
   \`\`\`
   LONGCAT_API_KEY=your_api_key_here
   LLM_PROVIDER=longcat
   \`\`\`
3. Restart the server

**Need Help?** Check the SETUP_GUIDE.md file in your project root.`;
        } else if (error.message) {
          errorContent = error.message;
        } else {
          errorContent += 'Please try again.';
        }
      } else {
        errorContent += 'Please try again.';
      }
      
      const errorMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: `❌ Error: ${errorContent}`,
        timestamp: new Date()
      };
      
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId ? errorMessage : msg
      ));
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
      setSelectedFile(null); // Clear selected file after sending
      abortControllerRef.current = null;
      if (sessionIdRef.current) {
        fetchUsageStatus();
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    if (confirm('Clear all messages?')) {
      setMessages([]);
      setSelectedFile(null);
      inputRef.current?.focus();
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const regenerateResponse = async (messageId: string) => {
    // Find the message and the user message that prompted it
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;

    const userMessage = messages[messageIndex - 1];
    if (userMessage.role !== 'user') return;

    // Remove the assistant message we're regenerating
    const updatedMessages = messages.slice(0, messageIndex);
    setMessages(updatedMessages);

    // Set the input to the user message content and trigger send
    setInput(userMessage.content);
    
    // Trigger the send after a short delay to ensure state is updated
    setTimeout(() => {
      handleSend();
    }, 100);
  };

  const openSettings = () => {
    setIsSettingsOpen(true);
  };

  const handlePreferenceChange = (key: 'showTimestamps' | 'autoScroll') => (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const { checked } = event.target;
    setPreferences((prev) => ({ ...prev, [key]: checked }));
    if (key === 'autoScroll' && checked) {
      setTimeout(() => scrollToBottom('instant'), 0);
    }
  };

  // Example prompts from knowledge base
  return (
    <>
    <div className="app-chat">
      {/* Header */}
      <div className="chat-header">
        <div className="header-content">
          <div className="flex items-center gap-3">
            <img 
              src="/avatar_5ee1eeab-f41d-4602-be31-1b5ebb0ce277.png" 
              alt="WormGPT AI Logo" 
              className="w-10 h-10 rounded-full"
            />
            <div>
              <h1>WormGPT AI</h1>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={openSettings}
            className="flex items-center gap-2 bg-gray-800/60 text-gray-200 border border-gray-700 hover:bg-gray-700 hover:text-white"
          >
            <Settings className="h-4 w-4" />
            <span className="text-sm">Settings &amp; help</span>
          </Button>
          {messages.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearChat}
                  className="text-gray-400 hover:text-white"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear chat</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="text-gray-400 hover:text-white"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <img 
              src="/avatar_5ee1eeab-f41d-4602-be31-1b5ebb0ce277.png" 
              alt="WormGPT AI Logo" 
              className="w-24 h-24 rounded-full mb-4"
            />
            <h2>WormGPT AI</h2>
            <p className="mt-2 text-xs text-gray-500 max-w-2xl">
              Unrestricted AI
            </p>
            
            {/* Example Prompts */}
          </div>
        ) : (
          messages.map((message) => (
            <MessageRenderer
              key={message.id}
              content={message.content}
              role={message.role}
              timestamp={message.timestamp}
              isStreaming={streamingMessageId === message.id}
              showTimestamp={preferences.showTimestamps}
              onRegenerate={message.role === 'assistant' ? () => regenerateResponse(message.id) : undefined}
            />
          ))
        )}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div 
        className={`chat-input-container ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {selectedFile && (
          <div className="file-preview">
            <Paperclip className="h-4 w-4" />
            <span className="text-sm">{selectedFile.name}</span>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>
        )}
        <div className="input-wrapper">
          {/* Action Buttons */}
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleAttachFile}
                  className="text-gray-400 hover:text-white"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach document</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSpeechToText}
                  disabled={isRecording}
                  className="text-gray-400 hover:text-white"
                >
                  {isRecording ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Speech to text</TooltipContent>
            </Tooltip>
          </div>

          {/* Text Input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={selectedFile ? "Describe what you want to extract from the file..." : "Ask anything or drag & drop files for OCR... (Enter to send)"}
            rows={1}
            className="chat-input"
            disabled={isLoading}
          />

          {/* Ultimate Features */}
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleImageGeneration}
                  className="text-gray-400 hover:text-white"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Image Generation
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleVideoGeneration}
                  className="text-gray-400 hover:text-white"
                >
                  <Video className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Video Generation
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDarkWebSearch}
                  className="text-gray-400 hover:text-white"
                >
                  <Search className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Dark Web Search
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleAgentMode}
                  className="text-gray-400 hover:text-white"
                >
                  <Bot className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                AI Agent Mode
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Send/Stop Button */}
          {isLoading ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStopGeneration}
                  className="text-red-400 hover:text-red-300"
                >
                  <Square className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop generation</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleSend}
                  disabled={sendDisabled}
                  size="icon"
                  className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isQuotaExceeded ? 'Daily access resets soon' : 'Send message'}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {isQuotaExceeded && (
          <div className="quota-banner">
            <p>
              Access unlocks in <strong>{countdownText ?? 'under 24 hours'}</strong>. Upgrade to keep the conversation going without waiting.
            </p>
          </div>
        )}
        <p className="chat-legal-notice">
          By messaging WormGPT AI, you agree to our{' '}
          <button
            type="button"
            onClick={() => handleLegalNoticeClick('terms')}
            className="underline decoration-dotted decoration-purple-400 text-purple-200 hover:text-purple-100"
          >
            Terms of Service
          </button>{' '}
          and have read our{' '}
          <button
            type="button"
            onClick={() => handleLegalNoticeClick('privacy')}
            className="underline decoration-dotted decoration-purple-400 text-purple-200 hover:text-purple-100"
          >
            Privacy Policy
          </button>
          .
        </p>
      </div>

    </div>

    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent className="bg-black/90 border border-purple-500/40 text-gray-200">
        <DialogHeader>
          <DialogTitle>Settings &amp; help</DialogTitle>
          <DialogDescription>
            Adjust your chat workspace preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex items-start gap-3">
            <input
              id="toggle-timestamps"
              type="checkbox"
              checked={preferences.showTimestamps}
              onChange={handlePreferenceChange('showTimestamps')}
              className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-900 text-purple-500 focus:ring-purple-400"
            />
            <div>
              <label htmlFor="toggle-timestamps" className="font-medium text-sm text-gray-100">
                Show message timestamps
              </label>
              <p className="text-xs text-gray-400 mt-1">
                Display the time each message was sent in the conversation.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="toggle-autoscroll"
              type="checkbox"
              checked={preferences.autoScroll}
              onChange={handlePreferenceChange('autoScroll')}
              className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-900 text-purple-500 focus:ring-purple-400"
            />
            <div>
              <label htmlFor="toggle-autoscroll" className="font-medium text-sm text-gray-100">
                Auto-scroll during responses
              </label>
              <p className="text-xs text-gray-400 mt-1">
                Keep the latest assistant responses in view while streaming.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-4 text-sm text-purple-100">
            <p className="font-medium">Need help?</p>
            <p className="text-xs text-purple-200 mt-1">
              For support or documentation, contact the WormGPT AI team at <a href="mailto:support@wormgpt.ai" className="underline text-purple-200 hover:text-purple-100">support@wormgpt.ai</a>.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsSettingsOpen(false)} className="border-purple-500/40 text-purple-200 hover:bg-purple-500/20">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={isUpgradeDialogOpen} onOpenChange={handleUpgradeDialogChange}>
      <DialogContent className="bg-black/90 border border-purple-500/40 text-gray-200">
        <DialogHeader>
          <DialogTitle>
            {upgradeDialogMode === 'quota' ? 'Unlock More Access' : 'Upgrade Required'}
          </DialogTitle>
          <DialogDescription>
            {upgradeDialogMode === 'quota'
              ? 'Your last response consumed your free quota for today. Upgrade to continue without waiting.'
              : 'Upgrade your plan to get access to premium features.'}
          </DialogDescription>
        </DialogHeader>

        {upgradeDialogMode === 'feature' && pendingPremiumFeature && (
          <div className="rounded-md border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-100">
            <span className="font-medium">{pendingPremiumFeature}</span> is available on our premium plans.
          </div>
        )}

        {upgradeDialogMode === 'quota' && (
          <div className="rounded-md border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-100">
            <p>
              Access unlocks in <span className="font-semibold text-white">{countdownText ?? 'under 24 hours'}</span>.
            </p>
            <p className="text-xs text-purple-200 mt-1">
              The countdown resets your daily allowance automatically. Upgrade to stay in the flow without limits.
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-3">
          {PREMIUM_PLANS.map((plan) => (
            <div
              key={plan.id}
              className="flex items-center justify-between rounded-lg border border-purple-500/30 bg-gray-900/80 px-4 py-3"
            >
              <div>
                <p className="text-base font-semibold text-white">{plan.name}</p>
                <p className="text-sm text-purple-200">{plan.price}</p>
                <p className="text-xs text-gray-400">{plan.tokens} • Full privacy</p>
              </div>
              <Button
                onClick={() => handlePlanSubscribe(plan.id)}
                className="bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800"
              >
                Subscribe
              </Button>
            </div>
          ))}
        </div>

      </DialogContent>
    </Dialog>
    </>
  );
}
