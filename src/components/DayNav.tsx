import Link from "next/link";

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * "← Previous day" and "Next day →" links between daily rounds, shown once a
 * round is finished. Each is left out where there's no round: before the
 * game's first round, or after today.
 */
export default function DayNav({
  path,
  date,
  today,
  firstDate,
  className,
}: {
  path: string;
  date: string;
  today: string;
  firstDate: string;
  className: string;
}) {
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const href = (d: string) => (d === today ? path : `${path}?date=${d}`);
  return (
    <>
      {prev >= firstDate && (
        <Link href={href(prev)} className={className}>
          ← Previous day
        </Link>
      )}
      {next <= today && (
        <Link href={href(next)} className={className}>
          Next day →
        </Link>
      )}
    </>
  );
}
