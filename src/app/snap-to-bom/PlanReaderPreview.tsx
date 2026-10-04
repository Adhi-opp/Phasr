"use client";

// src/app/snap-to-bom/PlanReaderPreview.tsx
// ============================================================================
// SNAP-TO-BOM — ADMIN PREVIEW
// ============================================================================
// The upload handler for the floor-plan reader, shown only to admins while
// Snap-to-BOM is marked Coming soon (the route is admin-only too). Every
// read spends model quota.
//
// The file is prepared in the browser first (features/vision/prepareUpload):
// a photo is shrunk to 1920 px and re-encoded, which keeps it under the
// route's 4 MB cap and strips its EXIF data, GPS position included. The line
// under the picker reports what was actually sent, so this can be checked
// from a phone.
//
// This is a test bench, not the room review screen: it shows what the model
// read and what the engine made of it, nothing is saved.
// ============================================================================

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Eyebrow } from "@/components/phase";
import type { RoomSpec } from "@/features/calculator/type";
import type { PlanSummary } from "@/features/vision/toCalculator";
import {
  prepareFloorPlanUpload,
  UploadPreparationError,
  type PreparedUpload,
} from "@/features/vision/prepareUpload";

type EnginePreview = {
  totalConnectedLoadKw: number;
  maxDemandKw: number;
  recommendedPhase: "SINGLE" | "THREE";
  totalCircuits: number;
};

type ReadReply = {
  ok: true;
  model: string;
  rooms: RoomSpec[];
  summary: PlanSummary;
  preview: EnginePreview | null;
  warnings: string[];
};

type FailReply = { ok: false; error: string; warnings?: string[]; notes?: string[] };

type State =
  | { step: "idle" }
  | { step: "preparing" }
  | { step: "reading"; sent: PreparedUpload }
  | { step: "done"; sent: PreparedUpload; reply: ReadReply }
  | { step: "failed"; sent: PreparedUpload | null; message: string; details: string[] };

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeSent(sent: PreparedUpload): string {
  if (!sent.reencoded) return `Sent the PDF as it is, ${formatBytes(sent.file.size)}.`;
  return `Sent a ${sent.width} × ${sent.height} JPEG, ${formatBytes(sent.file.size)} (from ${formatBytes(
    sent.originalBytes
  )}). Photo metadata, location included, removed.`;
}

export function PlanReaderPreview() {
  const inputId = useId();
  const [state, setState] = useState<State>({ step: "idle" });
  const busy = state.step === "preparing" || state.step === "reading";

  async function read(file: File) {
    setState({ step: "preparing" });
    let sent: PreparedUpload;
    try {
      sent = await prepareFloorPlanUpload(file);
    } catch (error) {
      const message =
        error instanceof UploadPreparationError ? error.message : "This file could not be prepared for upload.";
      setState({ step: "failed", sent: null, message, details: [] });
      return;
    }

    setState({ step: "reading", sent });
    try {
      const body = new FormData();
      body.append("file", sent.file);
      const response = await fetch("/api/vision/parse-floorplan", { method: "POST", body });
      const reply = (await response.json()) as ReadReply | FailReply;
      if (reply.ok) {
        setState({ step: "done", sent, reply });
      } else {
        setState({
          step: "failed",
          sent,
          message: reply.error,
          details: [...(reply.warnings ?? []), ...(reply.notes ?? [])],
        });
      }
    } catch {
      setState({
        step: "failed",
        sent,
        message: "The upload did not go through. Check the connection and try again.",
        details: [],
      });
    }
  }

  const sent = state.step === "reading" || state.step === "done" || state.step === "failed" ? state.sent : null;

  return (
    <section className="border-2 border-ink bg-white p-5">
      <Eyebrow phase="red" tone="ink">
        Admin preview
      </Eyebrow>
      <h2 className="mt-3 font-display text-lg font-extrabold tracking-tight text-ink">Read a floor plan</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">
        Only admins see this. Each read calls the vision model and spends quota. Nothing is saved.
      </p>

      <label htmlFor={inputId} className="mt-4 block text-[14px] font-semibold text-ink">
        Photo or PDF of the plan
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file again reads it again.
          event.target.value = "";
          if (file) void read(file);
        }}
        className="mt-2 block w-full text-[14px] text-neutral-700 file:mr-3 file:h-11 file:cursor-pointer file:border-2 file:border-ink file:bg-phase-yellow file:px-4 file:text-[14px] file:font-semibold file:text-ink disabled:opacity-60"
      />

      <div aria-live="polite" className="mt-3 space-y-1 text-[13px] leading-relaxed">
        {busy && (
          <p className="flex items-center gap-2 font-medium text-ink">
            <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
            {state.step === "preparing" ? "Shrinking the photo…" : "Reading the plan…"}
          </p>
        )}
        {sent && <p className="text-neutral-600">{describeSent(sent)}</p>}
      </div>

      {state.step === "failed" && (
        <div role="alert" className="mt-3 text-[13px]">
          <p className="font-medium text-phase-red">{state.message}</p>
          {state.details.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-neutral-700">
              {state.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state.step === "done" && <ReadResult reply={state.reply} />}
    </section>
  );
}

function ReadResult({ reply }: { reply: ReadReply }) {
  const { summary, preview, rooms, warnings } = reply;
  const facts: Array<[string, string]> = [
    ["Rooms read", String(summary.roomCount)],
    ["Floor area", `${Math.round(summary.totalSqFt).toLocaleString("en-IN")} sq ft`],
    [
      "AC / geyser circuits",
      `${summary.heavyApplianceCircuits} (${summary.applianceSource === "PLAN" ? "marked on plan" : "room defaults"})`,
    ],
  ];
  if (preview) {
    facts.push(
      ["Supply", preview.recommendedPhase === "THREE" ? "Three phase" : "Single phase"],
      ["Load", `${preview.totalConnectedLoadKw.toFixed(1)} kW connected, ${preview.maxDemandKw.toFixed(1)} kW demand`],
      ["Circuits", String(preview.totalCircuits)]
    );
  }

  return (
    <div className="mt-5 border-t border-neutral-300 pt-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-neutral-600">{label}</dt>
            <dd className="font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <table className="mt-4 w-full text-left text-[13px]">
        <thead className="border-b border-neutral-300 text-neutral-600">
          <tr>
            <th scope="col" className="py-1.5 pr-2 font-medium">Room</th>
            <th scope="col" className="py-1.5 pr-2 font-medium">Type</th>
            <th scope="col" className="py-1.5 text-right font-medium">Size (ft)</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id} className="border-b border-neutral-200">
              <td className="py-1.5 pr-2 text-ink">{room.name}</td>
              <td className="py-1.5 pr-2 text-neutral-600">{room.type.replaceAll("_", " ").toLowerCase()}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">
                {room.lengthFt} × {room.widthFt}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {warnings.length > 0 && (
        <div className="mt-4 border-2 border-ink bg-phase-yellow/30 p-3 text-[13px]">
          <p className="font-semibold text-ink">Check before trusting it</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-neutral-800">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[12px] text-neutral-500">Read by {reply.model}.</p>
    </div>
  );
}
