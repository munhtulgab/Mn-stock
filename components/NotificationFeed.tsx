"use client";

import { useState } from "react";
import Link from "next/link";
import NotificationList from "./NotificationList";
import { BellIcon } from "./icons";
import type { FeedNotification } from "@/lib/notifications";

export interface FeedGroup {
  day: string;
  heading: string;
  items: FeedNotification[];
}

/**
 * The whole feed: the count at the top, the days under it, and the state
 * that decides both.
 *
 * The rows used to keep that state a day at a time, inside each day's list.
 * It worked for the rows and for nothing else: the line above them is
 * rendered on the server from the feed as it stood when the page was built,
 * so clearing four alerts left ninety-six rows' worth of counting over
 * ninety-two rows — "96 шинэ · нийт 96" with the ninety-sixth already gone.
 * One list of what has been cleared and what has been opened, held above
 * everything that is counting it, is what keeps the two agreeing.
 */
export default function NotificationFeed({ groups }: { groups: FeedGroup[] }) {
  // Rows leave the list the moment they are swiped away rather than on the
  // server's reply: the reader has already watched it go.
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [read, setRead] = useState<string[]>([]);

  const days = groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((n) => !dismissed.includes(n.id))
        .map((n) => ({ ...n, isNew: n.isNew && !read.includes(n.id) })),
    }))
    // A day whose every alert has been cleared takes its heading with it.
    .filter((group) => group.items.length > 0);

  const total = days.reduce((n, group) => n + group.items.length, 0);
  const unread = days.reduce(
    (n, group) => n + group.items.filter((item) => item.isNew).length,
    0,
  );

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-app-text">Мэдэгдэл</h1>
        <p className="text-xs text-app-muted mt-0.5">
          {unread > 0
            ? `${unread} шинэ · нийт ${total}`
            : total > 0
              ? `${total} мэдэгдэл`
              : "Дохио өөрчлөгдөхөд энд харагдана"}
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-border p-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-app-elevated text-app-muted flex items-center justify-center">
            <BellIcon />
          </div>
          <p className="text-sm text-app-muted">
            Одоогоор мэдэгдэл алга.
            <br />
            Хувьцааны дохио өөрчлөгдөхөд энд харагдана.
          </p>
          <Link href="/discover" className="inline-block text-sm text-brand font-semibold">
            Зах зээл харах
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map((group) => (
            <section key={group.day}>
              <h2 className="text-xs font-semibold text-app-muted mb-2">
                {group.heading}
              </h2>
              <NotificationList
                items={group.items}
                onOpen={(id) => {
                  setRead((ids) => (ids.includes(id) ? ids : [...ids, id]));
                  send(id, "POST");
                }}
                onDismiss={(id) => {
                  setDismissed((ids) => (ids.includes(id) ? ids : [...ids, id]));
                  send(id, "DELETE");
                }}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function send(id: string, method: "POST" | "DELETE") {
  fetch(`/api/notifications/${id}`, { method, keepalive: true }).catch(() => {
    // Nothing to say to the reader: the row has already moved, and the next
    // page load reads the server's answer either way.
  });
}
