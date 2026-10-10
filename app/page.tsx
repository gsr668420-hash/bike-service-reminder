"use client";


import { useEffect, useState } from "react";

import {
 GoogleAuthProvider,
getAdditionalUserInfo,
onAuthStateChanged,
reauthenticateWithPopup,
signInWithPopup,
signOut,
User,
} from "firebase/auth";

import { auth, db } from "@/lib/firebase";
   import SpendingSummary from "@/lib/components/SpendingSummary";
   import OwnershipHistory from "@/lib/components/OwnershipHistory";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

type Bike = {
  id: string;
  bikeName: string;
  registrationNumber: string;
};

type ServiceRecord = {
  id: string;
  bikeId: string;
  bikeName: string;
  registrationNumber: string;
  serviceDate: Timestamp;
  nextServiceDate: Timestamp;
  amountPaid: number;
  workshop: string;
  notes: string;
  ownerId: string;
  ownerEmail: string;
  createdAt: Timestamp | null;
isPreviousOwnerService: boolean;
  createdByEmail: string;
  editedAt: {
    serviceDate: Timestamp | null;
    nextServiceDate: Timestamp | null;
    amountPaid: Timestamp | null;
    workshop: Timestamp | null;
    notes: Timestamp | null;
  };};

type ServiceReminder = {
  bikeId: string;
  bikeName: string;
  registrationNumber: string;
  nextServiceDate: Timestamp;
  daysRemaining: number;
};

type TransferRequest = {
  id: string;
  bikeId: string;
  bikeName: string;
  registrationNumber: string;
  fromOwnerId: string;
  fromOwnerEmail: string;
  toOwnerEmail: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: Timestamp | null;
};

type OldTransferredVehicle = {
  id: string;
  bikeId: string;
  bikeName: string;
  registrationNumber: string;
  serviceCount: number;
  totalSpent: number;
  transferredAt: Timestamp | null;
};
type VehicleTransferHistory = {
  id: string;
  bikeId: string;
  bikeName: string;
  registrationNumber: string;
  fromOwnerId: string;
  fromOwnerEmail: string;
  toOwnerId: string;
  toOwnerEmail: string;
  ownerServiceCount: number;
  ownerTotalSpent: number;
  ownershipStartedAt: Timestamp | null;
  ownershipDurationMs: number;
  transferredAt: Timestamp | null;
  transferNumber: number;
};
export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [bikes, setBikes] = useState<Bike[]>([]);

  const [selectedBike, setSelectedBike] =
    useState<Bike | null>(null);

  const [serviceHistory, setServiceHistory] =
    useState<ServiceRecord[]>([]);

  const [serviceReminders, setServiceReminders] =
    useState<ServiceReminder[]>([]);

const [bikeStats, setBikeStats] = useState<
  Record<
    string,
    {
      serviceCount: number;
      totalSpent: number;
      wasTransferred: boolean;
      userSpent: number;
      ownerSpending: {
        ownerId: string;
        ownerEmail: string;
        serviceCount: number;
        totalSpent: number;
      }[];
    }
  >
>({});

  const [oldTransferredVehicles, setOldTransferredVehicles] =
    useState<OldTransferredVehicle[]>([]);
const [vehicleTransferHistory, setVehicleTransferHistory] =
  useState<VehicleTransferHistory[]>([]);
  const [transferRequests, setTransferRequests] =
    useState<TransferRequest[]>([]);

  const [transferCount, setTransferCount] = useState(0);
  const [isTransferPending, setIsTransferPending] =
  useState(false);

  const [bikeName, setBikeName] = useState("");
  const [registrationNumber, setRegistrationNumber] =
    useState("");

  const [transferEmail, setTransferEmail] = useState("");

  const [serviceDate, setServiceDate] = useState("");
  const [nextServiceDate, setNextServiceDate] =
    useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [notes, setNotes] = useState("");
const [showAddServiceForm, setShowAddServiceForm] =
  useState(false);
  const [editingServiceId, setEditingServiceId] =
    useState<string | null>(null);

  const [editServiceDate, setEditServiceDate] =
    useState("");
  const [editNextServiceDate, setEditNextServiceDate] =
    useState("");
  const [editAmountPaid, setEditAmountPaid] =
    useState("");
  const [editWorkshop, setEditWorkshop] =
    useState("");
  const [editNotes, setEditNotes] = useState("");

  // =========================================
  // AUTH
  // =========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setCurrentUser(user);
        setAuthLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // =========================================
  // GOOGLE LOGIN
  // =========================================

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();

      provider.setCustomParameters({
        prompt: "select_account",
      });

      await signInWithPopup(
        auth,
        provider
      );
    } catch (error) {
      console.error(
        "Google login error:",
        error
      );

      alert(
        "Unable to login with Google."
      );
    }
  };

  // =========================================
  // LOGOUT
  // =========================================

  const logout = async () => {
    try {
      await signOut(auth);

      setSelectedBike(null);
      setServiceHistory([]);
      setServiceReminders([]);
      setBikeStats({});
      setOldTransferredVehicles([]);
      setVehicleTransferHistory([]);
      setTransferRequests([]);
      setTransferCount(0);
    } catch (error) {
      console.error(
        "Logout error:",
        error
      );
    }
  };

  // =========================================
  // LOAD BIKES
  // =========================================

  const loadBikes = async (
    user: User
  ) => {
    try {
      const bikeQuery = query(
        collection(db, "bikes"),
        where(
          "ownerId",
          "==",
          user.uid
        )
      );

      const snapshot =
        await getDocs(bikeQuery);

      const loadedBikes = snapshot.docs
        .map((bikeDoc) => {
          const data =
            bikeDoc.data();

          return {
            id: bikeDoc.id,
            bikeName:
              data.bikeName || "",
            registrationNumber:
              data.registrationNumber ||
              "",
          };
        })
        .sort((a, b) =>
          a.bikeName.localeCompare(
            b.bikeName
          )
        );

      setBikes(loadedBikes);

      if (
        selectedBike &&
        !loadedBikes.some(
          (bike) =>
            bike.id ===
            selectedBike.id
        )
      ) {
        setSelectedBike(null);
        setServiceHistory([]);
        setTransferCount(0);
      }
    } catch (error) {
      console.error(
        "Error loading bikes:",
        error
      );
    }
  };

  // =========================================
  // LOAD PER-BIKE STATS
  // =========================================
