"use client";

import { useRouter } from "next/navigation";

/**
 * A table row that opens what it is about.
 *
 * Every list on this side draws its rows with `rowlink`, which highlights the
 * whole row under the pointer — so all of it says it can be clicked, while
 * only the cell holding the anchor could be: 238 pixels of an 1,190-pixel row
 * on the users table. A click on the orders count or the balance went
 * nowhere, and nothing on screen said which fifth was the live one.
 *
 * This was first done in CSS, with the anchor's `::after` stretched over a
 * `position: relative` row. That is the tidier mechanism and it is not a safe
 * one: positioning a `<tr>` is not honoured everywhere, and where it is not
 * the sheet does not stay in the row — it climbs to the nearest positioned
 * ancestor, and every row's sheet ends up covering the page. The last row's
 * wins, so the administration bar and every other row alike began opening one
 * arbitrary account. Reported from production as "clicking Хэрэглэгч opens
 * munkhtulga", which is exactly that.
 *
 * So the row is handled here instead, where no layout assumption is involved.
 * The anchor in the name cell stays exactly as it was: the keyboard reaches
 * it, it opens in a new tab, and it shows its address in the status bar. This
 * only adds the rest of the row's area to it.
 */
export default function RowLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      className={className}
      onClick={(event) => {
        // Anything in the row that is already a control speaks for itself —
        // the orders table's ticker filters the list rather than opening
        // whoever traded it.
        if ((event.target as HTMLElement).closest("a, button, input, select, label")) {
          return;
        }
        // A modified click is a request for a new tab or a new window, and
        // this is not a link the browser can honour that on. Left it alone
        // rather than swallowing it into a same-tab navigation.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Reading a balance often means selecting it; finishing the drag
        // inside the row should not then navigate away from it.
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
