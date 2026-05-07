"use client";

import { useEffect } from "react";
import { registerTimerServiceWorker } from "@/lib/notifications";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    void registerTimerServiceWorker();
  }, []);

  return null;
}