const loadBikeStats = async (
  user: User
) => {
  try {
    // =========================================
    // LOAD CURRENT USER'S VEHICLES
    // =========================================

    const bikeQuery = query(
      collection(db, "bikes"),
      where(
        "ownerId",
        "==",
        user.uid
      )
    );

    const serviceQuery = query(
      collection(db, "serviceRecords"),
      where(
        "ownerId",
        "==",
        user.uid
      )
    );

    const [
      bikeSnapshot,
      serviceSnapshot,
    ] = await Promise.all([
      getDocs(bikeQuery),
      getDocs(serviceQuery),
    ]);

    const stats: Record<
      string,
      {
        serviceCount: number;
        totalSpent: number;
        wasTransferred: boolean;
        userSpent: number;
        ownerSpending: {
          ownerId: string;
          ownerEmail: string;
          serviceCount: number;
          totalSpent: number;
        }[];
      }
    > = {};

    // =========================================
    // INITIALIZE EVERY CURRENT VEHICLE
    // =========================================

    bikeSnapshot.docs.forEach(
      (bikeDoc) => {
        stats[bikeDoc.id] = {
          serviceCount: 0,
          totalSpent: 0,
          wasTransferred: false,
          userSpent: 0,
          ownerSpending: [],
        };
      }
    );

    // =========================================
    // CURRENT TOTAL SERVICE COUNT / SPENDING
    // =========================================

    serviceSnapshot.docs.forEach(
      (serviceDoc) => {
        const data =
          serviceDoc.data();

        const bikeId =
          data.bikeId;

        if (
          !bikeId ||
          !stats[bikeId]
        ) {
          return;
        }

        stats[bikeId].serviceCount += 1;

        stats[bikeId].totalSpent +=
          Number(
            data.amountPaid || 0
          );
      }
    );

    // =========================================
    // LOAD COMPLETE TRANSFER HISTORY
    // FOR EVERY CURRENT VEHICLE
    // =========================================

    const transferResults =
      await Promise.all(
        bikeSnapshot.docs.map(
          async (bikeDoc) => {
            const transferQuery =
              query(
                collection(
                  db,
                  "ownershipTransfers"
                ),
                where(
                  "bikeId",
                  "==",
                  bikeDoc.id
                )
              );

            const transferSnapshot =
              await getDocs(
                transferQuery
              );

            return {
              bikeId:
                bikeDoc.id,
              transfers:
                transferSnapshot.docs
                  .map(
                    (
                      transferDoc
                    ) => {
                      const data =
                        transferDoc.data();

                      return {
                        fromOwnerId:
                          data.fromOwnerId ||
                          "",
                        fromOwnerEmail:
                          data.fromOwnerEmail ||
                          "",
                        toOwnerId:
                          data.toOwnerId ||
                          "",
                        toOwnerEmail:
                          data.toOwnerEmail ||
                          "",
                        serviceCountAtTransfer:
                          Number(
                            data.serviceCountAtTransfer ||
                              0
                          ),
                        totalSpentAtTransfer:
                          Number(
                            data.totalSpentAtTransfer ||
                              0
                          ),
                        transferredAt:
                          data.transferredAt
                            instanceof Timestamp
                            ? data.transferredAt
                            : null,
                      };
                    }
                  )
                  .filter(
                    (
                      transfer
                    ) =>
                      transfer.transferredAt !==
                      null
                  )
                  .sort(
                    (
                      a,
                      b
                    ) =>
                      a.transferredAt!.toMillis() -
                      b.transferredAt!.toMillis()
                  ),
            };
          }
        )
      );

    // =========================================
    // CALCULATE SPENDING FOR EACH OWNER
    // =========================================

    transferResults.forEach(
      ({
        bikeId,
        transfers,
      }) => {
        if (
          !stats[bikeId] ||
          transfers.length === 0
        ) {
          return;
        }

        stats[bikeId]
          .wasTransferred = true;

        const ownerMap =
          new Map<
            string,
            {
              ownerId: string;
              ownerEmail: string;
              serviceCount: number;
              totalSpent: number;
            }
          >();

        const addOwnerSpending =
          (
            ownerId: string,
            ownerEmail: string,
            serviceCount: number,
            totalSpent: number
          ) => {
            if (!ownerId) {
              return;
            }

            const existing =
              ownerMap.get(
                ownerId
              );

            if (existing) {
              existing.serviceCount +=
                serviceCount;

              existing.totalSpent +=
                totalSpent;
            } else {
              ownerMap.set(
                ownerId,
                {
                  ownerId,
                  ownerEmail,
                  serviceCount,
                  totalSpent,
                }
              );
            }
          };

        let previousCount = 0;
        let previousSpent = 0;

        // -----------------------------------------
        // EACH OWNERSHIP PERIOD
        // -----------------------------------------

        transfers.forEach(
          (transfer) => {
            const currentSnapshotCount =
              Math.max(
                transfer.serviceCountAtTransfer,
                previousCount
              );

            const currentSnapshotSpent =
              Math.max(
                transfer.totalSpentAtTransfer,
                previousSpent
              );

            const ownerServiceCount =
              Math.max(
                currentSnapshotCount -
                  previousCount,
                0
              );

            const ownerSpent =
              Math.max(
                currentSnapshotSpent -
                  previousSpent,
                0
              );

            addOwnerSpending(
              transfer.fromOwnerId,
              transfer.fromOwnerEmail,
              ownerServiceCount,
              ownerSpent
            );

            previousCount =
              currentSnapshotCount;

            previousSpent =
              currentSnapshotSpent;
          }
        );

        // -----------------------------------------
        // CURRENT OWNER'S CURRENT PERIOD
        // -----------------------------------------

        const currentOwnerServiceCount =
          Math.max(
            stats[bikeId].serviceCount -
              previousCount,
            0
          );

        const currentOwnerSpent =
          Math.max(
            stats[bikeId].totalSpent -
              previousSpent,
            0
          );

        addOwnerSpending(
          user.uid,
          user.email?.toLowerCase() ||
            "",
          currentOwnerServiceCount,
          currentOwnerSpent
        );

        // -----------------------------------------
        // SORT OWNERS BY SPENDING
        // -----------------------------------------

        const ownerSpending =
          Array.from(
            ownerMap.values()
          ).sort(
            (a, b) =>
              b.totalSpent -
              a.totalSpent
          );

        stats[bikeId]
          .ownerSpending =
          ownerSpending;

        // -----------------------------------------
        // YOUR TOTAL SPENDING
        // -----------------------------------------
        //
        // This includes ALL periods in which the
        // current user owned the vehicle.
        //
        // Example:
        // A spent ₹1000
        // B spent ₹2002
        // A gets vehicle again
        //
        // A's "You Spent" = ₹1000
        //
        // If A later spends ₹500:
        // A's "You Spent" = ₹1500

        const currentUserOwner =
          ownerSpending.find(
            (owner) =>
              owner.ownerId ===
              user.uid
          );

        stats[bikeId]
          .userSpent =
          currentUserOwner
            ?.totalSpent || 0;
      }
    );

    setBikeStats(
      stats
    );

  } catch (error) {
    console.error(
      "Error loading bike stats:",
      error
    );
  }
};
  // =========================================
  // REPAIR OLD TRANSFER TOTALS
  // =========================================
  //
  // This handles transfers created before
  // serviceCountAtTransfer and
  // totalSpentAtTransfer were added.
  //
  // Only the CURRENT owner can perform this
  // repair because only the current owner
  // can access the transferred service records.

  const repairOldTransferSnapshots =
    async (user: User) => {
      try {
        const transferQuery = query(
          collection(
            db,
            "ownershipTransfers"
          ),
          where(
            "toOwnerId",
            "==",
            user.uid
          )
        );

        const transferSnapshot =
          await getDocs(
            transferQuery
          );

        for (
          const transferDoc of transferSnapshot.docs
        ) {
          const transferData =
            transferDoc.data();

          const hasServiceCount =
            Object.prototype.hasOwnProperty.call(
              transferData,
              "serviceCountAtTransfer"
            );

          const hasTotalSpent =
            Object.prototype.hasOwnProperty.call(
              transferData,
              "totalSpentAtTransfer"
            );

          if (
            hasServiceCount &&
            hasTotalSpent
          ) {
            continue;
          }

          if (
            !transferData.bikeId
          ) {
            continue;
          }

          if (
            !(
              transferData.transferredAt
              instanceof Timestamp
            )
          ) {
            continue;
          }

          const transferredAt =
            transferData.transferredAt;

          const serviceQuery =
            query(
              collection(
                db,
                "serviceRecords"
              ),
              where(
                "bikeId",
                "==",
                transferData.bikeId
              ),
              where(
                "ownerId",
                "==",
                user.uid
              )
            );

          const serviceSnapshot =
            await getDocs(
              serviceQuery
            );

          let serviceCount = 0;
          let totalSpent = 0;

          serviceSnapshot.docs.forEach(
            (serviceDoc) => {
              const serviceData =
                serviceDoc.data();

              let existedAtTransfer =
                true;

              // Prefer createdAt because it tells us
              // whether the record existed before transfer.
              if (
                serviceData.createdAt
                instanceof Timestamp
              ) {
                existedAtTransfer =
                  serviceData.createdAt.toMillis() <=
                  transferredAt.toMillis();
              }

              // Also ensure the actual service date
              // belongs before the transfer.
              if (
                existedAtTransfer &&
                serviceData.serviceDate
                instanceof Timestamp
              ) {
                existedAtTransfer =
                  serviceData.serviceDate.toMillis() <=
                  transferredAt.toMillis();
              }

              if (!existedAtTransfer) {
                return;
              }

              serviceCount += 1;

              totalSpent += Number(
                serviceData.amountPaid ||
                  0
              );
            }
          );

          const transferRef =
            doc(
              db,
              "ownershipTransfers",
              transferDoc.id
            );

          await updateDoc(
            transferRef,
            {
              serviceCountAtTransfer:
                serviceCount,
              totalSpentAtTransfer:
                totalSpent,
            }
          );
        }
      } catch (error) {
        console.error(
          "Error repairing old transfer totals:",
          error
        );
      }
    };

  // =========================================
  // LOAD OLD / TRANSFERRED VEHICLES
  // =========================================

  const loadOldTransferredVehicles =
    async (user: User) => {
      try {
        const transferQuery =
          query(
            collection(
              db,
              "ownershipTransfers"
            ),
            where(
              "fromOwnerId",
              "==",
              user.uid
            )
          );

        const snapshot =
          await getDocs(
            transferQuery
          );

        const vehicles =
          snapshot.docs
            .map(
              (transferDoc) => {
                const data =
                  transferDoc.data();

                return {
                  id: transferDoc.id,
                  bikeId:
                    data.bikeId ||
                    "",
                  bikeName:
                    data.bikeName ||
                    "",
                  registrationNumber:
                    data.registrationNumber ||
                    "",
                  serviceCount:
                    Number(
                      data.serviceCountAtTransfer ||
                        0
                    ),
                  totalSpent:
                    Number(
                      data.totalSpentAtTransfer ||
                        0
                    ),
                  transferredAt:
                    data.transferredAt
                      instanceof Timestamp
                      ? data.transferredAt
                      : null,
                };
              }
            )
            .sort((a, b) => {
              const aTime =
                a.transferredAt?.toMillis?.() ||
                0;

              const bTime =
                b.transferredAt?.toMillis?.() ||
                0;

              return bTime - aTime;
            });

        setOldTransferredVehicles(
          vehicles
        );
      } catch (error) {
        console.error(
          "Error loading old transferred vehicles:",
          error
        );
      }
    };
      // =========================================
  // LOAD COMPLETE VEHICLE TRANSFER HISTORY
  // =========================================

const loadVehicleTransferHistory =
  async (user: User) => {
    try {
      const fromOwnerQuery =
        query(
          collection(
            db,
            "ownershipTransfers"
          ),
          where(
            "fromOwnerId",
            "==",
            user.uid
          )
        );

      const toOwnerQuery =
        query(
          collection(
            db,
            "ownershipTransfers"
          ),
          where(
            "toOwnerId",
            "==",
            user.uid
          )
        );

      const [
        fromOwnerSnapshot,
        toOwnerSnapshot,
      ] = await Promise.all([
        getDocs(
          fromOwnerQuery
        ),
        getDocs(
          toOwnerQuery
        ),
      ]);
      const ownedBikesSnapshot =
        await getDocs(
          query(
            collection(db, "bikes"),
            where("ownerId", "==", user.uid)
          )
        );

      const bikeCreatedAtMap =
        new Map<string, Timestamp>();

      const chainSnapshots =
        await Promise.all(
          ownedBikesSnapshot.docs.map(
            (bikeDoc) => {
              const bikeData = bikeDoc.data();

              if (
                bikeData.createdAt instanceof Timestamp
              ) {
                bikeCreatedAtMap.set(
                  bikeDoc.id,
                  bikeData.createdAt
                );
              }

              return getDocs(
                query(
                  collection(db, "ownershipTransfers"),
                  where("bikeId", "==", bikeDoc.id)
                )
              );
            }
          )
        );

      const chainDocs =
        chainSnapshots.flatMap(
          (snapshot) => snapshot.docs
        );
      const allTransferDocs =
        Array.from(
          new Map(
            [
              ...fromOwnerSnapshot.docs,
              ...toOwnerSnapshot.docs,
              ...chainDocs,
            ].map(
              (transferDoc) => [
                transferDoc.id,
                transferDoc,
              ]
            )
          ).values()
        );

      const bikeIds =
        Array.from(
          new Set(
            allTransferDocs
              .map(
                (transferDoc) =>
                  transferDoc.data().bikeId
              )
              .filter(Boolean)
          )
        );

      const history: VehicleTransferHistory[] =
        [];

      for (
        const bikeId of bikeIds
      ) {
        // Get the vehicle creation date

        const transfers =
          allTransferDocs
            .filter(
              (transferDoc) =>
                transferDoc.data().bikeId ===
                bikeId
            )
            .map(
              (transferDoc) => {
                const data =
                  transferDoc.data();

                return {
                  id:
                    transferDoc.id,

                  bikeId:
                    bikeId,

                  bikeName:
  data.bikeName ||
  "",

registrationNumber:
  data.registrationNumber ||
  "",

                  fromOwnerId:
                    data.fromOwnerId ||
                    "",

                  fromOwnerEmail:
                    data.fromOwnerEmail ||
                    "",

                  toOwnerId:
                    data.toOwnerId ||
                    "",

                  toOwnerEmail:
                    data.toOwnerEmail ||
                    "",

                  totalServiceCount:
                    Number(
                      data.serviceCountAtTransfer ||
                        0
                    ),

                  totalSpent:
                    Number(
                      data.totalSpentAtTransfer ||
                        0
                    ),

                  transferredAt:
                    data.transferredAt
                      instanceof Timestamp
                      ? data.transferredAt
                      : null,
                };
              }
            )
            .filter(
              (transfer) =>
                transfer.transferredAt !==
                null
            )
            .sort(
              (a, b) =>
                a.transferredAt!.toMillis() -
                b.transferredAt!.toMillis()
            );

        let previousServiceCount =
          0;

        let previousSpent =
          0;
let previousTransferAt: Timestamp | null =
  bikeCreatedAtMap.get(bikeId) || null;

        transfers.forEach(
          (
            transfer,
            index
          ) => {
            const ownerServiceCount =
              Math.max(
                transfer.totalServiceCount -
                  previousServiceCount,
                0
              );

            const ownerTotalSpent =
              Math.max(
                transfer.totalSpent -
                  previousSpent,
                0
              );

            const ownershipStartedAt =
              previousTransferAt;

            const ownershipDurationMs =
              ownershipStartedAt
                ? Math.max(
                    transfer.transferredAt!.toMillis() -
                      ownershipStartedAt.toMillis(),
                    0
                  )
                : 0;

            history.push({
              id:
                transfer.id,

              bikeId:
                transfer.bikeId,

              bikeName:
                transfer.bikeName,

              registrationNumber:
                transfer.registrationNumber,

              fromOwnerId:
                transfer.fromOwnerId,

              fromOwnerEmail:
                transfer.fromOwnerEmail,

              toOwnerId:
                transfer.toOwnerId,

              toOwnerEmail:
                transfer.toOwnerEmail,

              ownerServiceCount,

              ownerTotalSpent,

              ownershipStartedAt,

              ownershipDurationMs,

              transferredAt:
                transfer.transferredAt,

              transferNumber:
                index + 1,
            });

            previousServiceCount =
              Math.max(
                transfer.totalServiceCount,
                previousServiceCount
              );

            previousSpent =
              Math.max(
                transfer.totalSpent,
                previousSpent
              );

            previousTransferAt =
              transfer.transferredAt;
          }
        );
      }

      history.sort(
        (a, b) => {
          const aTime =
            a.transferredAt?.toMillis() ||
            0;

          const bTime =
            b.transferredAt?.toMillis() ||
            0;

          return bTime - aTime;
        }
      );

      setVehicleTransferHistory(
        history
      );
    } catch (error) {
      console.error(
        "Error loading vehicle transfer history:",
        error
      );
    }
  };
  // =========================================
  // LOAD SERVICE HISTORY
  // =========================================

