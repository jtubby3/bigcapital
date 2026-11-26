import React, { useEffect, useState } from 'react';
import {
  Button,
  ButtonGroup,
  HTMLTable,
  InputGroup,
  Intent,
  Menu,
  MenuItem,
  Popover,
  Spinner,
  Tag,
} from '@blueprintjs/core';
import { omit } from 'lodash';
import { AppToaster, Stack } from '@/components';
import { useDrawerActions, useAlertActions } from '@/hooks/state';
import { useApiFetcher } from '@/hooks/useRequest';
import { fetchPdfTemplate } from '@bigcapital/sdk-ts';
import {
  useGetPdfTemplates,
  useCreatePdfTemplate,
  useAssignPdfTemplateAsDefault,
} from '@/hooks/query/pdf-templates';
import { getCustomizeDrawerNameFromResource } from '@/containers/BrandingTemplates/_utils';
import { withDashboardActions } from '@/containers/Dashboard/withDashboardActions';
import type { WithDashboardActionsProps } from '@/containers/Dashboard/withDashboardActions';
const resources = { SaleInvoice: 'Invoice' };
type Template = {
  id: number;
  templateName: string;
  resource: string;
  default: boolean;
  createdAtFormatted?: string;
};
function CustomFormStylesRoot({
  changePreferencesPageTitle,
}: Pick<WithDashboardActionsProps, 'changePreferencesPageTitle'>) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useGetPdfTemplates({ resource: 'SaleInvoice' });
  const { openDrawer } = useDrawerActions();
  const { openAlert } = useAlertActions();
  const fetcher = useApiFetcher({ enableCamelCaseTransform: true });
  const create = useCreatePdfTemplate();
  const assign = useAssignPdfTemplateAsDefault();
  useEffect(() => {
    changePreferencesPageTitle('Custom form styles');
  }, [changePreferencesPageTitle]);
  const templates = (
    Array.isArray(data) ? data : (data?.templates ?? [])
  ) as Template[];
  const filtered = templates.filter((t) =>
    t.templateName.toLowerCase().includes(search.toLowerCase()),
  );
  const edit = (t: Template) =>
    openDrawer(getCustomizeDrawerNameFromResource(t.resource), {
      templateId: t.id,
      resource: t.resource,
    });
  const duplicate = async (t: Template) => {
    try {
      const details = await fetchPdfTemplate(fetcher, t.id);
      await create.mutateAsync({
        resource: t.resource,
        templateName: `${t.templateName} copy`,
        attributes: omit(details.attributes, [
          'companyLogoUri',
          'footerImageUri',
        ]),
      });
      AppToaster.show({
        intent: Intent.SUCCESS,
        message: 'Form style duplicated.',
      });
    } catch {
      AppToaster.show({
        intent: Intent.DANGER,
        message: 'The form style could not be duplicated.',
      });
    }
  };
  return (
    <Stack
      spacing={20}
      style={{
        padding: '24px clamp(16px, 3vw, 36px)',
        width: '100%',
        maxWidth: 1250,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Invoice styles</h2>
          <p style={{ margin: '8px 0 0' }}>
            Create, customize, and choose the default designs for your invoices.
          </p>
        </div>
        <Button
          intent={Intent.PRIMARY}
          onClick={() =>
            openDrawer(getCustomizeDrawerNameFromResource('SaleInvoice'), {
              resource: 'SaleInvoice',
            })
          }
        >
          New style
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <InputGroup
          leftIcon="search"
          placeholder="Search form styles"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 300, maxWidth: '100%' }}
        />
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <div
          style={{ overflowX: 'auto', minWidth: 0 }}
          data-testId="form-styles-table-scroll"
        >
          <HTMLTable interactive striped style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Form type</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} data-testId="form-style-row">
                  <td>
                    <Button minimal onClick={() => edit(t)}>
                      {t.templateName}
                    </Button>{' '}
                    {Boolean(t.default) && (
                      <Tag minimal intent={Intent.SUCCESS}>
                        Default
                      </Tag>
                    )}
                  </td>
                  <td>
                    {resources[t.resource as keyof typeof resources] ||
                      t.resource}
                  </td>
                  <td>{t.createdAtFormatted}</td>
                  <td style={{ textAlign: 'right' }}>
                    <ButtonGroup>
                      <Button minimal onClick={() => edit(t)}>
                        Edit
                      </Button>
                      <Popover
                        minimal
                        content={
                          <Menu>
                            {!t.default && (
                              <MenuItem
                                text="Make default"
                                onClick={() =>
                                  assign.mutate(
                                    { templateId: t.id },
                                    {
                                      onError: () =>
                                        AppToaster.show({
                                          intent: Intent.DANGER,
                                          message:
                                            'The default style could not be changed.',
                                        }),
                                    },
                                  )
                                }
                              />
                            )}
                            <MenuItem
                              text="Duplicate"
                              onClick={() => duplicate(t)}
                            />
                            <MenuItem
                              text="Delete"
                              intent={Intent.DANGER}
                              onClick={() =>
                                openAlert('branding-template-delete', {
                                  templateId: t.id,
                                })
                              }
                            />
                          </Menu>
                        }
                      >
                        <Button
                          minimal
                          icon="chevron-down"
                          aria-label={`Actions for ${t.templateName}`}
                        />
                      </Popover>
                    </ButtonGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        </div>
      )}
      {!isLoading && !filtered.length && (
        <p>No matching form styles. Choose New style to create one.</p>
      )}
    </Stack>
  );
}
export const CustomFormStylesPage = withDashboardActions(CustomFormStylesRoot);
