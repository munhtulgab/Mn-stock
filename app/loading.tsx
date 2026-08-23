import AppSplash from "@/components/AppSplash";

/**
 * The boundary that covers the start of a visit.
 *
 * Here rather than in `(app)`, and that is the whole point of it: a
 * `loading.tsx` wraps the pages and the *nested* layouts below its own
 * segment, never the layout beside it. `(app)/loading.tsx` therefore begins
 * only once `(app)/layout.tsx` has finished — after the database is open and
 * the session is read — which is exactly the stretch that was showing an
 * empty page. From the root, that layout is a nested one, so it is inside the
 * boundary and the splash covers it.
 *
 * The page skeletons stay where they are. They are shaped like the pages they
 * stand in for and are the better thing to show once the shell is up; this is
 * only for the moment before there is a shell at all.
 */
export default function Loading() {
  return <AppSplash />;
}
