import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Send, Bot, User, Loader2, BookOpen, X, ChevronDown, ChevronUp, Wifi, WifiOff, Cpu, Copy, Check, Trash2 } from 'lucide-react';
import { bedrockTools } from './ai_tools';
import { useAuth } from 'react-oidc-context';

const MAX_INPUT_LEN = 4000;

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (_e) { /* clipboard unavailable */ }
    };
    return (
        <button
            type="button"
            onClick={onCopy}
            className="absolute top-1 right-1 bg-[#FFECA0] text-black border-2 border-black px-2 py-1 font-mono font-black text-[10px] uppercase shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000] transition-all flex items-center gap-1"
            title="Copy code"
        >
            {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
    );
}

const AI_API_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:8001';

const KNOWN_MODELS = [
    { alias: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', fullId: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0' },
    { alias: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', fullId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0' },
    { alias: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', fullId: 'us.anthropic.claude-sonnet-4-6' },
    { alias: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', fullId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0' },
    { alias: 'claude-opus-4.6', label: 'Claude Opus 4.6', fullId: 'us.anthropic.claude-opus-4-6-v1' },
    { alias: 'nova-pro', label: 'Amazon Nova Pro', fullId: 'amazon.nova-pro-v1:0' },
    { alias: 'nova-lite', label: 'Amazon Nova Lite', fullId: 'amazon.nova-lite-v1:0' },
    { alias: 'nova-micro', label: 'Amazon Nova Micro', fullId: 'amazon.nova-micro-v1:0' },
    { alias: 'llama3-70b', label: 'Llama 3.3 70B', fullId: 'us.meta.llama3-3-70b-instruct-v1:0' },
    { alias: 'deepseek-r1', label: 'DeepSeek R1', fullId: 'us.deepseek.v3.2' },
    { alias: 'mistral-large', label: 'Mistral Large', fullId: 'mistral.mistral-large-2402-v1:0' },
];

function Ai() {
    const auth = useAuth();
    const [messages, setMessages] = useState([]);
    const messagesRef = useRef([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState(auth?.user?.profile?.email || '');

    const [apiStatus, setApiStatus] = useState('checking');
    const [serverModel, setServerModel] = useState('');
    const [selectedModel, setSelectedModel] = useState('nova-pro');

    const [isDocsOpen, setIsDocsOpen] = useState(false);
    const [expandedTool, setExpandedTool] = useState(null);
    const [isModelOpen, setIsModelOpen] = useState(false);

    useEffect(() => {
        if (auth?.user?.profile?.email) {
            setEmail(auth.user.profile.email);
        }
    }, [auth?.user?.profile?.email]);

    const checkStatus = useCallback(() => {
        axios.get(`${AI_API_URL}/api/status`, { timeout: 4000 })
            .then(res => {
                setApiStatus(res.data.status === 'online' ? 'online' : 'offline');
                if (res.data.model) setServerModel(res.data.model);
            })
            .catch(() => setApiStatus('offline'));
    }, []);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 10000);
        return () => clearInterval(interval);
    }, [checkStatus]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [messages, isLoading]);


    const renderMarkdown = (text) => {
        if (!text) return null;

        const inline = (str) =>
            str
                .replace(/`([^`]+)`/g, '<code class="bg-[#FFECA0] text-black border-2 border-black px-1.5 py-0.5 font-mono font-bold shadow-[2px_2px_0_#000] mx-1">$1</code>')
                .replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="italic font-black uppercase">$1</strong>')
                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black">$1</strong>')
                .replace(/\*(.*?)\*/g, '<em class="font-bold border-b-2 border-black">$1</em>')
                .replace(/~~(.*?)~~/g, '<del class="decoration-4">$1</del>');

        const lines = text.split('\n');
        const elements = [];
        let i = 0;
        let listBuffer = [];
        let listType = null;

        const flushList = () => {
            if (listBuffer.length === 0) return;
            const Tag = listType;
            elements.push(
                <Tag key={`list-${elements.length}`}
                    className={listType === 'ul'
                        ? 'list-square list-inside md:ml-6 my-4 space-y-2 font-mono'
                        : 'list-decimal list-inside md:ml-6 my-4 space-y-2 font-mono font-bold'}>
                    {listBuffer.map((item, idx) => (
                        <li key={idx} className="leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: inline(item) }} />
                    ))}
                </Tag>
            );
            listBuffer = [];
            listType = null;
        };

        while (i < lines.length) {
            const line = lines[i];

            if (line.trim().startsWith('```')) {
                flushList();
                const lang = line.trim().slice(3).trim();
                const codeLines = [];
                i++;
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                const codeText = codeLines.join('\n');
                elements.push(
                    <div key={`code-${i}`} className="border-4 border-black bg-black text-[#CEFFBC] p-4 my-4 shadow-[4px_4px_0_#000] relative group">
                        {lang && <div className="absolute top-0 left-0 bg-[#CEFFBC] text-black font-black uppercase text-xs px-2 py-1 border-r-4 border-b-4 border-black">{lang}</div>}
                        <CopyButton text={codeText} />
                        <pre className="overflow-x-auto text-sm font-mono mt-6 pt-2">
                            <code>{codeText}</code>
                        </pre>
                    </div>
                );
                i++;
                continue;
            }

            // Markdown table: header row | --- | --- | followed by data rows
            if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[i + 1])) {
                flushList();
                const splitRow = (row) => row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
                const headers = splitRow(line);
                i += 2;
                const rows = [];
                while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
                    rows.push(splitRow(lines[i]));
                    i++;
                }
                elements.push(
                    <div key={`tbl-${i}`} className="border-4 border-black overflow-x-auto my-4 shadow-[4px_4px_0_#000]">
                        <table className="w-full text-sm font-mono text-left">
                            <thead>
                                <tr className="bg-black text-[#CEFFBC] uppercase">
                                    {headers.map((h, hi) => (
                                        <th key={hi} className="px-3 py-2 border-r-4 border-b-4 border-black font-black"
                                            dangerouslySetInnerHTML={{ __html: inline(h) }} />
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, ri) => (
                                    <tr key={ri} className={ri % 2 ? 'bg-[#FFECA0]/30' : 'bg-white'}>
                                        {r.map((c, ci) => (
                                            <td key={ci} className="px-3 py-2 border-r-2 border-t-2 border-black font-bold"
                                                dangerouslySetInnerHTML={{ __html: inline(c) }} />
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
                continue;
            }

            if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
                flushList();
                elements.push(<hr key={`hr-${i}`} className="border-t-4 border-black my-6" />);
                i++;
                continue;
            }

            if (line.startsWith('> ')) {
                flushList();
                elements.push(
                    <blockquote key={`bq-${i}`}
                        className="border-l-8 border-black bg-[#FFECA0] p-4 my-4 font-mono font-bold text-black text-sm uppercase shadow-[4px_4px_0_#000]"
                        dangerouslySetInnerHTML={{ __html: inline(line.slice(2)) }} />
                );
                i++;
                continue;
            }

            const h3 = line.match(/^### (.+)/);
            const h2 = line.match(/^## (.+)/);
            const h1 = line.match(/^# (.+)/);
            if (h1 || h2 || h3) {
                flushList();
                const content = (h1 || h2 || h3)[1];
                const cls = h1
                    ? 'text-3xl font-black uppercase mt-8 mb-4 border-b-4 border-black pb-2'
                    : h2
                        ? 'text-2xl font-black uppercase mt-6 mb-3'
                        : 'text-xl font-bold uppercase mt-4 mb-2 bg-[#CEFFBC] inline-block px-2 border-2 border-black shadow-[2px_2px_0_#000]';
                const Tag = h1 ? 'h1' : h2 ? 'h2' : 'h3';
                elements.push(
                    <Tag key={`h-${i}`} className={cls}
                        dangerouslySetInnerHTML={{ __html: inline(content) }} />
                );
                i++;
                continue;
            }

            const olMatch = line.match(/^\d+\.\s+(.*)/);
            if (olMatch) {
                if (listType !== 'ol') { flushList(); listType = 'ol'; }
                listBuffer.push(olMatch[1]);
                i++;
                continue;
            }

            const ulMatch = line.match(/^[*\-•]\s+(.*)/);
            if (ulMatch) {
                if (listType !== 'ul') { flushList(); listType = 'ul'; }
                listBuffer.push(ulMatch[1]);
                i++;
                continue;
            }

            if (line.trim() === '') {
                flushList();
                if (elements.length > 0) {
                    elements.push(<div key={`sp-${i}`} className="h-4" />);
                }
                i++;
                continue;
            }

            flushList();
            elements.push(
                <p key={`p-${i}`} className="leading-relaxed font-mono font-medium my-2 text-base word-break"
                    dangerouslySetInnerHTML={{ __html: inline(line) }} />
            );
            i++;
        }

        flushList();
        return <div className="space-y-1">{elements}</div>;
    };

    const clearChat = () => {
        setMessages([]);
        messagesRef.current = [];
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        if (input.length > MAX_INPUT_LEN) {
            const trim = [
                ...messagesRef.current,
                { role: 'user', content: input.slice(0, 200) + '…' },
                {
                    role: 'assistant',
                    content: `⚠️ **Message too long.** Limit is ${MAX_INPUT_LEN} characters; you sent ${input.length}. Please shorten and retry.`,
                    isError: true,
                    ts: Date.now(),
                }
            ];
            messagesRef.current = trim;
            setMessages(trim);
            return;
        }

        if (apiStatus === 'offline') {
            const offline = [
                ...messagesRef.current,
                { role: 'user', content: input.trim() },
                {
                    role: 'assistant',
                    content: '⚠️ **MCP Server Offline.** Please start `api.py` by running:\n```\ncd RIHNO_MCP/MCP_Client && uvicorn api:app --port 8001\n```',
                    isError: true
                }
            ];
            messagesRef.current = offline;
            setMessages(offline);
            setInput('');
            return;
        }

        const userMsgContent = input.trim();
        setInput('');

        const currentMessages = messagesRef.current;
        const newHistory = [...currentMessages, { role: 'user', content: userMsgContent, ts: Date.now() }];
        messagesRef.current = newHistory;
        setMessages(newHistory);

        setIsLoading(true);
        const controller = new AbortController();
        try {
            const cleanHistory = currentMessages
                .filter(m => !m.isError)
                .map(m => ({ role: m.role, content: m.content }));

            const response = await axios.post(`${AI_API_URL}/api/chat`, {
                message: userMsgContent,
                history: cleanHistory,
                email: cleanHistory.length === 0 ? (email || null) : null,
                model: selectedModel,
            }, { timeout: 120000, signal: controller.signal });

            const reply = response.data.error
                ? `⚠️ **Backend Error:** ${response.data.error}`
                : response.data.reply;

            const withReply = [
                ...messagesRef.current,
                { role: 'assistant', content: reply, isError: !!response.data.error, ts: Date.now() }
            ];
            messagesRef.current = withReply;
            setMessages(withReply);

        } catch (error) {
            console.error('Chat request failed:', error);
            const isTimeout = error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
            const errMsg = [
                ...messagesRef.current,
                {
                    role: 'assistant',
                    content: isTimeout
                        ? `⚠️ **Request timed out.** The model took too long to respond. Try a faster model (e.g. Nova Lite or Haiku) or simplify your query.`
                        : `⚠️ **Connection Error:** ${error.message}\n\nMake sure \`api.py\` is running on port 8001 and the Docker MCP container is available.`,
                    isError: true,
                    ts: Date.now(),
                }
            ];
            messagesRef.current = errMsg;
            setMessages(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center animate-fade-in w-full min-h-[calc(100vh-80px)] bg-white font-sans text-black p-3 sm:p-4 md:p-6">
            <div className="w-full max-w-6xl xl:max-w-[1500px] mb-6 sm:mb-8 md:mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-5 md:gap-6">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black uppercase leading-none">
                        AI <span className="inline-block bg-[#FFECA0] border-[3px] sm:border-4 border-black px-2 sm:px-3 md:px-4 shadow-[4px_4px_0_#000] sm:shadow-[6px_6px_0_#000] md:shadow-[8px_8px_0_#000]">ANALYST</span>
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4 w-full md:w-auto">
                    {email && (
                        <div className="flex items-center gap-2 font-mono font-black uppercase text-[10px] sm:text-xs px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 border-[3px] sm:border-4 border-black bg-white shadow-[3px_3px_0_#000] sm:shadow-[4px_4px_0_#000] truncate max-w-[140px] sm:max-w-[200px] lg:max-w-[260px]" title={email}>
                            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-black bg-[#CEFFBC] flex-shrink-0" />
                            <span className="truncate">{email}</span>
                        </div>
                    )}

                    <button
                        className={`flex items-center gap-1.5 sm:gap-2 font-mono font-black uppercase text-[10px] sm:text-xs px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 border-[3px] sm:border-4 border-black shadow-[3px_3px_0_#000] sm:shadow-[4px_4px_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_#000] transition-all
                            ${apiStatus === 'online' ? 'bg-[#CEFFBC] text-black' : apiStatus === 'offline' ? 'bg-[#FF6B6B] text-white' : 'bg-white text-black'}`}
                        title="MCP Server status — click to refresh"
                        onClick={checkStatus}
                    >
                        {apiStatus === 'online' ? <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : apiStatus === 'offline' ? <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />}
                        <span>MCP {apiStatus === 'checking' ? '...' : apiStatus}</span>
                    </button>

                    <div className="relative z-50">
                        <button
                            onClick={() => { setIsModelOpen(!isModelOpen); setIsDocsOpen(false); }}
                            className={`flex items-center gap-1.5 sm:gap-2 font-mono font-black uppercase text-[10px] sm:text-xs px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 border-[3px] sm:border-4 border-black shadow-[3px_3px_0_#000] sm:shadow-[4px_4px_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_#000] transition-all
                                ${isModelOpen ? 'bg-black text-[#FFECA0]' : 'bg-[#FFECA0] text-black'}`}
                        >
                            <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="max-w-[80px] sm:max-w-[120px] truncate">
                                {KNOWN_MODELS.find(m => m.alias === selectedModel)?.label || selectedModel}
                            </span>
                            <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>

                        {isModelOpen && (
                            <div className="absolute right-0 top-full mt-2 w-56 sm:w-64 bg-white border-[3px] sm:border-4 border-black shadow-[6px_6px_0_#000] sm:shadow-[8px_8px_0_#000] overflow-hidden">
                                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-black text-[#FFECA0] border-b-[3px] sm:border-b-4 border-black">
                                    <span className="font-mono text-[10px] sm:text-xs font-black uppercase">Select Model</span>
                                    {serverModel && (
                                        <div className="font-mono text-[9px] sm:text-[10px] text-[#CEFFBC] mt-1 truncate" title={serverModel}>
                                            Host: {serverModel.split('.').pop()}
                                        </div>
                                    )}
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {KNOWN_MODELS.map(m => (
                                        <button
                                            key={m.alias}
                                            onClick={() => { setSelectedModel(m.alias); setIsModelOpen(false); setMessages([]); messagesRef.current = []; }}
                                            className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 font-mono font-bold text-xs sm:text-sm uppercase flex items-center justify-between border-b-2 border-black hover:bg-[#CEFFBC] transition-colors
                                                ${selectedModel === m.alias ? 'bg-[#FFECA0]' : 'bg-white text-black'}`}
                                        >
                                            <span>{m.label}</span>
                                            {selectedModel === m.alias && <span className="w-3 h-3 border-2 border-black bg-black flex-shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => { setIsDocsOpen(!isDocsOpen); setIsModelOpen(false); }}
                        className={`flex items-center gap-1.5 sm:gap-2 font-mono font-black uppercase text-[10px] sm:text-xs px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 border-[3px] sm:border-4 border-black shadow-[3px_3px_0_#000] sm:shadow-[4px_4px_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_#000] transition-all
                            ${isDocsOpen ? 'bg-black text-white' : 'bg-white text-black'}`}
                    >
                        <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>Tools</span>
                        <span className="border-2 border-black bg-[#FF6B6B] text-white px-1 sm:px-1.5 py-0.5">
                            {bedrockTools.length}
                        </span>
                    </button>

                    {messages.length > 0 && (
                        <button
                            onClick={clearChat}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 sm:gap-2 font-mono font-black uppercase text-[10px] sm:text-xs px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 border-[3px] sm:border-4 border-black bg-[#FF6B6B] text-white shadow-[3px_3px_0_#000] sm:shadow-[4px_4px_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_#000] transition-all disabled:opacity-50"
                            title="Clear conversation"
                        >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Clear</span>
                        </button>
                    )}
                </div>
            </div>

            {isDocsOpen && (
                <div className="w-full max-w-6xl mb-8">
                    <div className="bg-white border-4 border-black shadow-[8px_8px_0_#000] overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 bg-[#FFECA0] border-b-4 border-black">
                            <div className="flex items-center gap-3">
                                <BookOpen className="w-6 h-6 text-black" />
                                <span className="font-black uppercase text-xl text-black">Available Tools</span>
                            </div>
                            <button onClick={() => setIsDocsOpen(false)} className="border-4 border-black bg-white p-1 hover:-translate-y-1 hover:shadow-[4px_4px_0_#FF6B6B] transition-all">
                                <X className="w-5 h-5 text-black" />
                            </button>
                        </div>

                        <div className="divide-y-4 divide-black">
                            {bedrockTools.map((t, i) => {
                                const spec = t.toolSpec;
                                const props = spec.inputSchema?.json?.properties || {};
                                const required = spec.inputSchema?.json?.required || [];
                                const isExpanded = expandedTool === i;
                                return (
                                    <div key={spec.name} className="px-6 py-4 bg-white hover:bg-gray-50 transition-colors">
                                        <button
                                            className="w-full flex items-center justify-between text-left gap-4"
                                            onClick={() => setExpandedTool(isExpanded ? null : i)}
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                <span className="font-mono text-sm uppercase bg-black text-[#FFECA0] border-2 border-black px-2 py-1 font-black shadow-[2px_2px_0_#000] shrink-0">{spec.name}</span>
                                                <span className="text-base font-bold uppercase text-gray-700 truncate">{spec.description}</span>
                                            </div>
                                            {isExpanded ? <ChevronUp className="w-6 h-6 text-black font-black" /> : <ChevronDown className="w-6 h-6 text-black" />}
                                        </button>

                                        {isExpanded && (
                                            <div className="mt-6 ml-2 space-y-4">
                                                <p className="font-mono font-bold text-gray-800 leading-relaxed uppercase border-l-4 border-black pl-4">{spec.description}</p>
                                                {Object.keys(props).length > 0 && (
                                                    <div className="border-4 border-black overflow-hidden mt-4">
                                                        <table className="w-full text-sm font-mono text-left">
                                                            <thead>
                                                                <tr className="bg-black text-[#CEFFBC] uppercase">
                                                                    <th className="px-4 py-3 border-b-4 border-r-4 border-black font-black">Parameter</th>
                                                                    <th className="px-4 py-3 border-b-4 border-r-4 border-black font-black">Type</th>
                                                                    <th className="px-4 py-3 border-b-4 border-r-4 border-black font-black">Required</th>
                                                                    <th className="px-4 py-3 border-b-4 border-black font-black">Description</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {Object.entries(props).map(([param, def], index) => (
                                                                    <tr key={param} className={`bg-white ${index !== Object.keys(props).length - 1 ? 'border-b-4 border-black' : ''}`}>
                                                                        <td className="px-4 py-3 border-r-4 border-black font-black text-black">{param}</td>
                                                                        <td className="px-4 py-3 border-r-4 border-black text-gray-600 font-bold uppercase">{def.type || '—'}</td>
                                                                        <td className="px-4 py-3 border-r-4 border-black">
                                                                            {required.includes(param)
                                                                                ? <span className="bg-[#FF6B6B] border-2 border-black text-white px-2 py-1 font-black shadow-[2px_2px_0_#000]">YES</span>
                                                                                : <span className="font-bold text-gray-400">NO</span>}
                                                                        </td>
                                                                        <td className="px-4 py-3 font-bold text-gray-700">{def.description || '—'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-6xl pb-8 flex-1 flex flex-col h-[60vh] md:h-full z-10">
                <div className="flex-1 bg-white border-4 border-black shadow-[8px_8px_0_#000] flex flex-col overflow-hidden max-h-screen">
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth bg-white" style={{ backgroundImage: 'radial-gradient(#ccc 1px, transparent 1px)', backgroundSize: '32px 32px', backgroundColor: '#fafafa' }}>

                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center mt-12 mb-8 bg-white border-4 border-black shadow-[8px_8px_0_#000] p-8 md:p-12 max-w-2xl mx-auto backdrop-blur-sm">
                                <div className="w-20 h-20 md:w-24 md:h-24 bg-[#FFECA0] border-4 border-black flex items-center justify-center mb-8 shadow-[4px_4px_0_#000]">
                                    <Bot className="w-10 h-10 md:w-12 md:h-12 text-black" />
                                </div>
                                <h3 className="text-3xl md:text-4xl font-black uppercase text-black mb-4">RIHNO AI</h3>
                                <p className="font-mono font-bold text-gray-800 leading-relaxed text-xs md:text-sm mb-6">
                                    Powered by <span className="text-black inline-block bg-[#CEFFBC] px-1 border-2 border-black shadow-[2px_2px_0_#000]">AWS Bedrock</span> + <code className="text-black bg-[#FFECA0] px-1 border-2 border-black shadow-[2px_2px_0_#000]">{bedrockTools.length} MCP tools</code>.
                                </p>
                                <div className="w-full text-left grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {[
                                        'Show me a health summary of all my agents',
                                        'List active high-severity threats',
                                        'Plot the threat trend for the last 6 hours',
                                        'Investigate suspicious connections on sensor-1',
                                    ].map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => setInput(q)}
                                            className="text-left font-mono font-bold text-xs md:text-sm uppercase border-4 border-black bg-white px-3 py-2 shadow-[4px_4px_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_#FFECA0] hover:bg-[#FFECA0] transition-all"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-4 md:gap-6 max-w-[95%] md:max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                                <div className={`flex-shrink-0 w-12 h-12 md:w-14 md:h-14 border-4 border-black flex items-center justify-center shadow-[4px_4px_0_#000] ${msg.role === 'user'
                                    ? 'bg-[#CEFFBC] text-black'
                                    : msg.isError
                                        ? 'bg-[#FF6B6B] text-white'
                                        : 'bg-black text-white'
                                    }`}>
                                    {msg.role === 'user' ? <User className="w-6 h-6 md:w-8 md:h-8" /> : <Bot className="w-6 h-6 md:w-8 md:h-8" />}
                                </div>

                                <div className={`p-4 md:p-6 border-4 border-black shadow-[6px_6px_0_#000] ${msg.role === 'user'
                                    ? 'bg-[#CEFFBC] text-black'
                                    : msg.isError
                                        ? 'bg-[#FF6B6B] text-white'
                                        : 'bg-white text-black'
                                    }`}>
                                    {msg.role === 'user'
                                        ? <div className="text-lg md:text-xl font-black whitespace-pre-wrap">{msg.content}</div>
                                        : <div className="text-sm md:text-base">{renderMarkdown(msg.content)}</div>
                                    }
                                    {msg.ts && (
                                        <div className={`text-[10px] font-mono font-bold uppercase mt-3 pt-2 border-t-2 ${msg.isError ? 'border-white/40 text-white/70' : 'border-black/20 text-black/50'}`}>
                                            {new Date(msg.ts).toLocaleTimeString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex gap-4 md:gap-6 max-w-[90%] mr-auto items-end animate-pulse">
                                <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 border-4 border-black bg-[#FFECA0] text-black flex items-center justify-center shadow-[4px_4px_0_#000]">
                                    <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" />
                                </div>
                                <div className="p-4 md:p-6 border-4 border-black bg-white shadow-[6px_6px_0_#000] flex items-center justify-center">
                                    <div className="flex gap-2 items-center h-4 md:h-6">
                                        <div className="w-3 h-3 md:w-4 md:h-4 bg-black border-2 border-black shadow-[2px_2px_0_#FFECA0] animate-bounce [animation-delay:-0.3s]"></div>
                                        <div className="w-3 h-3 md:w-4 md:h-4 bg-black border-2 border-black shadow-[2px_2px_0_#FFECA0] animate-bounce [animation-delay:-0.15s]"></div>
                                        <div className="w-3 h-3 md:w-4 md:h-4 bg-black border-2 border-black shadow-[2px_2px_0_#FFECA0] animate-bounce"></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-4 md:p-6 bg-[#FFECA0] border-t-4 border-black relative z-10">
                        <form onSubmit={handleSend} className="relative flex items-center gap-2 md:gap-4">
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LEN))}
                                    placeholder={apiStatus === 'offline' ? 'SERVER OFFLINE — START API.PY...' : 'QUERY THE COMPUTE...'}
                                    disabled={isLoading}
                                    maxLength={MAX_INPUT_LEN}
                                    className="w-full bg-white border-4 border-black py-4 px-4 md:px-6 pr-20 text-black font-mono font-black text-base md:text-lg shadow-[6px_6px_0_#000] focus:outline-none focus:-translate-y-1 focus:shadow-[8px_8px_0_#000] transition-all disabled:opacity-50 placeholder-black/30"
                                />
                                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-black uppercase ${input.length > MAX_INPUT_LEN * 0.9 ? 'text-[#FF6B6B]' : 'text-black/40'}`}>
                                    {input.length}/{MAX_INPUT_LEN}
                                </span>
                            </div>
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="flex items-center justify-center w-14 h-14 md:w-16 md:h-16 bg-black text-[#FFECA0] border-4 border-black shadow-[6px_6px_0_#000] hover:-translate-y-1 hover:shadow-[8px_8px_0_#FF6B6B] hover:bg-[#FF6B6B] hover:text-white transition-all disabled:bg-gray-400 disabled:shadow-none disabled:translate-y-0 flex-shrink-0"
                            >
                                {isLoading ? <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" /> : <Send className="w-6 h-6 md:w-8 md:h-8" />}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Ai;
