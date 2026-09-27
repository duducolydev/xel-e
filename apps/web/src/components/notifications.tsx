import type { NotificationEleve } from "@xel-e/shared";
import { BoutonNotificationsLues } from "./progression";

function date(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Africa/Dakar" });
}

export function PanneauNotifications({ notifications, nonLues }: { notifications: NotificationEleve[]; nonLues: number }) {
  if (notifications.length === 0) return null;
  return (
    <section aria-labelledby="titre-notifications" className="rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titre-notifications" className="font-semibold text-gray-900">
          Notifications
          {nonLues > 0 ? (
            <span className="ml-2 rounded-full bg-brand-dark px-2 py-0.5 text-xs text-white">
              {nonLues} nouvelle{nonLues > 1 ? "s" : ""}
            </span>
          ) : null}
        </h2>
        {nonLues > 0 ? <BoutonNotificationsLues /> : null}
      </div>
      <ul className="mt-3 space-y-2">
        {notifications.map((notification) => (
          <li
            key={notification.id}
            className={`rounded-lg px-3 py-2 text-sm ${notification.lu ? "text-gray-600" : "bg-brand-wash font-medium text-gray-900"}`}
          >
            {notification.contenu}
            <span className="ml-2 text-xs text-gray-500">{date(notification.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
