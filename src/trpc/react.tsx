"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  httpBatchStreamLink,
  loggerLink,
  TRPCClientError,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import SuperJSON from "superjson";

import { type AppRouter } from "~/server/api/root";
import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  }
  // Browser: use singleton pattern to keep the same query client
  clientQueryClientSingleton ??= createQueryClient();

  return clientQueryClientSingleton;
};

export const api = createTRPCReact<AppRouter>();

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

const CLIENT_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_SUPPORTED",
  "TIMEOUT",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
]);

function isExpectedClientError(result: unknown): boolean {
  const err =
    result instanceof TRPCClientError
      ? result
      : result &&
          typeof result === "object" &&
          "result" in result &&
          result.result &&
          typeof result.result === "object" &&
          "error" in result.result &&
          result.result.error instanceof TRPCClientError
        ? result.result.error
        : null;

  if (!err) return false;

  const data = err.data as
    | { httpStatus?: unknown; code?: unknown }
    | undefined;
  if (
    typeof data?.httpStatus === "number" &&
    data.httpStatus >= 400 &&
    data.httpStatus < 500
  ) {
    return true;
  }
  return typeof data?.code === "string" && CLIENT_ERROR_CODES.has(data.code);
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) => {
            if (op.direction === "down" && isExpectedClientError(op.result)) {
              return false;
            }
            return (
              process.env.NODE_ENV === "development" ||
              (op.direction === "down" && op.result instanceof Error)
            );
          },
        }),
        httpBatchStreamLink({
          transformer: SuperJSON,
          url: getBaseUrl() + "/api/trpc",
          headers: () => {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");
            return headers;
          },
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
