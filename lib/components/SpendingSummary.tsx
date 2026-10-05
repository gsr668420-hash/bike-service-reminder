"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "../firebase";

type Bike = {
  id: string;
  bikeName: string;
  registrationNumber: string;
};

type SpendRecord = {
  id: string;
  bikeId: string;
  serviceDate: Date;
  amountPaid: number;
  workshop: string;
  isMine: boolean;
};

type Summary = {
  thisYear: number;
  lastYear: number;
  count: number;
  total: number;
  average: number;
  mostExpensive: SpendRecord | null;
  workshops: { name: string; count: number; total: number }[];
};

type Props = {
  user: User;
  bikes: Bike[];
  // Pass any value that changes after services are added,
  // edited, deleted or transferred (for example bikeStats).
  refreshKey: unknown;
};

type TimelineEntry = {
  fromOwnerEmail: string;
  transferredAtMs: number;
};

const rupees = (value: number) =>
  `₹${Math.round(value).toLocaleString("en-IN")}`;

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const sumOf = (items: SpendRecord[]) =>
  items.reduce((total, item) => total + item.amountPaid, 0);

const buildSummary = (
  items: SpendRecord[],
  thisYear: number,
  lastYear: number
): Summary => {
  const inYear = (year: number) =>
    items.filter((item) => item.serviceDate.getFullYear() === year);

  const total = sumOf(items);

  const mostExpensive = items.reduce<SpendRecord | null>(
    (best, item) =>
      !best || item.amountPaid > best.amountPaid ? item : best,
    null
  );

  const workshopMap = new Map<
    string,
    { name: string; count: number; total: number }
  >();

  items.forEach((item) => {
    const name = item.workshop || "Workshop not provided";
    const key = name.toLowerCase();
    const existing = workshopMap.get(key);

    if (existing) {
      existing.count += 1;
      existing.total += item.amountPaid;
    } else {
      workshopMap.set(key, {
        name,
        count: 1,
        total: item.amountPaid,
      });
    }
  });

  return {
    thisYear: sumOf(inYear(thisYear)),
    lastYear: sumOf(inYear(lastYear)),
    count: items.length,
    total,
    average: items.length > 0 ? total / items.length : 0,
    mostExpensive,
    workshops: Array.from(workshopMap.values()).sort(
      (a, b) => b.total - a.total
    ),
  };
};

