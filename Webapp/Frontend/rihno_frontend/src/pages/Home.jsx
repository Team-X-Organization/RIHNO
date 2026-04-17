import React, { Suspense, useEffect, useState } from 'react';
import { Environment, ScrollControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Model from "../components/Model.jsx";
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { backendConfig } from "../authConfig.js";
import axios from 'axios';

function Home() {
    // Check backend (node.js) is ready
    const [data, setData] = useState("");
    // Call the backend API and update the status
    useEffect(() => {
        // call express js api using axios
        axios.get(`${backendConfig.backendURL}api/backend_check`)
            .then(response => { setData(response.data.message); })
            .catch(error => { console.error("There was an error fetching the data!", error); })
    }, []);

    // Return the Home page
    return (
        <div className="relative w-full min-h-screen bg-white overflow-hidden flex flex-col">
            <div className="relative lg:absolute inset-0 z-10 container mx-auto px-6 flex items-center pt-24 pb-12 lg:pb-32 pointer-events-none">
                <div className="max-w-2xl pointer-events-auto">

                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black text-white text-[10px] md:text-xs font-bold tracking-wider mb-4 md:mb-6 border border-gray-800 shadow-md">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${data ? 'bg-green-400' : 'bg-red-400'}`}></span>
                        {data ? `SYSTEM ONLINE: ${data}` : "SYSTEM OFFLINE"}
                    </div>

                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-black leading-tight mb-6 drop-shadow-sm">
                        <span className={"bg-black text-[#FFA0A2] box-border border-[#FFA0A2] border-6 px-2"}>SECURE YOUR</span> <br />
                        <span className="bg-clip-text text-black">
                            INFRASTRUCTURE
                        </span>
                    </h1>

                    <p className="text-base md:text-lg text-gray-600 mb-8 font-mono leading-relaxed max-w-md md:max-w-lg">
                        Next-generation AI Intrusion Detection System.
                        Real-time monitoring, intelligent threat analysis.
                    </p>

                    <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                        <Link
                            to="/dashboard"
                            className="flex justify-center flex-1 md:flex-none items-center gap-2 bg-[#CEFFBC] text-black border-[3px] border-black px-6 py-3 md:px-8 md:py-4 font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                            Get Started <ArrowRight size={20} />
                        </Link>

                        <Link
                            to="/documentation#cli"
                            className="flex justify-center flex-1 md:flex-none items-center gap-2 bg-black text-white border-[3px] border-black px-6 py-3 md:px-8 md:py-4 font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                            Install CLI
                        </Link>

                        <Link
                            to="/documentation"
                            className="flex justify-center flex-1 md:flex-none items-center gap-2 bg-[#7EA0FD] text-black border-[3px] border-black px-6 py-3 md:px-8 md:py-4 font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                            Documentation
                        </Link>
                    </div>

                    <div className="mt-8 md:mt-12 flex flex-wrap gap-4 md:gap-8 text-sm font-bold text-gray-500">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={18} className="text-black" /> 99.9% Uptime
                        </div>
                        <div className="flex items-center gap-2">
                            <Zap size={18} className="text-black" /> &lt; 10ms Latency
                        </div>
                    </div>
                </div>
            </div>

            {/* --- 3D SCENE --- */}
            <div className="absolute inset-0 z-0 h-full">
                <Canvas camera={{ position: [0, 0, 5], fov: 40 }}>
                    <ambientLight intensity={0.7} />
                    <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.5} castShadow />
                    <directionalLight position={[-5, 5, -5]} intensity={0.5} color="white" />

                    <Suspense fallback={null}>
                        {/* pages={3}: Defines the scrollable height.
                            damping={0.2}: Makes the movement feel smooth and heavy.
                        */}
                        <ScrollControls pages={2} damping={0.15}>
                            <Model />
                        </ScrollControls>
                    </Suspense>

                    <Environment preset="city" />
                </Canvas>
            </div>
        </div>
    );
}

export default Home;