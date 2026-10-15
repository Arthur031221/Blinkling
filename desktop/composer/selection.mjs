import {
  efforts as effortIds,
  permissionModes as permissionIds,
  families,
  familyOf,
  modelLabel,
} from "./models.mjs";
import { createPicker } from "./picker.mjs";
import { strings } from "./strings.mjs";

const pretty = (value) => `${value[0].toUpperCase()}${value.slice(1)}`;

/** The model, effort and permission lists, as the chat card and the mini
 * composer both show them. Every pick carries the other lists as they stand,
 * so one never resets another; `onChoose` gets the whole selection.
 *
 * tr: a translator over composer/strings.mjs. */
export function createSelectionPickers(
  doc,
  {
    tr,
    signal,
    onChoose,
    models = families.map((id) => ({ id, label: modelLabel(id) })),
    efforts,
  },
) {
  const effortLabel = (id) =>
    strings.en[`effort-${id}`] === undefined ? pretty(id) : tr(`effort-${id}`);
  efforts ??= effortIds.map((id) => ({ id, label: effortLabel(id) }));
  const permissions = permissionIds.map((id) => ({
    id,
    label: tr(`permission-${id}`),
  }));
  const current = (change) => ({
    model: model.value,
    effort: effort.value,
    ...(permission.value ? { permissionMode: permission.value } : {}),
    ...change,
  });
  const picker = (label, items, key) =>
    createPicker(doc, {
      label,
      items,
      signal,
      onChoose: (id) => onChoose(current({ [key]: id })),
    });
  const model = picker(tr("model"), models, "model"),
    effort = picker(tr("effort"), efforts, "effort"),
    permission = picker(tr("permission"), permissions, "permissionMode");
  const all = [model, effort, permission];
  return {
    model,
    effort,
    permission,
    all,
    apply(selection) {
      if (!selection) {
        for (const p of all) p.set("");
        return;
      }
      // A confirmed full model id names the family entry already in the list;
      // it refines that row's label instead of adding a second row.
      const family = familyOf(selection.model);
      if (family && model.has(family) && selection.model !== family)
        model.set(family, modelLabel(selection.model));
      else
        model.set(
          selection.model,
          models.find((m) => m.id === selection.model)?.label ??
            modelLabel(selection.model),
        );
      effort.set(
        selection.effort,
        efforts.find((e) => e.id === selection.effort)?.label ??
          effortLabel(selection.effort),
      );
      const mode = selection.permissionMode ?? "default";
      permission.set(mode, tr(`permission-${mode}`));
    },
    setDisabled(disabled) {
      for (const p of all) p.setDisabled(disabled);
    },
    /** Closes the open list, if any: true when one was open. */
    dismiss: () => all.map((p) => p.dismiss()).some(Boolean),
    get isOpen() {
      return all.some((p) => p.isOpen);
    },
  };
}
