import { ControlGroup } from "@blueprintjs/core";
import {
  deriveItemMarkup,
  getItemPricingUpdate,
  isAutoPricingEnabled,
} from "@bigcapital/utils";
import { useFormikContext, ErrorMessage } from "formik";
import React from "react";
import intl from "react-intl-universal";
import { useItemFormContext } from "./ItemFormProvider";
import { ItemFormSectionTitle } from "./ItemFormSectionTitle";
import {
  costPriceFieldShouldUpdate,
  costAccountFieldShouldUpdate,
  purchaseDescFieldShouldUpdate,
  taxRateFieldShouldUpdate,
} from "./utils";
import type { ItemFormValues } from "./types";
import {
  AccountsSelect,
  FCheckbox,
  FMoneyInputGroup,
  Hint,
  InputPrependText,
  FFormGroup,
  FTextArea,
  Box,
} from "@/components";
import { FormattedMessage as T } from "@/components";
import { TaxRatesSelect } from "@/components/TaxRates/TaxRatesSelect";
import { Features } from "@/constants";
import { ACCOUNT_PARENT_TYPE } from "@/constants/accountTypes";
import {
  useCurrentOrganizationBaseCurrency,
  useSettingsItems,
} from "@/hooks/query";
import { useFeatureCan } from "@/hooks/state";

export function ItemFormPurchasingSection() {
  const { accounts, taxRates, isNewMode } = useItemFormContext();
  const { values, setValues, initialValues } =
    useFormikContext<ItemFormValues>();
  const baseCurrency = useCurrentOrganizationBaseCurrency();
  const { data: itemSettings, isLoading: settingsLoading } = useSettingsItems();
  const masterEnabled =
    !settingsLoading &&
    isAutoPricingEnabled(itemSettings?.autoIncreaseSellPrice);

  const { featureCan } = useFeatureCan();
  const isSalesTaxFeatureCan = featureCan(Features.SalesTax);

  return (
    <Box data-section-id="purchasing">
      <ItemFormSectionTitle>Purchasing details</ItemFormSectionTitle>

      {/*------------- Purchasable checkbox ------------- */}
      <FFormGroup
        name={"purchasable"}
        inline={true}
        className={"form-group--purchasable"}
        fastField
      >
        <FCheckbox
          name={"purchasable"}
          inline={true}
          labelElement={<T id={"i_purchase_this_item"} />}
          fastField
        />
      </FFormGroup>

      {/*------------- Cost price ------------- */}
      <FFormGroup
        name={"costPrice"}
        label={<T id={"cost_price"} />}
        inline={true}
        fastField
      >
        <ControlGroup fill>
          <InputPrependText text={baseCurrency} />
          <FMoneyInputGroup
            name={"costPrice"}
            onChange={(value: string | undefined) => {
              setValues((previous) => {
                const costPrice = value ?? "";
                const costChanged =
                  costPrice !== "" &&
                  Number.isFinite(Number(costPrice)) &&
                  Number(costPrice) >= 0 &&
                  (previous.costPrice === "" ||
                    Number(costPrice) !== Number(previous.costPrice));
                const firstCost =
                  isNewMode &&
                  costChanged &&
                  !previous.pricingEditedManually &&
                  (previous.sellPrice === "" ||
                    previous.sellPrice == null ||
                    (Number(previous.costPrice) === 0 &&
                      Number(previous.sellPrice) === 0));
                const useSavedBaseline =
                  !isNewMode && !previous.pricingEditedManually;
                const pricingBaseline = useSavedBaseline
                  ? {
                      ...previous,
                      costPrice: initialValues.costPrice,
                      sellPrice: initialValues.sellPrice,
                    }
                  : previous;
                return {
                  ...previous,
                  costPrice,
                  ...(costChanged && useSavedBaseline
                    ? { sellPrice: initialValues.sellPrice }
                    : {}),
                  ...(firstCost
                    ? {
                        sellPrice: costPrice,
                        markupPercentage: deriveItemMarkup(
                          costPrice,
                          costPrice,
                        ),
                      }
                    : costChanged
                      ? getItemPricingUpdate(
                          pricingBaseline,
                          { costPrice },
                          masterEnabled,
                        )
                      : {}),
                };
              });
            }}
            shouldUpdate={costPriceFieldShouldUpdate}
            purchasable={values.purchasable}
            inputGroupProps={{ medium: true }}
            disabled={!values.purchasable}
            fastField
          />
        </ControlGroup>
      </FFormGroup>

      {/*------------- Cost account ------------- */}
      <FFormGroup
        name={"costAccountId"}
        label={<T id={"account"} />}
        labelInfo={<Hint content={intl.get("item.field.cost_account.hint")} />}
        inline={true}
      >
        <AccountsSelect
          name={"costAccountId"}
          items={accounts}
          placeholder={intl.get("select_account")}
          filterByParentTypes={[ACCOUNT_PARENT_TYPE.EXPENSE]}
          popoverFill={true}
          allowCreate={true}
          fastField={true}
          disabled={!values.purchasable}
          purchasable={values.purchasable}
          shouldUpdate={costAccountFieldShouldUpdate}
        />
      </FFormGroup>

      {/*------------- Purchase Tax Rate ------------- */}
      {isSalesTaxFeatureCan && (
        <FFormGroup name={"purchaseTaxRateId"} label={"Tax Rate"} inline={true}>
          <TaxRatesSelect
            name={"purchaseTaxRateId"}
            items={taxRates}
            allowCreate={true}
            fastField={true}
            shouldUpdateDeps={{ taxRates }}
            shouldUpdate={taxRateFieldShouldUpdate}
          />
        </FFormGroup>
      )}

      <FFormGroup
        name={"purchaseDescription"}
        label={<T id={"description"} />}
        className={"form-group--purchase-description"}
        helperText={<ErrorMessage name={"description"} />}
        inline={true}
      >
        <FTextArea
          name={"purchaseDescription"}
          growVertically={true}
          disabled={!values.purchasable}
          fill
          shouldUpdate={purchaseDescFieldShouldUpdate}
        />
      </FFormGroup>
    </Box>
  );
}