export default function SpendingSummary({
  user,
  bikes,
  refreshKey,
}: Props) {
  const [records, setRecords] = useState<SpendRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const userEmail = user.email?.toLowerCase() || "";

        // Vehicles the user currently owns
        const bikeSnapshot = await getDocs(
          query(
            collection(db, "bikes"),
            where("ownerId", "==", user.uid)
          )
        );

        const [serviceSnapshot, timelineEntries] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "serviceRecords"),
                where("ownerId", "==", user.uid)
              )
            ),

            // Ownership timeline of each vehicle (oldest first),
            // used to work out who recorded each service.
            Promise.all(
              bikeSnapshot.docs.map(async (bikeDoc) => {
                const transferSnapshot = await getDocs(
                  query(
                    collection(db, "ownershipTransfers"),
                    where("bikeId", "==", bikeDoc.id)
                  )
                );

                const transfers = transferSnapshot.docs
                  .map((transferDoc) => {
                    const data = transferDoc.data();

                    return {
                      fromOwnerEmail: String(
                        data.fromOwnerEmail || ""
                      ).toLowerCase(),
                      transferredAtMs:
                        data.transferredAt instanceof Timestamp
                          ? data.transferredAt.toMillis()
                          : null,
                    };
                  })
                  .filter(
                    (transfer): transfer is TimelineEntry =>
                      transfer.transferredAtMs !== null
                  )
                  .sort(
                    (a, b) =>
                      a.transferredAtMs - b.transferredAtMs
                  );

                return [bikeDoc.id, transfers] as const;
              })
            ),
          ]);

        const timelines = new Map<string, TimelineEntry[]>(
          timelineEntries
        );

        // Who recorded this service?
        // 1. The creator saved on the record (newer records)
        // 2. Otherwise, the owner at the time it was created,
        //    worked out from the transfer times (older records)
        const creatorOf = (
          bikeId: string,
          createdAt: Timestamp | null,
          createdBy: string
        ) => {
          if (createdBy) {
            return createdBy;
          }

          if (!createdAt) {
            return "";
          }

          const transfers = timelines.get(bikeId) || [];

          const nextTransfer = transfers.find(
            (transfer) =>
              transfer.transferredAtMs >= createdAt.toMillis()
          );

          return nextTransfer
            ? nextTransfer.fromOwnerEmail
            : userEmail;
        };

        const items: SpendRecord[] = [];

        serviceSnapshot.docs.forEach((serviceDoc) => {
          const data = serviceDoc.data();

          if (!(data.serviceDate instanceof Timestamp)) {
            return;
          }

          const bikeId: string = data.bikeId || "";

          const creator = creatorOf(
            bikeId,
            data.createdAt instanceof Timestamp
              ? data.createdAt
              : null,
            String(data.createdByEmail || "").toLowerCase()
          );

          items.push({
            id: serviceDoc.id,
            bikeId,
            serviceDate: data.serviceDate.toDate(),
            amountPaid: Number(data.amountPaid || 0),
            workshop: String(data.workshop || "").trim(),
            // Only expenses made by the CURRENT owner.
            isMine: creator
              ? creator === userEmail
              : data.isPreviousOwnerService !== true,
          });
        });

        if (!cancelled) {
          setRecords(items);
        }
      } catch (error) {
        console.error("Error loading spending summary:", error);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user.uid, user.email, refreshKey]);

  if (bikes.length === 0) {
    return null;
  }

  const thisYear = new Date().getFullYear();
  const lastYear = thisYear - 1;

  // Cards are built from the bikes the user CURRENTLY owns, so a
  // transferred or deleted bike disappears automatically.
  const bikeIds = new Set(bikes.map((bike) => bike.id));

  const mine = records.filter(
    (record) => record.isMine && bikeIds.has(record.bikeId)
  );

  const cards = bikes.map((bike) => ({
    key: bike.id,
    title: bike.bikeName,
    subtitle: bike.registrationNumber,
    summary: buildSummary(
      mine.filter((record) => record.bikeId === bike.id),
      thisYear,
      lastYear
    ),
  }));

  if (bikes.length > 1) {
    cards.unshift({
      key: "all-bikes",
      title: "All your bikes",
      subtitle: `${bikes.length} vehicles combined summary`,
      summary: buildSummary(mine, thisYear, lastYear),
    });
  }

  const current = Math.min(activeIndex, cards.length - 1);

  const goTo = (index: number) => {
    const element = scroller.current;

    if (!element) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, cards.length - 1));

    element.scrollTo({
      left: safeIndex * element.clientWidth,
      behavior: "smooth",
    });
  };

  const handleScroll = () => {
    const element = scroller.current;

    if (!element || element.clientWidth === 0) {
      return;
    }

    setActiveIndex(
      Math.round(element.scrollLeft / element.clientWidth)
    );
  };

  return (
    <section className="mx-auto max-w-6xl px-6 pb-8">
      <div className="rounded-3xl border-2 border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="border-l-4 border-rose-500 pl-3">
            <h2 className="text-xl font-extrabold tracking-tight text-rose-900">
              Spending Summary
            </h2>

            <p className="text-xs text-rose-900/70">
              Only the expenses you recorded as the current owner.
            </p>
            <p className="text-xs text-rose-900/70">
            ------------------------------------------------------------------------
            </p>
          </div>

          {cards.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-rose-800">
                {current + 1} / {cards.length}
              </span>

              <button
                type="button"
                onClick={() => goTo(current - 1)}
                aria-label="Previous bike"
                className="rounded-lg border-2 border-rose-200 px-3 py-1 text-sm font-bold text-rose-800 transition hover:bg-rose-50"
              >
                ←
              </button>

              <button
                type="button"
                onClick={() => goTo(current + 1)}
                aria-label="Next bike"
                className="rounded-lg border-2 border-rose-200 px-3 py-1 text-sm font-bold text-rose-800 transition hover:bg-rose-50"
              >
                →
              </button>
            </div>
          )}
        </div>

        {/* One bike per slide. Swipe left / right. */}
        <div
          ref={scroller}
          onScroll={handleScroll}
          className="mt-4 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card) => {
            const { summary } = card;

            return (
              <div
                key={card.key}
                className="w-full shrink-0 snap-center"
              >
                <div className="rounded-2xl border-2 border-rose-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-extrabold text-rose-950">
                        {card.title}
                      </h3>

                      <p className="text-xs text-gray-1500">
                          Registrations:{" "}
                        <span className="font-semibold text-gray-800">
                          {card.subtitle}
                        </span>
                      </p>
                    </div>

                    {summary.count > 0 && (
                      <div className="rounded-lg bg-emerald-50 px-3 py-1 text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                          Total by you
                        </p>

                        <p className="text-sm font-extrabold text-emerald-900">
                          {rupees(summary.total)}{" "}
                          <span className="text-xs font-semibold text-emerald-700">
                            · {summary.count} service
                            {summary.count === 1 ? "" : "s"}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  {summary.count === 0 ? (
                    <div className="mt-3 rounded-xl bg-gray-50 p-3">
                      <p className="text-sm text-gray-600">
                        You haven&apos;t recorded any services on{" "}
                        {card.key === "all-bikes"
                          ? "these bikes"
                          : "this bike"}{" "}
                        yet.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-rose-100 bg-rose-50 p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600">
                              This Year
                            </p>

                            <p className="mt-0.5 text-base font-extrabold text-rose-900">
                              {rupees(summary.thisYear)}
                            </p>
                          </div>

                          <div className="rounded-xl border border-orange-100 bg-orange-50 p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600">
                              Last Year
                            </p>

                            <p className="mt-0.5 text-base font-extrabold text-orange-900">
                              {rupees(summary.lastYear)}
                            </p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-blue-50 p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
                              Avg / Service
                            </p>

                            <p className="mt-0.5 text-base font-extrabold text-blue-900">
                              {rupees(summary.average)}
                            </p>
                          </div>
                        </div>

                        {summary.mostExpensive && (
                          <div className="rounded-xl border border-violet-100 bg-violet-50 p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
                              Most Expensive Service
                            </p>

                            <p className="mt-0.5 text-base font-extrabold text-violet-900">
                              {rupees(summary.mostExpensive.amountPaid)}
                            </p>

                            <p className="text-xs text-violet-800">
                              {formatDate(
                                summary.mostExpensive.serviceDate
                              )}
                              {" · "}
                              {summary.mostExpensive.workshop ||
                                "Workshop not provided"}
                            </p>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          Spending by Workshop
                        </p>

                        <div className="mt-1.5 max-h-32 space-y-1.5 overflow-y-auto pr-1">
                          {summary.workshops.map((workshop) => (
                            <div
                              key={workshop.name}
                              className="flex items-center justify-between gap-2 rounded-lg bg-rose-50/60 px-2.5 py-1.5"
                            >
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {workshop.name}
                                </p>

                                <p className="text-[11px] text-gray-500">
                                  {workshop.count} visit
                                  {workshop.count === 1 ? "" : "s"} ·{" "}
                                  {rupees(
                                    workshop.total / workshop.count
                                  )}{" "}
                                  / visit
                                </p>
                              </div>

                              <p className="text-sm font-extrabold text-rose-900">
                                {rupees(workshop.total)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {cards.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {cards.map((card, index) => (
              <button
                key={card.key}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Show ${card.title}`}
                className={`h-2 rounded-full transition-all ${
                  index === current
                    ? "w-6 bg-rose-600"
                    : "w-2 bg-rose-200"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
