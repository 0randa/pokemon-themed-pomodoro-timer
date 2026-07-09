"use client";

import { AuthProvider } from "@/context/auth-context";
import { CheckinProvider } from "@/context/checkin-context";

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <CheckinProvider>
        {children}
      </CheckinProvider>
    </AuthProvider>
  );
}
