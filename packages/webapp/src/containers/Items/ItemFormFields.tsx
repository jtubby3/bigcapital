import { Divider } from '@blueprintjs/core';
import { css } from '@emotion/css';
import { ItemFormBasicSection } from './ItemFormBasicSection';
import { ItemFormInventorySection } from './ItemFormInventorySection';
import { ItemFormPurchasingSection } from './ItemFormPurchasingSection';
import { ItemFormSellingSection } from './ItemFormSellingSection';
import { ItemPriceHistory } from './ItemPriceHistory';
import { useItemFormContext } from './ItemFormProvider';
import { ItemFormSectionTitle } from './ItemFormSectionTitle';
import { Box } from '@/components';

const itemFormSectionDividerClass = css`
  margin: 20px 0;
`;

export function ItemFormSections() {
  const { itemId, isNewMode } = useItemFormContext();
  return (
    <Box>
      <ItemFormBasicSection />
      <Divider className={itemFormSectionDividerClass} />

      <ItemFormSellingSection />
      <Divider className={itemFormSectionDividerClass} />

      <ItemFormPurchasingSection />
      <Divider className={itemFormSectionDividerClass} />

      <ItemFormInventorySection />
      {itemId && !isNewMode && (
        <Box data-section-id="price-history">
          <Divider className={itemFormSectionDividerClass} />
          <ItemFormSectionTitle>Price history</ItemFormSectionTitle>
          <ItemPriceHistory itemId={itemId} />
        </Box>
      )}
    </Box>
  );
}
