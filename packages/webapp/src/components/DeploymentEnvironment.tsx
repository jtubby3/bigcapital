declare global {
  interface Window {
    __BIGCAPITAL_ENV__?: { name?: string; release?: string; copiedAt?: string };
  }
}

export const isStaging = () => window.__BIGCAPITAL_ENV__?.name === 'staging';
export const environmentTitle = (title: string) =>
  isStaging() ? `[STAGING] ${title}` : title;

export function DeploymentEnvironmentBanner() {
  if (!isStaging()) return null;
  const environment = window.__BIGCAPITAL_ENV__;
  return (
    <aside
      className="deployment-environment-banner"
      role="status"
      aria-label="Staging environment"
    >
      <strong>STAGING · FEATURE TESTING · NOT PRODUCTION</strong>
      <span>
        External delivery disabled · Copy: {environment?.copiedAt || 'unknown'}{' '}
        · Build: {environment?.release?.slice(0, 12) || 'local'}
      </span>
    </aside>
  );
}
