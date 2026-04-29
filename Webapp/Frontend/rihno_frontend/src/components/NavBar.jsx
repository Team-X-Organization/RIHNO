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
        <div className="w-full max-w-[1600px] mx-auto relative z-50 p-2 sm:p-3 md:p-4">
            <nav className="flex items-center justify-between border-[3px] md:border-[5px] xl:border-[6px] border-black p-2 sm:p-2.5 md:p-3 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] xl:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">

                {/* Logo Section */}
                <div className="flex items-center gap-2 min-w-0">
                    <img src={logo} alt="logo" className="h-9 w-9 sm:h-11 sm:w-11 md:h-14 md:w-14 xl:h-16 xl:w-16 rounded-full flex-shrink-0" />
                    <Link to={"/"}><span className="text-lg sm:text-xl md:text-2xl font-black underline">RIHNO</span></Link>
                </div>

                {/* Desktop Menu: Hidden on small screens */}
                <div className="hidden lg:flex items-center gap-3 xl:gap-6 font-bold text-base xl:text-lg">
                    <Link to="/" className="hover:border-b-[4px] hover:border-[#FFECA0] font-mono">Home</Link>
                    <Link to="/contact" className="hover:border-b-[4px] hover:border-[#CEFFBC] font-mono">Contact</Link>
                    <Link to="/about" className="hover:border-b-[4px] hover:border-[#FFA0A2] font-mono">About</Link>
                    <Link to="/documentation" className="hover:border-b-[4px] hover:border-[#7EA0FD] font-mono">Documentation</Link>

                    {auth.isAuthenticated && (
                        <span className="text-xs xl:text-sm font-mono bg-black text-white px-2 xl:px-3 py-1 truncate max-w-[180px] xl:max-w-[260px]">
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
                    className="lg:hidden p-2 border-2 border-black flex-shrink-0"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? <X className="w-6 h-6 sm:w-7 sm:h-7" /> : <Menu className="w-6 h-6 sm:w-7 sm:h-7" />}
                </button>
            </nav>

            {/* Mobile Dropdown Menu */}
            {isOpen && (
                <div className="lg:hidden mt-2 flex flex-col gap-3 sm:gap-4 p-4 sm:p-6 bg-white border-[3px] sm:border-[4px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold">
                    <Link to="/" onClick={() => setIsOpen(false)}>Home</Link>
                    <Link to="/contact" onClick={() => setIsOpen(false)}>Contact</Link>
                    <Link to="/about" onClick={() => setIsOpen(false)}>About</Link>
                    <Link to="/documentation" onClick={() => setIsOpen(false)}>Documentation</Link>
                    {auth.isAuthenticated && (
                        <span className="text-xs font-mono bg-black text-white px-2 py-1 truncate">
                            {auth.user?.profile?.email}
                        </span>
                    )}
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