"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "./api";

export function useSession() {
  const query = useQuery({ queryKey: ["me"], queryFn: fetchMe, staleTime: 60_000 });
  const permissions = query.data?.user.permissions ?? [];
  return {
    ...query,
    user: query.data?.user,
    can: (permission: string) => permissions.includes(permission),
  };
}
