import React, { useState } from 'react';
import logo from '../assets/rihno.svg';
import { Link } from 'react-router-dom';
import { useAuth } from "react-oidc-context";
import { cognitoConfig } from "../authConfig.js";
import Button from "./Button";
import { Menu, X } from 'lucide-react'; // Added icons for mobile toggle

function NavBar() {
    const auth = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const signOutRedirect = async () => {
        await auth.removeUser();
        const clientId = cognitoConfig?.client_id;
        const logoutUri = cognitoConfig?.redirect_uri;
        const cognitoDomain = cognitoConfig?.domain;
        window.location.href =
            `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
    };

    return (
        <div className="w-full max-w-7xl mx-auto relative z-50 p-2 md:p-4">
            <nav className="flex items-center justify-between border-[3px] md:border-[6px] border-black p-2 md:p-3 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">

                {/* Logo Section */}
                <div className="flex items-center gap-2">
                    <img src={logo} alt="logo" className="h-10 w-10 md:h-16 md:w-16 rounded-full" />
                    <Link to={"/"}><span className="text-xl md:text-2xl font-black underline">RIHNO</span></Link>
                </div>

                {/* Desktop Menu: Hidden on small screens */}
                <div className="hidden lg:flex items-center gap-6 font-bold text-lg">
                    <Link to="/" className="hover:border-b-[4px] hover:border-[#FFECA0] font-mono">Home</Link>
                    <Link to="/contact" className="hover:border-b-[4px] hover:border-[#CEFFBC] font-mono">Contact</Link>
                    <Link to="/about" className="hover:border-b-[4px] hover:border-[#FFA0A2] font-mono">About</Link>
                    <Link to="/documentation" className="hover:border-b-[4px] hover:border-[#7EA0FD] font-mono">Documentation</Link>

                    {auth.isAuthenticated && (
                        <span className="text-sm font-mono bg-black text-white px-3 py-1">
                            {auth.user?.profile?.email}
                        </span>
                    )}

                    {!auth.isAuthenticated ? (
                        <Button func={() => auth.signinRedirect()} color={"bg-[#FFECA0]"} label="LOGIN" />
                    ) : (
                        <Button func={signOutRedirect} color={"bg-red-300"} label="LOGOUT" />
                    )}
                </div>

                {/* Mobile Toggle: Only visible on small screens */}
                <button
                    className="lg:hidden p-2 border-2 border-black"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? <X size={28} /> : <Menu size={28} />}
                </button>
            </nav>

            {/* Mobile Dropdown Menu */}
            {isOpen && (
                <div className="lg:hidden mt-2 flex flex-col gap-4 p-6 bg-white border-[4px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold">
                    <Link to="/" onClick={() => setIsOpen(false)}>Home</Link>
                    <Link to="/contact" onClick={() => setIsOpen(false)}>Contact</Link>
                    <Link to="/about" onClick={() => setIsOpen(false)}>About</Link>
                    <Link to="/documentation" onClick={() => setIsOpen(false)}>Documentation</Link>
                    <hr className="border-black" />
                    {!auth.isAuthenticated ? (
                        <Button func={() => auth.signinRedirect()} color={"bg-[#FFECA0]"} label="LOGIN" />
                    ) : (
                        <Button func={signOutRedirect} color={"bg-red-300"} label="LOGOUT" />
                    )}
                </div>
            )}
        </div>
    );
}

export default NavBar;