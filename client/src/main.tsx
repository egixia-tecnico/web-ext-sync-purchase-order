import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { ClientKeyProvider } from "./contexts/ClientKeyContext";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

/**
 * Fetch interceptor: detecta respuestas HTML del servidor (504, 502, 503, etc.)
 * antes de que tRPC intente parsear el JSON y lance un error críptico.
 */
async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await globalThis.fetch(input, {
    ...(init ?? {}),
    credentials: "include",
  });

  // Si el servidor devuelve HTML (gateway error, proxy timeout, etc.)
  // clonamos la respuesta para leer el body sin consumirlo
  const contentType = response.headers.get('content-type') || '';
  if (
    !response.ok &&
    (contentType.includes('text/html') || response.status === 504 || response.status === 502 || response.status === 503)
  ) {
    const bodyText = await response.clone().text();
    if (bodyText.trimStart().startsWith('<')) {
      const statusMessages: Record<number, string> = {
        504: 'El servidor no respondió a tiempo (504 Gateway Timeout). Intente de nuevo en unos momentos.',
        502: 'Error de comunicación con el servidor (502 Bad Gateway). Intente de nuevo.',
        503: 'El servicio no está disponible temporalmente (503). Intente de nuevo en unos momentos.',
      };
      const msg = statusMessages[response.status] ||
        `El servidor devolvió una página de error (HTTP ${response.status}) en vez de datos JSON. Intente de nuevo.`;
      // Devolver una respuesta JSON válida con el error para que tRPC lo procese correctamente
      return new Response(
        JSON.stringify({ error: { message: msg, code: `HTTP_${response.status}` } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
  }

  return response;
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: safeFetch,
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <ClientKeyProvider>
        <App />
      </ClientKeyProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
