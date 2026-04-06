import Link from "next/link";

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  crumbs: Crumb[];
  title: string;
  description?: string;
}

export function ReportPageHeader({ crumbs, title, description }: Props) {
  return (
    <div className="mb-6">
      <p className="text-zinc-500 text-sm flex flex-wrap gap-1 items-center">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-zinc-300 transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-zinc-300">{crumb.label}</span>
            )}
          </span>
        ))}
      </p>
      <h1 className="text-2xl font-bold text-white mt-2">{title}</h1>
      {description && (
        <p className="text-zinc-400 text-sm mt-1">{description}</p>
      )}
    </div>
  );
}
