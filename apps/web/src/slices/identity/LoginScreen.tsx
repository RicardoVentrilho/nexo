"use client";

import * as React from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Separator } from "../../components/ui/separator";

export function LoginScreen() {
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[1.1fr_1fr]">
      <section className="flex min-h-[42vh] flex-col justify-between gap-12 border-b bg-muted px-6 py-8 sm:px-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">N</div>
          <div className="text-lg font-semibold">Nexo</div>
        </div>

        <div className="flex max-w-md flex-col gap-3">
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-[2rem]">
            Inteligencia de mercado para pecas diesel.
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Converse com o agente Nexo. Ele faz as perguntas certas e localiza a peca direto com o fabricante.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">(c) 2026 Nexo</p>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
        <Card className="w-full max-w-[380px] rounded-lg">
          <CardHeader className="flex flex-col gap-1 p-7 pb-0">
            <CardTitle className="text-xl">Entrar no Nexo</CardTitle>
            <CardDescription>Acesse para comecar a conversar com o agente.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-7">
            {isHydrated ? <LoginActions /> : <div aria-hidden="true" className="h-[250px]" />}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function LoginActions() {
  return (
    <>
      <form action="/auth/start" className="flex flex-col gap-4" method="get">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="identifier">Usuario ou e-mail</FieldLabel>
            <Input id="identifier" placeholder="usuario ou voce@empresa.com" type="text" />
          </Field>

          <Field>
            <div className="flex items-center justify-between gap-4">
              <FieldLabel htmlFor="password">Senha</FieldLabel>
              <Link className="text-xs font-medium text-primary underline underline-offset-4 hover:opacity-85" href="/auth/start">
                Esqueceu a senha?
              </Link>
            </div>
            <Input id="password" placeholder="********" type="password" />
          </Field>
        </FieldGroup>

        <Button className="w-full" type="submit">
          Entrar
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="min-w-0 flex-1" />
        <span>OU</span>
        <Separator className="min-w-0 flex-1" />
      </div>

      <form action="/auth/start" method="get">
        <Button className="w-full" type="submit" variant="outline">
          <GoogleIcon data-icon="inline-start" />
          Continuar com Google
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Nao tem conta?{" "}
        <Link className="font-medium text-primary underline underline-offset-4 hover:opacity-85" href="mailto:contato@nexo.local">
          Fale com o time
        </Link>
      </p>
    </>
  );
}

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" {...props}>
      <path d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.6-.2-3.1-.4-4.5z" fill="#FFC107" />
      <path d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 7 29.6 5 24 5c-8 0-14.8 4.6-17.7 9.7z" fill="#FF3D00" />
      <path d="M24 45.5c5.4 0 10.3-1.8 14-5l-6.5-5.3c-2 1.4-4.6 2.3-7.5 2.3-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9 40.9 15.9 45.5 24 45.5z" fill="#4CAF50" />
      <path d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.3C41.7 36.2 44.5 31.1 44.5 25c0-1.6-.2-3.1-.9-4.5z" fill="#1976D2" />
    </svg>
  );
}
