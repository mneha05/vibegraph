"use client";
import dynamic from "next/dynamic";

// Editor is client-only — Monaco + React Flow both depend on `window`.
const VibeEditor = dynamic(() => import("@/components/editor/VibeEditor"), { ssr: false });

export default function Page() {
  return <VibeEditor />;
}
