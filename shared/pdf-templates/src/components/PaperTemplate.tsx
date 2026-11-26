import React from "react";
import clsx from "classnames";
import { get, isFunction } from "lodash";
import { x } from "@xstyled/emotion";
import { css } from "@emotion/css";
import { Box, BoxProps } from "../lib/layout/Box";
import { Group, GroupProps } from "../lib/layout/Group";

export interface PaperTemplateProps extends BoxProps {
  primaryColor?: string;
  secondaryColor?: string;
  children?: React.ReactNode;
}

export function PaperTemplate({
  primaryColor,
  secondaryColor,
  children,
  ...restProps
}: PaperTemplateProps) {
  return (
    <Box
      backgroundColor="#fff"
      color="#111"
      boxShadow="inset 0 4px 0px 0 var(--invoice-primary-color)"
      padding="30px 30px"
      fontSize="12px"
      position="relative"
      m="0 auto"
      h="1123px"
      w="794px"
      {...restProps}
      className={clsx(
        restProps?.className,
        css`
          @media print {
            width: auto !important;
            height: auto !important;
          }
        `,
      )}
    >
      <style>{`:root { --invoice-primary-color: ${primaryColor}; --invoice-secondary-color: ${secondaryColor}; }`}</style>
      {children}
    </Box>
  );
}

interface PaperTemplateBigTitleProps {
  title: string;
}

PaperTemplate.BigTitle = ({ title }: PaperTemplateBigTitleProps) => {
  return (
    <x.h1
      fontSize={"30px"}
      margin={0}
      lineHeight={1}
      fontWeight={500}
      color={"#333"}
    >
      {title}
    </x.h1>
  );
};

interface PaperTemplateLogoProps {
  logoUri: string;
}

PaperTemplate.Logo = ({ logoUri }: PaperTemplateLogoProps) => {
  return (
    <x.div overflow={"hidden"}>
      <x.img
        width={"100%"}
        height={"100%"}
        maxWidth={"260px"}
        maxHeight={"100px"}
        alt=""
        src={logoUri}
      />
    </x.div>
  );
};

interface PaperTemplateTableProps {
  columns: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessor: string | ((data: Record<string, any>) => JSX.Element);
    label: string;
    value?: JSX.Element;
    align?: "left" | "center" | "right";
    thStyle?: React.CSSProperties;
    visible?: boolean;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Array<Record<string, any>>;
  alternateRowColors?: boolean;
  oddRowColor?: string;
  evenRowColor?: string;
  compact?: boolean;
  fixedLayout?: boolean;
  headerBackground?: string;
  headerTextColor?: string;
  footer?: React.ReactNode;
}

