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
        <div className="min-h-screen bg-white text-black font-sans pb-12 sm:pb-16 md:pb-20 pt-8 sm:pt-12 md:pt-16">
            <div className="w-full mx-auto px-4 sm:px-6 md:px-8 lg:px-10 pt-8 sm:pt-12 md:pt-16 lg:pt-24 max-w-5xl xl:max-w-6xl">
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black uppercase mb-6 sm:mb-8 border-b-[3px] sm:border-b-[4px] border-black pb-3 sm:pb-4">
                    Documentation
                </h1>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8 mt-8 sm:mt-10 md:mt-12">
                    {/* Sidebar */}
                    <div className="md:col-span-1 border-r-[3px] border-black pr-4 hidden md:block">
                        <div className="sticky top-24">
                            <ul className="space-y-3 lg:space-y-4 font-bold text-base lg:text-lg">
                                <li><a href="#getting-started" className="hover:text-[#7EA0FD] flex items-center gap-2"><ChevronRight size={18}/> Getting Started</a></li>
                                <li><a href="#dashboard" className="hover:text-[#FFA0A2] flex items-center gap-2"><ChevronRight size={18}/> Dashboard Guide</a></li>
                                <li><a href="#cli" className="hover:text-[#CEFFBC] flex items-center gap-2"><ChevronRight size={18}/> Rihno CLI</a></li>
                            </ul>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="md:col-span-3 space-y-10 sm:space-y-12 md:space-y-16">
                        {/* Getting Started */}
                        <section id="getting-started" className="scroll-mt-32">
                            <h2 className="text-2xl sm:text-3xl font-black uppercase bg-[#7EA0FD] inline-block px-3 sm:px-4 py-1.5 sm:py-2 border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4 sm:mb-6">
                                1. Getting Started
                            </h2>
                            <p className="text-base sm:text-lg md:text-xl font-medium mb-4 leading-relaxed">
                                Welcome to RIHNO IDS. This next-generation intrusion detection system leverages AI to monitor, detect, and respond to threats in real-time.
                            </p>
                            <div className="bg-gray-100 border-[3px] border-black p-4 sm:p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-shadow duration-300">
                                <h3 className="text-lg sm:text-xl font-bold mb-2 flex items-center gap-2"><Shield size={20} className="sm:w-6 sm:h-6"/> Core Components</h3>
                                <ul className="list-disc list-inside space-y-2 font-mono text-xs sm:text-sm mt-3 sm:mt-4">
                                    <li><strong>Web Dashboard:</strong> Centralized hub for managing alerts and viewing analytics.</li>
                                    <li><strong>Data Pipeline:</strong> Backend connecting agents to the AI engine.</li>
                                    <li><strong>Rihno CLI Agent:</strong> Deployed on target machines to monitor network traffic.</li>
                                </ul>
                            </div>
                        </section>

                        {/* Dashboard section */}
                        <section id="dashboard" className="scroll-mt-32">
                            <h2 className="text-2xl sm:text-3xl font-black uppercase bg-[#FFA0A2] inline-block px-3 sm:px-4 py-1.5 sm:py-2 border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4 sm:mb-6">
                                2. Dashboard Guide
                            </h2>
                            <p className="text-base sm:text-lg mb-4">
                                The Dashboard is your primary interface for interacting with RIHNO.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                <div className="border-[3px] border-black p-3 sm:p-4 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <h4 className="font-black uppercase mb-2 text-sm sm:text-base">Real-time Alerts</h4>
                                    <p className="text-xs sm:text-sm">View threats instantly as they are detected by the AI models.</p>
                                </div>
                                <div className="border-[3px] border-black p-3 sm:p-4 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <h4 className="font-black uppercase mb-2 text-sm sm:text-base">Analytics</h4>
                                    <p className="text-xs sm:text-sm">Analyze patterns and network traffic volume over time.</p>
                                </div>
                            </div>
                        </section>

                        {/* CLI section */}
                        <section id="cli" className="scroll-mt-32">
                            <h2 className="text-2xl sm:text-3xl font-black uppercase bg-[#CEFFBC] inline-block px-3 sm:px-4 py-1.5 sm:py-2 border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4 sm:mb-6">
                                3. Install Rihno CLI
                            </h2>
                            <p className="text-base sm:text-lg mb-4">
                                The Rihno CLI is a Go-based agent that must be installed on the machines you want to protect. It acts as the probe monitoring the network.
                            </p>

                            <div className="bg-[#111] text-green-400 p-4 sm:p-6 rounded-none border-[3px] border-black font-mono relative mt-4 sm:mt-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                                <button
                                    onClick={() => handleCopy('git clone https://github.com/Sakib-Dalal/Rihno.git\\ncd Rihno/Rihno_CLI\\ngo build -o rihno main.go\\nsudo ./rihno start')}
                                    className="absolute top-3 sm:top-4 right-3 sm:right-4 text-white hover:text-green-400 transition-colors"
                                >
                                    {copied ? <Check size={18} className="sm:w-5 sm:h-5" /> : <Copy size={18} className="sm:w-5 sm:h-5" />}
                                </button>
                                <div className="space-y-3 sm:space-y-4 text-xs sm:text-sm mt-2 overflow-x-auto whitespace-pre-wrap pr-8">
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
                            
                            <div className="mt-6 sm:mt-8 border-[3px] border-black p-4 sm:p-6 bg-[#ffffdd] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                                <h4 className="font-black uppercase flex items-center gap-2 mb-3 sm:mb-4 text-sm sm:text-base"><Terminal size={18} className="sm:w-5 sm:h-5"/> Available Commands</h4>
                                <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm">
                                    <li className="flex items-start gap-3 sm:gap-4 flex-wrap">
                                        <span className="bg-black text-[#CEFFBC] font-mono px-2 sm:px-3 py-1 font-bold border-[2px] border-black flex-shrink-0">start</span>
                                        <div className="flex-1 mt-0.5 sm:mt-1 min-w-0">Begins network monitoring and forwards data to the AI agent nodes.</div>
                                    </li>
                                    <li className="flex items-start gap-3 sm:gap-4 flex-wrap">
                                        <span className="bg-black text-[#FFA0A2] font-mono px-2 sm:px-3 py-1 font-bold border-[2px] border-black flex-shrink-0">stop</span>
                                        <div className="flex-1 mt-0.5 sm:mt-1 min-w-0">Safely shuts down the monitoring agent.</div>
                                    </li>
                                    <li className="flex items-start gap-3 sm:gap-4 flex-wrap">
                                        <span className="bg-black text-[#7EA0FD] font-mono px-2 sm:px-3 py-1 font-bold border-[2px] border-black flex-shrink-0">status</span>
                                        <div className="flex-1 mt-0.5 sm:mt-1 min-w-0">Checks the current operational health of the agent.</div>
                                    </li>
                                    <li className="flex items-start gap-3 sm:gap-4 flex-wrap">
                                        <span className="bg-black text-white font-mono px-2 sm:px-3 py-1 font-bold border-[2px] border-black flex-shrink-0">config</span>
                                        <div className="flex-1 mt-0.5 sm:mt-1 min-w-0">Configures remote backend API connectivity.</div>
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