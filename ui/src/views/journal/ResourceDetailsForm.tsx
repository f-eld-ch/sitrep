import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "components/ui";
import { useRenameResource, useUpdateContact, useUpdatePersonnelCount } from "api";
import type { ContactMedium, Resource } from "api";

const inputClass =
  "w-full rounded border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:outline-none";

/**
 * Collapsed "Correct details" section of a resource's edit panel.
 *
 * Name, contact and headcount rarely change, so they stay out of the way of the state and task
 * actions above and are saved explicitly (one button) instead of on blur: a half-typed name must
 * not end up as an event. Only the fields that changed are sent.
 */
export function ResourceDetailsForm({
  resource: r,
  messageTime,
  showContact = true,
}: {
  resource: Resource;
  messageTime: Date;
  /** The contact is hidden where the panel already offers it inline (status AUFGEBOTEN). */
  showContact?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rename, renameState] = useRenameResource();
  const [updateContact, contactState] = useUpdateContact();
  const [updateCount, countState] = useUpdatePersonnelCount();

  const [name, setName] = useState(r.name);
  const [medium, setMedium] = useState<ContactMedium>(r.contact?.medium ?? "PHONE");
  const [detail, setDetail] = useState(r.contact?.detail ?? "");
  const [count, setCount] = useState(String(r.personnelCount));
  const [attempted, setAttempted] = useState(false);

  const nameInvalid = !name.trim();
  const countNumber = Number(count);
  const countInvalid = !Number.isInteger(countNumber) || countNumber < 1;

  const nameChanged = name.trim() !== r.name;
  const contactChanged =
    showContact &&
    detail.trim() !== "" &&
    (detail.trim() !== (r.contact?.detail ?? "") || medium !== (r.contact?.medium ?? "PHONE"));
  const countChanged = !countInvalid && countNumber !== r.personnelCount;

  const busy = renameState.loading || contactState.loading || countState.loading;
  const error = renameState.error ?? contactState.error ?? countState.error;

  const reset = () => {
    setName(r.name);
    setMedium(r.contact?.medium ?? "PHONE");
    setDetail(r.contact?.detail ?? "");
    setCount(String(r.personnelCount));
    setAttempted(false);
  };

  const toggle = () => {
    if (open) reset();
    setOpen((v) => !v);
  };

  const save = async () => {
    setAttempted(true);
    if (nameInvalid || countInvalid) return;

    try {
      if (nameChanged) await rename({ id: r.id, name: name.trim(), at: messageTime });
      if (contactChanged)
        await updateContact({ id: r.id, medium, detail: detail.trim(), at: messageTime });
      if (countChanged) await updateCount({ id: r.id, count: countNumber, at: messageTime });
    } catch {
      // Surfaced through the command state below; keep the section open for a retry.
      return;
    }

    setAttempted(false);
    setOpen(false);
  };

  return (
    <div className="border-t border-border/60 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="text-xs text-fg-muted underline-offset-2 hover:text-primary hover:underline"
      >
        {t("resource.editDetails")}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <label className="block">
            <span className="mb-0.5 block text-xs font-medium text-fg-muted">
              {t("resource.fields.name")}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={clsx(
                inputClass,
                attempted && nameInvalid
                  ? "border-danger focus:ring-danger"
                  : "border-border focus:ring-primary",
              )}
            />
            {attempted && nameInvalid && (
              <span className="mt-0.5 block text-xs text-danger">
                {t("resource.validation.nameRequired")}
              </span>
            )}
          </label>

          {showContact && (
            <div>
              <span className="mb-0.5 block text-xs font-medium text-fg-muted">
                {t("resource.fields.contact")}
              </span>
              <div className="flex gap-2">
                <select
                  aria-label={t("resource.fields.contact")}
                  value={medium}
                  onChange={(e) => setMedium(e.target.value as ContactMedium)}
                  className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="PHONE">{t("medium.PHONE")}</option>
                  <option value="RADIO">{t("medium.RADIO")}</option>
                  <option value="OTHER">{t("medium.OTHER")}</option>
                </select>
                <input
                  type="text"
                  aria-label={t("resource.fields.contact")}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-0.5 block text-xs font-medium text-fg-muted">
              {t("resource.fields.personnelCount")}
            </span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={clsx(
                inputClass,
                attempted && countInvalid
                  ? "border-danger focus:ring-danger"
                  : "border-border focus:ring-primary",
              )}
            />
            {attempted && countInvalid && (
              <span className="mt-0.5 block text-xs text-danger">
                {t("resource.validation.personnelCountMin")}
              </span>
            )}
          </label>

          {error && <p className="text-xs text-danger">{t(`errors.${error.code}`)}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={busy || (!nameChanged && !contactChanged && !countChanged)}
              onClick={() => void save()}
            >
              {t("save")}
            </Button>
            <Button type="button" size="sm" variant="light" disabled={busy} onClick={toggle}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
