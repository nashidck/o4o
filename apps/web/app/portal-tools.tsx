"use client";
import { useEffect, useState } from "react";
import { Save, Users } from "lucide-react";
type Row = Record<string, any>;
type Api = (path: string, method?: string, body?: unknown) => Promise<any>;
type Action = (fn: () => Promise<any>, message: string) => Promise<boolean>;
export function CampaignEdit({
  campaign,
  api,
  action,
}: {
  campaign: Row;
  api: Api;
  action: Action;
}) {
  return (
    <details className="campaign-editor">
      <summary>Edit campaign</summary>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action(
            () =>
              api(`retailer/campaigns/${campaign.id}`, "PATCH", {
                title: f.get("title"),
                description: f.get("description"),
                version: campaign.version,
              }),
            ["PUBLISHED", "SCHEDULED"].includes(campaign.status)
              ? "Revision submitted. Published content stays unchanged until approved."
              : "Draft updated",
          );
        }}
      >
        <label>
          Campaign title
          <input
            name="title"
            defaultValue={campaign.title}
            required
            maxLength={200}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={campaign.description}
            maxLength={10000}
          />
        </label>
        <button className="outline-button">
          Save changes
          <Save size={14} />
        </button>
      </form>
      <button
        className="text-button"
        onClick={() =>
          action(
            () =>
              api(`retailer/campaigns/${campaign.id}/withdraw`, "POST", {
                version: campaign.version,
              }),
            "Campaign withdrawn",
          )
        }
      >
        Withdraw campaign
      </button>
    </details>
  );
}
export function CampaignRevisions({
  campaign,
  api,
  action,
  refresh,
}: {
  campaign: Row;
  api: Api;
  action: Action;
  refresh: () => void;
}) {
  return (
    <>
      {campaign.revisions
        ?.filter((r: Row) => r.payload.status === "SUBMITTED")
        .map((r: Row) => (
          <details className="content-editor" key={r.id}>
            <summary>Review submitted revision</summary>
            <h4>{r.payload.title}</h4>
            <p>{r.payload.description}</p>
            <button
              className="outline-button"
              onClick={() =>
                action(
                  () =>
                    api(
                      `admin/campaigns/${campaign.id}/revisions/${r.id}`,
                      "POST",
                      { decision: "APPROVED" },
                    ),
                  "Revision approved",
                ).then((ok) => {
                  if (ok) refresh();
                })
              }
            >
              Approve revision
            </button>
          </details>
        ))}
      {["SUBMITTED", "UNDER_REVIEW"].includes(campaign.status) && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason");
            action(
              () =>
                api(`admin/campaigns/${campaign.id}/moderate`, "POST", {
                  decision: "REJECTED",
                  reason,
                  version: campaign.version,
                }),
              "Campaign rejected with reason",
            ).then((ok) => {
              if (ok) refresh();
            });
          }}
        >
          <input name="reason" placeholder="Rejection reason" required />
          <button className="outline-button">Reject campaign</button>
        </form>
      )}
    </>
  );
}
export function RetailerTeam({
  retailer,
  api,
  action,
}: {
  retailer: Row;
  api: Api;
  action: Action;
}) {
  const [events, setEvents] = useState<Row[]>([]);
  useEffect(() => {
    api(`retailer/${retailer.id}/analytics`)
      .then(setEvents)
      .catch(() => {});
  }, [retailer.id]);
  return (
    <>
      <form
        className="panel stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const email = new FormData(e.currentTarget).get("email");
          action(
            () => api(`retailer/${retailer.id}/members`, "POST", { email }),
            "Employee added with editor access",
          );
        }}
      >
        <h3>Your team</h3>
        <p>
          Business owners can add employees who already have an O4O account.
        </p>
        <label>
          Employee email
          <input name="email" type="email" required />
        </label>
        <button className="outline-button">
          Add employee
          <Users size={15} />
        </button>
      </form>
      <div className="panel">
        <h3>Last 30 days</h3>
        {events.length ? (
          events.map((e) => (
            <p key={e.type}>
              {e.type.toLowerCase().replaceAll("_", " ")}:{" "}
              <strong>{e._count}</strong>
            </p>
          ))
        ) : (
          <p>No measured engagement yet.</p>
        )}
        <small>
          Event counts are measured interactions, not unique people.
        </small>
      </div>
    </>
  );
}
export function ItemEdit({
  item,
  list,
  api,
  action,
}: {
  item: Row;
  list: Row;
  api: Api;
  action: Action;
}) {
  return (
    <details className="item-editor">
      <summary>Quantity & note</summary>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action(
            () =>
              api(`lists/${list.id}/items/${item.id}`, "PATCH", {
                quantity: Number(f.get("quantity")),
                note: f.get("note"),
                version: list.version,
              }),
            "Item updated",
          );
        }}
      >
        <input
          name="quantity"
          aria-label="Item quantity"
          type="number"
          min="0.001"
          max="10000"
          step="0.001"
          defaultValue={item.quantity}
          required
        />
        <input
          name="note"
          aria-label="Item note"
          placeholder="Item note"
          defaultValue={item.note}
        />
        <button className="outline-button">
          Save
          <Save size={14} />
        </button>
      </form>
    </details>
  );
}
