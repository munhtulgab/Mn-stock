"use client";

import { useId, useState } from "react";
import Avatar from "./Avatar";
import AccountForm from "./AccountForm";
import { EditIcon } from "./icons";
import Glyph from "./ui/Glyph";

/**
 * Who is signed in, and the form to change it opening underneath.
 *
 * Засах used to take the reader somewhere else — to Тохиргоо, then for an
 * hour to a page of its own — and back again afterwards, for what is a
 * change of name or picture. It drops the form down under the card now and
 * folds it away once it has saved, so the reader never leaves Профайл.
 *
 * Kept mounted while closed, with `inert`, rather than unmounted: that is
 * what lets it slide rather than appear, and `inert` keeps its fields out of
 * reach of the keyboard and of screen readers while it is folded away.
 */
export default function ProfileCard({
  username,
  fullName,
  email,
  phone,
  avatar,
}: {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  avatar: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const displayName = fullName || username;

  return (
    <div>
      <div className="flex items-center gap-4 rounded-3xl border border-app-border bg-app-card p-5">
        <Avatar src={avatar} name={displayName} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-app-text">{displayName}</div>
          <div className="truncate text-sm text-app-muted">@{username}</div>
        </div>
        {/* A word and a chevron. A bare pencil was once the only way to the
            one Хадгалах button on this side of the app and nobody found it;
            the word says what it does and the chevron that it opens here. */}
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-controls={panel}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-[transform,background-color,color] active:scale-95 ${
            open ? "bg-brand-light text-brand" : "bg-app-elevated text-app-text"
          }`}
        >
          <EditIcon /> Засах
          <Glyph
            name="chevron"
            size={14}
            className={`transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Rows from 0fr to 1fr is the height animation that needs no height:
          the form's own size is whatever it is, and the grid eases to it. */}
      <div
        id={panel}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="pt-3">
            <AccountForm
              username={username}
              fullName={fullName}
              email={email}
              phone={phone}
              avatar={avatar}
              onSaved={() => setOpen(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
