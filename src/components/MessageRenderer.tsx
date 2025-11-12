import React, { useState } from 'react';
import { Copy, Check, Share, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface MessageRendererProps {
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  onRegenerate?: () => void;
  isStreaming?: boolean;
  showTimestamp?: boolean;
}

interface CodeBlock {
  language: string;
  code: string;
  startIndex: number;
  endIndex: number;
}

export default function MessageRenderer({ 
  content, 
  role, 
  timestamp, 
  onRegenerate,
  isStreaming = false,
  showTimestamp = true
}: MessageRendererProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [speechSynthesis, setSpeechSynthesis] = useState<SpeechSynthesisUtterance | null>(null);

  // Parse code blocks from content
  const parseCodeBlocks = (text: string): { blocks: CodeBlock[], textParts: string[] } => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks: CodeBlock[] = [];
    const textParts: string[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        textParts.push(text.slice(lastIndex, match.index));
      } else {
        textParts.push('');
      }

      // Add code block
      blocks.push({
        language: match[1] || 'text',
        code: match[2].trim(),
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      textParts.push(text.slice(lastIndex));
    } else {
      textParts.push('');
    }

    return { blocks, textParts };
  };

  const { blocks, textParts } = parseCodeBlocks(content);

  const copyToClipboard = async (text: string, type: 'code' | 'message' = 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(type === 'code' ? text : 'message');
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const shareMessage = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'WormGPT AI Response',
          text: content,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      // Fallback to copying to clipboard
      copyToClipboard(content, 'message');
    }
  };

  const toggleReadAloud = () => {
    if (isReading && speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsReading(false);
      setSpeechSynthesis(null);
    } else {
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      utterance.onend = () => {
        setIsReading(false);
        setSpeechSynthesis(null);
      };
      
      utterance.onerror = () => {
        setIsReading(false);
        setSpeechSynthesis(null);
      };

      window.speechSynthesis.speak(utterance);
      setIsReading(true);
      setSpeechSynthesis(utterance);
    }
  };

  const formatText = (text: string) => {
    // Convert markdown-style formatting to HTML
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="inline-code">$1</code>')
      .replace(/\n/g, '<br />');
  };

  const renderContent = () => {
    if (blocks.length === 0) {
      // No code blocks, render as formatted text
      return (
        <div 
          className="message-text"
          dangerouslySetInnerHTML={{ __html: formatText(content) }}
        />
      );
    }

    // Render text parts and code blocks
    return (
      <div className="message-text">
        {textParts.map((textPart, index) => (
          <React.Fragment key={index}>
            {textPart && (
              <div 
                dangerouslySetInnerHTML={{ __html: formatText(textPart) }}
              />
            )}
            {blocks[index] && (
              <div className="code-block-container">
                <div className="code-block-header">
                  <span className="code-language">{blocks[index].language}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="code-copy-btn"
                        onClick={() => copyToClipboard(blocks[index].code)}
                      >
                        {copiedText === blocks[index].code ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {copiedText === blocks[index].code ? 'Copied!' : 'Copy code'}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <pre className="code-block">
                  <code className={`language-${blocks[index].language}`}>
                    {blocks[index].code}
                  </code>
                </pre>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className={`message ${role}`}>
      <div className="message-content">
        {renderContent()}
        {isStreaming && <span className="typing-cursor">|</span>}
        
        <div className="message-footer">
          {showTimestamp && (
            <div className="message-time">
              {timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}
          
          {role === 'assistant' && !isStreaming && (
            <div className="message-actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(content, 'message')}
                    className="action-btn"
                  >
                    {copiedText === 'message' ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {copiedText === 'message' ? 'Copied!' : 'Copy response'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={shareMessage}
                    className="action-btn"
                  >
                    <Share className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share response</TooltipContent>
              </Tooltip>

              {onRegenerate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onRegenerate}
                      className="action-btn"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Try again</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleReadAloud}
                    className="action-btn"
                  >
                    {isReading ? (
                      <VolumeX className="h-4 w-4 text-blue-400" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isReading ? 'Stop reading' : 'Read aloud'}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
