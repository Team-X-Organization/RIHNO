import React from 'react';
import logo from "../assets/rihno.svg";
import {Link} from "react-router-dom";
import Button from "./Button.jsx";
import { useAuth } from "react-oidc-context";
// Import your config if you created the file, otherwise the fallback values below handle it
import { cognitoConfig } from "../authConfig.js";


function NavDashboardTop() {
    const auth = useAuth();
    const signOutRedirect = async () => {
        // 1. Clear the local browser session first
        await auth.removeUser();

        // 2. Define configuration (Matches your AWS Console)
        const clientId = cognitoConfig?.client_id;
        const logoutUri = cognitoConfig?.redirect_uri;
        const cognitoDomain = cognitoConfig?.domain;

        // 3. Redirect to AWS Cognito Logout URL
        window.location.href =
            `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
    };

    return (
        <div className="w-full max-w-[100vw] mx-auto p-2 sm:p-3 md:p-4">
            <nav className="flex items-center justify-between border-[3px] md:border-[5px] xl:border-[6px] border-black p-2 pr-2 md:pr-4 xl:pr-6 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] xl:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] gap-2">

                <div className="flex items-center gap-2 min-w-0 flex-shrink">
                    <img src={logo} alt="logo" className="h-9 w-9 sm:h-11 sm:w-11 md:h-14 md:w-14 xl:h-16 xl:w-16 rounded-full flex-shrink-0" />
                    <span className="text-lg sm:text-xl md:text-2xl font-black underline"><Link to={'/'}>RIHNO</Link></span>
                </div>

                <div className="flex items-center gap-2 md:gap-3 xl:gap-6 font-bold text-sm md:text-base xl:text-lg min-w-0">
                    <p className="hidden md:flex items-center font-mono text-xs lg:text-sm xl:text-lg text-center bg-black min-w-0">
                        <span className={"bg-white ml-1 px-2 flex-shrink-0"}>User:</span>
                        <b className="text-xs lg:text-sm xl:text-xl text-white p-1 truncate max-w-[180px] lg:max-w-[260px] xl:max-w-[400px]">{auth.user?.profile?.email}</b>
                    </p>

                    <button
                        onClick={signOutRedirect}
                        className="bg-red-300 border-[3px] md:border-[4px] border-black px-3 py-2 sm:px-4 md:px-6 lg:px-8 xl:px-10 md:py-2.5 xl:py-3 font-black text-xs sm:text-sm md:text-base uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] xl:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex-shrink-0">
                        Logout
                    </button>
                </div>
            </nav>
        </div>

    );
}

export default NavDashboardTop;