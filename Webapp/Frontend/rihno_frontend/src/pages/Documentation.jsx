import React, { useState, useEffect } from 'react';
import { Terminal, Shield, ChevronRight, Copy, Check, Info } from 'lucide-react';
import { useLocation } from 'react-router-dom';

function Documentation() {
    const [copied, setCopied] = useState(false);
    const { hash } = useLocation();

    useEffect(() => {
        if (hash) {
            const element = document.getElementById(hash.substring(1));
            if (element) {
                setTimeout(() => element.scrollIntoView({ behavior: 'smooth' }), 100);
            }
        }
    }, [hash]);

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-white text-black font-sans pb-20 pt-16">
            <div className="container mx-auto px-6 pt-12 md:pt-24 max-w-5xl">
                <h1 className="text-5xl md:text-7xl font-black uppercase mb-8 border-b-[4px] border-black pb-4">
                    Documentation
                </h1>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mt-12">
                    {/* Sidebar */}
                    <div className="md:col-span-1 border-r-[3px] border-black pr-4 hidden md:block">
                        <div className="sticky top-24">
                            <ul className="space-y-4 font-bold text-lg">
                                <li><a href="#getting-started" className="hover:text-[#7EA0FD] flex items-center gap-2"><ChevronRight size={18}/> Getting Started</a></li>
                                <li><a href="#dashboard" className="hover:text-[#FFA0A2] flex items-center gap-2"><ChevronRight size={18}/> Dashboard Guide</a></li>
                                <li><a href="#cli" className="hover:text-[#CEFFBC] flex items-center gap-2"><ChevronRight size={18}/> Rihno CLI</a></li>
                            </ul>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="md:col-span-3 space-y-16">
                        {/* Getting Started */}
                        <section id="getting-started" className="scroll-mt-32">
                            <h2 className="text-3xl font-black uppercase bg-[#7EA0FD] inline-block px-4 py-2 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6">
                                1. Getting Started
                            </h2>
                            <p className="text-xl font-medium mb-4 leading-relaxed">
                                Welcome to RIHNO IDS. This next-generation intrusion detection system leverages AI to monitor, detect, and respond to threats in real-time.
                            </p>
                            <div className="bg-gray-100 border-[3px] border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-shadow duration-300">
                                <h3 className="text-xl font-bold mb-2 flex items-center gap-2"><Shield size={24}/> Core Components</h3>
                                <ul className="list-disc list-inside space-y-2 font-mono text-sm mt-4">
                                    <li><strong>Web Dashboard:</strong> Centralized hub for managing alerts and viewing analytics.</li>
                                    <li><strong>Data Pipeline:</strong> Backend connecting agents to the AI engine.</li>
                                    <li><strong>Rihno CLI Agent:</strong> Deployed on target machines to monitor network traffic.</li>
                                </ul>
                            </div>
                        </section>

                        {/* Dashboard section */}
                        <section id="dashboard" className="scroll-mt-32">
                            <h2 className="text-3xl font-black uppercase bg-[#FFA0A2] inline-block px-4 py-2 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6">
                                2. Dashboard Guide
                            </h2>
                            <p className="text-lg mb-4">
                                The Dashboard is your primary interface for interacting with RIHNO.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="border-[3px] border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <h4 className="font-black uppercase mb-2">Real-time Alerts</h4>
                                    <p className="text-sm">View threats instantly as they are detected by the AI models.</p>
                                </div>
                                <div className="border-[3px] border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <h4 className="font-black uppercase mb-2">Analytics</h4>
                                    <p className="text-sm">Analyze patterns and network traffic volume over time.</p>
                                </div>
                            </div>
                        </section>

                        {/* CLI section */}
                        <section id="cli" className="scroll-mt-32">
                            <h2 className="text-3xl font-black uppercase bg-[#CEFFBC] inline-block px-4 py-2 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6">
                                3. Install Rihno CLI
                            </h2>
                            <p className="text-lg mb-4">
                                The Rihno CLI is a Go-based agent that must be installed on the machines you want to protect. It acts as the probe monitoring the network.
                            </p>
                            
                            <div className="bg-[#111] text-green-400 p-6 rounded-none border-[3px] border-black font-mono relative mt-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                                <button 
                                    onClick={() => handleCopy('git clone https://github.com/Sakib-Dalal/Rihno.git\\ncd Rihno/Rihno_CLI\\ngo build -o rihno main.go\\nsudo ./rihno start')}
                                    className="absolute top-4 right-4 text-white hover:text-green-400 transition-colors"
                                >
                                    {copied ? <Check size={20} /> : <Copy size={20} />}
                                </button>
                                <div className="space-y-4 text-sm mt-2 overflow-x-auto whitespace-pre-wrap pr-8">
                                    <div>
                                        <span className="text-gray-500"># 1. Clone the repository</span>
                                        <br/>
                                        <span>git clone https://github.com/Sakib-Dalal/Rihno.git</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500"># 2. Navigate to the CLI directory</span>
                                        <br/>
                                        <span>cd Rihno_CLI</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500"># 3. Build the CLI tool</span>
                                        <br/>
                                        <span>go build -o rihno main.go</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500"># 4. Start the agent (requires root for continuous monitoring)</span>
                                        <br/>
                                        <span>sudo ./rihno start</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-8 border-[3px] border-black p-6 bg-[#ffffdd] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                                <h4 className="font-black uppercase flex items-center gap-2 mb-4"><Terminal size={20}/> Available Commands</h4>
                                <ul className="space-y-4 text-sm">
                                    <li className="flex items-start gap-4">
                                        <span className="bg-black text-[#CEFFBC] font-mono px-3 py-1 font-bold border-[2px] border-black">start</span>
                                        <div className="flex-1 mt-1">Begins network monitoring and forwards data to the AI agent nodes.</div>
                                    </li>
                                    <li className="flex items-start gap-4">
                                        <span className="bg-black text-[#FFA0A2] font-mono px-3 py-1 font-bold border-[2px] border-black">stop</span>
                                        <div className="flex-1 mt-1">Safely shuts down the monitoring agent.</div>
                                    </li>
                                    <li className="flex items-start gap-4">
                                        <span className="bg-black text-[#7EA0FD] font-mono px-3 py-1 font-bold border-[2px] border-black">status</span>
                                        <div className="flex-1 mt-1">Checks the current operational health of the agent.</div>
                                    </li>
                                    <li className="flex items-start gap-4">
                                        <span className="bg-black text-white font-mono px-3 py-1 font-bold border-[2px] border-black">config</span>
                                        <div className="flex-1 mt-1">Configures remote backend API connectivity.</div>
                                    </li>
                                </ul>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Documentation;