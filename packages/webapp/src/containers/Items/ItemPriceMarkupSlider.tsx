import { InputGroup, Switch } from "@blueprintjs/core";
import { deriveItemMarkup, isAutoPricingEnabled } from "@bigcapital/utils";
import { useSettingsItems } from "@/hooks/query";
import { useFormikContext } from "formik";
import { round } from "lodash";
import { useId, useState } from "react";
import type { ItemFormValues } from "./types";

export function ItemPriceMarkupSlider() {
  const { values, setValues, setFieldTouched } =
    useFormikContext<ItemFormValues>();
  const id = useId();
  const { data: itemSettings } = useSettingsItems();
  const masterEnabled = isAutoPricingEnabled(
    itemSettings?.autoIncreaseSellPrice,
  );
  const cost = Number(values.costPrice);
  const price = Number(values.sellPrice);
  const hasCost = Number.isFinite(cost) && cost > 0;
  const hasPrice =
    values.sellPrice !== "" &&
    values.sellPrice != null &&
    Number.isFinite(price) &&
    price >= 0;
  const effectiveMarkup = deriveItemMarkup(cost, hasPrice ? price : null);
  const markup = hasCost ? (values.markupPercentage ?? effectiveMarkup) : null;
  const disabled = !values.sellable || !values.purchasable || !hasCost;
  const [markupDraft, setMarkupDraft] = useState<string | null>(null);
  const max = 500;
  const sliderMarkup = Math.max(-100, Math.min(max, markup ?? 0));

  const updatePrice = (nextMarkup: number) =>
    setValues((previous) => ({
      ...previous,
      markupPercentage: round(nextMarkup, 8),
      sellPrice: round(cost * (1 + nextMarkup / 100), 2),
      pricingEditedManually: true,
    }));

  return (
    <div style={{ marginTop: 12, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <label htmlFor={id}>Saved markup on cost</label>
        <div style={{ width: 128, maxWidth: "100%", minWidth: 0, flex: "0 1 128px" }}>
          <InputGroup
            fill
            id={id}
            type="number"
            inputMode="decimal"
            aria-label="Markup percentage"
            aria-describedby={`${id}-help`}
            min={-100}
            step="any"
            value={
              markupDraft ?? (markup === null ? "" : String(round(markup, 2)))
            }
            placeholder="—"
            disabled={disabled}
            onFocus={() =>
              setMarkupDraft(markup === null ? "" : String(markup))
            }
            onChange={(event) => {
              const value = event.target.value;
              setMarkupDraft(value);
              if (value !== "" && Number.isFinite(Number(value))) {
                updatePrice(Math.max(-100, Number(value)));
              }
            }}
            onBlur={() => {
              setMarkupDraft(null);
              setFieldTouched("sellPrice", true);
            }}
            rightElement={
              <span
                aria-hidden="true"
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 30,
                  padding: "0 8px",
                  pointerEvents: "none",
                }}
              >
                %
              </span>
            }
          />
        </div>
      </div>
      <input
        id={`${id}-slider`}
        type="range"
        aria-label="Markup percentage"
        aria-describedby={`${id}-help`}
        aria-valuetext={
          markup === null ? "No markup calculated" : `${sliderMarkup}% markup`
        }
        min={-100}
        max={max}
        step="any"
        value={sliderMarkup}
        disabled={disabled}
        onChange={(event) => updatePrice(Number(event.target.value))}
        onKeyDown={(event) => {
          if (
            !["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          const direction = ["ArrowRight", "ArrowUp"].includes(event.key)
            ? 1
            : -1;
          // Each key press must move at least one cent after currency rounding.
          const nextMarkup = sliderMarkup + direction * Math.max(1, 1 / cost);
          updatePrice(Math.max(-100, Math.min(max, nextMarkup)));
        }}
        onBlur={() => setFieldTouched("sellPrice", true)}
        style={{
          display: "block",
          width: "100%",
          margin: "8px 0",
          accentColor: "#137cbd",
          cursor: disabled ? "default" : "pointer",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
        }}
      >
        <span>−100%</span>
        <span>{max}%</span>
      </div>
      <small id={`${id}-help`}>
        {hasCost
          ? "0% markup sells at cost."
          : "Enter a cost price above 0 to calculate markup."}
      </small>
      {markup !== null &&
        effectiveMarkup !== null &&
        Math.abs(markup - effectiveMarkup) > 0.01 && (
          <small style={{ display: "block", marginTop: 4 }}>
            Current markup: {round(effectiveMarkup, 2)}%. The selling price is
            held; the saved percentage is used for future cost increases.
          </small>
        )}
      <div style={{ marginTop: 14 }}>
        <Switch
          checked={values.autoIncreaseSellPrice}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            setValues((previous) => ({
              ...previous,
              autoIncreaseSellPrice: checked,
            }));
          }}
          label="Automatically raise selling price"
          disabled={!values.sellable || !values.purchasable}
          aria-describedby={`${id}-automatic-help`}
        />
        <small id={`${id}-automatic-help`} style={{ display: "block" }}>
          When purchase cost increases, raise the selling price to keep your
          saved markup percentage. Cost decreases won't lower your selling
          price.
        </small>
        {!masterEnabled && (
          <small style={{ display: "block", marginTop: 4 }}>
            Paused by the master switch in Settings &gt; Items. Your item
            preference is saved.
          </small>
        )}
      </div>
    </div>
  );
}
