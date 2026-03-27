import React from 'react';

interface LicenseGuardProps {
    children: React.ReactNode;
    userEmail?: string | null;
    userTier?: string | null;
}

// License enforcement has been removed from the platform.
// Keep this wrapper to avoid touching the surrounding app tree.
const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => <>{children}</>;

export default LicenseGuard;
