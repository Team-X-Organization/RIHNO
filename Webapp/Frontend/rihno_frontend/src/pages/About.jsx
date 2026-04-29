import React from 'react';
import { ShieldCheck, Cpu, Activity, Globe } from 'lucide-react';

function About() {
    return (
        <div className="min-h-screen bg-white text-black font-sans pb-12 sm:pb-16 md:pb-20 pt-8 sm:pt-12 md:pt-16">
            <div className="w-full mx-auto px-4 sm:px-6 md:px-8 lg:px-10 pt-8 sm:pt-12 md:pt-16 lg:pt-24 max-w-6xl xl:max-w-7xl">
                <div className="mb-10 sm:mb-12 md:mb-16 text-center mt-6 sm:mt-8 md:mt-0">
                    <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black uppercase leading-none tracking-tight mb-4 sm:mb-6">
                        About <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#CEFFBC] via-[#7EA0FD] to-[#FFA0A2] stroke-black" style={{ WebkitTextStroke: '2px black' }}>RIHNO</span>
                    </h1>
                    <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-mono max-w-3xl mx-auto border-b-[3px] sm:border-b-[4px] border-t-[3px] sm:border-t-[4px] border-black py-4 sm:py-6 px-2">
                        Securing the future of infrastructure with unparalleled artificial intelligence and real-time network analysis.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 mt-10 sm:mt-12 md:mt-16">
                    {/* Vision */}
                    <div className="bg-[#CEFFBC] border-[3px] sm:border-[4px] border-black p-5 sm:p-6 md:p-8 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-2 hover:translate-x-2 transition-transform duration-300">
                        <Globe className="mb-4 sm:mb-6 w-10 h-10 sm:w-12 sm:h-12" />
                        <h2 className="text-2xl sm:text-3xl font-black uppercase mb-3 sm:mb-4">Our Vision</h2>
                        <p className="text-base sm:text-lg font-medium leading-relaxed">
                            Traditional security paradigms are failing against sophisticated cyber threats. We built RIHNO to provide a proactive, AI-driven shield that evolves as quickly as the threats themselves, ensuring zero-day protection for mission-critical systems.
                        </p>
                    </div>

                    {/* Technology */}
                    <div className="bg-[#FFA0A2] border-[3px] sm:border-[4px] border-black p-5 sm:p-6 md:p-8 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-2 hover:translate-x-2 transition-transform duration-300">
                        <Cpu className="mb-4 sm:mb-6 w-10 h-10 sm:w-12 sm:h-12" />
                        <h2 className="text-2xl sm:text-3xl font-black uppercase mb-3 sm:mb-4">The Engine</h2>
                        <p className="text-base sm:text-lg font-medium leading-relaxed">
                            Powered by a custom deep learning model trained on terabytes of network telemetry. RIHNO doesn't just look for known signatures; it understands the baseline behavior of your network and detects anomalies with extreme precision.
                        </p>
                    </div>
                </div>

                <div className="mt-14 sm:mt-16 md:mt-20 border-[3px] sm:border-[4px] border-black bg-white p-5 sm:p-8 md:p-12 relative shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
                    <div className="absolute -top-5 sm:-top-6 left-4 sm:left-8 bg-[#7EA0FD] border-[3px] border-black px-3 sm:px-6 py-1.5 sm:py-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <h3 className="text-base sm:text-xl md:text-2xl font-black uppercase">Why RIHNO?</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 mt-6 sm:mt-8">
                        <div className="flex flex-col items-center text-center">
                            <Activity size={36} className="mb-3 sm:mb-4 text-[#7EA0FD] sm:w-10 sm:h-10" />
                            <h4 className="font-black text-lg sm:text-xl mb-2">Real-Time Insight</h4>
                            <p className="text-gray-600 font-mono text-xs sm:text-sm">Sub-millisecond packet analysis ensures malicious actors are stopped before they exfiltrate data.</p>
                        </div>
                        <div className="flex flex-col items-center text-center">
                            <ShieldCheck size={36} className="mb-3 sm:mb-4 text-[#CEFFBC] sm:w-10 sm:h-10" />
                            <h4 className="font-black text-lg sm:text-xl mb-2">Zero-Trust Ready</h4>
                            <p className="text-gray-600 font-mono text-xs sm:text-sm">Designed to integrate seamlessly into modern zero-trust architectures and cloud-native environments.</p>
                        </div>
                        <div className="flex flex-col items-center text-center sm:col-span-2 md:col-span-1">
                            <Cpu size={36} className="mb-3 sm:mb-4 text-[#FFA0A2] sm:w-10 sm:h-10" />
                            <h4 className="font-black text-lg sm:text-xl mb-2">Automated Response</h4>
                            <p className="text-gray-600 font-mono text-xs sm:text-sm">Integrates with your existing firewall controllers to instantly block recognized threat vectors.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default About;