const loadServiceHistory =
  async (
    bikeId: string,
    user: User
  ) => {
    try {
      // Find the latest transfer that brought this
      // vehicle to the current owner.
      const transferQuery =
        query(
          collection(
            db,
            "ownershipTransfers"
          ),
          where(
            "toOwnerId",
            "==",
            user.uid
          )
        );

      const transferSnapshot =
        await getDocs(
          transferQuery
        );

      const bikeTransfers =
        transferSnapshot.docs
          .map((transferDoc) => {
            const data =
              transferDoc.data();

            return {
              bikeId:
                data.bikeId || "",
              transferredAt:
                data.transferredAt
                  instanceof Timestamp
                  ? data.transferredAt
                  : null,
            };
          })
          .filter(
            (transfer) =>
              transfer.bikeId === bikeId &&
              transfer.transferredAt !== null
          )
          .sort(
            (a, b) =>
              b.transferredAt!.toMillis() -
              a.transferredAt!.toMillis()
          );

      const latestTransferAt =
        bikeTransfers.length > 0
          ? bikeTransfers[0].transferredAt
          : null;
          
      // Ownership timeline for this vehicle (oldest first).
      // Used to work out who recorded older services.
      let ownerTimeline: {
        fromOwnerEmail: string;
        transferredAt: Timestamp;
      }[] = [];

      try {
        const timelineSnapshot =
          await getDocs(
            query(
              collection(
                db,
                "ownershipTransfers"
              ),
              where(
                "bikeId",
                "==",
                bikeId
              )
            )
          );

        ownerTimeline =
          timelineSnapshot.docs
            .map((transferDoc) => {
              const data =
                transferDoc.data();

              return {
                fromOwnerEmail:
                  String(
                    data.fromOwnerEmail ||
                      ""
                  ).toLowerCase(),
                transferredAt:
                  data.transferredAt instanceof Timestamp
                    ? data.transferredAt
                    : null,
              };
            })
            .filter(
              (
                transfer
              ): transfer is {
                fromOwnerEmail: string;
                transferredAt: Timestamp;
              } =>
                transfer.transferredAt !== null
            )
            .sort(
              (a, b) =>
                a.transferredAt.toMillis() -
                b.transferredAt.toMillis()
            );
      } catch (timelineError) {
        console.error(
          "Error loading ownership timeline:",
          timelineError
        );
      }

      const findCreatorEmail = (
        createdAt: Timestamp | null
      ) => {
        if (!createdAt) {
          return "";
        }

        const nextTransfer =
          ownerTimeline.find(
            (transfer) =>
              transfer.transferredAt.toMillis() >=
              createdAt.toMillis()
          );

        return nextTransfer
          ? nextTransfer.fromOwnerEmail
          : user.email?.toLowerCase() || "";
      };

      const serviceQuery =
        query(
          collection(
            db,
            "serviceRecords"
          ),
          where(
            "bikeId",
            "==",
            bikeId
          ),
          where(
            "ownerId",
            "==",
            user.uid
          )
        );

      const snapshot =
        await getDocs(
          serviceQuery
        );

      const records =
        snapshot.docs
          .map(
            (serviceDoc) => {
              const data =
                serviceDoc.data();

              const createdAt =
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null;

              let isPreviousOwnerService =
                data.isPreviousOwnerService === true;

              // Support older transferred service records
              // that were created before this field existed.
              if (
                !isPreviousOwnerService &&
                latestTransferAt
              ) {
                if (createdAt) {
                  isPreviousOwnerService =
                    createdAt.toMillis() <=
                    latestTransferAt.toMillis();
                } else if (
                  data.serviceDate instanceof Timestamp
                ) {
                  isPreviousOwnerService =
                    data.serviceDate.toMillis() <=
                    latestTransferAt.toMillis();
                }
              }

              return {
                id: serviceDoc.id,
                bikeId:
                  data.bikeId || "",
                bikeName:
                  data.bikeName || "",
                registrationNumber:
                  data.registrationNumber || "",
                serviceDate:
                  data.serviceDate
                    instanceof Timestamp
                    ? data.serviceDate
                    : Timestamp.now(),
                nextServiceDate:
                  data.nextServiceDate
                    instanceof Timestamp
                    ? data.nextServiceDate
                    : Timestamp.now(),
                amountPaid:
                  Number(
                    data.amountPaid || 0
                  ),
                workshop:
                  data.workshop || "",
                notes:
                  data.notes || "",
                ownerId:
                  data.ownerId || "",
                ownerEmail:
                  data.ownerEmail || "",
                createdAt,
isPreviousOwnerService,
                createdByEmail:
                  String(
                    data.createdByEmail || ""
                  ).toLowerCase() ||
                  findCreatorEmail(createdAt),                editedAt: {
                  serviceDate:
                    data.editedAt?.serviceDate instanceof Timestamp
                      ? data.editedAt.serviceDate
                      : null,
                  nextServiceDate:
                    data.editedAt?.nextServiceDate instanceof Timestamp
                      ? data.editedAt.nextServiceDate
                      : null,
                  amountPaid:
                    data.editedAt?.amountPaid instanceof Timestamp
                      ? data.editedAt.amountPaid
                      : null,
                  workshop:
                    data.editedAt?.workshop instanceof Timestamp
                      ? data.editedAt.workshop
                      : null,
                  notes:
                    data.editedAt?.notes instanceof Timestamp
                      ? data.editedAt.notes
                      : null,
                },
              };
            }
          )
          .sort(
            (a, b) =>
              b.serviceDate.toMillis() -
              a.serviceDate.toMillis()
          );

      setServiceHistory(
        records
      );
    } catch (error) {
      console.error(
        "Error loading service history:",
        error
      );

      alert(
        "Unable to load service history."
      );
    }
  };

  // =========================================
  // LOAD TRANSFER HISTORY
  // =========================================
const loadTransferHistory = async (
  bikeId: string,
  user: User
) => {
  try {
    const transferQuery = query(
      collection(db, "ownershipTransfers"),
where("bikeId", "==", bikeId)    );

    const snapshot = await getDocs(transferQuery);

    const bikeTransfers = snapshot.docs.filter(
      (doc) => doc.data().bikeId === bikeId
    );

    setTransferCount(bikeTransfers.length);
  } catch (error) {
    console.error(
      "Error loading transfer history:",
      error
    );

    setTransferCount(0);
  }
};
  // =========================================
  // SELECT BIKE
  // =========================================

