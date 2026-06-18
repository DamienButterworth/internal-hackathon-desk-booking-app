"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shield, ArrowRight } from "lucide-react";
import clsx from "clsx";
import { switchBooker } from "@/server/actions";

type Booker = {
  id: string;
  name: string;
  team: string;
  role: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
}

export function ProfilePicker({
  bookers,
  currentId,
}: {
  bookers: Booker[];
  currentId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const users = bookers.filter((b) => b.role === "USER");
  const admin = bookers.find((b) => b.role === "ADMIN");

  function choose(id: string, dest: string) {
    setBusyId(id);
    startTransition(async () => {
      await switchBooker(id);
      router.push(dest);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="label mb-3">Book as a colleague</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {users.map((b) => (
            <button
              key={b.id}
              onClick={() => choose(b.id, "/book")}
              disabled={pending}
              className={clsx(
                "card group flex flex-col items-start gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                currentId === b.id && "ring-2 ring-brand",
                busyId === b.id && "opacity-60",
              )}
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-sm font-semibold text-white">
                {initials(b.name)}
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {b.name}
                </span>
                <span className="block text-xs text-muted">{b.team}</span>
              </span>
              <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-brand opacity-0 transition group-hover:opacity-100">
                Continue <ArrowRight size={13} />
              </span>
            </button>
          ))}
        </div>
      </section>

      {admin && (
        <section>
          <h2 className="label mb-3">Manage the office</h2>
          <button
            onClick={() => choose(admin.id, "/admin")}
            disabled={pending}
            className={clsx(
              "card flex w-full items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md sm:w-auto",
              currentId === admin.id && "ring-2 ring-ink",
              busyId === admin.id && "opacity-60",
            )}
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-white">
              <Shield size={20} />
            </span>
            <span className="pr-6">
              <span className="block text-sm font-semibold text-ink">
                {admin.name} · Admin
              </span>
              <span className="block text-xs text-muted">
                Edit the floor plan, zones &amp; auto-release rules
              </span>
            </span>
            <ArrowRight size={16} className="ml-auto text-ink" />
          </button>
        </section>
      )}
    </div>
  );
}
