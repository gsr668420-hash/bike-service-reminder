"use client";

import { Timestamp } from "firebase/firestore";

type TransferItem = {
  id: string;
  bikeId: string;
  bikeName: string;
  registrationNumber: string;
  fromOwnerEmail: string;
  toOwnerEmail: string;
  ownerServiceCount: number;
  ownerTotalSpent: number;
  ownershipStartedAt: Timestamp | null;
  ownershipDurationMs: number;
  transferredAt: Timestamp | null;
  transferNumber: number;
};

type Props = {
  history: TransferItem[];
  currentUserEmail: string | null | undefined;
};

// Shows only the first 3 characters of the Gmail name.
const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");

  if (!domain) {
    return `${email.slice(0, 3)}*****`;
  }

  return `${name.slice(0, 3)}*****@${domain}`;
};

const formatDateTime = (timestamp: Timestamp | null) => {
  if (!timestamp) {
    return "Not available";
  }

  return timestamp.toDate().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// Short form: "2d 45m", "15h 52m", "39m"
const formatDuration = (durationMs: number) => {
  const totalMinutes = Math.floor(durationMs / (1000 * 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  return parts.length > 0 ? parts.join(" ") : "<1m";
};

export default function OwnershipHistory({
  history,
  currentUserEmail,
}: Props) {
  if (history.length === 0) {
    return null;
  }

  const me = (currentUserEmail || "").toLowerCase();

  const ownerLabel = (email: string) => {
    if (!email) {
      return "Unknown owner";
    }

    return email.toLowerCase() === me ? "You" : maskEmail(email);
  };

  return (
    <section className="mx-auto max-w-6xl px-6 pt-8 pb-6">
      <div className="rounded-2xl border-4 border-indigo-500 bg-gradient-to-br from-indigo-100 via-white to-violet-100 p-4 shadow-lg ring-2 ring-indigo-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="border-l-4 border-indigo-600 pl-3">
            <h2 className="font-serif text-xl font-extrabold text-indigo-900">
              🔑 Ownership &amp; Transfer History
            </h2>

            <p className="text-xs font-semibold text-indigo-900/80">
              Check this first: who owned your vehicles before you.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              Important for new owners
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-800 ring-1 ring-indigo-200">
              {history.length} transfer
              {history.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Two transfers are visible at a time. Scroll inside the box for more. */}
        <div className="mt-3 max-h-[184px] snap-y snap-mandatory space-y-2 overflow-y-auto pr-1">
          {history.map((transfer) => (
            <div
              key={transfer.id}
              className="h-[88px] snap-start overflow-hidden rounded-xl border-2 border-indigo-100 bg-white px-3 py-2 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-extrabold text-indigo-950">
                  {transfer.bikeName}
                  <span className="ml-2 text-xs font-semibold text-gray-500">
                    {transfer.registrationNumber}
                  </span>
                </p>

                <p className="shrink-0 text-[11px] font-semibold text-indigo-800">
                  #{transfer.transferNumber} ·{" "}
                  {formatDateTime(transfer.transferredAt)}
                </p>
              </div>

              <p className="mt-0.5 truncate text-sm font-bold text-gray-900">
                {ownerLabel(transfer.fromOwnerEmail)}
                <span className="mx-1.5 text-indigo-500">→</span>
                {ownerLabel(transfer.toOwnerEmail)}
              </p>

              <p
                className="mt-0.5 truncate text-xs text-gray-600"
                title={`Since ${formatDateTime(
                  transfer.ownershipStartedAt
                )}`}
              >
                Owned{" "}
                <span className="font-bold text-orange-700">
                  {transfer.ownershipStartedAt
                    ? formatDuration(transfer.ownershipDurationMs)
                    : "unknown"}
                </span>
                {" · "}
                <span className="font-bold text-blue-700">
                  {transfer.ownerServiceCount} service
                  {transfer.ownerServiceCount === 1 ? "" : "s"}
                </span>
                {" · "}
                <span className="font-bold text-emerald-700">
                  ₹{transfer.ownerTotalSpent.toLocaleString("en-IN")}
                </span>
              </p>
            </div>
          ))}
        </div>

        {history.length > 2 && (
          <p className="mt-2 text-center text-[11px] font-semibold text-indigo-700">
            Scroll inside the box to see the other{" "}
            {history.length - 2} transfer
            {history.length - 2 === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </section>
  );
}