const selectBike = async (
  bike: Bike
) => {
  setSelectedBike(bike);
  setEditingServiceId(null);
  setIsTransferPending(false);

  if (currentUser) {
    const requestRef = doc(
      db,
      "ownershipTransferRequests",
      bike.id
    );

    const requestSnapshot =
      await getDoc(requestRef);

    if (requestSnapshot.exists()) {
      const requestData =
        requestSnapshot.data();

      setIsTransferPending(
        requestData.status ===
          "pending" &&
        requestData.fromOwnerId ===
          currentUser.uid
      );
    }

    await loadServiceHistory(
      bike.id,
      currentUser
    );

    await loadTransferHistory(
      bike.id,
      currentUser
    );
  }
};

  // =========================================
  // LOAD TRANSFER REQUESTS
  // =========================================

  const loadTransferRequests =
    async (user: User) => {
      try {
        if (!user.email) {
          setTransferRequests(
            []
          );
          return;
        }

        const requestQuery =
          query(
            collection(
              db,
              "ownershipTransferRequests"
            ),
            where(
              "toOwnerEmail",
              "==",
              user.email.toLowerCase()
            )
          );

        const snapshot =
          await getDocs(
            requestQuery
          );

        const requests =
          snapshot.docs
            .map(
              (requestDoc) => {
                const data =
                  requestDoc.data();

                return {
                  id: requestDoc.id,
                  bikeId:
                    data.bikeId ||
                    requestDoc.id,
                  bikeName:
                    data.bikeName ||
                    "",
                  registrationNumber:
                    data.registrationNumber ||
                    "",
                  fromOwnerId:
                    data.fromOwnerId ||
                    "",
                  fromOwnerEmail:
                    data.fromOwnerEmail ||
                    "",
                  toOwnerEmail:
                    data.toOwnerEmail ||
                    "",
                  status:
                    data.status ||
                    "pending",
                  createdAt:
                    data.createdAt
                      instanceof Timestamp
                      ? data.createdAt
                      : null,
                };
              }
            )
            .filter(
              (request) =>
                request.status ===
                "pending"
            );

        setTransferRequests(
          requests
        );
      } catch (error) {
        console.error(
          "Error loading transfer requests:",
          error
        );
      }
    };

  // =========================================
  // LOAD SERVICE REMINDERS
  // =========================================

  const loadServiceReminders =
    async (user: User) => {
      try {
        const serviceQuery =
          query(
            collection(
              db,
              "serviceRecords"
            ),
            where(
              "ownerId",
              "==",
              user.uid
            )
          );

        const serviceSnapshot =
          await getDocs(
            serviceQuery
          );

        const bikeQuery =
          query(
            collection(
              db,
              "bikes"
            ),
            where(
              "ownerId",
              "==",
              user.uid
            )
          );

        const bikeSnapshot =
          await getDocs(
            bikeQuery
          );

        const currentBikeIds =
          new Set(
            bikeSnapshot.docs.map(
              (bikeDoc) =>
                bikeDoc.id
            )
          );

        const registrationMap =
          new Map<
            string,
            string
          >();

        bikeSnapshot.docs.forEach(
          (bikeDoc) => {
            const data =
              bikeDoc.data();

            registrationMap.set(
              bikeDoc.id,
              data.registrationNumber ||
                ""
            );
          }
        );

        const today =
          new Date();

        today.setHours(
          0,
          0,
          0,
          0
        );

        const reminders: ServiceReminder[] =
          [];

        serviceSnapshot.docs.forEach(
          (serviceDoc) => {
            const data =
              serviceDoc.data();

            if (
              !currentBikeIds.has(
                data.bikeId
              )
            ) {
              return;
            }

            if (
              !(
                data.nextServiceDate
                instanceof Timestamp
              )
            ) {
              return;
            }

            const nextDate =
              data.nextServiceDate.toDate();

            nextDate.setHours(
              0,
              0,
              0,
              0
            );

            const diffMs =
              nextDate.getTime() -
              today.getTime();

            const daysRemaining =
              Math.ceil(
                diffMs /
                  (1000 *
                    60 *
                    60 *
                    24)
              );

            if (
              daysRemaining <= 7
            ) {
              reminders.push({
                bikeId:
                  data.bikeId,
                bikeName:
                  data.bikeName ||
                  "",
                registrationNumber:
                  registrationMap.get(
                    data.bikeId
                  ) ||
                  data.registrationNumber ||
                  "",
                nextServiceDate:
                  data.nextServiceDate,
                daysRemaining,
              });
            }
          }
        );

        reminders.sort(
          (a, b) =>
            a.nextServiceDate.toMillis() -
            b.nextServiceDate.toMillis()
        );

        setServiceReminders(
          reminders
        );
      } catch (error) {
        console.error(
          "Error loading service reminders:",
          error
        );
      }
    };

  // =========================================
  // ADD BIKE
  // =========================================

  const addBike = async () => {
    if (!currentUser) {
      alert("Please login first.");
      return;
    }

    const cleanBikeName =
      bikeName.trim();

    const cleanRegistration =
      registrationNumber
        .trim()
        .toUpperCase();

    if (!cleanBikeName) {
      alert(
        "Please enter the vehicle name."
      );
      return;
    }

    if (!cleanRegistration) {
      alert(
        "Please enter the registration number."
      );
      return;
    }

    if (
      !/^[A-Z0-9 .-]{4,20}$/.test(
        cleanRegistration
      )
    ) {
      alert(
        "Please enter a valid registration number."
      );
      return;
    }

    try {
      const bikeRef = doc(
        collection(db, "bikes")
      );

      const registrationRef =
        doc(
          db,
          "bikeRegistrations",
          cleanRegistration
        );

      await runTransaction(
        db,
        async (transaction) => {
          const registrationSnapshot =
            await transaction.get(
              registrationRef
            );

          if (
            registrationSnapshot.exists()
          ) {
            throw new Error(
              "This registration number is already registered."
            );
          }

          transaction.set(
            bikeRef,
            {
              bikeName:
                cleanBikeName,
              registrationNumber:
                cleanRegistration,
              ownerId:
                currentUser.uid,
              ownerEmail:
                currentUser.email?.toLowerCase() ||
                "",
              createdAt:
                serverTimestamp(),
            }
          );

         transaction.set(
  registrationRef,
  {
    registrationNumber: cleanRegistration,
    bikeId: bikeRef.id,
    ownerId: currentUser.uid,
    createdAt: serverTimestamp(),
  }
);
        }
      );

      setBikeName("");
      setRegistrationNumber("");

await Promise.all([
  loadBikes(
    currentUser
  ),
  loadTransferRequests(
    currentUser
  ),
  loadServiceReminders(
    currentUser
)]);

await repairOldTransferSnapshots(
  currentUser
);

await loadBikeStats(
  currentUser
);

await loadVehicleTransferHistory(
  currentUser
);

      alert(
        "Vehicle added successfully."
      );
    } catch (error) {
      console.error(
        "Error adding vehicle:",
        error
      );

      if (
        error instanceof Error &&
        error.message.includes(
          "already registered"
        )
      ) {
        alert(error.message);
      } else {
        alert(
          "Unable to add vehicle."
        );
      }
    }
  };

  // =========================================
  // SEND TRANSFER REQUEST
  // =========================================

  const sendTransferRequest =
    async (
      bike: Bike,
      targetEmail?: string
    ) => {
      if (!currentUser) {
        alert(
          "Please login first."
        );
        return;
      }

      const email = (
        targetEmail ||
        transferEmail ||
        ""
      )
        .trim()
        .toLowerCase();

      if (!email) {
        alert(
          "Please enter the Gmail address."
        );
        return;
      }

      if (
        !email.endsWith(
          "@gmail.com"
        )
      ) {
        alert(
          "Ownership transfer is available only to Gmail accounts."
        );
        return;
      }

      if (
        currentUser.email &&
        email ===
          currentUser.email.toLowerCase()
      ) {
        alert(
          "You cannot transfer the vehicle to your own account."
        );
        return;
      }

try {
  alert(
    "Before sending the transfer request, you need to verify your Google account. Please select the same Gmail account that is currently logged into Bike Service Reminder."
  );

  const provider =
    new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: "select_account",
  });

  const verificationResult =
    await reauthenticateWithPopup(
      currentUser,
      provider
    );

  const additionalUserInfo =
    getAdditionalUserInfo(
      verificationResult
    );

  const googleProfile =
    additionalUserInfo?.profile;

  const verifiedGoogleEmail =
    typeof googleProfile?.email ===
    "string"
      ? googleProfile.email
          .trim()
          .toLowerCase()
      : "";

  const loggedInEmail =
    currentUser.email
      ?.trim()
      .toLowerCase() || "";

  if (
    !verifiedGoogleEmail ||
    !loggedInEmail ||
    verifiedGoogleEmail !==
      loggedInEmail
  ) {
    alert(
      `Wrong Gmail account. You verified with ${
        verifiedGoogleEmail ||
        "another Google account"
      }. Please verify with ${loggedInEmail} before sending the transfer request.`
    );

    return;
  }

        const requestRef =
          doc(
            db,
            "ownershipTransferRequests",
            bike.id
          );

        await runTransaction(
          db,
          async (transaction) => {
            const bikeRef =
              doc(
                db,
                "bikes",
                bike.id
              );

            const bikeSnapshot =
              await transaction.get(
                bikeRef
              );

            if (
              !bikeSnapshot.exists()
            ) {
              throw new Error(
                "Vehicle no longer exists."
              );
            }

            const bikeData =
              bikeSnapshot.data();

            if (
              bikeData.ownerId !==
              currentUser.uid
            ) {
              throw new Error(
                "You are no longer the owner of this vehicle."
              );
            }

            transaction.set(
              requestRef,
              {
                bikeId:
                  bike.id,
                bikeName:
                  bike.bikeName,
                registrationNumber:
                  bike.registrationNumber,
                fromOwnerId:
                  currentUser.uid,
                fromOwnerEmail:
                  currentUser.email?.toLowerCase() ||
                  "",
                toOwnerEmail:
                  email,
                status:
                  "pending",
                createdAt:
                  serverTimestamp(),
              }
            );
          }
        );

                setTransferEmail("");
        if (
  selectedBike?.id === bike.id
) {
  setIsTransferPending(true);
  setShowAddServiceForm(false);
}

        await loadTransferRequests(
          currentUser
        );

        alert(
          "Transfer request sent successfully."
        );
      } catch (error) {
        console.error(
          "Error sending transfer request:",
          error
        );

       if (
  error instanceof Error &&
  error.message.includes(
    "auth/user-mismatch"
  )
) {
  alert(
    "Your verification was not successful due to a Gmail account mismatch. Please verify with the same Gmail account that is currently logged in."
  );
} else if (
  error instanceof Error &&
  error.message.includes(
    "auth/cancelled-popup-request"
  )
) {
  alert(
    "Google verification was cancelled. Please verify your Google account before sending the transfer request."
  );
} else if (error instanceof Error) {
  alert(
    error.message
  );
} else {
  alert(
    "Unable to send transfer request."
  );
}
      }
    };

  // =========================================
  // ACCEPT TRANSFER
  // =========================================

  const acceptTransferRequest =
    async (requestId: string) => {
      if (!currentUser) {
        return;
      }

      try {
        const requestRef =
          doc(
            db,
            "ownershipTransferRequests",
            requestId
          );

        const requestSnapshot =
          await getDoc(
            requestRef
          );

        if (
          !requestSnapshot.exists()
        ) {
          alert(
            "Transfer request no longer exists."
          );
          return;
        }

        const request =
          requestSnapshot.data();

        if (
          request.status !==
          "pending"
        ) {
          alert(
            "This transfer request is no longer pending."
          );
          return;
        }

        if (
          request.toOwnerEmail !==
          currentUser.email?.toLowerCase()
        ) {
          alert(
            "This transfer request is not for your account."
          );
          return;
        }

        const bikeRef =
          doc(
            db,
            "bikes",
            request.bikeId
          );

        const bikeSnapshot =
          await getDoc(
            bikeRef
          );

        if (
          !bikeSnapshot.exists()
        ) {
          alert(
            "Vehicle not found."
          );
          return;
        }

        const bikeData =
          bikeSnapshot.data();

        if (
          bikeData.ownerId !==
          request.fromOwnerId
        ) {
          alert(
            "The vehicle owner has changed. Please refresh."
          );
          return;
        }

        const serviceQuery =
          query(
            collection(
              db,
              "serviceRecords"
            ),
            where(
              "bikeId",
              "==",
              request.bikeId
            ),
            where(
              "ownerId",
              "==",
              request.fromOwnerId
            )
          );

        const serviceSnapshot =
          await getDocs(
            serviceQuery
          );

        const serviceCountAtTransfer =
          serviceSnapshot.size;

        const totalSpentAtTransfer =
          serviceSnapshot.docs.reduce(
            (
              total,
              serviceDoc
            ) =>
              total +
              Number(
                serviceDoc.data()
                  .amountPaid ||
                  0
              ),
            0
          );

        const registrationRef =
          doc(
            db,
            "bikeRegistrations",
            request.registrationNumber.toUpperCase()
          );

        const transferHistoryRef =
          doc(
            collection(
              db,
              "ownershipTransfers"
            )
          );

        const batch =
          writeBatch(db);

        batch.update(
          bikeRef,
          {
            ownerId:
              currentUser.uid,
            ownerEmail:
              currentUser.email?.toLowerCase() ||
              "",
          }
        );

        batch.update(
          registrationRef,
          {
            ownerId:
              currentUser.uid,
          }
        );

        serviceSnapshot.docs.forEach(
          (serviceDoc) => {
           batch.update(
  serviceDoc.ref,
  {
    ownerId:
      currentUser.uid,
    ownerEmail:
      currentUser.email?.toLowerCase() ||
      "",
    isPreviousOwnerService: true,
    previousOwnerId:
      request.fromOwnerId,
  }
);
          }
        );

        batch.update(
          requestRef,
          {
            status:
              "accepted",
          }
        );

        batch.set(
          transferHistoryRef,
          {
            bikeId:
              request.bikeId,
            bikeName:
              request.bikeName,
            registrationNumber:
              request.registrationNumber,
            fromOwnerId:
              request.fromOwnerId,
            fromOwnerEmail:
              request.fromOwnerEmail,
            toOwnerId:
              currentUser.uid,
            toOwnerEmail:
              currentUser.email?.toLowerCase() ||
              "",
            serviceCountAtTransfer,
            totalSpentAtTransfer,
            transferredAt:
              serverTimestamp(),
          }
        );

        await batch.commit();

        await loadBikes(
          currentUser
        );

        await loadTransferRequests(
          currentUser
        );

        await loadServiceReminders(
          currentUser
        );
        await repairOldTransferSnapshots(
          currentUser
        );
 await loadBikeStats(
          currentUser
        );

        await loadOldTransferredVehicles(
          currentUser
        );
await loadVehicleTransferHistory(
  currentUser
);
        if (
          selectedBike?.id ===
          request.bikeId
        ) {
          const updatedBike: Bike =
            {
              id:
                request.bikeId,
              bikeName:
                request.bikeName ||
                "",
              registrationNumber:
                request.registrationNumber ||
                "",
            };

          setSelectedBike(
            updatedBike
          );

          await loadServiceHistory(
            request.bikeId,
            currentUser
          );

          await loadTransferHistory(
            request.bikeId,
            currentUser
          );
        }

        alert(
          "Vehicle ownership accepted successfully."
        );
      } catch (error) {
        console.error(
          "Error accepting transfer:",
          error
        );

        if (error instanceof Error) {
          alert(error.message);
        } else {
          alert(
            "Unable to accept transfer."
          );
        }
      }
    };

  // =========================================
  // REJECT TRANSFER
  // =========================================

  const rejectTransferRequest =
    async (requestId: string) => {
      if (!currentUser) {
        return;
      }

      try {
        const requestRef =
          doc(
            db,
            "ownershipTransferRequests",
            requestId
          );

        const requestSnapshot =
          await getDoc(
            requestRef
          );

        if (
          !requestSnapshot.exists()
        ) {
          alert(
            "Transfer request no longer exists."
          );
          return;
        }

        const request =
          requestSnapshot.data();

        if (
          request.toOwnerEmail !==
          currentUser.email?.toLowerCase()
        ) {
          alert(
            "This transfer request is not for your account."
          );
          return;
        }

        if (
          request.status !==
          "pending"
        ) {
          alert(
            "This request is no longer pending."
          );
          return;
        }

      await updateDoc(
  requestRef,
  {
    status:
      "rejected",
  }
);

if (
  selectedBike?.id ===
  request.bikeId
) {
  setIsTransferPending(false);
}

await loadTransferRequests(
  currentUser
);

        alert(
          "Transfer request rejected."
        );
      } catch (error) {
        console.error(
          "Error rejecting transfer:",
          error
        );

        alert(
          "Unable to reject transfer request."
        );
      }
    };

  // =========================================
  // DELETE BIKE
  // =========================================

  const deleteBike = async (
    bike: Bike
  ) => {
    if (!currentUser) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete ${bike.bikeName} (${bike.registrationNumber})? This will also delete its service history.`
      );

    if (!confirmed) {
      return;
    }

    try {
      const serviceQuery =
        query(
          collection(
            db,
            "serviceRecords"
          ),
          where(
            "bikeId",
            "==",
            bike.id
          ),
          where(
            "ownerId",
            "==",
            currentUser.uid
          )
        );

      const serviceSnapshot =
        await getDocs(
          serviceQuery
        );

      const batch =
        writeBatch(db);

      serviceSnapshot.docs.forEach(
        (serviceDoc) => {
          batch.delete(
            serviceDoc.ref
          );
        }
      );

      const registrationRef =
        doc(
          db,
          "bikeRegistrations",
          bike.registrationNumber.toUpperCase()
        );

      const bikeRef =
        doc(
          db,
          "bikes",
          bike.id
        );

      batch.delete(
        registrationRef
      );

      batch.delete(
        bikeRef
      );

      await batch.commit();

      if (
        selectedBike?.id ===
        bike.id
      ) {
        setSelectedBike(
          null
        );
        setServiceHistory(
          []
        );
        setTransferCount(0);
        setEditingServiceId(
          null
        );
      }

      await loadBikes(
        currentUser
      );

      await loadBikeStats(
        currentUser
      );

      await loadServiceReminders(
        currentUser
      );

      alert(
        "Vehicle deleted successfully."
      );
    } catch (error) {
      console.error(
        "Error deleting vehicle:",
        error
      );

      alert(
        "Unable to delete vehicle."
      );
    }
  };

  // =========================================
  // FORMAT DATE
  // =========================================

  const formatDateForInput = (
    timestamp:
      | Timestamp
      | null
      | undefined
  ) => {
    if (!timestamp) {
      return "";
    }

    const date =
      timestamp.toDate();

    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (
    timestamp:
      | Timestamp
      | null
      | undefined
  ) => {
    if (!timestamp) {
      return "Not available";
    }

    return timestamp
      .toDate()
      .toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }
      );
  };
    // Shows only the first 3 characters of the Gmail name.
  const maskEmail = (
    email: string | null | undefined
  ) => {
    if (!email) {
      return "";
    }

    const [name, domain] =
      email.split("@");

    if (!domain) {
      return `${email.slice(0, 3)}*****`;
    }

    return `${name.slice(0, 3)}*****@${domain}`;
  };
  const formatDisplayDateTime = (
    timestamp:
      | Timestamp
      | null
      | undefined
  ) => {
    if (!timestamp) {
      return "Not available";
    }

    return timestamp
      .toDate()
      .toLocaleString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }
      );
  };

  const formatOwnershipDuration = (
    durationMs: number
  ) => {
    const totalMinutes =
      Math.floor(
        durationMs /
          (1000 * 60)
      );

    const days =
      Math.floor(
        totalMinutes / 1440
      );

    const hours =
      Math.floor(
        (totalMinutes % 1440) /
          60
      );

    const minutes =
      totalMinutes % 60;

    const parts: string[] =
      [];

    if (days > 0) {
      parts.push(
        `${days} day${
          days === 1 ? "" : "s"
        }`
      );
    }

    if (hours > 0) {
      parts.push(
        `${hours} hour${
          hours === 1 ? "" : "s"
        }`
      );
    }

    if (minutes > 0) {
      parts.push(
        `${minutes} minute${
          minutes === 1 ? "" : "s"
        }`
      );
    }

    return parts.length > 0
      ? parts.join(" ")
      : "Less than 1 minute";
  };
  // =========================================
  // SAVE SERVICE
  // =========================================

  const saveService = async () => {
    if (!currentUser) {
      alert(
        "Please login first."
      );
      return;
    }

    if (!selectedBike) {
      alert(
        "Please select a vehicle first."
      );
      return;
    }

    if (!serviceDate) {
      alert(
        "Please select the service date."
      );
      return;
    }
    if (isTransferPending) {
      alert(
        "Service records cannot be added while the ownership transfer request is pending."
      );
      return;
    }
    if (!nextServiceDate) {
      alert(
        "Please select the next service date."
      );
      return;
    }

    const parsedAmount =
      Number(
        amountPaid || 0
      );

    if (
      Number.isNaN(
        parsedAmount
      ) ||
      parsedAmount < 0
    ) {
      alert(
        "Please enter a valid service amount."
      );
      return;
    }

    const serviceDateObject =
      new Date(
        `${serviceDate}T00:00:00`
      );

    const nextServiceDateObject =
      new Date(
        `${nextServiceDate}T00:00:00`
      );

    if (
      nextServiceDateObject <
      serviceDateObject
    ) {
      alert(
        "Next service date cannot be before the service date."
      );
      return;
    }

    try {
      await addDoc(
        collection(
          db,
          "serviceRecords"
        ),
        {
          bikeId:
            selectedBike.id,
          bikeName:
            selectedBike.bikeName,
          registrationNumber:
            selectedBike.registrationNumber,
                      createdByEmail:
            currentUser.email?.toLowerCase() ||
            "",
          serviceDate:
            Timestamp.fromDate(
              serviceDateObject
            ),
          nextServiceDate:
            Timestamp.fromDate(
              nextServiceDateObject
            ),
          amountPaid:
            parsedAmount,
          workshop:
            workshop.trim(),
          notes:
            notes.trim(),
          ownerId:
            currentUser.uid,
          ownerEmail:
            currentUser.email?.toLowerCase() ||
            "",
          createdAt:
            serverTimestamp(),
        }
      );

      setServiceDate("");
      setNextServiceDate("");
      setAmountPaid("");
      setWorkshop("");
      setNotes("");
      setShowAddServiceForm(false);

      await loadServiceHistory(
        selectedBike.id,
        currentUser
      );

      await loadServiceReminders(
        currentUser
      );

      await loadBikeStats(
        currentUser
      );

      alert(
        "Service record added successfully."
      );
    } catch (error) {
      console.error(
        "Error saving service:",
        error
      );

      alert(
        "Unable to save service record."
      );
    }
  };

  // =========================================
  // START EDIT SERVICE
  // =========================================

 const startEditService = (
  service: ServiceRecord
) => {
  if (isTransferPending) {
  alert(
    "Service history cannot be edited while the ownership transfer request is pending."
  );
  return;
}
  if (service.isPreviousOwnerService) {
    alert(
      "Services recorded by the previous owner cannot be edited."
    );
    return;
  }

  setEditingServiceId(
    service.id
  );
    setEditServiceDate(
      formatDateForInput(
        service.serviceDate
      )
    );

    setEditNextServiceDate(
      formatDateForInput(
        service.nextServiceDate
      )
    );

    setEditAmountPaid(
      String(
        service.amountPaid
      )
    );

    setEditWorkshop(
      service.workshop
    );

    setEditNotes(
      service.notes
    );
  };

  // =========================================
  // CANCEL EDIT
  // =========================================

  const cancelEditService = () => {
    setEditingServiceId(
      null
    );

    setEditServiceDate("");
    setEditNextServiceDate("");
    setEditAmountPaid("");
    setEditWorkshop("");
    setEditNotes("");
  };

  // =========================================
  // UPDATE SERVICE
  // =========================================

  const updateService = async (
    serviceId: string
  ) => {
    if (!currentUser) {
      return;
    }

    if (!selectedBike) {
      return;
    }
if (isTransferPending) {
  alert(
    "Service history cannot be edited while the ownership transfer request is pending."
  );
  return;
}
const serviceRecord =
  serviceHistory.find(
    (service) =>
      service.id === serviceId
  );

if (
  serviceRecord?.isPreviousOwnerService
) {
  alert(
    "Services recorded by the previous owner cannot be edited."
  );
  return;
}
    if (!editServiceDate) {
      alert(
        "Please select the service date."
      );
      return;
    }

    if (!editNextServiceDate) {
      alert(
        "Please select the next service date."
      );
      return;
    }

    const parsedAmount =
      Number(
        editAmountPaid || 0
      );

    if (
      Number.isNaN(
        parsedAmount
      ) ||
      parsedAmount < 0
    ) {
      alert(
        "Please enter a valid service amount."
      );
      return;
    }

    const serviceDateObject =
      new Date(
        `${editServiceDate}T00:00:00`
      );

    const nextServiceDateObject =
      new Date(
        `${editNextServiceDate}T00:00:00`
      );

    if (
      nextServiceDateObject <
      serviceDateObject
    ) {
      alert(
        "Next service date cannot be before the service date."
      );
      return;
    }

    try {
      const serviceRef =
        doc(
          db,
          "serviceRecords",
          serviceId
        );

      const serviceSnapshot =
        await getDoc(
          serviceRef
        );

      if (
        !serviceSnapshot.exists()
      ) {
        alert(
          "Service record not found."
        );
        return;
      }

      const serviceData =
        serviceSnapshot.data();

      if (
        serviceData.ownerId !==
        currentUser.uid
      ) {
        alert(
          "You are not allowed to edit this service record."
        );
        return;
      }

      if (
        serviceData.bikeId !==
        selectedBike.id
      ) {
        alert(
          "This service record belongs to another vehicle."
        );
        return;
      }

      const newServiceTs =
        Timestamp.fromDate(
          serviceDateObject
        );

      const newNextServiceTs =
        Timestamp.fromDate(
          nextServiceDateObject
        );

      const oldServiceMs =
        serviceData.serviceDate instanceof Timestamp
          ? serviceData.serviceDate.toMillis()
          : null;

      const oldNextServiceMs =
        serviceData.nextServiceDate instanceof Timestamp
          ? serviceData.nextServiceDate.toMillis()
          : null;

      const editMarks: Record<
        string,
        ReturnType<typeof serverTimestamp>
      > = {};

      if (oldServiceMs !== newServiceTs.toMillis()) {
        editMarks["editedAt.serviceDate"] =
          serverTimestamp();
      }

      if (oldNextServiceMs !== newNextServiceTs.toMillis()) {
        editMarks["editedAt.nextServiceDate"] =
          serverTimestamp();
      }

      if (Number(serviceData.amountPaid || 0) !== parsedAmount) {
        editMarks["editedAt.amountPaid"] =
          serverTimestamp();
      }

      if ((serviceData.workshop || "") !== editWorkshop.trim()) {
        editMarks["editedAt.workshop"] =
          serverTimestamp();
      }

      if ((serviceData.notes || "") !== editNotes.trim()) {
        editMarks["editedAt.notes"] =
          serverTimestamp();
      }

      await updateDoc(
        serviceRef,
        {
          serviceDate: newServiceTs,
          nextServiceDate: newNextServiceTs,
          amountPaid: parsedAmount,
          workshop: editWorkshop.trim(),
          notes: editNotes.trim(),
          ...editMarks,
        }
      );

      cancelEditService();

      await loadServiceHistory(
        selectedBike.id,
        currentUser
      );

      await loadServiceReminders(
        currentUser
      );

      await loadBikeStats(
        currentUser
      );

      alert(
        "Service record updated successfully."
      );
    } catch (error) {
      console.error(
        "Error updating service:",
        error
      );

      alert(
        "Unable to update service record."
      );
    }
  };

  // =========================================
  // DELETE SERVICE
  // =========================================

  const deleteService = async (
    serviceId: string
  ) => {
    if (!currentUser) {
      return;
    }

    if (!selectedBike) {
      return;
    }
if (isTransferPending) {
  alert(
    "Service history cannot be deleted while the ownership transfer request is pending."
  );
  return;
}

const serviceRecord =
  serviceHistory.find(
    (service) =>
      service.id === serviceId
  );

if (
  serviceRecord?.isPreviousOwnerService
) {
  alert(
    "Services recorded by the previous owner cannot be deleted."
  );
  return;
}

    const confirmed =
      window.confirm(
        "Delete this service record?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const serviceRef =
        doc(
          db,
          "serviceRecords",
          serviceId
        );

      const serviceSnapshot =
        await getDoc(
          serviceRef
        );

      if (
        !serviceSnapshot.exists()
      ) {
        alert(
          "Service record not found."
        );
        return;
      }

      const serviceData =
        serviceSnapshot.data();

      if (
        serviceData.ownerId !==
        currentUser.uid
      ) {
        alert(
          "You are not allowed to delete this service record."
        );
        return;
      }

      if (
        serviceData.bikeId !==
        selectedBike.id
      ) {
        alert(
          "This service record belongs to another vehicle."
        );
        return;
      }

      await deleteDoc(
        serviceRef
      );

      if (
        editingServiceId ===
        serviceId
      ) {
        cancelEditService();
      }

      await loadServiceHistory(
        selectedBike.id,
        currentUser
      );

      await loadServiceReminders(
        currentUser
      );

      await loadBikeStats(
        currentUser
      );

      alert(
        "Service record deleted successfully."
      );
    } catch (error) {
      console.error(
        "Error deleting service:",
        error
      );

      alert(
        "Unable to delete service record."
      );
    }
  };

  // =========================================
  // LOAD ALL DATA
  // =========================================

  useEffect(() => {
    if (!currentUser) {
      setTransferRequests([]);
      setBikes([]);
      setSelectedBike(null);
      setServiceHistory([]);
      setServiceReminders([]);
      setBikeStats({});
      setOldTransferredVehicles([]);
      setVehicleTransferHistory([]);
      setTransferCount(0);

      return;
    }

    const loadAllData =
      async () => {
await Promise.all([
  loadBikes(
    currentUser
  ),
  loadTransferRequests(
    currentUser
  ),
  loadServiceReminders(
    currentUser
  ),
]);

await repairOldTransferSnapshots(
  currentUser
);

await loadBikeStats(
  currentUser
);

await loadVehicleTransferHistory(
  currentUser
);

await loadOldTransferredVehicles(
  currentUser
);

      };

    loadAllData();
  }, [currentUser]);

  // =========================================
  // LOADING SCREEN
  // =========================================

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-2xl bg-white px-8 py-6 shadow-sm">
          <p className="text-gray-600">
            Loading Bike Service Reminder...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">

      {/* =======================================
          HEADER
      ======================================= */}

      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">

          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Bike Service Reminder
            </h1>

            <p className="text-xs text-gray-500">
              Keep your vehicle service records organized.
            </p>
          </div>

          {currentUser ? (
            <div className="flex items-center gap-3">

              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">
                  {currentUser.displayName ||
                    "Google User"}
                </p>

                <p className="text-xs text-gray-500">
                  {currentUser.email}
                </p>
              </div>

              <button
                onClick={logout}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
              >
                Logout
              </button>

            </div>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700"
            >
              Continue with Google
            </button>
          )}

        </div>
      </header>

      {/* =======================================
          HERO
      ======================================= */}

      <section className="border-b bg-white">

        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:items-center">

          <div>

            <div className="mb-4 inline-flex rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
              🏍️ Built for vehicle enthusiasts
            </div>

            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Never forget your next service.
            </h2>

            <p className="mt-5 max-w-xl text-lg leading-8 text-gray-600">
              Keep every vehicle's service dates,
              expenses, workshops, notes, and ownership
              history in one place.
            </p>

            {!currentUser && (
              <button
                onClick={loginWithGoogle}
                className="mt-8 rounded-xl bg-gray-900 px-6 py-3 font-medium text-white transition hover:bg-gray-700"
              >
                Get Started with Google
              </button>
            )}

          </div>

          <div className="rounded-3xl border bg-gray-50 p-8 shadow-sm">

            <div className="text-6xl">
              🏍️
            </div>

            <h3 className="mt-6 text-2xl font-semibold">
              Your vehicles. Your history.
            </h3>

            <p className="mt-3 leading-7 text-gray-600">
              Add your vehicles, record every service,
              track spending, and keep the next service
              date ready whenever you need it.
            </p>

          </div>

        </div>

      </section>

      {/* =======================================
          FEATURES
      ======================================= */}

      <section className="mx-auto max-w-6xl px-6 py-16">

        <div className="mb-10 text-center">

          <h2 className="text-3xl font-bold">
            Features
          </h2>

          <p className="mt-3 text-gray-600">
            Everything needed to keep your service records
            organized.
          </p>

        </div>

        <div className="grid gap-6 md:grid-cols-3">

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-3xl">
              📅
            </div>

            <h3 className="mt-4 text-lg font-semibold">
              Service Reminders
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              See upcoming, today's, and overdue service
              dates.
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-3xl">
              💰
            </div>

            <h3 className="mt-4 text-lg font-semibold">
              Expense Tracking
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              Automatically calculate how much you have
              spent on every vehicle.
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-3xl">
              🔄
            </div>

            <h3 className="mt-4 text-lg font-semibold">
              Ownership Transfer
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              Transfer a vehicle while keeping its service
              history with the vehicle.
            </p>
          </div>

        </div>

      </section>

      {/* =======================================
          HOW IT WORKS
      ======================================= */}

      <section className="border-y bg-white">

        <div className="mx-auto max-w-6xl px-6 py-16">

          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">
              How It Works
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">

            <div className="rounded-2xl border p-6">
              <div className="text-2xl font-bold">
                01
              </div>

              <h3 className="mt-3 font-semibold">
                Add your vehicle
              </h3>

              <p className="mt-2 text-sm text-gray-600">
                Save the vehicle name and unique registration
                number.
              </p>
            </div>

            <div className="rounded-2xl border p-6">
              <div className="text-2xl font-bold">
                02
              </div>

              <h3 className="mt-3 font-semibold">
                Record services
              </h3>

              <p className="mt-2 text-sm text-gray-600">
                Save service dates, expenses, workshop details,
                and notes.
              </p>
            </div>

            <div className="rounded-2xl border p-6">
              <div className="text-2xl font-bold">
                03
              </div>

              <h3 className="mt-3 font-semibold">
                Track everything
              </h3>

              <p className="mt-2 text-sm text-gray-600">
                Use reminders, service history, and spending
                totals whenever needed.
              </p>
            </div>

          </div>

        </div>

      </section>

      {/* =======================================
          ADD VEHICLE
      ======================================= */}

      {currentUser && (
        <section className="mx-auto max-w-6xl px-6 py-12">

          <div className="rounded-3xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-8 shadow-sm">

            <div className="border-l-4 border-cyan-500 pl-4">

              <h2 className="font-mono text-2xl font-extrabold text-cyan-900">
                Add Your Vehicle
              </h2>

              <p className="mt-2 text-sm text-cyan-800/70">
                Add a bike or another vehicle to your account.
              </p>

            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">

              <input
                type="text"
                value={bikeName}
                onChange={(e) =>
                  setBikeName(
                    e.target.value
                  )
                }
                placeholder="Vehicle name"
                className="rounded-xl border border-cyan-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />

              <input
                type="text"
                value={
                  registrationNumber
                }
                onChange={(e) =>
                  setRegistrationNumber(
                    e.target.value.toUpperCase()
                  )
                }
                placeholder="Registration number"
                className="rounded-xl border border-cyan-200 bg-white px-4 py-3 uppercase outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />

              <button
                onClick={
                  addBike
                }
                className="rounded-xl bg-cyan-700 px-5 py-3 font-semibold text-white transition hover:bg-cyan-800"
              >
                Add Vehicle
              </button>

            </div>

          </div>

        </section>
      )}

      {/* =======================================
          LOGGED-IN CONTENT
      ======================================= */}

      {currentUser && (
        <>
                     <OwnershipHistory
               history={vehicleTransferHistory}
               currentUserEmail={currentUser.email}
             />
{selectedBike && transferCount > 0 && (
  <section className="mx-auto max-w-6xl px-6 pt-8 pb-6">

    <div className="rounded-3xl border-2 border-indigo-300 bg-gradient-to-r from-indigo-100 via-violet-50 to-purple-100 p-6 shadow-md">

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

        <div>

          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
            Ownership History
          </p>

          <h2 className="mt-1 text-2xl font-extrabold text-indigo-950">
            This vehicle has previous ownership history
          </h2>

          <p className="mt-2 text-sm text-indigo-800">
            Review the ownership and transfer records before
            managing this vehicle.
          </p>

        </div>

        <div className="rounded-2xl border border-indigo-200 bg-white px-6 py-4 text-center shadow-sm">

          <p className="text-xs font-bold uppercase tracking-wide text-indigo-500">
            Ownership Transfers
          </p>

          <p className="mt-1 text-4xl font-extrabold text-indigo-900">
            {transferCount}
          </p>

        </div>

      </div>

    </div>

  </section>
)}
          {/* =====================================
              SERVICE REMINDERS
          ===================================== */}

          <section className="mx-auto max-w-6xl px-6 pb-10">

            <div className="rounded-3xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-8 shadow-sm">

              <div className="border-l-4 border-amber-500 pl-4">

                <h2 className="font-mono text-2xl font-extrabold tracking-wide text-amber-900">
                  Service Reminders
                </h2>

                <p className="mt-2 text-sm text-amber-900/70">
                  Services due within 7 days, including overdue
                  services.
                </p>

              </div>

              {serviceReminders.length ===
              0 ? (
                <div className="mt-6 rounded-2xl border border-amber-100 bg-white p-6">
                  <p className="text-amber-900/70">
                    No service reminders right now.
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2">

                  {serviceReminders.map(
                    (reminder) => {

                      const nextDate =
                        reminder.nextServiceDate.toDate();

                      const nextDay =
                        new Date(
                          nextDate.getFullYear(),
                          nextDate.getMonth(),
                          nextDate.getDate()
                        );

                      const today =
                        new Date();

                      const todayDay =
                        new Date(
                          today.getFullYear(),
                          today.getMonth(),
                          today.getDate()
                        );

                      const isOverdue =
                        nextDay.getTime() <
                        todayDay.getTime();

                      return (
                        <div
                          key={`${reminder.bikeId}-${reminder.nextServiceDate.toMillis()}`}
                          className="rounded-2xl border-2 border-amber-100 bg-white p-5 shadow-sm"
                        >

                          <div className="flex items-start justify-between gap-4">

                            <div>
                              <h3 className="font-semibold text-amber-950">
                                {
                                  reminder.bikeName
                                }
                              </h3>

                              <p className="mt-1 text-sm text-gray-500">
                                {
                                  reminder.registrationNumber
                                }
                              </p>
                            </div>

                            <div className="rounded-xl bg-amber-100 px-3 py-2 text-2xl">
                              🔔
                            </div>

                          </div>

                          <p className="mt-4 text-sm text-gray-600">
                            Next service:{" "}
                            <span className="font-semibold text-gray-900">
                              {
                                formatDisplayDate(
                                  reminder.nextServiceDate
                                )
                              }
                            </span>
                          </p>

                          <p
                            className={`mt-2 text-sm font-bold ${
                              isOverdue
                                ? "text-red-600"
                                : "text-amber-700"
                            }`}
                          >
                            {isOverdue
                              ? `⚠️ Service is overdue by ${Math.abs(
                                  reminder.daysRemaining
                                )} day${
                                  Math.abs(
                                    reminder.daysRemaining
                                  ) ===
                                  1
                                    ? ""
                                    : "s"
                                }!`
                              : reminder.daysRemaining ===
                                0
                              ? "🔔 Service is due today!"
                              : `🔔 Service is due in ${
                                  reminder.daysRemaining
                                } day${
                                  reminder.daysRemaining ===
                                  1
                                    ? ""
                                    : "s"
                                }!`}
                          </p>

                          <button
  onClick={async () => {
    const bike = bikes.find(
      (b) => b.id === reminder.bikeId
    );

    if (bike) {
      await selectBike(bike);

      document
        .getElementById("service-history")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }
  }}
  className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
>
  View Service History
</button>

                        </div>
                      );
                    }
                  )}

                </div>
              )}

            </div>

          </section>

          {/* =====================================
              MY BIKES
          ===================================== */}

          <section className="mx-auto max-w-6xl px-6 pb-10">

            <div className="rounded-3xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-8 shadow-sm">

              <div className="border-l-4 border-blue-500 pl-4">

                <h2 className="text-2xl font-extrabold tracking-tight text-blue-900">
                  My Bikes
                </h2>

                <p className="mt-2 text-sm text-blue-900/70">
                  Your current vehicles and their automatic service
                  totals.
                </p>

              </div>

              {bikes.length ===
              0 ? (
                <div className="mt-6 rounded-2xl border border-blue-100 bg-white p-6">
                  <p className="text-blue-900/70">
                    No vehicles added yet.
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">

                  {bikes.map(
                    (bike) => {

                     const stats =
  bikeStats[
    bike.id
  ] || {
    serviceCount: 0,
    totalSpent: 0,
    wasTransferred: false,
    userSpent: 0,
    ownerSpending: [],
  };
                      return (
                        <div
                          key={bike.id}
                          className="rounded-2xl border-2 border-blue-100 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
                        >

                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-2xl">
                            🏍️
                          </div>

                          <h3 className="mt-4 text-lg font-bold text-blue-950">
                            {
                              bike.bikeName
                            }
                          </h3>

                          <p className="mt-2 text-sm text-gray-600">
                            Registration:{" "}
                            <span className="font-semibold text-gray-900">
                              {
                                bike.registrationNumber
                              }
                            </span>
                          </p>

            <div className="mt-5 space-y-3">

  <div className="grid grid-cols-2 gap-3">

    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">

      <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
        Services
      </p>

      <p className="mt-1 text-2xl font-extrabold text-blue-900">
        {stats.serviceCount}
      </p>

    </div>

    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">

      <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">
        Total Spent
      </p>

      <p className="mt-1 text-xl font-extrabold text-emerald-900">
        ₹
        {stats.totalSpent.toLocaleString(
          "en-IN"
        )}
      </p>

    </div>

  </div>

{stats.wasTransferred && (
  <div className="mt-3 space-y-3">

    {/* OWNER SPENDING */}

    <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">

      <p className="text-xs font-bold uppercase tracking-wide text-orange-600">
        Owner Spending
      </p>

      <div className="mt-3 space-y-2">

        {stats.ownerSpending.map(
          (owner) => (
            <div
              key={owner.ownerId}
              className="flex items-center justify-between rounded-lg border border-orange-100 bg-white px-3 py-2"
            >

              <div>
                <p className="text-sm font-bold text-gray-900">
                  {owner.ownerId ===
                  currentUser.uid
                    ? "You"
                    : owner.ownerEmail ||
                      "Previous Owner"}
                </p>

                <p className="text-xs text-gray-500">
                  {owner.serviceCount} service
                  {owner.serviceCount === 1
                    ? ""
                    : "s"}
                </p>
              </div>

              <p className="text-sm font-extrabold text-orange-900">
                ₹
                {owner.totalSpent.toLocaleString(
                  "en-IN"
                )}
              </p>

            </div>
          )
        )}

      </div>

    </div>

    {/* YOUR TOTAL */}

    <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">

      <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
        You Spent
      </p>

      <p className="mt-1 text-lg font-extrabold text-violet-900">
        ₹
        {stats.userSpent.toLocaleString(
          "en-IN"
        )}
      </p>

    </div>

  </div>
)}

</div>

                          <button
                            onClick={() =>
                              selectBike(
                                bike
                              )
                            }
                            className="mt-5 w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
                          >
                            Select Vehicle
                          </button>

                          <div className="mt-3 grid grid-cols-2 gap-3">

                            <button
                              onClick={() =>
                                deleteBike(
                                  bike
                                )
                              }
                              className="rounded-xl border-2 border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              Delete
                            </button>

                            <button
                              onClick={() => {
                                const email =
                                  window.prompt(
                                    `Enter the Gmail address of the new owner for ${bike.bikeName}:`
                                  );

                                if (email) {
                                  sendTransferRequest(
                                    bike,
                                    email
                                  );
                                }
                              }}
                              className="rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-800"
                            >
                              Transfer
                            </button>

                          </div>

                        </div>
                      );
                    }
                  )}

                </div>
              )}

            </div>

          </section>
          {/* =====================================
              OWNERSHIP & TRANSFER HISTORY
          ===================================== */}

                      <SpendingSummary
               user={currentUser}
               bikes={bikes}
               refreshKey={bikeStats}
             />
          
          {/* =====================================
              TRANSFER REQUESTS
          ===================================== */}

          {transferRequests.length >
            0 && (
            <section className="mx-auto max-w-6xl px-6 pb-10">

              <div className="rounded-3xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50 p-8 shadow-sm">

                <div className="border-l-4 border-purple-500 pl-4">

                  <h2 className="font-serif text-3xl font-extrabold text-purple-900">
                    Transfer Requests
                  </h2>

                  <p className="mt-2 text-sm text-purple-900/70">
                    Vehicles waiting for your acceptance.
                  </p>

                </div>

                <div className="mt-6 space-y-4">

                  {transferRequests.map(
                    (request) => (
                      <div
                        key={request.id}
                        className="rounded-2xl border-2 border-purple-100 bg-white p-5 shadow-sm"
                      >

                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

                          <div>

                            <h3 className="font-serif text-xl font-bold text-purple-950">
                              {
                                request.bikeName
                              }
                            </h3>

                            <p className="mt-1 text-sm text-gray-600">
                              Registration:{" "}
                              <span className="font-semibold">
                                {
                                  request.registrationNumber
                                }
                              </span>
                            </p>

                            <p className="mt-1 text-sm text-gray-500">
                              From:{" "}
                              {
                                request.fromOwnerEmail
                              }
                            </p>

                          </div>

                          <div className="flex gap-3">

                            <button
                              onClick={() =>
                                acceptTransferRequest(
                                  request.id
                                )
                              }
                              className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-800"
                            >
                              Accept
                            </button>

                            <button
                              onClick={() =>
                                rejectTransferRequest(
                                  request.id
                                )
                              }
                              className="rounded-xl border-2 border-purple-200 px-4 py-2 text-sm font-semibold text-purple-800 transition hover:bg-purple-50"
                            >
                              Reject
                            </button>

                          </div>

                        </div>

                      </div>
                    )
                  )}

                </div>

              </div>

            </section>
          )}

         {/* =====================================
    SERVICE HISTORY
===================================== */}

<section
  id="service-history"
  className="mx-auto max-w-6xl px-6 pb-16"
>
  <div className="rounded-3xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-8 shadow-sm">

    <div className="border-l-4 border-emerald-500 pl-4">

      <h2 className="text-2xl font-extrabold tracking-tight text-emerald-900">
        Service History
      </h2>

      <p className="mt-2 text-sm text-emerald-900/70">
        Select a vehicle to view, add, edit, or delete
        service records.
      </p>

    </div>

    <div className="mt-6">

      <label className="mb-2 block text-sm font-bold text-emerald-900">
        Select Vehicle
      </label>

      <select
        value={selectedBike?.id || ""}
        onChange={async (e) => {

          const bike =
            bikes.find(
              (item) =>
                item.id ===
                e.target.value
            );

          if (bike) {
            await selectBike(bike);
          } else {
            setSelectedBike(null);
            setServiceHistory([]);
            setTransferCount(0);
            setIsTransferPending(false);
          }

        }}
        className="w-full rounded-xl border-2 border-emerald-200 bg-white px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >

        <option value="">
          Select a vehicle
        </option>

        {bikes.map(
          (bike) => (
            <option
              key={bike.id}
              value={bike.id}
            >
              {bike.bikeName} —{" "}
              {bike.registrationNumber}
            </option>
          )
        )}

      </select>

    </div>

    {selectedBike && (
      <>

        {/* SELECTED VEHICLE */}

        <div className="mt-8 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-6">

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

            <div>

              <h3 className="text-xl font-extrabold text-emerald-950">
                {selectedBike.bikeName}
              </h3>

              <p className="mt-1 text-sm text-emerald-900/70">
                Registration:{" "}
                {selectedBike.registrationNumber}
              </p>

            </div>

            <div className="rounded-xl bg-white px-4 py-3 text-sm text-emerald-800 shadow-sm">
              Ownership transfers:{" "}
              <span className="font-extrabold">
                {transferCount}
              </span>
            </div>

          </div>

          {isTransferPending && (
            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-100 px-4 py-3 text-sm font-semibold text-orange-800">
              Ownership transfer is pending.
              Service history is locked until the
              transfer request is accepted or rejected.
            </div>
          )}

        </div>

        {/* ADD SERVICE */}

        {showAddServiceForm && (
          <div className="mt-6 rounded-2xl border-2 border-emerald-100 bg-white p-6">

            <h3 className="text-lg font-extrabold text-emerald-900">
              Add Service
            </h3>

            <div className="mt-5 grid gap-4 md:grid-cols-2">

              <div>

                <label className="mb-2 block text-sm font-semibold">
                  Service Date
                </label>

                <input
                  type="date"
                  value={serviceDate}
                  onChange={(e) =>
                    setServiceDate(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm font-semibold">
                  Next Service Date
                </label>

                <input
                  type="date"
                  value={nextServiceDate}
                  onChange={(e) =>
                    setNextServiceDate(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm font-semibold">
                  Amount Paid
                </label>

                <input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onChange={(e) =>
                    setAmountPaid(
                      e.target.value
                    )
                  }
                  placeholder="0"
                  className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm font-semibold">
                  Workshop
                </label>

                <input
                  type="text"
                  value={workshop}
                  onChange={(e) =>
                    setWorkshop(
                      e.target.value
                    )
                  }
                  placeholder="Workshop name"
                  className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                />

              </div>

              <div className="md:col-span-2">

                <label className="mb-2 block text-sm font-semibold">
                  Notes
                </label>

                <textarea
                  value={notes}
                  onChange={(e) =>
                    setNotes(
                      e.target.value
                    )
                  }
                  placeholder="Service details or notes"
                  rows={4}
                  className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                />

              </div>

            </div>

            <div className="mt-5 flex items-center gap-2">

              <button
                onClick={saveService}
                className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
              >
                Save Service
              </button>

              <button
                onClick={() =>
                  setShowAddServiceForm(false)
                }
                className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700"
              >
                Close Add Service
              </button>

            </div>

          </div>
        )}

        {/* SERVICE RECORDS */}

        <div className="mt-8">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <h3 className="text-lg font-extrabold text-emerald-900">
                Service Records
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                {serviceHistory.length} service
                {serviceHistory.length === 1
                  ? ""
                  : "s"}
              </p>

            </div>

                       <button
              onClick={() =>
                setShowAddServiceForm(
                  (previous) =>
                    !previous
                )
              }
              disabled={isTransferPending}
              className="self-start rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
            >
              {showAddServiceForm
                ? "Close Add Service"
                : "+ Add Service"}
            </button>

          </div>

          {serviceHistory.length === 0 ? (

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-white p-6">
              <p className="text-gray-600">
                No service history for this vehicle yet.
              </p>
            </div>

          ) : (

            <div className="mt-5 space-y-5">

              {serviceHistory.map(
                (service) => (

                  <div
                    key={service.id}
                    className="rounded-2xl border-2 border-emerald-100 bg-white p-6 shadow-sm"
                  >

                    {editingServiceId ===
                    service.id ? (

                      <div>

                        <h4 className="text-lg font-extrabold text-emerald-900">
                          Edit Service
                        </h4>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">

                          <div>

                            <label className="mb-2 block text-sm font-semibold">
                              Service Date
                            </label>

                            <input
                              type="date"
                              value={editServiceDate}
                              onChange={(e) =>
                                setEditServiceDate(
                                  e.target.value
                                )
                              }
                              className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                            />

                          </div>

                          <div>

                            <label className="mb-2 block text-sm font-semibold">
                              Next Service Date
                            </label>

                            <input
                              type="date"
                              value={editNextServiceDate}
                              onChange={(e) =>
                                setEditNextServiceDate(
                                  e.target.value
                                )
                              }
                              className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                            />

                          </div>

                          <div>

                            <label className="mb-2 block text-sm font-semibold">
                              Amount Paid
                            </label>

                            <input
                              type="number"
                              min="0"
                              value={editAmountPaid}
                              onChange={(e) =>
                                setEditAmountPaid(
                                  e.target.value
                                )
                              }
                              className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                            />

                          </div>

                          <div>

                            <label className="mb-2 block text-sm font-semibold">
                              Workshop
                            </label>

                            <input
                              type="text"
                              value={editWorkshop}
                              onChange={(e) =>
                                setEditWorkshop(
                                  e.target.value
                                )
                              }
                              className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                            />

                          </div>

                          <div className="md:col-span-2">

                            <label className="mb-2 block text-sm font-semibold">
                              Notes
                            </label>

                            <textarea
                              value={editNotes}
                              onChange={(e) =>
                                setEditNotes(
                                  e.target.value
                                )
                              }
                              rows={4}
                              className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 outline-none focus:border-emerald-500"
                            />

                          </div>

                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">

                          <button
                            onClick={() =>
                              updateService(
                                service.id
                              )
                            }
                            className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                          >
                            Save Changes
                          </button>

                          <button
                            onClick={
                              cancelEditService
                            }
                            className="rounded-xl border-2 border-gray-200 px-5 py-2.5 text-sm font-semibold hover:bg-gray-50"
                          >
                            Cancel
                          </button>

                          <button
                            onClick={() =>
                              deleteService(
                                service.id
                              )
                            }
                            className="rounded-xl border-2 border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Delete Service
                          </button>

                        </div>

                      </div>

                    ) : (

                      <div>

                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

                          <div>

                            <h4 className="text-lg font-bold">
                              Service on{" "}
                              {formatDisplayDate(
                                service.serviceDate
                              )}
                            </h4>
                            {service.editedAt.serviceDate && (
                              <p className="mt-1 text-xs font-semibold text-orange-600">
                                Service date edited on{" "}
                                {formatDisplayDate(
                                  service.editedAt.serviceDate
                                )}
                              </p>
                            )}
                            <p className="mt-1 text-sm text-gray-500">
                              {service.registrationNumber}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-emerald-700">
                              Added on:{" "}
                              {formatDisplayDateTime(
                                service.createdAt
                              )}
                            </p>
                                                        <p className="mt-1 text-xs font-semibold text-indigo-700">
                              Recorded by:{" "}
                              {service.createdByEmail &&
                              service.createdByEmail ===
                                currentUser.email?.toLowerCase()
                                ? "You"
                                : maskEmail(
                                    service.createdByEmail
                                  ) || "Unknown owner"}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">

                            {isTransferPending ? (

                              <span className="rounded-xl bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-700">
                                Transfer Pending — Service Locked
                              </span>

                            ) : service.isPreviousOwnerService ? (

                              <span className="rounded-xl bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-700">
                                Previous Owner Service
                              </span>

                            ) : (

                              <>
                                <button
                                  onClick={() =>
                                    startEditService(
                                      service
                                    )
                                  }
                                  className="rounded-xl border-2 border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
                                >
                                  Edit Service
                                </button>

                                <button
                                  onClick={() =>
                                    deleteService(
                                      service.id
                                    )
                                  }
                                  className="rounded-xl border-2 border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                                >
                                  Delete Service
                                </button>
                              </>

                            )}

                          </div>

                        </div>

                          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                          <div className="rounded-xl bg-gray-50 p-4">

                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                              Next Service
                            </p>

                            <p className="mt-1 font-semibold">
                              {formatDisplayDate(
                                service.nextServiceDate
                              )}
                            </p>

                            {service.editedAt.nextServiceDate && (
                              <p className="mt-1 text-xs font-semibold text-orange-600">
                                Edited on{" "}
                                {formatDisplayDate(
                                  service.editedAt.nextServiceDate
                                )}
                              </p>
                            )}

                          </div>

                          <div className="rounded-xl bg-gray-50 p-4">

                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                              Amount Paid
                            </p>

                            <p className="mt-1 font-semibold">
                              ₹
                              {service.amountPaid.toLocaleString(
                                "en-IN"
                              )}
                            </p>

                            {service.editedAt.amountPaid && (
                              <p className="mt-1 text-xs font-semibold text-orange-600">
                                Edited on{" "}
                                {formatDisplayDate(
                                  service.editedAt.amountPaid
                                )}
                              </p>
                            )}

                          </div>

                          <div className="rounded-xl bg-gray-50 p-4">

                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                              Workshop
                            </p>

                            <p className="mt-1 font-semibold">
                              {service.workshop ||
                                "Not provided"}
                            </p>

                            {service.editedAt.workshop && (
                              <p className="mt-1 text-xs font-semibold text-orange-600">
                                Edited on{" "}
                                {formatDisplayDate(
                                  service.editedAt.workshop
                                )}
                              </p>
                            )}

                          </div>

                          <div className="rounded-xl bg-gray-50 p-4">

                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                              Service #
                            </p>

                            <p className="mt-1 font-semibold">
                              {
                                serviceHistory.length -
                                serviceHistory.findIndex(
                                  (item) =>
                                    item.id ===
                                    service.id
                                )
                              }
                            </p>

                          </div>

                        </div>

{(service.notes || service.editedAt.notes) && (
                          <div className="mt-5 rounded-xl bg-gray-50 p-4">

                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                              Notes
                            </p>

                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                              {service.notes}
                            </p>

                            {service.editedAt.notes && (
                              <p className="mt-2 text-xs font-semibold text-orange-600">
                                Edited on{" "}
                                {formatDisplayDate(
                                  service.editedAt.notes
                                )}
                              </p>
                            )}

                          </div>

                        )}
                                              </div>

                    )}

                  </div>

                )
              )}

            </div>

          )}

        </div>

      </>
    )}

  </div>
</section>

        </>
      )}

      {/* =======================================
          FOOTER
      ======================================= */}

      <footer className="border-t bg-white">

        <div className="mx-auto max-w-6xl px-6 py-10 text-center">

          <p className="font-semibold">
            Bike Service Reminder
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Keep your vehicles maintained and your service
            records organized.
          </p>

        </div>

      </footer>

    </main>
  );
}
