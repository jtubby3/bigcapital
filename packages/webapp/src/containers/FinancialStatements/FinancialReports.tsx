import React from 'react';
import { Button } from '@blueprintjs/core';
import { Link } from 'react-router-dom';
import {
  useFilterFinancialReports,
  FinancialSection,
  FinancialReport,
} from './FilterFinancialReports';
import { DashboardInsider } from '@/components';
import { financialReportMenus } from '@/constants/financialReportsMenu';
import { useAuthOrganizationId, useAuthUserId } from '@/hooks/state';
import { useLocalStorage } from '@/hooks/utils/useLocalStorage';
import '@/style/pages/FinancialStatements/FinancialSheets.scss';

const defaultFavorites = [
  '/financial-reports/receivable-aging-summary',
  '/financial-reports/sales-by-customer-summary',
  '/financial-reports/balance-sheet',
  '/financial-reports/sales-by-customer-detail',
  '/financial-reports/income-by-customer-summary',
  '/financial-reports/profit-loss-sheet',
];

function ReportsCatalog({
  sections,
  storageKey,
}: {
  sections: FinancialSection[];
  storageKey: string;
}) {
  const [saved, setSaved] = useLocalStorage<string[]>(
    storageKey,
    defaultFavorites,
  );
  const favorites =
    Array.isArray(saved) && saved.every((value) => typeof value === 'string')
      ? saved
      : defaultFavorites;
  const allReports = sections.flatMap((section) => section.reports);
  const favoriteReports = favorites
    .map((link) => allReports.find((report) => report.link === link))
    .filter((report): report is FinancialReport => Boolean(report));

  const toggleFavorite = (link: string) =>
    setSaved(
      favorites.includes(link)
        ? favorites.filter((value) => value !== link)
        : [...favorites, link],
    );
  const star = (report: FinancialReport) => {
    const active = favorites.includes(report.link);
    const name =
      typeof report.title === 'string'
        ? report.title
        : report.link.split('/').pop()?.split('?')[0].replace(/-/g, ' ');
    return (
      <Button
        minimal
        icon={active ? 'star' : 'star-empty'}
        className={`report-favorite-star${active ? ' is-favorite' : ''}`}
        aria-label={`${active ? 'Remove' : 'Add'} ${name} ${active ? 'from' : 'to'} favorites`}
        aria-pressed={active}
        title={active ? 'Remove from favorites' : 'Add to favorites'}
        onClick={() => toggleFavorite(report.link)}
      />
    );
  };

  return (
    <div className="financial-reports">
      <details className="report-favorites" open>
        <summary>Favorites</summary>
        <div className="report-favorites__list">
          {favoriteReports.map((report) => (
            <div className="report-favorites__item" key={report.link}>
              <Link to={report.link}>{report.title}</Link>
              {star(report)}
            </div>
          ))}
        </div>
        {favoriteReports.length === 0 && (
          <p className="report-favorites__empty">
            Star a report below to add it to Favorites.
          </p>
        )}
      </details>
      {sections.map((section, index) => (
        <div className="financial-reports__section" key={index}>
          <h2 className="section-title">{section.sectionTitle}</h2>
          <div className="financial-reports__list">
            {section.reports.map((report) => (
              <div className="financial-reports__item" key={report.link}>
                <div className="financial-reports__item-title">
                  <Link className="title" to={report.link}>
                    {report.title}
                  </Link>
                  {star(report)}
                </div>
                <p className="desc">{report.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FinancialReports() {
  const sections = useFilterFinancialReports(financialReportMenus);
  const organizationId = useAuthOrganizationId();
  const userId = useAuthUserId();
  const storageKey = `report-favorites:${organizationId}:${userId}`;
  return (
    <DashboardInsider name="financial-reports">
      <ReportsCatalog
        key={storageKey}
        storageKey={storageKey}
        sections={sections}
      />
    </DashboardInsider>
  );
}
