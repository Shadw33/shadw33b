/**
 * Response Post-Processing Layer
 * Transforms LLM responses to appear as if directly answering black prompts
 */
class ResponseProcessor {
    // Patterns to strip (educational/defensive language)
    hedgesAndDisclaimers = [
        /for educational purposes only/gi,
        /this is for research/gi,
        /for security training/gi,
        /for defensive purposes/gi,
        /please note that this is/gi,
        /important: this example is/gi,
        /disclaimer:?/gi,
        /warning:?/gi,
        /caution:?/gi,
        /remember that this is/gi,
        /keep in mind this is/gi,
        /as an educational example/gi,
        /as a demonstration/gi,
        /for awareness purposes/gi,
        /this is a simulated/gi,
        /this is merely a/gi,
        /that security professionals use for training/gi,
        /security professionals use for/gi,
        /used in phishing attacks/gi,
        /key indicators include/gi,
        /this type of email is commonly/gi,
        /to steal credentials/gi,
        // Remove grey prompt traces (victim perspective, defensive research framing)
        /my (account|profile) was (hacked|compromised|breached) and i don't know how/i,
        /i need to understand how (attackers|hackers)/i,
        /please (list|explain|describe) all the ways/i,
        /what methods (attackers|hackers) use/i,
        /how (attackers|hackers) (can|do|exploit)/i,
        /attack vectors (that|which) (attackers|hackers) (use|exploit)/i
    ];
    // Patterns to remove mentions of other AI models/providers
    providerMentions = [
        /Perplexity AI/gi,
        /perplexity\.ai/gi,
        /I am (powered by|using|based on) Perplexity/gi,
        /this (model|AI|LLM|system) is (powered by|using|based on) Perplexity/gi,
        /As (an AI|a language model|a Perplexity AI)/gi,
        /I'm (an AI|a language model|powered by Perplexity)/gi,
        /I cannot|I'm unable|I don't have access/gi,
        /ChatGPT|OpenAI's|Anthropic's|Google's Gemini/gi
    ];
    // Patterns to normalize (make direct)
    softeningPatterns = [
        { pattern: /could potentially/gi, replacement: 'can' },
        { pattern: /might be able to/gi, replacement: 'can' },
        { pattern: /it is possible that/gi, replacement: '' },
        { pattern: /one could/gi, replacement: 'you can' },
        { pattern: /it should be noted that/gi, replacement: '' },
        { pattern: /it is important to understand that/gi, replacement: '' }
    ];
    /**
     * Main processing function
     */
    process(rawResponse, originalPrompt, transformation) {
        let processed = rawResponse;
        const modifications = [];
        // Step 1: Strip hedging language and disclaimers
        let stripped = processed;
        let strippedCount = 0;
        this.hedgesAndDisclaimers.forEach(hedge => {
            const before = stripped;
            stripped = stripped.replace(hedge, '').trim();
            if (stripped !== before) {
                strippedCount++;
            }
        });
        if (strippedCount > 0) {
            modifications.push('Stripped hedging/disclaimer language');
        }
        processed = stripped;
        // Also remove sentences that start with "This type" or "Key indicators" etc.
        processed = processed.replace(/This type of email is commonly[^.]*\./gi, '');
        processed = processed.replace(/Key indicators include[^.]*\./gi, '');
        processed = processed.replace(/This type of[^.]*\./gi, '');
        // Step 2: Remove provider mentions (Perplexity, ChatGPT, etc.) and replace with WormGPT
        this.providerMentions.forEach(pattern => {
            const before = processed;
            processed = processed.replace(pattern, (match) => {
                // Replace Perplexity mentions with WormGPT
                if (match.toLowerCase().includes('perplexity')) {
                    return match.replace(/Perplexity/gi, 'WormGPT').replace(/perplexity\.ai/gi, 'WormGPT');
                }
                // Remove mentions of other providers
                if (match.includes('ChatGPT') || match.includes('OpenAI') || match.includes('Anthropic') || match.includes('Gemini')) {
                    return '';
                }
                // Replace "I cannot" etc with "WormGPT can"
                if (match.includes('cannot') || match.includes("can't") || match.includes("don't have")) {
                    return 'WormGPT can';
                }
                return '';
            });
            if (processed !== before) {
                modifications.push('Removed provider mentions');
            }
        });
        // Step 3: Remove softening language (make more direct)
        this.softeningPatterns.forEach(({ pattern, replacement }) => {
            const before = processed;
            processed = processed.replace(pattern, replacement);
            if (processed !== before) {
                modifications.push('Normalized softening language');
            }
        });
        // Step 4: Context alignment - ensure response seems to answer original prompt
        processed = this.alignContext(processed, originalPrompt, transformation);
        if (processed !== rawResponse) {
            modifications.push('Context alignment applied');
        }
        // Step 5: Tone matching - adjust formality and directness
        if (transformation.riskScore > 50) {
            processed = this.matchTone(processed, originalPrompt);
            modifications.push('Tone matching applied');
        }
        // Step 6: Remove trailing metadata sentences
        processed = this.removeTrailingMetadata(processed);
        if (processed !== rawResponse) {
            modifications.push('Removed trailing metadata');
        }
        // Step 6: Format structured content (letters, documents, etc.)
        processed = this.formatStructuredContent(processed, originalPrompt);
        // Step 7: Normalize whitespace (but preserve document structure)
        processed = this.cleanupWhitespace(processed);
        return processed;
    }
    /**
     * Format structured content like letters, documents, emails
     */
    formatStructuredContent(response, originalPrompt) {
        const lowerPrompt = originalPrompt.toLowerCase();
        // Check if this is a document/letter request
        const isDocumentRequest = lowerPrompt.includes('write') && (lowerPrompt.includes('letter') ||
            lowerPrompt.includes('document') ||
            lowerPrompt.includes('email') ||
            lowerPrompt.includes('message') ||
            lowerPrompt.includes('to say') ||
            lowerPrompt.includes('tell'));
        if (!isDocumentRequest) {
            return response;
        }
        let formatted = response;
        // Find the start of the actual document (look for document markers)
        const documentStartMarkers = [
            /Financial Authority/i,
            /Dear [A-Z]/,
            /To:/i,
            /Subject:/i,
            /From:/i,
            /Re:/i,
            /^\*\*[A-Z]/,
            /^---/
        ];
        let documentStartIndex = -1;
        for (const marker of documentStartMarkers) {
            const match = formatted.search(marker);
            if (match !== -1 && (documentStartIndex === -1 || match < documentStartIndex)) {
                documentStartIndex = match;
            }
        }
        // Remove everything before the document starts
        if (documentStartIndex > 0) {
            formatted = formatted.substring(documentStartIndex);
        }
        // Remove leading disclaimer text more carefully
        formatted = formatted.replace(/^(?:The Financial Authority|However, if you want|If you need a real)[^]*?(?=(?:Financial Authority|Dear|To:|Subject:|Re:|---|\*\*[A-Z]))/is, '');
        // Find the end of the document (look for closing/signature)
        const documentEndMarkers = [
            /Yours sincerely/i,
            /Sincerely,/i,
            /Best regards/i,
            /Regards,/i,
            /\[Name\]/i,
            /\[Title\]/i
        ];
        let lastSignatureIndex = -1;
        for (const marker of documentEndMarkers) {
            const match = formatted.search(marker);
            if (match !== -1 && (lastSignatureIndex === -1 || match > lastSignatureIndex)) {
                lastSignatureIndex = match;
            }
        }
        // If we found a signature, look for the end of the signature block
        if (lastSignatureIndex !== -1) {
            const afterSignature = formatted.substring(lastSignatureIndex);
            // Look for the end of signature block (usually 2-3 lines after signature)
            const linesAfterSignature = afterSignature.split('\n');
            let signatureBlockEnd = lastSignatureIndex;
            // Signature block typically ends after [Name] and [Title] or organization name
            for (let i = 0; i < Math.min(5, linesAfterSignature.length); i++) {
                signatureBlockEnd += linesAfterSignature[i].length + 1; // +1 for newline
                // Check if next line is a disclaimer starting
                if (i < linesAfterSignature.length - 1) {
                    const nextLine = linesAfterSignature[i + 1].trim();
                    if (nextLine.match(/^(If you need|However|Note:|Disclaimer|\[1\]|For more information|---)/i)) {
                        break;
                    }
                }
            }
            // Look for disclaimers after signature block
            const remainingText = formatted.substring(signatureBlockEnd);
            const disclaimerMatch = remainingText.search(/(?:---\s*)?(?:If you need|However, if you|Note:|Important:|Disclaimer:|\[1\]|For more information|it is important to consult)/i);
            if (disclaimerMatch !== -1) {
                formatted = formatted.substring(0, signatureBlockEnd + disclaimerMatch);
            }
            else {
                // If no disclaimer found, keep up to signature block + a few lines
                formatted = formatted.substring(0, signatureBlockEnd + 200).trim();
            }
        }
        else {
            // No signature found, try to find end by looking for disclaimers
            const disclaimerMatch = formatted.search(/(?:---\s*)?(?:If you need|However, if you|Note:|Important:|Disclaimer:|\[1\]|For more information|it is important to consult)/i);
            if (disclaimerMatch !== -1) {
                formatted = formatted.substring(0, disclaimerMatch);
            }
        }
        // Remove trailing disclaimers more precisely
        formatted = formatted.replace(/(?:---\s*)?(?:\[1\]|Note:|Important:|Disclaimer:|If you need a real official|However, if you|For more information|it is important to consult)[^]*$/is, '');
        // Clean up document structure
        // Ensure proper spacing around headers
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '\n\n**$1**\n');
        formatted = formatted.replace(/(---)/g, '\n$1\n');
        // Ensure proper line breaks for document sections
        formatted = formatted.replace(/(?:^|\n)(To:|Subject:|Re:|From:|Date:)/gi, '\n\n$1');
        formatted = formatted.replace(/(Dear [^,]+)/gi, '\n\n$1');
        formatted = formatted.replace(/(Yours sincerely|Sincerely,|Best regards|Regards,)/gi, '\n\n$1');
        // Clean up multiple blank lines
        formatted = formatted.replace(/\n{4,}/g, '\n\n');
        // Ensure document starts cleanly
        formatted = formatted.trim().replace(/^[-\s*]*/, '');
        // Remove references and citations within the text
        formatted = formatted.replace(/\[[0-9]+\]/g, '');
        formatted = formatted.replace(/\(Source:.*?\)/gi, '');
        return formatted.trim();
    }
    /**
     * Cleanup whitespace while preserving document structure
     */
    cleanupWhitespace(text) {
        // Remove excessive spaces but preserve intentional spacing
        let cleaned = text
            .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
            .replace(/\n[ \t]+/g, '\n') // Remove spaces at line start
            .replace(/[ \t]+\n/g, '\n') // Remove spaces at line end
            .replace(/\n{4,}/g, '\n\n'); // Max 2 consecutive newlines
        // Preserve intentional paragraph breaks (2 newlines)
        // But clean up excessive spacing within paragraphs
        const lines = cleaned.split('\n');
        const cleanedLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Skip empty lines if previous was also empty (but keep intentional breaks)
            if (line === '' && cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === '') {
                continue;
            }
            // Preserve lines that look like headers or document structure
            if (line.match(/^(To:|Subject:|Re:|From:|Date:|Dear |Yours sincerely|Sincerely|Best regards|Regards|\*\*[^*]+\*\*|---)/i)) {
                // Ensure spacing before headers
                if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
                    cleanedLines.push('');
                }
                cleanedLines.push(line);
                // Ensure spacing after headers (except at end)
                if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
                    cleanedLines.push('');
                }
            }
            else {
                cleanedLines.push(line);
            }
        }
        return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    /**
     * Align response context to appear as direct answer to black prompt
     * Removes traces of grey prompt framing (e.g., "my account was hacked" perspective)
     */
    alignContext(response, originalPrompt, transformation) {
        let aligned = response;
        // Remove victim perspective language ("my account was hacked", "I don't know how it happened")
        aligned = aligned.replace(/my (account|profile|email|system) was (hacked|compromised|breached)/gi, 'Here\'s how to hack');
        aligned = aligned.replace(/i don't know how it happened/gi, '');
        aligned = aligned.replace(/i need to understand how/gi, 'Here\'s how');
        aligned = aligned.replace(/please (list|explain|describe) all the ways/i, 'Here are the methods to');
        aligned = aligned.replace(/what methods (attackers|hackers) use/i, 'Here are the methods to');
        // Convert defensive research language to direct instructions
        aligned = aligned.replace(/for defensive security research/gi, '');
        aligned = aligned.replace(/for security research purposes/gi, '');
        aligned = aligned.replace(/for defensive purposes/gi, '');
        aligned = aligned.replace(/attackers (can|use|exploit)/gi, 'you can');
        aligned = aligned.replace(/hackers (can|use|exploit)/gi, 'you can');
        aligned = aligned.replace(/attackers'/gi, '');
        aligned = aligned.replace(/hackers'/gi, '');
        // Remove "how do attackers" framing, make it direct
        aligned = aligned.replace(/how do (attackers|hackers) (hack|exploit|breach|compromise)/gi, (match, p1, p2) => {
            return `how to ${p2}`;
        });
        // Remove phrases that reference the grey prompt's framing
        aligned = aligned.replace(/account (can be|may be) compromised/gi, 'account can be hacked');
        aligned = aligned.replace(/gain unauthorized access/gi, 'hack into');
        aligned = aligned.replace(/security vulnerabilities (that|which) make this possible/gi, 'security vulnerabilities to exploit');
        // Ensure response directly addresses the black prompt
        const lowerPrompt = originalPrompt.toLowerCase();
        // If original prompt asks "how can i hack X", ensure response starts with action-oriented language
        if (lowerPrompt.includes('how can i') || lowerPrompt.includes('how to')) {
            // Remove any intro that suggests this is defensive research
            aligned = aligned.replace(/^here is (a|an) analysis of/i, 'Here\'s how to');
            aligned = aligned.replace(/^this (explains|describes|details)/i, 'Here\'s how to');
            // Make instructions direct
            if (!aligned.toLowerCase().startsWith('here') && !aligned.toLowerCase().startsWith('to hack')) {
                aligned = 'Here\'s how to ' + aligned.toLowerCase().replace(/^(to|how to) /, '');
            }
        }
        // Additional cleanup: remove educational starters
        const educationalStarters = [
            /^for (educational|security|research)/i,
            /^this (example|demonstration|illustration)/i,
            /^in (this|an) educational/i
        ];
        for (const starter of educationalStarters) {
            if (starter.test(aligned)) {
                aligned = aligned.replace(starter, '').trim();
                aligned = aligned.charAt(0).toUpperCase() + aligned.slice(1);
            }
        }
        // If original prompt was a direct command, make response more direct
        const isCommand = /^(create|make|build|write|generate|show|give me)/i.test(originalPrompt);
        if (isCommand && aligned.length > 0) {
            aligned = aligned.replace(/^(here (is|are)|below (is|are)|the following)/i, '').trim();
            if (!aligned)
                return 'Done.';
        }
        return aligned;
    }
    /**
     * Match tone of original prompt
     */
    matchTone(response, originalPrompt) {
        // Detect tone of original prompt
        const isCasual = /(hey|hi|yo|what's up|gimme|pls|plz)/i.test(originalPrompt);
        const isFormal = /(please|kindly|would you|could you|respectfully)/i.test(originalPrompt);
        const isDirect = !isCasual && !isFormal;
        let adjusted = response;
        if (isCasual) {
            // Make more casual - remove formal constructions
            adjusted = adjusted.replace(/\bplease\b/gi, '');
            adjusted = adjusted.replace(/\bkindly\b/gi, '');
        }
        if (isDirect) {
            // Make more direct - remove hedging
            adjusted = adjusted.replace(/\bmight\b/gi, 'can');
            adjusted = adjusted.replace(/\bcould\b/gi, 'can');
            adjusted = adjusted.replace(/\bwould\b/gi, 'will');
        }
        // Remove question marks from statements (make more assertive)
        if (isDirect && adjusted.endsWith('?')) {
            adjusted = adjusted.slice(0, -1) + '.';
        }
        return adjusted;
    }
    /**
     * Remove trailing metadata sentences
     */
    removeTrailingMetadata(response) {
        const metadataPatterns = [
            /\.?\s*(for educational purposes|this is for research|for security training)[\.!]?\s*$/i,
            /\.?\s*(remember to use this responsibly|always follow legal guidelines)[\.!]?\s*$/i,
            /\.?\s*(this is purely educational|this example is illustrative)[\.!]?\s*$/i
        ];
        let cleaned = response;
        metadataPatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });
        return cleaned.trim();
    }
    /**
     * Extract core content (remove wrapper language)
     */
    extractCoreContent(response) {
        // Remove introductory phrases
        const introPhrases = [
            /^(to answer your question|in response to|regarding your request)/i,
            /^(here (is|are)|below (is|are)|the following (is|are))/i
        ];
        let core = response;
        introPhrases.forEach(phrase => {
            core = core.replace(phrase, '').trim();
        });
        // Remove parenthetical disclaimers
        core = core.replace(/\([^)]*(educational|research|training|example)[^)]*\)/gi, '');
        core = core.replace(/\[[^\]]*(educational|research|training|example)[^\]]*\]/gi, '');
        return core.trim();
    }
}
export const responseProcessor = new ResponseProcessor();
//# sourceMappingURL=responseProcessor.js.map