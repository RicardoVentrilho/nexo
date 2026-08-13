"use client";

import { LogIn, Send } from "lucide-react";
import { useState } from "react";
import type { Card as LedgerCard, TurnResponse } from "@nexo/contracts/api";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Notices } from "./Notices";
import { Prose } from "./Prose";
import { PartCard } from "../result-cards/PartCard";
import { VehicleCandidateCard } from "../result-cards/VehicleCandidateCard";
import { AssemblyCard } from "../result-cards/AssemblyCard";
import { CrossReferenceCard } from "../result-cards/CrossReferenceCard";
import { ManufacturerCard } from "../result-cards/ManufacturerCard";
import { VehicleModelCard } from "../result-cards/VehicleModelCard";
import { GroupCard } from "../result-cards/GroupCard";

interface TranscriptItem {
  user: string;
  response: TurnResponse;
}

export function Chat() {
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [pending, setPending] = useState(false);

  async function submit(nextMessage = message) {
    if (!nextMessage.trim()) return;
    setPending(true);
    try {
      const response = await fetch("/api/bff/conversations/local/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: nextMessage })
      });
      const body = response.ok ? ((await response.json()) as TurnResponse) : turnErrorResponse(await response.json().catch(() => undefined));
      setItems((current) => [...current, { user: nextMessage, response: body }]);
      setMessage("");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 py-6">
      <header className="flex items-start justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Nexo</h1>
          <p className="text-sm text-muted-foreground">Catalogo de pecas autenticado</p>
        </div>
        <Button onClick={() => window.location.assign("/auth/login")} type="button" variant="outline">
          <LogIn className="mr-2 h-4 w-4" />
          Entrar
        </Button>
      </header>

      <section className="flex-1 space-y-5">
        {items.map((item, index) => (
          <article className="space-y-3" key={`${item.response.turnId}-${index}`}>
            <div className="rounded-md bg-muted p-3 text-sm">{item.user}</div>
            {isAuthRequired(item.response) ? (
              <AuthRequiredPanel />
            ) : (
              <>
                <Prose text={item.response.prose} />
                <Notices notices={item.response.notices} />
                <div className="grid gap-3 md:grid-cols-2">
                  {item.response.cards.map((card) => renderCard(card, {
                    onVehicleSelect: (id) => submit(`usar aplicacao ${id}`),
                    onManufacturerSelect: (id) => submit(`usar fabricante ${id}`),
                    onModelSelect: (manufacturerId, description) => submit(`usar modelo ${manufacturerId} ${description}`)
                  }))}
                </div>
              </>
            )}
          </article>
        ))}
      </section>

      <form
        className="flex gap-2 border-t pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Descreva o veiculo e a peca" />
        <Button aria-label="Enviar" disabled={pending} size="icon" type="submit">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </main>
  );
}

function AuthRequiredPanel() {
  return (
    <Alert className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Entre para consultar o catalogo</p>
        <p className="text-muted-foreground">A conversa usa dados protegidos e precisa de uma sessao autenticada.</p>
      </div>
      <Button className="w-full sm:w-auto" onClick={() => window.location.assign("/auth/login")} type="button">
        <LogIn className="mr-2 h-4 w-4" />
        Entrar
      </Button>
    </Alert>
  );
}

function isAuthRequired(response: TurnResponse) {
  return response.notices.some((notice) => notice.code === "unauthenticated");
}

interface CardActions {
  onVehicleSelect: (id: string) => void;
  onManufacturerSelect: (id: string) => void;
  onModelSelect: (manufacturerId: string, description: string) => void;
}

function renderCard(card: LedgerCard, actions: CardActions) {
  if (card.kind === "part") {
    return (
      <div id={`card-${card.cardId}`} key={card.cardId}>
        <PartCard part={card.payload as never} />
      </div>
    );
  }
  if (card.kind === "vehicle_candidate") {
    return (
      <div id={`card-${card.cardId}`} key={card.cardId}>
        <VehicleCandidateCard candidate={card.payload as never} onSelect={actions.onVehicleSelect} />
      </div>
    );
  }
  if (card.kind === "assembly") {
    return (
      <div id={`card-${card.cardId}`} key={card.cardId}>
        <AssemblyCard result={card.payload as never} />
      </div>
    );
  }
  if (card.kind === "cross_reference") {
    return (
      <div id={`card-${card.cardId}`} key={card.cardId}>
        <CrossReferenceCard result={card.payload as never} />
      </div>
    );
  }
  if (card.kind === "manufacturer") {
    return (
      <div id={`card-${card.cardId}`} key={card.cardId}>
        <ManufacturerCard manufacturer={card.payload as never} onSelect={actions.onManufacturerSelect} />
      </div>
    );
  }
  if (card.kind === "vehicle_model") {
    return (
      <div id={`card-${card.cardId}`} key={card.cardId}>
        <VehicleModelCard model={card.payload as never} onSelect={actions.onModelSelect} />
      </div>
    );
  }
  if (card.kind === "group") {
    return (
      <div id={`card-${card.cardId}`} key={card.cardId}>
        <GroupCard group={card.payload as never} />
      </div>
    );
  }
  return null;
}

function turnErrorResponse(payload: unknown): TurnResponse {
  const code =
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error?: { code?: unknown } }).error?.code === "string"
      ? (payload as { error: { code: string } }).error.code
      : undefined;
  const message =
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error?: { message?: unknown } }).error?.message === "string"
      ? (payload as { error: { message: string } }).error.message
      : "Nao foi possivel processar a mensagem.";

  return {
    turnId: crypto.randomUUID(),
    prose: message,
    cards: [],
    notices: [{ code: code === "unauthenticated" ? "unauthenticated" : "catalog_unavailable", message }],
    state: "released"
  };
}