PaperTemplate.Table = ({
  columns,
  data,
  alternateRowColors = false,
  oddRowColor = "#ffffff",
  evenRowColor = "#eef2f5",
  compact = false,
  headerBackground,
  headerTextColor,
  fixedLayout = false,
  footer,
}: PaperTemplateTableProps) => {
  const color = (value: string, fallback: string) =>
    /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const filteredColumns = columns.filter((col) => col.visible !== false);

  return (
    <table
      style={fixedLayout ? { tableLayout: "fixed" } : undefined}
      className={css`
        width: 100%;
        border-collapse: collapse;
        text-align: left;

        th,
        td {
          box-sizing: border-box;
          overflow-wrap: anywhere;
          vertical-align: top;
        }
        thead th {
          font-weight: 400;
          border-bottom: 1px solid #000;
          padding: 8px 12px;
          color: #333;

          &.rate,
          &.total {
            text-align: right;
          }
        }
        tbody {
          td {
            border-bottom: 1px solid #f6f6f6;
            padding: 10px 12px;

            &.rate,
            &.total {
              text-align: right;
            }
          }
        }
      `}
    >
      <thead
        style={
          compact
            ? { backgroundColor: headerBackground || "#d0d0d0" }
            : undefined
        }
      >
        <tr>
          {filteredColumns.map((col, index) => (
            <x.th
              scope="col"
              key={index}
              textAlign={col.align}
              style={{
                ...col.thStyle,
                ...(headerTextColor ? { color: headerTextColor } : {}),
              }}
            >
              {col.label}
            </x.th>
          ))}
        </tr>
      </thead>

      <tbody>
        {data.map((_data, rowIndex) => (
          <tr
            key={rowIndex}
            data-item-row={rowIndex}
            style={{
              ...(alternateRowColors
                ? {
                    backgroundColor:
                      rowIndex % 2
                        ? color(evenRowColor, "#eef2f5")
                        : color(oddRowColor, "#ffffff"),
                    printColorAdjust: "exact",
                    WebkitPrintColorAdjust: "exact",
                  }
                : {}),
            }}
          >
            {filteredColumns.map((column, index) => (
              <x.td
                textAlign={column.align}
                key={index}
                style={
                  compact
                    ? {
                        padding: "8px 12px",
                        verticalAlign: "top",
                        borderBottom: "none",
                      }
                    : undefined
                }
              >
                {isFunction(column?.accessor)
                  ? column?.accessor(_data)
                  : get(_data, column.accessor)}
              </x.td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && <tfoot style={{ display: "table-row-group" }}>{footer}</tfoot>}
    </table>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export enum PaperTemplateTotalBorder {
  Gray = "gray",
  Dark = "dark",
}

PaperTemplate.Totals = ({ children }: { children: React.ReactNode }) => {
  return (
    <x.div
      style={{
        display: "flex",
        flexDirection: "column",
        marginLeft: "auto",
        width: "340px",
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: "8px 12px",
        breakInside: "avoid",
      }}
    >
      {children}
    </x.div>
  );
};

const totalBottomBordered = css`
  border-bottom: 1px solid #000;
`;
const totalBottomGrayBordered = css`
  border-bottom: 1px solid #dadada;
`;

PaperTemplate.TotalLine = ({
  label,
  amount,
  border,
  style,
}: {
  label: string;
  amount: string;
  border?: PaperTemplateTotalBorder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style?: any;
}) => {
  return (
    <x.div
      display={"flex"}
      padding={"6px 0"}
      alignItems="baseline"
      gap="12px"
      className={clsx({
        [totalBottomBordered]: border === PaperTemplateTotalBorder.Dark,
        [totalBottomGrayBordered]: border === PaperTemplateTotalBorder.Gray,
      })}
      style={style}
    >
      <x.div flex="1 1 55%" minWidth={0}>
        {label}
      </x.div>
      <x.div flex="0 1 45%" minWidth={0} textAlign={"right"}>
        {amount}
      </x.div>
    </x.div>
  );
};

PaperTemplate.AddressesGroup = (props: GroupProps) => {
  return (
    <Group
      spacing={10}
      align={"flex-start"}
      {...props}
      className={css`
        > div {
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }
      `}
    />
  );
};

PaperTemplate.Address = ({ children }: { children: React.ReactNode }) => {
  return (
    <Box minWidth={0} style={{ overflowWrap: "anywhere" }}>
      {children}
    </Box>
  );
};

PaperTemplate.Statement = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => {
  return (
    <x.div mb={"20px"}>
      {label && <x.div color={"#666"}>{label}</x.div>}
      <x.div>{children}</x.div>
    </x.div>
  );
};

PaperTemplate.TermsList = ({ children }: { children: React.ReactNode }) => {
  return (
    <x.div display={"flex"} flexDirection={"column"} gap={"4px"}>
      {children}
    </x.div>
  );
};

PaperTemplate.TermsItem = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => {
  return (
    <Group spacing={12}>
      <x.div flex="0 1 120px" minWidth={0} color={"#333"}>
        {label}
      </x.div>
      <x.div flex="1 1 0" minWidth={0}>
        {children}
      </x.div>
    </Group>
  );
};
