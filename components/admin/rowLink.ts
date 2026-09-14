/**
 * The classes that make one link in a table row cover the whole row.
 *
 * Every list on this side draws its rows with `rowlink`, which lights the
 * row up under the pointer — so the whole row says it can be clicked. Only
 * the cell holding the link could be: on the users table that was 238 pixels
 * of an 1,190-pixel row, and a click on the orders count or the balance did
 * nothing at all. That is the whole of "clicking a user does not open them".
 *
 * A stretched link rather than a click handler on the row. It is still one
 * real anchor, so it opens in a new tab, shows its address in the status bar,
 * and the keyboard reaches it the way it always did — none of which survives
 * being turned into an `onClick`, and the last of which would have made the
 * row unreachable without a pointer.
 *
 * The row needs `relative` for the overlay to resolve against it, and any
 * other control in the row needs to sit above it — see `ROW_LINK_ABOVE`.
 */
export const ROW_LINK = "after:absolute after:inset-0 after:content-['']";

/**
 * For the second link in a row, which the overlay would otherwise bury.
 *
 * The orders table carries two: the account, which is the row's own
 * destination, and the ticker, which filters the list in place. The ticker
 * has to stay clickable through the sheet stretched over it.
 */
export const ROW_LINK_ABOVE = "relative z-10";
