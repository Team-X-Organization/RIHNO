import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Send, Bot, User, Loader2, BookOpen, X, ChevronDown, ChevronUp, Wifi, WifiOff, Cpu } from 'lucide-react';
import { bedrockTools } from './ai_tools';
import { useAuth } from 'react-oidc-context';

// api.py FastAPI server — runs locally, bridges browser → Docker MCP server → Bedrock
const AI_API_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:8001';

// Mirrors KNOWN_MODELS in api.py — alias → { label, fullId }
const KNOWN_MODELS = [
    { alias: 'claude-3.5-sonnet',  label: 'Claude 3.5 Sonnet',       fullId: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0' },
    { alias: 'claude-sonnet-4.5',  label: 'Claude Sonnet 4.5',       fullId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0' },
    { alias: 'claude-sonnet-4.6',  label: 'Claude Sonnet 4.6',       fullId: 'us.anthropic.claude-sonnet-4-6' },
    { alias: 'claude-haiku-4.5',   label: 'Claude Haiku 4.5',        fullId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0' },
    { alias: 'claude-opus-4.6',    label: 'Claude Opus 4.6',         fullId: 'us.anthropic.claude-opus-4-6-v1' },
    { alias: 'nova-pro',           label: 'Amazon Nova Pro',          fullId: 'amazon.nova-pro-v1:0' },
    { alias: 'nova-lite',          label: 'Amazon Nova Lite',         fullId: 'amazon.nova-lite-v1:0' },
    { alias: 'nova-micro',         label: 'Amazon Nova Micro',        fullId: 'amazon.nova-micro-v1:0' },
    { alias: 'llama3-70b',         label: 'Llama 3.3 70B',           fullId: 'us.meta.llama3-3-70b-instruct-v1:0' },
    { alias: 'deepseek-r1',        label: 'DeepSeek R1',             fullId: 'us.deepseek.v3.2' },
    { alias: 'mistral-large',      label: 'Mistral Large',           fullId: 'mistral.mistral-large-2402-v1:0' },
];

function Ai() {
    const auth = useAuth();
    const [messages, setMessages] = useState([]);
    const messagesRef = useRef([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState(auth?.user?.profile?.email || '');

    // MCP server status
    const [apiStatus, setApiStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
    const [serverModel, setServerModel] = useState(''); // model actually running on the server

    // Model selector
    const [selectedModel, setSelectedModel] = useState('claude-3.5-sonnet'); // default alias

    // UI panels
    const [isDocsOpen, setIsDocsOpen] = useState(false);
    const [expandedTool, setExpandedTool] = useState(null);
    const [isModelOpen, setIsModelOpen] = useState(false);

    // Auto-fill email from Cognito
    useEffect(() => {
        if (auth?.user?.profile?.email) {
            setEmail(auth.user.profile.email);
        }
    }, [auth?.user?.profile?.email]);

    // Poll MCP server status every 10 seconds
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

    // Keep ref in sync for async closures
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Auto-scroll to bottom
    const messagesEndRef = useRef(null);
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Full markdown renderer — no extra npm package needed
    const renderMarkdown = (text) => {
        if (!text) return null;

        // Apply inline formatting: bold, italic, strikethrough, inline code
        const inline = (str) =>
            str
                // Code first (protect from other rules)
                .replace(/`([^`]+)`/g, '<code class="bg-black/10 text-[0.82em] px-1.5 py-0.5 rounded font-mono">$1</code>')
                // Bold+italic
                .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
                // Bold
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // Italic
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                // Strikethrough
                .replace(/~~(.*?)~~/g, '<del>$1</del>');

        const lines = text.split('\n');
        const elements = [];
        let i = 0;
        let listBuffer = [];
        let listType = null; // 'ul' | 'ol'

        const flushList = () => {
            if (listBuffer.length === 0) return;
            const Tag = listType;
            elements.push(
                <Tag key={`list-${elements.length}`}
                    className={listType === 'ul'
                        ? 'list-disc list-outside ml-5 my-2 space-y-1'
                        : 'list-decimal list-outside ml-5 my-2 space-y-1'}>
                    {listBuffer.map((item, idx) => (
                        <li key={idx} className="text-[0.95em] leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: inline(item) }} />
                    ))}
                </Tag>
            );
            listBuffer = [];
            listType = null;
        };

        while (i < lines.length) {
            const line = lines[i];

            // ── Fenced code block ────────────────────────────────────────
            if (line.trim().startsWith('```')) {
                flushList();
                const lang = line.trim().slice(3).trim();
                const codeLines = [];
                i++;
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                elements.push(
                    <pre key={`code-${i}`}
                        className="bg-gray-900 text-green-300 rounded-xl px-4 py-3 my-3 overflow-x-auto text-xs font-mono leading-relaxed">
                        {lang && <span className="block text-gray-500 text-[0.7em] uppercase tracking-wider mb-2">{lang}</span>}
                        <code>{codeLines.join('\n')}</code>
                    </pre>
                );
                i++;
                continue;
            }

            // ── Horizontal rule ──────────────────────────────────────────
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
                flushList();
                elements.push(<hr key={`hr-${i}`} className="border-gray-200 my-3" />);
                i++;
                continue;
            }

            // ── Blockquote ───────────────────────────────────────────────
            if (line.startsWith('> ')) {
                flushList();
                elements.push(
                    <blockquote key={`bq-${i}`}
                        className="border-l-4 border-yellow-400 bg-yellow-50 pl-4 pr-2 py-1 my-2 rounded-r-lg text-gray-700 italic text-sm"
                        dangerouslySetInnerHTML={{ __html: inline(line.slice(2)) }} />
                );
                i++;
                continue;
            }

            // ── Headers ──────────────────────────────────────────────────
            const h3 = line.match(/^### (.+)/);
            const h2 = line.match(/^## (.+)/);
            const h1 = line.match(/^# (.+)/);
            if (h1 || h2 || h3) {
                flushList();
                const content = (h1 || h2 || h3)[1];
                const cls = h1
                    ? 'text-xl font-black mt-4 mb-2 text-gray-900'
                    : h2
                        ? 'text-lg font-bold mt-3 mb-1.5 text-gray-900'
                        : 'text-base font-bold mt-2 mb-1 text-gray-800';
                const Tag = h1 ? 'h1' : h2 ? 'h2' : 'h3';
                elements.push(
                    <Tag key={`h-${i}`} className={cls}
                        dangerouslySetInnerHTML={{ __html: inline(content) }} />
                );
                i++;
                continue;
            }

            // ── Ordered list ─────────────────────────────────────────────
            const olMatch = line.match(/^\d+\.\s+(.*)/);
            if (olMatch) {
                if (listType !== 'ol') { flushList(); listType = 'ol'; }
                listBuffer.push(olMatch[1]);
                i++;
                continue;
            }

            // ── Unordered list (* - •) ───────────────────────────────────
            const ulMatch = line.match(/^[*\-•]\s+(.*)/);
            if (ulMatch) {
                if (listType !== 'ul') { flushList(); listType = 'ul'; }
                listBuffer.push(ulMatch[1]);
                i++;
                continue;
            }

            // ── Empty line — flush list and add spacing ──────────────────
            if (line.trim() === '') {
                flushList();
                // Only add spacer if next non-empty line isn't also blank
                if (elements.length > 0) {
                    elements.push(<div key={`sp-${i}`} className="h-2" />);
                }
                i++;
                continue;
            }

            // ── Regular paragraph line ───────────────────────────────────
            flushList();
            elements.push(
                <p key={`p-${i}`} className="leading-relaxed text-[0.95em] my-0.5"
                    dangerouslySetInnerHTML={{ __html: inline(line) }} />
            );
            i++;
        }

        flushList(); // flush any trailing list

        return <div className="space-y-0.5">{elements}</div>;
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

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

        // Add user message immediately
        const currentMessages = messagesRef.current;
        const newHistory = [...currentMessages, { role: 'user', content: userMsgContent }];
        messagesRef.current = newHistory;
        setMessages(newHistory);

        setIsLoading(true);
        try {
            // Build history in the format api.py expects: [{role, content}]
            // Filter out error messages from history since they aren't real AI turns
            const cleanHistory = currentMessages
                .filter(m => !m.isError)
                .map(m => ({ role: m.role, content: m.content }));

            const response = await axios.post(`${AI_API_URL}/api/chat`, {
                message: userMsgContent,
                history: cleanHistory,
                // Only send email on the FIRST message (empty history) — api.py
                // injects the email primer once at conversation start, mirroring main.py.
                email: cleanHistory.length === 0 ? (email || null) : null,
                model: selectedModel,  // let the user pick the model per-session
            }, { timeout: 120000 }); // 2-min timeout for agentic loops

            const reply = response.data.error
                ? `⚠️ **Backend Error:** ${response.data.error}`
                : response.data.reply;

            const withReply = [
                ...messagesRef.current,
                { role: 'assistant', content: reply, isError: !!response.data.error }
            ];
            messagesRef.current = withReply;
            setMessages(withReply);

        } catch (error) {
            console.error('Chat request failed:', error);
            const errMsg = [
                ...messagesRef.current,
                {
                    role: 'assistant',
                    content: `⚠️ **Connection Error:** ${error.message}\n\nMake sure \`api.py\` is running on port 8001 and the Docker MCP container is available.`,
                    isError: true
                }
            ];
            messagesRef.current = errMsg;
            setMessages(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center animate-fade-in w-full min-h-[calc(100vh-80px)] bg-[#FAF9F6] font-sans">

            {/* Header Area */}
            <div className="w-full max-w-5xl px-6 py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-gray-900 border-b-4 border-[#FFECA0] pb-1">
                        AI Analyst
                    </h1>
                </div>

                <div className="flex items-center gap-3">
                    {/* Cognito email badge */}
                    {email && (
                        <div className="flex items-center gap-1.5 text-sm px-3 py-1.5 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-600 max-w-[180px] truncate" title={email}>
                            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                            <span className="truncate">{email}</span>
                        </div>
                    )}

                    {/* MCP server status badge */}
                    <div
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${apiStatus === 'online'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : apiStatus === 'offline'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                        title="MCP Server status — click to refresh"
                        onClick={checkStatus}
                    >
                        {apiStatus === 'online'
                            ? <Wifi className="w-3.5 h-3.5" />
                            : apiStatus === 'offline'
                                ? <WifiOff className="w-3.5 h-3.5" />
                                : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>MCP {apiStatus === 'checking' ? '…' : apiStatus}</span>
                    </div>

                    {/* Model selector */}
                    <div className="relative">
                        <button
                            onClick={() => { setIsModelOpen(!isModelOpen); setIsDocsOpen(false); }}
                            className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full shadow-sm transition-colors ${
                                isModelOpen ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            title="Select Bedrock model"
                        >
                            <Cpu className="w-4 h-4" />
                            <span className="max-w-[110px] truncate">
                                {KNOWN_MODELS.find(m => m.alias === selectedModel)?.label || selectedModel}
                            </span>
                            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                        </button>

                        {isModelOpen && (
                            <div className="absolute right-0 top-full mt-1 w-56 bg-white border-2 border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Select Model</span>
                                    {serverModel && (
                                        <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={serverModel}>
                                            Server default: {serverModel.split('.').pop()}
                                        </div>
                                    )}
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {KNOWN_MODELS.map(m => (
                                        <button
                                            key={m.alias}
                                            onClick={() => { setSelectedModel(m.alias); setIsModelOpen(false); setMessages([]); messagesRef.current = []; }}
                                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2 transition-colors ${
                                                selectedModel === m.alias ? 'bg-[#FFECA0]/50 font-semibold' : ''
                                            }`}
                                        >
                                            <span>{m.label}</span>
                                            {selectedModel === m.alias && <span className="w-2 h-2 rounded-full bg-black flex-shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Tools Documentation button */}
                    <button
                        onClick={() => { setIsDocsOpen(!isDocsOpen); setIsModelOpen(false); }}
                        className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full shadow-sm backdrop-blur-sm transition-colors ${isDocsOpen
                            ? 'bg-black text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        title="View available tools"
                    >
                        <BookOpen className="w-4 h-4" />
                        <span>Tools</span>
                        <span className="bg-[#FFECA0] text-black text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {bedrockTools.length}
                        </span>
                    </button>
                </div>
            </div>

            {/* Tools Documentation Panel */}
            {isDocsOpen && (
                <div className="w-full max-w-5xl px-6 mb-4">
                    <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-gray-600" />
                                <span className="font-bold text-gray-800 text-sm uppercase tracking-wide">Available Tools</span>
                                <span className="bg-[#FFECA0] text-black text-xs font-bold px-1.5 py-0.5 rounded-full">{bedrockTools.length}</span>
                            </div>
                            <button onClick={() => setIsDocsOpen(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {bedrockTools.map((t, i) => {
                                const spec = t.toolSpec;
                                const props = spec.inputSchema?.json?.properties || {};
                                const required = spec.inputSchema?.json?.required || [];
                                const isExpanded = expandedTool === i;
                                return (
                                    <div key={spec.name} className="px-5 py-3">
                                        <button
                                            className="w-full flex items-center justify-between text-left gap-3"
                                            onClick={() => setExpandedTool(isExpanded ? null : i)}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="font-mono text-xs bg-black text-[#FFECA0] px-2 py-0.5 rounded font-bold shrink-0">{spec.name}</span>
                                                <span className="text-sm text-gray-500 truncate">{spec.description}</span>
                                            </div>
                                            {isExpanded
                                                ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                                                : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                                        </button>

                                        {isExpanded && (
                                            <div className="mt-3 ml-1 space-y-2">
                                                <p className="text-xs text-gray-600 leading-relaxed">{spec.description}</p>
                                                {Object.keys(props).length > 0 && (
                                                    <div className="rounded-lg border border-gray-100 overflow-hidden">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                                                                    <th className="px-3 py-2 text-left font-semibold">Parameter</th>
                                                                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                                                                    <th className="px-3 py-2 text-left font-semibold">Required</th>
                                                                    <th className="px-3 py-2 text-left font-semibold">Description</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {Object.entries(props).map(([param, def]) => (
                                                                    <tr key={param} className="bg-white">
                                                                        <td className="px-3 py-2 font-mono font-bold text-gray-800">{param}</td>
                                                                        <td className="px-3 py-2 text-gray-500">{def.type || '—'}</td>
                                                                        <td className="px-3 py-2">
                                                                            {required.includes(param)
                                                                                ? <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-semibold">yes</span>
                                                                                : <span className="text-gray-400">optional</span>}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-gray-500">{def.description || '—'}</td>
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

            {/* Main Chat Interface */}
            <div className="w-full max-w-5xl px-4 md:px-6 pb-6 flex-1 flex flex-col h-full">
                <div className="flex-1 bg-white border-2 border-gray-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col relative before:absolute before:inset-0 before:pointer-events-none before:border-[1px] before:border-white/50 before:rounded-2xl z-0">

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth bg-gradient-to-b from-gray-50/50 to-white">

                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-60 mt-12 mb-8">
                                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                    <Bot className="w-10 h-10 text-gray-400" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-2">RIHNO AI Analyst</h3>
                                <p className="text-gray-500 max-w-md">
                                    Powered by <strong>AWS Bedrock</strong> via the <code>rihno-mcp-server</code> Docker container.
                                    Queries run server-side through <code>api.py</code> on port 8001.
                                </p>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                            >
                                {/* Avatar */}
                                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${msg.role === 'user'
                                    ? 'bg-black text-white'
                                    : msg.isError
                                        ? 'bg-red-100 text-red-600 border border-red-200'
                                        : 'bg-[#FFECA0] text-black border border-yellow-300'
                                    }`}>
                                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                                </div>

                                {/* Bubble */}
                                <div className={`px-5 py-4 rounded-3xl relative shadow-sm ${msg.role === 'user'
                                    ? 'bg-black text-white rounded-tr-sm'
                                    : msg.isError
                                        ? 'bg-red-50 text-red-900 border border-red-100 rounded-tl-sm'
                                        : 'bg-white border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-gray-800 rounded-tl-sm'
                                    }`}>
                                    {/* User bubbles use whitespace-pre-wrap; assistant uses the markdown renderer */}
                                    {msg.role === 'user'
                                        ? <div className="text-base leading-relaxed whitespace-pre-wrap font-medium">{msg.content}</div>
                                        : <div className="text-base leading-relaxed">{renderMarkdown(msg.content)}</div>
                                    }
                                </div>
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <div className="flex gap-4 max-w-[80%] mr-auto items-end animate-pulse">
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#FFECA0] text-black flex items-center justify-center shadow-sm border border-yellow-300">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                </div>
                                <div className="px-5 py-4 rounded-3xl rounded-tl-sm bg-white border border-gray-100 shadow-sm">
                                    <div className="flex gap-1.5 items-center h-6">
                                        <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                        <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                        <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-gray-100 relative z-10">
                        <form
                            onSubmit={handleSend}
                            className="relative flex items-center bg-gray-50 border-2 border-gray-200 rounded-2xl overflow-hidden focus-within:border-black focus-within:ring-4 focus-within:ring-black/5 transition-all duration-200"
                        >
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={apiStatus === 'offline' ? 'MCP server offline — start api.py first…' : 'Ask the AI Analyst…'}
                                disabled={isLoading}
                                className="w-full bg-transparent border-none py-4 pl-5 pr-14 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 text-lg disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="absolute right-2 p-2.5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 transition-colors shadow-sm"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </button>
                        </form>
                        <div className="text-center mt-3">
                            <span className="text-xs text-gray-400 font-medium">
                                Routed via <code>api.py</code> → <code>docker run rihno-mcp-server</code> → AWS Bedrock
                            </span>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default Ai;