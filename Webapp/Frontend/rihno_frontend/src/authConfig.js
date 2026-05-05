export const cognitoConfig = {
    // These values match your screenshot and provided code
    authority: import.meta.env.VITE_COGNITO_AUTHORITY,
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_COGNITO_REDIRECT_URI,

    // The domain from your Hosted UI
    domain: import.meta.env.VITE_COGNITO_DOMAIN,

};

export const backendConfig = {
    // Added the VITE_ prefix here
    backendURL: import.meta.env.VITE_BACKEND_URL,
    dealerURL: import.meta.env.VITE_DEALER_URL || 'https://rihnobackend.duckdns.org/api/rhino',
}
