import Image from "next/image";

/** Square item icon (architecture §9). */
export function ItemIcon({
  name,
  iconUrl,
  size = 32,
  alt = name,
}: {
  name: string;
  iconUrl: string | null;
  size?: number;
  /** Pass "" when a visible label already names the item. */
  alt?: string;
}) {
  return (
    <span
      className="block shrink-0 overflow-hidden rounded border border-line bg-raised"
      style={{ width: size, height: size }}
    >
      {iconUrl ? (
        <Image src={iconUrl} alt={alt} width={size} height={size} className="size-full object-cover" />
      ) : (
        <span
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          className="grid size-full place-items-center text-[9px] font-semibold text-muted"
        >
          {name.slice(0, 2)}
        </span>
      )}
    </span>
  );
}
