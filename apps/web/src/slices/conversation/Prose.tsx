export function Prose({ text }: { text: string }) {
  const parts = text.split(/(\[\[card:\d+\]\])/g);
  return (
    <p className="leading-7">
      {parts.map((part, index) => {
        const match = part.match(/\[\[card:(\d+)\]\]/);
        if (!match) return <span key={index}>{part}</span>;
        return (
          <a className="font-medium text-primary underline" href={`#card-${match[1]}`} key={index}>
            card {match[1]}
          </a>
        );
      })}
    </p>
  );
}
