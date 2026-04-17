import React from 'react';
import { ShieldCheck, Cpu, Activity, Globe } from 'lucide-react';

function About() {
    return (
        <div className="min-h-screen bg-white text-black font-sans pb-20 pt-16">
            <div className="container mx-auto px-6 pt-12 md:pt-24 max-w-6xl">
                <div className="mb-16 text-center mt-12 md:mt-0">
                    <h1 className="text-5xl md:text-8xl font-black uppercase leading-none tracking-tight mb-6">
                        About <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#CEFFBC] via-[#7EA0FD] to-[#FFA0A2] stroke-black" style={{ WebkitTextStroke: '2px black' }}>RIHNO</span>
                    </h1>
                    <p className="text-xl md:text-2xl font-mono max-w-3xl mx-auto border-b-[4px] border-t-[4px] border-black py-6">
                        Securing the future of infrastructure with unparalleled artificial intelligence and real-time network analysis.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-16">
                    {/* Vision */}
                    <div className="bg-[#CEFFBC] border-[4px] border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-2 hover:translate-x-2 transition-transform duration-300">
                        <Globe size={48} className="mb-6" />
                        <h2 className="text-3xl font-black uppercase mb-4">Our Vision</h2>
                        <p className="text-lg font-medium leading-relaxed">
                            Traditional security paradigms are failing against sophisticated cyber threats. We built RIHNO to provide a proactive, AI-driven shield that evolves as quickly as the threats themselves, ensuring zero-day protection for mission-critical systems.
                        </p>
                    </div>

                    {/* Technology */}
                    <div className="bg-[#FFA0A2] border-[4px] border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-2 hover:translate-x-2 transition-transform duration-300">
                        <Cpu size={48} className="mb-6" />
                        <h2 className="text-3xl font-black uppercase mb-4">The Engine</h2>
                        <p className="text-lg font-medium leading-relaxed">
                            Powered by a custom deep learning model trained on terabytes of network telemetry. RIHNO doesn't just look for known signatures; it understands the baseline behavior of your network and detects anomalies with extreme precision.
                        </p>
                    </div>
                </div>

                <div className="mt-20 border-[4px] border-black bg-white p-8 md:p-12 relative shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
                    <div className="absolute -top-6 left-8 bg-[#7EA0FD] border-[3px] border-black px-6 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <h3 className="text-2xl font-black uppercase">Why RIHNO?</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
                        <div className="flex flex-col items-center text-center">
                            <Activity size={40} className="mb-4 text-[#7EA0FD]" />
                            <h4 className="font-black text-xl mb-2">Real-Time Insight</h4>
                            <p className="text-gray-600 font-mono text-sm">Sub-millisecond packet analysis ensures malicious actors are stopped before they exfiltrate data.</p>
                        </div>
                        <div className="flex flex-col items-center text-center">
                            <ShieldCheck size={40} className="mb-4 text-[#CEFFBC]" />
                            <h4 className="font-black text-xl mb-2">Zero-Trust Ready</h4>
                            <p className="text-gray-600 font-mono text-sm">Designed to integrate seamlessly into modern zero-trust architectures and cloud-native environments.</p>
                        </div>
                        <div className="flex flex-col items-center text-center">
                            <Cpu size={40} className="mb-4 text-[#FFA0A2]" />
                            <h4 className="font-black text-xl mb-2">Automated Response</h4>
                            <p className="text-gray-600 font-mono text-sm">Integrates with your existing firewall controllers to instantly block recognized threat vectors.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default About;