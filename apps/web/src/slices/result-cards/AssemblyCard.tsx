import type { z } from "zod";
import type { GetAssembliesOutput } from "@nexo/contracts/tools";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

type AssemblyResult = z.infer<typeof GetAssembliesOutput>;

export function AssemblyCard({ result }: { result: AssemblyResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conjunto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <PartList title="Kits que contem a peca" items={result.parent_assemblies} />
        <PartList title="Componentes" items={result.components} />
        <PartList title="Mesmo desenho" items={result.same_drawing} />
      </CardContent>
    </Card>
  );
}

function PartList({ title, items }: { title: string; items: AssemblyResult["components"] }) {
  return (
    <section className="space-y-2">
      <h4 className="font-medium">{title}</h4>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Nenhum item registrado.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li className="flex items-center justify-between gap-3" key={`${title}-${item.part_id}-${item.drawing_item ?? ""}`}>
              <span>{item.part_number} - {item.description}</span>
              {item.quantity !== undefined ? <span className="text-muted-foreground">Qtd. {item.quantity}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
